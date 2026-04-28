import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useChat } from '../stores/chat'
import { useConversations } from '../stores/conversations'
import { generateStreamWithContext } from '../services/stream'
import { db } from '../db'
import { classifyError } from '../utils/error'
import { useToast } from './useToast'
import { settings } from '../stores/settings'
import type {Message, ImageAttachment, StreamController} from "../types/chat.ts";

/**
 * 聊天页面核心逻辑 composable
 *
 * 职责：
 *  1. 会话管理 —— 新建 / 切换 / 删除会话，监听 currentId 自动加载历史消息
 *  2. 消息收发 —— 发送用户消息、发起流式请求、处理重试与继续生成
 *  3. 流式渲染 —— 通过 chunk 队列 + requestAnimationFrame 实现打字机效果
 *  4. 滚动控制 —— 自动跟随、未读提示、手动回到底部
 *  5. 持久化   —— 消息写入 IndexedDB，会话时间戳更新
 *
 * 数据流概览（发送一条消息）：
 *   handleSend
 *     ├─ 确保会话存在（首条消息自动创建）
 *     ├─ 写入用户消息（内存 + DB）
 *     ├─ 创建 AI 占位消息（loading 状态）
 *     └─ runStream
 *          ├─ generateStreamWithContext（发起流式请求）
 *          │    ├─ onChunk → queue.push → flushQueue 逐字符写入（打字机）
 *          │    └─ onDone  → 标记 done / aborted，触发 Markdown 渲染
 *          └─ finally → 持久化 AI 消息、更新会话时间戳、刷新侧边栏
 */
export function useChatView() {
    const {
        messages, addMessage, clearMessages, updateMessage,
        loadForConversation, createAssistantMessage, appendToMessage,
    } = useChat()

    const {
        conversations, currentId,
        loadAll, createConversation, selectConversation, deleteConversation, refreshList,
    } = useConversations()

    const toast = useToast()

    // ── 响应式状态（模板绑定） ────────────────────────────────
    const inputValue   = ref<string>('')
    const isStreaming  = ref<boolean>(false)
    const unreadCount  = ref<number>(0)
    const containerRef = ref<HTMLDivElement | null>(null)
    const sidebarOpen  = ref<boolean>(false)
    const pendingImages = ref<ImageAttachment[]>([])

    // ── 非响应式标志位 ───────────────────────────────────────
    let userAtBottom = true                          // 用户是否在消息底部，控制自动滚动
    let isScrolling  = false                         // rAF 节流，防止同一帧多次赋值 scrollTop
    let streamCtrl:  StreamController | null = null  // 当前流式请求控制器
    // createConversation 会设置 currentId，触发 watcher 加载消息——
    // 但 handleSend 中刚写入内存的消息会被 loadForConversation 覆盖清空，
    // 所以在 handleSend 创建会话期间用此标志临时屏蔽 watcher
    let suppressConvWatch = false

    // ── 会话切换 ─────────────────────────────────────────────

    watch(currentId, async (newId) => {
        if (suppressConvWatch) return
        if (newId !== null) {
            await loadForConversation(newId)
        } else {
            clearMessages()
        }
        await nextTick()
        const el = containerRef.value
        if (el) el.scrollTop = el.scrollHeight
        unreadCount.value = 0
        userAtBottom = true
    })

    function handleSelectConversation(id: number) {
        if (isStreaming.value) return
        selectConversation(id)
        sidebarOpen.value = false
    }

    function handleNewConversation() {
        if (isStreaming.value) return
        currentId.value = null
        sidebarOpen.value = false
    }

    async function handleDeleteConversation(id: number) {
        await deleteConversation(id)
    }

    // ── 持久化 ───────────────────────────────────────────────

    // upsert 一条消息到 IndexedDB（runStream finally 中调用）
    async function persistMessage(msgId: string, convId: number) {
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        await db.messages.put({
            id: msg.id,
            conversationId: convId,
            role: msg.role,
            content: msg.content,
            images: msg.images,
            status: msg.status,
            canContinue: msg.canContinue,
            errorMessage: msg.errorMessage,
            createdAt: Date.now(),
        })
    }

    // ── 滚动控制 ─────────────────────────────────────────────

    function isAtBottom(): boolean {
        const el = containerRef.value
        if (!el) return false
        return el.scrollHeight - el.scrollTop - el.clientHeight < 20
    }

    // rAF + nextTick 调度滚动，仅在用户已在底部时执行
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

    // 强制滚到底部（点击"有新消息"徽章时调用）
    async function scrollToBottom(): Promise<void> {
        await nextTick()
        const el = containerRef.value
        if (!el) return
        el.scrollTop = el.scrollHeight
        unreadCount.value = 0
        userAtBottom = true
    }

    function handleScroll(): void {
        const atBottom = isAtBottom()
        userAtBottom = atBottom
        if (atBottom) unreadCount.value = 0
    }

    // ── 流式输出（打字机） ───────────────────────────────────
    //
    // 设计：网络回调 onChunk 把文本片段推入 queue，
    //       flushQueue 通过 rAF 逐字符消费，将网络速率与渲染帧率解耦。
    //
    // 重要：queue / isFlushing / needsStatusFallback 是模块级变量，
    //       runStream 每次调用前重置它们。不要在 runStream 内用 const/let 遮蔽。

    let queue: string[] = []
    let isFlushing = false
    let needsStatusFallback = true

    // 生成结束后将原始 Markdown 渲染为 HTML（懒加载 markdown 工具）
    async function formatFinishedMessage(msgId: string) {
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        const { renderMarkdownAsync } = await import('../utils/markdown')
        msg.formattedContent = await renderMarkdownAsync(msg.content)
    }

    /**
     * 打字机核心：逐帧从 queue 取 chunk，再逐字符通过 rAF 写入消息。
     *
     *   onChunk → queue.push → flushQueue（启动循环）
     *                            └→ step（取一个 chunk）
     *                                 └→ typeChar（逐字符写入，每字符一帧）
     */
    function flushQueue(messageId: string) {
        if (isFlushing) return
        isFlushing = true

        function step() {
            if (queue.length === 0) { isFlushing = false; return }
            const chunk = queue.shift()!
            const chars = chunk.split('')
            let i = 0

            function typeChar() {
                if (streamCtrl?.isAborted) return
                if (i >= chars.length) { requestAnimationFrame(step); return }
                const char = chars[i]
                if (!char) { requestAnimationFrame(step); return }
                appendToMessage(messageId, chars[i])
                i++
                requestAnimationFrame(typeChar)
            }
            typeChar()
        }
        requestAnimationFrame(step)
    }

    // 封装 AbortController，abort() 同时中断网络请求 + ReadableStream + 标记 isAborted
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

    // ── 用户操作入口 ─────────────────────────────────────────

    function handleStop() {
        if (!streamCtrl) return
        streamCtrl.abort()
        isStreaming.value = false
    }

    // 发送消息：写入用户消息 → 创建 AI 占位 → 启动流式生成
    function addImages(files: File[]) {
        const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
        const maxSize = 10 * 1024 * 1024
        for (const file of files) {
            if (!allowed.includes(file.type)) {
                toast.show(`不支持的图片格式: ${file.name}`, 'warning')
                continue
            }
            if (file.size > maxSize) {
                toast.show(`图片过大(>10MB): ${file.name}`, 'warning')
                continue
            }
            const reader = new FileReader()
            reader.onload = () => {
                const dataUrl = reader.result as string
                const base64 = dataUrl.split(',')[1]
                pendingImages.value.push({
                    base64,
                    mediaType: file.type as ImageAttachment['mediaType'],
                    name: file.name,
                })
            }
            reader.readAsDataURL(file)
        }
    }

    function removeImage(index: number) {
        pendingImages.value.splice(index, 1)
    }

    async function handleSend() {
        if (isStreaming.value) return
        const userText = inputValue.value.trim()
        const images = pendingImages.value.length > 0 ? [...pendingImages.value] : undefined
        inputValue.value = ''
        pendingImages.value = []

        if (!userText && !images?.length) return

        if (images?.length && settings.provider === 'ollama') {
            const model = settings.ollama.model.toLowerCase()
            const visionModels = ['llava', 'bakllava', 'minicpm-v', 'qwen2-vl', 'llama3.2-vision', 'moondream', 'cogvlm']
            const isVision = visionModels.some(v => model.includes(v))
            if (!isVision) {
                toast.show(`当前模型 ${settings.ollama.model} 可能不支持图片，建议使用 llava / minicpm-v / qwen2-vl 等视觉模型`, 'warning', 6000)
            }
        }

        const displayText = userText || (images ? '图片' : '')
        const promptText = userText || (images ? '请描述这张图片' : '')

        let convId = currentId.value
        if (convId === null) {
            suppressConvWatch = true
            convId = await createConversation(displayText.slice(0, 28) || '新对话')
            suppressConvWatch = false
        }

        const userMsgId = crypto.randomUUID()
        addMessage({ id: userMsgId, role: 'user', content: userText, images, status: 'done' })
        await db.messages.add({
            id: userMsgId,
            conversationId: convId,
            role: 'user',
            content: userText,
            images,
            status: 'done',
            createdAt: Date.now(),
        })

        const aiMsg = createAssistantMessage()
        await runStream({ aiMessageId: aiMsg.id, prompt: promptText, convId })
    }

    // 重试：删除失败的 AI 消息，用同一条用户消息重新生成
    async function handleRetry(messageId: string) {
        if (isStreaming.value) return
        const msgIdx = messages.value.findIndex(m => m.id === messageId)
        if (msgIdx === -1 || currentId.value === null) return
        const errMsg = messages.value[msgIdx]
        if (errMsg.status !== 'error') return

        let userMsg: Message | null = null
        for (let i = msgIdx - 1; i >= 0; i--) {
            if (messages.value[i].role === 'user') {
                userMsg = messages.value[i]
                break
            }
        }
        if (!userMsg) {
            console.warn('[handleRetry] 找不到原始用户消息')
            return
        }

        await db.messages.delete(messageId)
        messages.value.splice(msgIdx, 1)

        const aiMsg = createAssistantMessage()
        await runStream({ aiMessageId: aiMsg.id, prompt: userMsg.content, convId: currentId.value })
    }

    // 继续生成：复用已中断的 AI 消息，以空 prompt 续写
    async function handleContinue(messageId: string) {
        if (isStreaming.value) return
        const msg = messages.value.find(m => m.id === messageId)
        if (!msg || currentId.value === null) return
        if (msg.status !== 'aborted') return
        updateMessage(msg.id, { status: 'loading', canContinue: false })
        await runStream({ aiMessageId: messageId, prompt: '', convId: currentId.value })
    }

    // ── 流式请求核心 ─────────────────────────────────────────

    interface RunStreamOptions {
        aiMessageId: string
        prompt: string   // 空字符串 = 续写
        convId: number
    }

    /**
     * 统一的流式请求执行器，handleSend / handleRetry / handleContinue 最终都委托到这里。
     *
     * 生命周期：
     *   1. 重置队列和标志位
     *   2. 调用 generateStreamWithContext 发起 SSE 流
     *   3. onChunk 推入 queue → flushQueue 打字机写入
     *   4. onDone 标记完成状态 + Markdown 渲染
     *   5. finally 持久化到 DB、刷新侧边栏
     */
    async function runStream(options: RunStreamOptions): Promise<void> {
        queue = []
        isFlushing = false
        needsStatusFallback = true
        isStreaming.value = true
        await nextTick()
        scheduleScroll()
        streamCtrl = createStreamController(options.aiMessageId)

        try {
            await generateStreamWithContext(
                messages.value,
                options.prompt,
                (chunk) => {
                    if (streamCtrl?.isAborted) return
                    queue.push(chunk)
                    flushQueue(options.aiMessageId)
                    if (!userAtBottom) {
                        unreadCount.value++
                    } else {
                        scheduleScroll()
                    }
                },
                () => {
                    needsStatusFallback = false
                    if (streamCtrl?.isAborted) {
                        updateMessage(options.aiMessageId, { status: 'aborted', canContinue: true })
                    } else {
                        updateMessage(options.aiMessageId, { status: 'done' })
                        formatFinishedMessage(options.aiMessageId)
                    }
                },
                streamCtrl.controller.signal
            )
        } catch (err: unknown) {
            if (streamCtrl?.isAborted) return
            const chatErr = classifyError(err)
            needsStatusFallback = false
            updateMessage(options.aiMessageId, {
                status: 'error',
                errorMessage: chatErr.message,
            })
            toast.show(chatErr.message, 'error')
        } finally {
            isStreaming.value = false
            scheduleScroll()

            // 兜底：极少数情况 onDone 未触发（如网络中断），补一次 done
            if (needsStatusFallback && !streamCtrl?.isAborted) {
                updateMessage(options.aiMessageId, { status: 'done' })
            }

            await persistMessage(options.aiMessageId, options.convId)
            await db.conversations.update(options.convId, { updatedAt: Date.now() })
            await refreshList()
        }
    }

    // ── 生命周期 ─────────────────────────────────────────────

    onMounted(async () => {
        containerRef.value?.addEventListener('scroll', handleScroll)
        await loadAll()
        if (conversations.value.length > 0 && currentId.value === null) {
            selectConversation(conversations.value[0].id!)
        }
    })

    onUnmounted(() => {
        containerRef.value?.removeEventListener('scroll', handleScroll)
    })

    // ── 对外暴露 ─────────────────────────────────────────────

    return {
        messages,
        inputValue,
        isStreaming,
        unreadCount,
        containerRef,
        sidebarOpen,
        conversations,
        currentId,
        toast,
        pendingImages,
        handleSend,
        scrollToBottom,
        handleStop,
        handleContinue,
        handleRetry,
        handleSelectConversation,
        handleNewConversation,
        handleDeleteConversation,
        addImages,
        removeImage,
    }
}
