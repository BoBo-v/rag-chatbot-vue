import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useChat } from '../stores/chat'
import { generateStreamWithContext} from '../services/ollama'

export function useChatView() {
    const { messages,abortMessage, addMessage, createAssistantMessage, appendToMessage, finishMessage } = useChat()

    // ── 状态 ──────────────────────────────────────────────
    const inputValue   = ref<string>('')
    const isStreaming  = ref<boolean>(false)
    const unreadCount  = ref<number>(0)
    const containerRef = ref<HTMLDivElement | null>(null)

    // 用普通变量而非 ref，不需要模板绑定，避免响应式开销
    let userAtBottom = true
    let isScrolling  = false
    let stopped = false
    let controller: AbortController | null = null// 流式请求控制器
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
            console.log('scrollToBottom执行')
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
    let queue: string[] = []
    let isFlushing = false
    let clearblink=true
    let streamCtrl: ReturnType<typeof createStreamController> | null = null

    async function handleSend(): Promise<void> {
        if (!inputValue.value.trim() || isStreaming.value) return

        queue = []
        isFlushing = false
        isStreaming.value = true
        stopped = false
        controller = new AbortController()
        const userText = inputValue.value
        inputValue.value = ''

        // 1. 写入用户消息
        addMessage({
            id: crypto.randomUUID(),
            role: 'user',
            content: userText,
            status: 'done',
        })
        await nextTick()
        scheduleScroll()
        // 2. 创建 AI 占位消息，保存引用用于后续 append
        const aiMsg = createAssistantMessage()
        streamCtrl = createStreamController(aiMsg.id)
        try {
            // 3. 流式接收
            await generateStreamWithContext(
                messages.value,
                userText,
                (chunk) => {
                    if (streamCtrl?.isAborted) return
                    // appendToMessage(aiMsg.id, chunk)
                    queue.push(chunk)
                    flushQueue(aiMsg.id)

                    if (!userAtBottom) {
                        unreadCount.value++
                    } else {
                        scheduleScroll()
                    }
                },
                () => {
                    clearblink= false
                    if (streamCtrl?.isAborted) {
                        abortMessage(aiMsg.id)
                    } else {
                        finishMessage(aiMsg.id)
                    }
                },
                streamCtrl.controller.signal
            )
        } finally {
            // 无论成功 / 报错都解除禁用
            isStreaming.value = false
            scheduleScroll()
            if(clearblink && !streamCtrl?.isAborted){ //离开处理光标闪烁问题
                finishMessage(aiMsg.id)
            }
        }
    }

    function flushQueue(messageId: string) {
        if (isFlushing) return

        isFlushing = true

        function step() {
            if (queue.length === 0) {
                isFlushing = false
                return
            }
            //  控制“每帧输出多少”
            const chunk = queue.shift()!
            // 可以做更细粒度拆分（关键优化点）
            const chars = chunk.split('')

            let i = 0

            function typeChar() {
                const currentCtrl = streamCtrl

                if (currentCtrl?.isAborted) return

                if (i >= chars.length) {
                    requestAnimationFrame(step) // 回到下一 chunk
                    return
                }
                const char = chars[i]
                if (!char) {
                    requestAnimationFrame(step)
                    return
                }
                appendToMessage(messageId, chars[i])
                i++

                requestAnimationFrame(typeChar)
            }

            typeChar()
        }

        requestAnimationFrame(step)
    }
    function createStreamController(messageId: string) {
        const controller = new AbortController()

        return {
            messageId,
            controller,
            reader: null as ReadableStreamDefaultReader | null,
            isAborted: false,

            abort() {
                this.isAborted = true
                this.controller.abort()
                this.reader?.cancel()
            }
        }
    }
    /**
     * 处理继续生成逻辑，基于现有消息继续流式生成内容
     * @param messageId - 要继续生成的消息的唯一标识符
     */
    async function handleContinue(messageId: string) {
        const msg = messages.value.find(m => m.id === messageId)
        if (!msg) return

        // 重新进入 streaming
        msg.status = 'loading'
        msg.canContinue = false

        streamCtrl = createStreamController(msg.id)

        await generateStreamWithContext(
            messages.value,
            '', // 这里关键点：不需要新用户输入
            (chunk) => {
                if (streamCtrl?.isAborted) return
                appendToMessage(msg.id, chunk)
            },
            () => {
                if (streamCtrl?.isAborted) {
                    abortMessage(msg.id)
                } else {
                    finishMessage(msg.id)
                }
            },
            streamCtrl.controller.signal
        )
    }
    /**
     * 处理停止流式响应的操作
     * 中止当前的请求控制器并重置流状态
     */
    function handleStop() {
        if (!streamCtrl) return

        streamCtrl.abort()

        abortMessage(streamCtrl.messageId)

        isStreaming.value = false
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
        controller,
        // 方法
        handleSend,
        scrollToBottom,
        handleStop,
        handleContinue
    }
}