import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useChat } from '../stores/chat'
import { useConversations } from '../stores/conversations'
import { generateStreamWithContext } from '../services/ollama'
import { db } from '../db'

export function useChatView() {
    const {
        messages, abortMessage, addMessage, clearMessages,
        loadForConversation, createAssistantMessage, appendToMessage, finishMessage,
    } = useChat()

    const {
        conversations, currentId,
        loadAll, createConversation, selectConversation, deleteConversation, refreshList,
    } = useConversations()

    // ── 状态 ──────────────────────────────────────────────
    const inputValue   = ref<string>('')
    const isStreaming  = ref<boolean>(false)
    const unreadCount  = ref<number>(0)
    const containerRef = ref<HTMLDivElement | null>(null)
    const sidebarOpen  = ref<boolean>(false)

    let userAtBottom = true
    let isScrolling  = false
    let streamCtrl: ReturnType<typeof createStreamController> | null = null

    // ── 对话切换 ──────────────────────────────────────────

    watch(currentId, async (newId) => {
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

    async function handleSelectConversation(id: number) {
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

    // ── DB 持久化辅助 ──────────────────────────────────────

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

    function isAtBottom(): boolean {
        const el = containerRef.value
        if (!el) return false
        return el.scrollHeight - el.scrollTop - el.clientHeight < 20
    }

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

    // ── 发送消息 ──────────────────────────────────────────
    let queue: string[] = []
    let isFlushing = false
    let clearblink = true

    async function formatFinishedMessage(msgId: string) {
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        const { renderMarkdownAsync } = await import('../utils/markdown')
        msg.formattedContent = await renderMarkdownAsync(msg.content)
    }

    async function handleSend(): Promise<void> {
        if (!inputValue.value.trim() || isStreaming.value) return

        queue = []
        isFlushing = false
        clearblink = true
        isStreaming.value = true
        const userText = inputValue.value
        inputValue.value = ''

        // 确保有当前会话（首条消息时自动创建）
        let convId = currentId.value
        if (convId === null) {
            convId = await createConversation(userText.slice(0, 28) || '新对话')
        }

        const userMsgId = crypto.randomUUID()

        // 写入用户消息到内存
        addMessage({ id: userMsgId, role: 'user', content: userText, status: 'done' })

        // 保存用户消息到 DB
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

        // 创建 AI 占位消息
        const aiMsg = createAssistantMessage()
        streamCtrl = createStreamController(aiMsg.id)

        try {
            await generateStreamWithContext(
                messages.value,
                userText,
                (chunk) => {
                    if (streamCtrl?.isAborted) return
                    queue.push(chunk)
                    flushQueue(aiMsg.id)
                    if (!userAtBottom) {
                        unreadCount.value++
                    } else {
                        scheduleScroll()
                    }
                },
                () => {
                    clearblink = false
                    if (streamCtrl?.isAborted) {
                        abortMessage(aiMsg.id)
                    } else {
                        finishMessage(aiMsg.id)
                        formatFinishedMessage(aiMsg.id)
                    }
                },
                streamCtrl.controller.signal
            )
        } finally {
            isStreaming.value = false
            scheduleScroll()

            if (clearblink && !streamCtrl?.isAborted) {
                finishMessage(aiMsg.id)
            }

            // 保存 AI 消息并更新会话时间
            await persistMessage(aiMsg.id, convId)
            await db.conversations.update(convId, { updatedAt: Date.now() })
            await refreshList()
        }
    }

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

    async function handleContinue(messageId: string) {
        const msg = messages.value.find(m => m.id === messageId)
        if (!msg || currentId.value === null) return

        const convId = currentId.value
        msg.status = 'loading'
        msg.canContinue = false
        streamCtrl = createStreamController(msg.id)

        await generateStreamWithContext(
            messages.value,
            '',
            (chunk) => {
                if (streamCtrl?.isAborted) return
                appendToMessage(msg.id, chunk)
            },
            async () => {
                if (streamCtrl?.isAborted) {
                    abortMessage(msg.id)
                } else {
                    finishMessage(msg.id)
                    await formatFinishedMessage(msg.id)
                }
                await persistMessage(msg.id, convId)
                await db.conversations.update(convId, { updatedAt: Date.now() })
                await refreshList()
            },
            streamCtrl.controller.signal
        )
    }

    function handleStop() {
        if (!streamCtrl) return
        streamCtrl.abort()
        abortMessage(streamCtrl.messageId)
        isStreaming.value = false
        // AI 消息的持久化在 handleSend 的 finally 中完成
    }

    // ── 生命周期 ──────────────────────────────────────────

    onMounted(async () => {
        containerRef.value?.addEventListener('scroll', handleScroll)
        await loadAll()
        // 自动选中最近的会话
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
