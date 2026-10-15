export type CatalogState = 'idle' | 'loading' | 'success' | 'error'

export interface BackendChatProviderCapabilities {
    chatStream: boolean
    agentTools: boolean
    vision: boolean
    rag: boolean
}

export interface BackendChatProvider {
    id: 'ollama' | 'openai' | 'anthropic'
    name: string
    defaultModel: string
    configured: boolean
    models?: string[]
    capabilities?: BackendChatProviderCapabilities
    error?: string
}

export interface BackendProvidersCatalog {
    state: CatalogState
    baseUrl: string
    providers: BackendChatProvider[]
    error?: string
}
