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

export interface DBMessage {
    id: string
    conversationId: number
    role: 'user' | 'assistant'
    content: string
    images?: DBImage[]
    status: string
    canContinue?: boolean
    errorMessage?: string
    createdAt: number
}

class ChatDB extends Dexie {
    conversations!: Table<DBConversation, number>
    messages!: Table<DBMessage, string>

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
    }
}

export const db = new ChatDB()
