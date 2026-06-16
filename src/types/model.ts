import type { BackendChatProviderType, BackendRagMode, ProviderType } from '../stores/settings'
import type { FileAttachment, ImageAttachment } from './chat'

export type ModelProvider = ProviderType
export type ModelTransport = 'direct' | 'backend'

export interface ModelRuntimeConfig {
    provider: ModelProvider
    transport: ModelTransport
    label: string
    model: string
    baseUrl?: string
    apiKey?: string
    systemPrompt: string
    maxContextTokens: number
    responseTimeoutSeconds: number
    backendRagMode?: BackendRagMode
    backendProvider?: BackendChatProviderType
    backendModel?: string
}

export type ComparisonRunStatus =
    | 'idle'
    | 'loading'
    | 'streaming'
    | 'done'
    | 'error'
    | 'aborted'

export interface ComparisonRun {
    id: string
    sessionId: string
    config: ModelRuntimeConfig
    content: string
    status: ComparisonRunStatus
    errorMessage?: string
    startedAt?: number
    finishedAt?: number
    latencyMs?: number
    sourceRunIds?: string[]
}

export interface ComparisonSession {
    id: string
    conversationId?: number
    prompt: string
    images?: ImageAttachment[]
    files?: FileAttachment[]
    runs: ComparisonRun[]
    summaryRun?: ComparisonRun
    summaryInstruction?: string
    workflowVersion: number
    promptVersion: number
    createdAt: number
    updatedAt: number
}
