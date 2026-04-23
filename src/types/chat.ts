export type Role = 'user' | 'assistant'

export type MessageStatus = 'loading' | 'streaming' | 'done' | 'error' | 'aborted'

export interface Message {
    id: string
    role: Role
    content: string
    status: MessageStatus
    time?: string
    canContinue?: boolean
    formattedContent?: string
}

export interface Conversation {
    id: number
    title: string
    createdAt: number
    updatedAt: number
}
export interface StreamController {
    messageId: string
    controller: AbortController
    reader: ReadableStreamDefaultReader | null
    isAborted: boolean
    abort(): void
}