import Dexie, { type Table } from 'dexie'

export interface DBConversation {
    id?: number
    title: string
    createdAt: number
    updatedAt: number
}

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

export interface DBMessage {
    id: string
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    images?: DBImage[]
    files?: DBFile[]
    status: string
    canContinue?: boolean
    errorMessage?: string
    createdAt: number
}

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

export interface DBSearchTerm {
    term: string
    docId: number
    tf: number
    positions?: number[]
}

export interface DBSearchTermStat {
    term: string
    df: number
    updatedAt: number
}

export interface DBSearchTag {
    tag: string
    docId: number
}

export interface DBRecentSearch {
    id?: number
    query: string
    filtersHash: string
    usedAt: number
    hitCount: number
}

export interface DBSearchMeta {
    key: string
    value: string
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

    constructor() {
        super('ai-chat-db')
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
    }
}

export const db = new ChatDB()
