import { nextTick, ref } from 'vue'

export function useChatScroll() {
    const unreadCount = ref<number>(0)
    const containerRef = ref<HTMLDivElement | null>(null)

    let userAtBottom = true
    let isScrolling = false

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
            unreadCount.value++
        } else {
            scheduleScroll()
        }
    }

    function attachScrollListener(): void {
        containerRef.value?.addEventListener('scroll', handleScroll)
    }

    function detachScrollListener(): void {
        containerRef.value?.removeEventListener('scroll', handleScroll)
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
