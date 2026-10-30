import type { AppSettings } from '../stores/settings'
import type { ModelRuntimeConfig } from '../types/model'
import type { BackendChatProvider, BackendProvidersCatalog } from '../types/connection'
import { resolveActiveConnection } from './activeConnection'

export function createRuntimeFromSettings(
    appSettings: AppSettings,
    catalogOrProviders?: BackendProvidersCatalog | BackendChatProvider[]
): ModelRuntimeConfig {
    const active = resolveActiveConnection(appSettings, catalogOrProviders)
    const common = {
        transport: active.transport,
        systemPrompt: appSettings.systemPrompt,
        maxContextTokens: appSettings.maxContextTokens,
        responseTimeoutSeconds: appSettings.responseTimeoutSeconds,
        scenario: appSettings.scenario ?? 'ticket',
    }

    if (active.transport === 'backend') {
        return {
            ...common,
            provider: active.providerId,
            label: active.summaryLabel,
            model: active.model,
            baseUrl: active.baseUrl,
            backendRagMode: appSettings.ragMode,
            backendProvider: (active.providerId === 'claude' ? 'anthropic' : active.providerId) as import('../stores/settings').BackendChatProviderType,
            backendModel: active.model,
        }
    }

    switch (active.providerId) {
        case 'openai':
            return {
                ...common,
                provider: 'openai',
                label: active.summaryLabel,
                model: active.model,
                baseUrl: active.baseUrl,
                apiKey: appSettings.openai.apiKey,
            }
        case 'claude':
            return {
                ...common,
                provider: 'claude',
                label: active.summaryLabel,
                model: active.model,
                baseUrl: active.baseUrl,
                apiKey: appSettings.claude.apiKey,
            }
        case 'ollama':
        default:
            return {
                ...common,
                provider: 'ollama',
                label: active.summaryLabel,
                model: active.model,
                baseUrl: active.baseUrl,
            }
    }
}

export function freezeRuntime(runtime: ModelRuntimeConfig): Readonly<ModelRuntimeConfig> {
    return Object.freeze({ ...runtime })
}

export function getRuntimeDisplayName(runtime: ModelRuntimeConfig): string {
    return runtime.label || `${runtime.provider} - ${runtime.model}`
}
