import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useChat } from '../stores/chat'
import { generateStream } from '../services/ollama'

export function useChatView() {
    const { messages, addMessage, createAssistantMessage, appendToMessage, finishMessage } = useChat()

    // ── 状态 ──────────────────────────────────────────────
    const inputValue   = ref<string>('')
    const isStreaming  = ref<boolean>(false)
    const unreadCount  = ref<number>(0)
    const containerRef = ref<HTMLDivElement | null>(null)

    // 用普通变量而非 ref，不需要模板绑定，避免响应式开销
    let userAtBottom = true
    let isScrolling  = false

    // ── 滚动相关 ──────────────────────────────────────────

    /** 判断是否已经在底部（阈值 20px） */
    function isAtBottom(): boolean {
        const el = containerRef.value
        if (!el) return false
        return el.scrollHeight - el.scrollTop - el.clientHeight < 20
    }

    /**
     * 用 rAF + nextTick 合并多次滚动请求为一帧一次
     * 原理：isScrolling 标志在同一帧内拦截重复调用，
     *       rAF 保证在浏览器下一次绘制前执行，
     *       nextTick 保证 Vue DOM 已刷新后再读 scrollHeight
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

    /** 点击"新消息"提示时手动滚到底部 */
    async function scrollToBottom(): Promise<void> {
        await nextTick()
        const el = containerRef.value
        if (!el) return
        el.scrollTop = el.scrollHeight
        unreadCount.value = 0
        userAtBottom = true
    }

    /** 监听用户手动滚动 */
    function handleScroll(): void {
        const atBottom = isAtBottom()
        userAtBottom = atBottom
        if (atBottom) unreadCount.value = 0
    }

    // ── 发送消息 ──────────────────────────────────────────

    async function handleSend(): Promise<void> {
        if (!inputValue.value.trim() || isStreaming.value) return

        isStreaming.value = true
        const userInput = inputValue.value
        inputValue.value = ''

        // 1. 写入用户消息
        addMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: userInput,
            status: 'done',
        })

        // 2. 创建 AI 占位消息，保存引用用于后续 append
        const aiMsg = createAssistantMessage()

        try {
            // 3. 流式接收
            await generateStream(
                userInput,
                (chunk) => {
                    appendToMessage(aiMsg.id, chunk)
                    // 用户不在底部时累计未读数，否则自动滚动
                    if (!userAtBottom) {
                        unreadCount.value++
                    } else {
                        scheduleScroll()
                    }
                },
                () => {
                    // done 信号：关闭 loading 状态
                    finishMessage(aiMsg.id)
                }
            )
        } finally {
            // 无论成功 / 报错都解除禁用
            isStreaming.value = false
            scheduleScroll()
        }
    }

    // ── 生命周期 ──────────────────────────────────────────

    onMounted(() => {
        containerRef.value?.addEventListener('scroll', handleScroll)
    })

    onUnmounted(() => {
        containerRef.value?.removeEventListener('scroll', handleScroll)
    })

    // ── 对外暴露 ──────────────────────────────────────────
    return {
        // 数据
        messages,
        inputValue,
        isStreaming,
        unreadCount,
        containerRef,
        // 方法
        handleSend,
        scrollToBottom,
    }
}