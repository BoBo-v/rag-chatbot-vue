import type { Conversation, Message, Role } from '../types/chat'

export interface SearchIndexInput {
    message: Message
    conversation: Conversation
    createdAt?: number
    updatedAt?: number
    tags?: string[]
}

export interface SearchFilters {
    tags?: string[]
    role?: Role | 'all'
    from?: number
    to?: number
}

export interface SearchQuery {
    query: string
    filters?: SearchFilters
    limit?: number
}

export interface SearchResult {
    conversationId: number
    messageId: string
    title: string
    snippet: string
    score: number
    updatedAt: number
}

export interface RecentSearch {
    query: string
    filtersHash: string
    usedAt: number
    hitCount: number
}

export type WorkerRequest =
    | { type: 'INDEX_MESSAGE'; requestId: string; payload: SearchIndexInput }
    | { type: 'DELETE_CONVERSATION'; requestId: string; payload: { conversationId: number } }
    | { type: 'SEARCH'; requestId: string; payload: SearchQuery }
    | { type: 'SUGGEST'; requestId: string; payload: { prefix: string; limit?: number } }
    | { type: 'GET_RECENT_SEARCHES'; requestId: string; payload?: { limit?: number } }
    | { type: 'CLEAR_RECENT_SEARCHES'; requestId: string }
    | { type: 'ENSURE_INDEX'; requestId: string }
    | { type: 'REBUILD_INDEX'; requestId: string }

export type WorkerResponse =
    | { type: 'SUCCESS'; requestId: string; payload?: unknown }
    | { type: 'ERROR'; requestId: string; error: string }

export type WorkerRequestInput = WorkerRequest extends infer Request
    ? Request extends { requestId: string }
        ? Omit<Request, 'requestId'>
        : never
    : never
