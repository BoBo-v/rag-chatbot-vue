import { nextTick, ref } from 'vue'

export function useChatScroll() {
    const unreadCount = ref<number>(0)
    const containerRef = ref<HTMLDivElement | null>(null)

    const BOTTOM_THRESHOLD = 80
    let userAtBottom = true
    let isScrolling = false
    let attachedElement: HTMLDivElement | null = null

    function isAtBottom(): boolean {
        const el = containerRef.value
        if (!el) return false
        return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD
    }

    function scheduleScroll(): void {
        if (!userAtBottom || isScrolling) return
        isScrolling = true
        requestAnimationFrame(async () => {
            try {
                await nextTick()
                const el = containerRef.value
                if (el) el.scrollTop = el.scrollHeight
            } finally {
                isScrolling = false
            }
        })
    }

    async function scrollToBottom(options?: { smooth?: boolean } | boolean | Event): Promise<void> {
        await nextTick()
        const el = containerRef.value
        if (!el) return
        const isSmooth = options === false ? false : true
        if (isSmooth) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
        } else {
            el.scrollTop = el.scrollHeight
        }
        unreadCount.value = 0
        userAtBottom = true
    }

    function resetAfterConversationChange(): void {
        const el = containerRef.value
        if (el) el.scrollTop = el.scrollHeight
        unreadCount.value = 0
        userAtBottom = true
    }

    function handleScroll(): void {
        const atBottom = isAtBottom()
        userAtBottom = atBottom
        if (atBottom) unreadCount.value = 0
    }

    function handleIncomingChunk(): void {
        if (!userAtBottom) {
            if (unreadCount.value === 0) {
                unreadCount.value = 1
            }
        } else {
            scheduleScroll()
        }
    }

    function attachScrollListener(): void {
        const el = containerRef.value
        if (!el || attachedElement === el) return
        attachedElement?.removeEventListener('scroll', handleScroll)
        attachedElement = el
        attachedElement.addEventListener('scroll', handleScroll)
        userAtBottom = isAtBottom()
    }

    function detachScrollListener(): void {
        attachedElement?.removeEventListener('scroll', handleScroll)
        attachedElement = null
    }

    return {
        unreadCount,
        containerRef,
        scheduleScroll,
        scrollToBottom,
        resetAfterConversationChange,
        handleIncomingChunk,
        attachScrollListener,
        detachScrollListener,
    }
}
