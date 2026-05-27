import Dexie, { type Table } from 'dexie'
import type { MessageStatus } from '../types/chat'
import type { ComparisonRunStatus, ModelRuntimeConfig } from '../types/model'

// 这个文件集中定义 IndexedDB 的表结构。
// Dexie 是 IndexedDB 的封装库，可以把浏览器本地数据库当成类型化的表来操作。

// 一条会话记录：侧边栏列表展示的就是 conversations 表。
export interface DBConversation {
    id?: number
    title: string
    createdAt: number
    updatedAt: number
}

// 图片和文件不会上传到后端存储，而是跟随消息一起保存在浏览器 IndexedDB。
export interface DBImage {
    base64: string
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
    name: string
}

export interface DBFile {
    name: string
    content: string
    size: number
}

// 一条聊天消息。conversationId 用来说明这条消息属于哪个会话。
export interface DBMessage {
    id: string
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    images?: DBImage[]
    files?: DBFile[]
    status: MessageStatus
    canContinue?: boolean
    errorMessage?: string
    createdAt: number
}

// 搜索索引里的“文档”。这里一条消息会被拆成一个可搜索文档。
export interface DBSearchDoc {
    docId?: number
    messageId: string
    conversationId: number
    role: 'user' | 'assistant'
    title: string
    content: string
    createdAt: number
    updatedAt: number
    length: number
    tags: string[]
}

// 倒排索引：term 表示词，docId 表示这个词出现在哪个搜索文档里。
// 搜索时先根据词找到候选文档，再计算排序分数。
export interface DBSearchTerm {
    term: string
    docId: number
    tf: number
    positions?: number[]
}

// 每个词的统计信息，df 是包含该词的文档数量，用于后续扩展排序算法。
export interface DBSearchTermStat {
    term: string
    df: number
    updatedAt: number
}

// 搜索标签表，目前预留给按标签过滤搜索结果。
export interface DBSearchTag {
    tag: string
    docId: number
}

// 最近搜索记录，用来支持搜索历史。
export interface DBRecentSearch {
    id?: number
    query: string
    filtersHash: string
    usedAt: number
    hitCount: number
}

// 搜索索引的元数据。indexVersion 用来判断是否需要重建索引。
export interface DBSearchMeta {
    key: string
    value: string
}

// 多模型对比记录独立于普通聊天会话，避免影响聊天历史、搜索和继续生成逻辑。
export interface DBComparisonSession {
    id: string
    conversationId?: number
    prompt: string
    images?: DBImage[]
    files?: DBFile[]
    summaryRunId?: string
    summaryInstruction?: string
    workflowVersion: number
    promptVersion: number
    createdAt: number
    updatedAt: number
}

export interface DBComparisonRun {
    id: string
    sessionId: string
    kind: 'answer' | 'summary'
    order: number
    config: ModelRuntimeConfig
    content: string
    status: ComparisonRunStatus
    errorMessage?: string
    startedAt?: number
    finishedAt?: number
    latencyMs?: number
    sourceRunIds?: string[]
}

class ChatDB extends Dexie {
    conversations!: Table<DBConversation, number>
    messages!: Table<DBMessage, string>
    searchDocs!: Table<DBSearchDoc, number>
    searchTerms!: Table<DBSearchTerm, [string, number]>
    searchTermStats!: Table<DBSearchTermStat, string>
    searchTags!: Table<DBSearchTag, [string, number]>
    recentSearches!: Table<DBRecentSearch, number>
    searchMeta!: Table<DBSearchMeta, string>
    comparisonSessions!: Table<DBComparisonSession, string>
    comparisonRuns!: Table<DBComparisonRun, string>

    constructor() {
        super('ai-chat-db')
        // Dexie 的 version(n).stores(...) 是数据库迁移声明。
        // 新增表或索引时要提升版本号，否则旧用户的本地数据库不会自动升级。
        this.version(1).stores({
            conversations: '++id, updatedAt',
            messages: 'id, conversationId'
        })
        this.version(2).stores({
            conversations: '++id, updatedAt',
            messages: 'id, conversationId'
        })
        this.version(3).stores({
            conversations: '++id, updatedAt',
            messages: 'id, conversationId',
            searchDocs: '++docId, &messageId, conversationId, updatedAt, createdAt, role',
            searchTerms: '[term+docId], term, docId',
            searchTermStats: 'term',
            searchTags: '[tag+docId], tag, docId',
            recentSearches: '++id, query, usedAt',
            searchMeta: 'key'
        })
        this.version(4).stores({
            conversations: '++id, updatedAt',
            messages: 'id, conversationId',
            searchDocs: '++docId, &messageId, conversationId, updatedAt, createdAt, role',
            searchTerms: '[term+docId], term, docId',
            searchTermStats: 'term',
            searchTags: '[tag+docId], tag, docId',
            recentSearches: '++id, query, usedAt',
            searchMeta: 'key',
            comparisonSessions: 'id, conversationId, updatedAt, createdAt',
            comparisonRuns: 'id, sessionId, status, startedAt, finishedAt'
        })
    }
}

export const db = new ChatDB()
