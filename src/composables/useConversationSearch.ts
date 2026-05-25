import { ref, computed, watch } from 'vue'
import { searchService } from '../search/SearchService'
import type { SearchResult } from '../search/types'

interface UseConversationSearchOptions {
    onSelect: (conversationId: number) => void
    canSelect?: () => boolean
}

// 管理侧边栏搜索框的状态和请求节流。
// 组件只关心输入框、loading、结果列表和点击结果，真正搜索由 searchService 交给 Web Worker 执行。
export function useConversationSearch(options: UseConversationSearchOptions) {
    const conversationSearchDraft = ref('')
    const isSearchLoading = ref(false)
    const searchError = ref('')
    const searchResults = ref<SearchResult[]>([])
    const isSearchMode = computed(() => conversationSearchDraft.value.trim().length > 0)

    // 每次输入变化都会递增序号。旧请求回来时如果序号不一致，就丢弃它，避免旧结果覆盖新结果。
    let searchRequestSeq = 0

    watch(conversationSearchDraft, (value) => {
        const query = value.trim()
        const requestSeq = ++searchRequestSeq
        searchError.value = ''

        if (!query) {
            isSearchLoading.value = false
            searchResults.value = []
            return
        }

        isSearchLoading.value = true
        // 简单防抖：用户停止输入 250ms 后再真正搜索，减少 worker 和 IndexedDB 压力。
        window.setTimeout(async () => {
            if (requestSeq !== searchRequestSeq) return
            try {
                const results = await searchService.search({ query, limit: 20 })
                if (requestSeq !== searchRequestSeq) return
                searchResults.value = results
            } catch (err: unknown) {
                if (requestSeq !== searchRequestSeq) return
                searchResults.value = []
                searchError.value = err instanceof Error ? err.message : '搜索失败'
            } finally {
                if (requestSeq === searchRequestSeq) {
                    isSearchLoading.value = false
                }
            }
        }, 250)
    })

    function handleSearchResultClick(conversationId: number) {
        if (options.canSelect && !options.canSelect()) return
        options.onSelect(conversationId)
    }

    return {
        conversationSearchDraft,
        isSearchLoading,
        searchError,
        searchResults,
        isSearchMode,
        handleSearchResultClick,
    }
}
