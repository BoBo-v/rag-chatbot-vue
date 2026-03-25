export type Role = 'user' | 'assistant'

export type MessageStatus = 'loading' | 'streaming' | 'done' | 'error'

export interface Message {
    id: string
    role: Role
    content: string
    status: MessageStatus,
    time?: string
}