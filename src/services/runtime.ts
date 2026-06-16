import type { AppSettings } from '../stores/settings'
import type { ModelRuntimeConfig } from '../types/model'

export function createRuntimeFromSettings(appSettings: AppSettings): ModelRuntimeConfig {
    const common = {
        provider: appSettings.provider,
        transport: appSettings.transport,
        systemPrompt: appSettings.systemPrompt,
        maxContextTokens: appSettings.maxContextTokens,
        responseTimeoutSeconds: appSettings.responseTimeoutSeconds,
    }

    if (appSettings.transport === 'backend') {
        return {
            ...common,
            label: `后端代理 - ${appSettings.backend.model || appSettings.ollama.model}`,
            model: appSettings.backend.model || appSettings.ollama.model,
            backendRagMode: appSettings.ragMode,
            backendProvider: appSettings.backend.provider,
            backendModel: appSettings.backend.model || appSettings.ollama.model,
        }
    }

    switch (appSettings.provider) {
        case 'openai':
            return {
                ...common,
                label: `OpenAI - ${appSettings.openai.model}`,
                model: appSettings.openai.model,
                baseUrl: appSettings.openai.baseUrl,
                apiKey: appSettings.openai.apiKey,
            }
        case 'claude':
            return {
                ...common,
                label: `Claude - ${appSettings.claude.model}`,
                model: appSettings.claude.model,
                apiKey: appSettings.claude.apiKey,
            }
        case 'ollama':
        default:
            return {
                ...common,
                provider: 'ollama',
                label: `Ollama - ${appSettings.ollama.model}`,
                model: appSettings.ollama.model,
                baseUrl: appSettings.ollama.url,
            }
    }
}

export function getRuntimeDisplayName(runtime: ModelRuntimeConfig): string {
    return runtime.label || `${runtime.provider} - ${runtime.model}`
}
