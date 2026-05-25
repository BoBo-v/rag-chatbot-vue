import type { Conversation, Message, Role } from '../types/chat'

// 搜索模块的类型定义。
// 主线程和 worker 之间传递的数据都在这里声明，方便 TypeScript 检查消息格式。

// 写入索引时需要一条消息和它所属的会话。
export interface SearchIndexInput {
    message: Message
    conversation: Conversation
    createdAt?: number
    updatedAt?: number
    tags?: string[]
}

// 搜索过滤条件，目前支持角色、时间范围和标签。
export interface SearchFilters {
    tags?: string[]
    role?: Role | 'all'
    from?: number
    to?: number
}

// 搜索请求：query 是关键词，limit 控制最多返回多少条。
export interface SearchQuery {
    query: string
    filters?: SearchFilters
    limit?: number
}

// UI 展示的搜索结果。虽然索引按消息存储，但侧边栏会按会话聚合展示。
export interface SearchResult {
    conversationId: number
    messageId: string
    title: string
    snippet: string
    score: number
    updatedAt: number
}

// 最近搜索历史，用于以后做搜索建议或历史记录。
export interface RecentSearch {
    query: string
    filtersHash: string
    usedAt: number
    hitCount: number
}

// WorkerRequest 是主线程可以发给 worker 的所有命令。
export type WorkerRequest =
    | { type: 'INDEX_MESSAGE'; requestId: string; payload: SearchIndexInput }
    | { type: 'DELETE_CONVERSATION'; requestId: string; payload: { conversationId: number } }
    | { type: 'SEARCH'; requestId: string; payload: SearchQuery }
    | { type: 'SUGGEST'; requestId: string; payload: { prefix: string; limit?: number } }
    | { type: 'GET_RECENT_SEARCHES'; requestId: string; payload?: { limit?: number } }
    | { type: 'CLEAR_RECENT_SEARCHES'; requestId: string }
    | { type: 'ENSURE_INDEX'; requestId: string }
    | { type: 'REBUILD_INDEX'; requestId: string }

// WorkerResponse 是 worker 返回给主线程的结果。成功时 payload 可有可无，失败时带 error。
export type WorkerResponse =
    | { type: 'SUCCESS'; requestId: string; payload?: unknown }
    | { type: 'ERROR'; requestId: string; error: string }

export type WorkerRequestInput = WorkerRequest extends infer Request
    ? Request extends { requestId: string }
        ? Omit<Request, 'requestId'>
        : never
    : never
