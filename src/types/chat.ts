export type Role = 'user' | 'assistant'

export type MessageStatus = 'loading' | 'streaming' | 'done' | 'error' | 'aborted'

export interface ImageAttachment {
    base64: string
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
    name: string
}

export interface FileAttachment {
    name: string
    content: string
    size: number
}

export interface Message {
    id: string
    role: Role
    content: string
    images?: ImageAttachment[]
    files?: FileAttachment[]
    status: MessageStatus
    time?: string
    canContinue?: boolean
    formattedContent?: string
    errorMessage?: string
}

export type ChatErrorType = 'network' | 'auth' | 'server' | 'timeout' | 'unknown'

export interface ChatError {
    type: ChatErrorType
    message: string
    status?: number
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