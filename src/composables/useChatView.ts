import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useChat } from '../stores/chat'
import { useConversations } from '../stores/conversations'
import { generateStreamWithContext } from '../services/stream'
import { db } from '../db'
import type { StreamController } from "../types/chat.ts";

export function useChatView() {
    const {
        messages, addMessage, clearMessages, updateMessage,
        loadForConversation, createAssistantMessage, appendToMessage,
    } = useChat()

    const {
        conversations, currentId,
        loadAll, createConversation, selectConversation, deleteConversation, refreshList,
    } = useConversations()

    // ── UI 状态 ───────────────────────────────────────────
    const inputValue   = ref<string>('')
    const isStreaming  = ref<boolean>(false)   // 是否正在生成（控制发送按钮、禁止切换会话）
    const unreadCount  = ref<number>(0)        // 用户向上滚动时新消息的未读计数，显示"↓ N 条新消息"
    const containerRef = ref<HTMLDivElement | null>(null)  // 消息滚动容器的 DOM 引用
    const sidebarOpen  = ref<boolean>(false)   // 移动端侧边栏是否展开

    // 用户当前是否停留在消息列表底部（决定是否自动跟随滚动）
    let userAtBottom = true
    // 防止同一帧内多次触发 scrollTop 赋值（requestAnimationFrame 节流标记）
    let isScrolling  = false
    // 当前流式请求的控制器，用于中断生成
    let streamCtrl:  StreamController | null = null
    // handleSend 内部创建新对话时，临时屏蔽 watcher 的自动加载，
    // 避免 createConversation 设置 currentId 后触发 loadForConversation 把刚写入内存的消息清空
    let suppressConvWatch = false

    // ── 会话切换监听 ──────────────────────────────────────
    // currentId 变化时（点击侧边栏会话 / 新建对话）自动加载对应消息并滚到底部
    watch(currentId, async (newId) => {
        if (suppressConvWatch) return  // handleSend 内部创建会话时跳过
        if (newId !== null) {
            await loadForConversation(newId)
        } else {
            clearMessages()  // currentId = null 表示新建对话，清空消息区
        }
        await nextTick()
        const el = containerRef.value
        if (el) el.scrollTop = el.scrollHeight
        unreadCount.value = 0
        userAtBottom = true
    })

    /** 点击侧边栏会话条目，生成中禁止切换，切换后关闭侧边栏 */
    async function handleSelectConversation(id: number) {
        if (isStreaming.value) return
        selectConversation(id)
        sidebarOpen.value = false
    }

    /** 点击"新对话"按钮，将 currentId 置为 null，清空消息区 */
    function handleNewConversation() {
        if (isStreaming.value) return
        currentId.value = null
        sidebarOpen.value = false
    }

    async function handleDeleteConversation(id: number) {
        await deleteConversation(id)
    }

    // ── DB 持久化辅助 ──────────────────────────────────────

    /**
     * 将内存中指定消息写入（或覆盖）IndexedDB。
     * 使用 db.put（upsert）而非 add，防止重复写入报错。
     * 生成完成 / 中断时在 handleSend finally 里调用。
     */
    async function persistMessage(msgId: string, convId: number) {
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        await db.messages.put({
            id: msg.id,
            conversationId: convId,
            role: msg.role,
            content: msg.content,
            status: msg.status,
            canContinue: msg.canContinue,
            createdAt: Date.now(),
        })
    }

    // ── 滚动相关 ──────────────────────────────────────────

    /** 判断滚动容器是否已到达底部（留 20px 误差）*/
    function isAtBottom(): boolean {
        const el = containerRef.value
        if (!el) return false
        return el.scrollHeight - el.scrollTop - el.clientHeight < 20
    }

    /**
     * 调度一次滚动到底部（通过 requestAnimationFrame + nextTick）。
     * 仅当用户本就在底部时才执行，避免打断用户主动上翻历史。
     * isScrolling 防止同一帧内重复触发。
     */
    function scheduleScroll(): void {
        if (!userAtBottom || isScrolling) return
        isScrolling = true
        requestAnimationFrame(async () => {
            await nextTick()
            const el = containerRef.value
            if (el) el.scrollTop = el.scrollHeight
            isScrolling = false
        })
    }

    /**
     * 强制滚动到底部并清除未读计数。
     * 点击"↓ N 条新消息"徽章时调用。
     */
    async function scrollToBottom(): Promise<void> {
        await nextTick()
        const el = containerRef.value
        if (!el) return
        el.scrollTop = el.scrollHeight
        unreadCount.value = 0
        userAtBottom = true
    }

    /**
     * 滚动容器的 scroll 事件处理。
     * 实时更新 userAtBottom 状态；
     * 用户滚到底部时自动清除未读计数。
     */
    function handleScroll(): void {
        const atBottom = isAtBottom()
        userAtBottom = atBottom
        if (atBottom) unreadCount.value = 0
    }

    // ── 流式输出 ──────────────────────────────────────────

    // chunk 接收队列：onChunk 回调把 chunk 推入队列，flushQueue 逐帧消费
    // 这样可以把网络速度和渲染帧率解耦，防止 UI 卡顿
    let queue: string[] = []
    // 防止 flushQueue 同时被多个 onChunk 并发启动
    let isFlushing = false
    // 标记生成是否还在进行中（用于判断 finally 里是否需要补一次 status:'done'）
    let needsStatusFallback = true

    /**
     * 生成完成后，异步将消息内容渲染成 HTML（Markdown + 代码高亮）。
     * 渲染结果存到 formattedContent，模板中 done 状态下用 v-html 展示。
     * 懒加载 markdown 工具，避免阻塞首屏。
     */
    async function formatFinishedMessage(msgId: string) {
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        const { renderMarkdownAsync } = await import('../utils/markdown')
        msg.formattedContent = await renderMarkdownAsync(msg.content)
    }

    // ── 发送消息主流程 ────────────────────────────────────

    async function handleSend(): Promise<void> {
        if (!inputValue.value.trim() || isStreaming.value) return

        // 重置流式输出相关状态
        queue = []
        isFlushing = false
        needsStatusFallback = true
        isStreaming.value = true
        const userText = inputValue.value
        inputValue.value = ''   // 立即清空输入框，提升响应感

        // 确保有当前会话（首条消息时自动创建，标题取前 28 个字符）
        let convId = currentId.value
        if (convId === null) {
            // 屏蔽 watcher：createConversation 内部会 set currentId，
            // 若不屏蔽，watcher 会触发 loadForConversation，清空下面即将写入的消息
            suppressConvWatch = true
            convId = await createConversation(userText.slice(0, 28) || '新对话')
            suppressConvWatch = false
        }

        const userMsgId = crypto.randomUUID()

        // 先写入内存（立即显示），再写 DB（持久化）
        addMessage({ id: userMsgId, role: 'user', content: userText, status: 'done' })
        await db.messages.add({
            id: userMsgId,
            conversationId: convId,
            role: 'user',
            content: userText,
            status: 'done',
            createdAt: Date.now(),
        })

        await nextTick()
        scheduleScroll()

        // 创建 AI 占位消息（loading 状态）并绑定中断控制器
        const aiMsg = createAssistantMessage()
        streamCtrl = createStreamController(aiMsg.id)

        try {
            await generateStreamWithContext(
                messages.value,
                userText,
                // onChunk：每收到一个文本片段时回调
                (chunk) => {
                    if (streamCtrl?.isAborted) return
                    queue.push(chunk)       // 推入队列，由 flushQueue 逐帧消费
                    flushQueue(aiMsg.id)
                    if (!userAtBottom) {
                        unreadCount.value++ // 用户不在底部：累计未读数
                    } else {
                        scheduleScroll()    // 用户在底部：自动跟随滚动
                    }
                },
                // onDone：流结束时回调（正常结束 or 被 abort 后触发）
                () => {
                    needsStatusFallback = false  // 标记 onDone 已执行，finally 不需要再补 done
                    if (streamCtrl?.isAborted) {
                        updateMessage(aiMsg.id, { status: 'aborted', canContinue: true })
                    } else {
                        updateMessage(aiMsg.id, { status: 'done' })
                        formatFinishedMessage(aiMsg.id)  // 异步渲染 Markdown
                    }
                },
                streamCtrl.controller.signal
            )
        } finally {
            isStreaming.value = false
            scheduleScroll()

            // 极少数情况：onDone 未触发（网络异常等）但流已结束，补一次 done
            if (needsStatusFallback && !streamCtrl?.isAborted) {
                updateMessage(aiMsg.id, { status: 'done' })
            }

            // 持久化 AI 消息 + 更新会话最后修改时间 + 刷新侧边栏排序
            await persistMessage(aiMsg.id, convId)
            await db.conversations.update(convId, { updatedAt: Date.now() })
            await refreshList()
        }
    }

    /**
     * 逐帧消费 queue 中的 chunk，每个 chunk 再拆成单字符逐帧写入，
     * 实现打字机效果。使用 requestAnimationFrame 节奏，不阻塞主线程。
     *
     * 调用链：onChunk → queue.push → flushQueue（若未在运行则启动）
     *                                    └→ step（逐 chunk）
     *                                          └→ typeChar（逐字符）
     */
    function flushQueue(messageId: string) {
        if (isFlushing) return   // 已有 flush 循环在跑，直接返回，避免并发
        isFlushing = true

        function step() {
            if (queue.length === 0) { isFlushing = false; return }  // 队列清空，退出循环
            const chunk = queue.shift()!
            const chars = chunk.split('')
            let i = 0

            function typeChar() {
                if (streamCtrl?.isAborted) return  // 已中断，停止渲染
                if (i >= chars.length) { requestAnimationFrame(step); return }  // 当前 chunk 处理完，取下一个
                const char = chars[i]
                if (!char) { requestAnimationFrame(step); return }
                appendToMessage(messageId, chars[i])
                i++
                requestAnimationFrame(typeChar)  // 下一帧继续写下一个字符
            }
            typeChar()
        }
        requestAnimationFrame(step)
    }

    /**
     * 创建单次请求的控制器对象，封装 AbortController。
     * abort() 同时：标记 isAborted（让 flushQueue / onChunk 快速退出）、
     *               触发 fetch 的 signal abort（中断网络请求）、
     *               取消 ReadableStream reader（释放资源）。
     */
    function createStreamController(messageId: string) {
        const ctrl = new AbortController()
        return {
            messageId,
            controller: ctrl,
            reader: null as ReadableStreamDefaultReader | null,
            isAborted: false,
            abort() {
                this.isAborted = true
                this.controller.abort()
                this.reader?.cancel()
            },
        }
    }

    /**
     * 继续生成：针对 status='aborted' 的 AI 消息，以当前内容为上下文续写。
     * 与 handleSend 的区别：不新增用户消息，直接在原消息上追加内容。
     */
    async function handleContinue(messageId: string) {
        if (isStreaming.value) return
        const msg = messages.value.find(m => m.id === messageId)
        if (!msg || currentId.value === null) return
        if (msg.status !== 'aborted') return

        queue = []
        isFlushing = false
        needsStatusFallback = true
        isStreaming.value = true
        const convId = currentId.value

        // 重置为 loading 状态，隐藏"继续生成"按钮
        updateMessage(msg.id, { status: 'loading', canContinue: false })
        streamCtrl = createStreamController(msg.id)

        try {
            await generateStreamWithContext(
                messages.value,
                '',   // 无新用户输入，模型根据历史上下文续写
                (chunk) => {
                    if (streamCtrl?.isAborted) return
                    // 续写时不再做打字机效果，直接追加（避免视觉跳动）
                    appendToMessage(msg.id, chunk)
                },
                async () => {
                    if (streamCtrl?.isAborted) {
                        updateMessage(msg.id, { status: 'aborted', canContinue: true })
                    } else {
                        updateMessage(msg.id, { status: 'done' })
                        await formatFinishedMessage(msg.id)
                    }
                    // onDone 里直接持久化（续写的 finally 不再重复做）
                    await persistMessage(msg.id, convId)
                    await db.conversations.update(convId, { updatedAt: Date.now() })
                    await refreshList()
                },
                streamCtrl.controller.signal
            )
        } finally {
            isStreaming.value = false
        }
    }

    /**
     * 停止生成：中断当前流式请求，将 AI 消息标记为 aborted 并显示"继续生成"按钮。
     * AI 消息的最终持久化由 handleSend 的 finally 完成，这里不重复写 DB。
     */
    function handleStop() {
        if (!streamCtrl) return
        streamCtrl.abort()

        isStreaming.value = false
    }

    // ── 生命周期 ──────────────────────────────────────────

    onMounted(async () => {
        containerRef.value?.addEventListener('scroll', handleScroll)
        await loadAll()  // 从 DB 加载所有会话列表
        // 自动选中最近修改的会话（列表已按 updatedAt 降序排列）
        if (conversations.value.length > 0 && currentId.value === null) {
            selectConversation(conversations.value[0].id!)
        }
    })

    onUnmounted(() => {
        containerRef.value?.removeEventListener('scroll', handleScroll)
    })

    // ── 对外暴露 ──────────────────────────────────────────

    return {
        messages,
        inputValue,
        isStreaming,
        unreadCount,
        containerRef,
        sidebarOpen,
        conversations,
        currentId,
        handleSend,
        scrollToBottom,
        handleStop,
        handleContinue,
        handleSelectConversation,
        handleNewConversation,
        handleDeleteConversation,
    }
}
