import { SearchWorkerClient } from './SearchWorkerClient'
import type { RecentSearch, SearchIndexInput, SearchQuery, SearchResult } from './types'

class SearchService {
    private readonly client = new SearchWorkerClient()

    indexMessage(input: SearchIndexInput): Promise<void> {
        return this.client.request<void>({ type: 'INDEX_MESSAGE', payload: input })
    }

    deleteConversation(conversationId: number): Promise<void> {
        return this.client.request<void>({
            type: 'DELETE_CONVERSATION',
            payload: { conversationId },
        })
    }

    search(query: SearchQuery): Promise<SearchResult[]> {
        return this.client.request<SearchResult[]>({ type: 'SEARCH', payload: query })
    }

    suggest(prefix: string, limit = 8): Promise<string[]> {
        return this.client.request<string[]>({
            type: 'SUGGEST',
            payload: { prefix, limit },
        })
    }

    getRecentSearches(limit = 10): Promise<RecentSearch[]> {
        return this.client.request<RecentSearch[]>({
            type: 'GET_RECENT_SEARCHES',
            payload: { limit },
        })
    }

    clearRecentSearches(): Promise<void> {
        return this.client.request<void>({ type: 'CLEAR_RECENT_SEARCHES' })
    }

    rebuildIndex(): Promise<void> {
        return this.client.request<void>({ type: 'REBUILD_INDEX' })
    }

    dispose(): void {
        this.client.dispose()
    }
}

export const searchService = new SearchService()
