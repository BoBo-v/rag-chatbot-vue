import type { ProviderType } from '../stores/settings'

export type ModelProvider = ProviderType

export interface ModelRuntimeConfig {
    provider: ModelProvider
    label: string
    model: string
    baseUrl?: string
    apiKey?: string
    systemPrompt: string
    maxContextTokens: number
}
