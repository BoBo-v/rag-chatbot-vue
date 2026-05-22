import { ref, computed, watch } from 'vue'
import { searchService } from '../search/SearchService'
import type { SearchResult } from '../search/types'

interface UseConversationSearchOptions {
    onSelect: (conversationId: number) => void
    canSelect?: () => boolean
}

export function useConversationSearch(options: UseConversationSearchOptions) {
    const conversationSearchDraft = ref('')
    const isSearchLoading = ref(false)
    const searchError = ref('')
    const searchResults = ref<SearchResult[]>([])
    const isSearchMode = computed(() => conversationSearchDraft.value.trim().length > 0)
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
