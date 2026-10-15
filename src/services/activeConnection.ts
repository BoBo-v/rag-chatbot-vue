import type { AppSettings } from '../stores/settings'
import type {
    ActiveConnection,
    BackendProviderId,
    DirectProviderId,
    ModelTransport,
} from '../types/model'
import type { BackendChatProvider } from './knowledge'
import { supportsVision } from './modelCapabilities'

const env = (import.meta as { env?: Record<string, any> }).env
const configuredApiBaseUrl = (env?.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''

export function directToBackendProvider(direct: DirectProviderId): BackendProviderId {
    if (direct === 'claude') return 'anthropic'
    if (direct === 'openai') return 'openai'
    return 'ollama'
}

export function backendToDirectProvider(backend: BackendProviderId): DirectProviderId {
    if (backend === 'anthropic') return 'claude'
    if (backend === 'openai') return 'openai'
    return 'ollama'
}

export function getDefaultBackendProviderName(providerId: BackendProviderId): string {
    switch (providerId) {
        case 'ollama':
            return 'Ollama (本地)'
        case 'openai':
            return 'DeepSeek / OpenAI 兼容'
        case 'anthropic':
            return 'Claude 服务'
        default:
            return providerId
    }
}

export function getDefaultDirectProviderName(providerId: DirectProviderId): string {
    switch (providerId) {
        case 'ollama':
            return '本机 Ollama'
        case 'openai':
            return 'OpenAI 兼容'
        case 'claude':
            return 'Anthropic Claude'
        default:
            return providerId
    }
}

function resolveBrowserOrigin(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin
    }
    return 'http://localhost:3001'
}

export function resolveActiveConnection(
    settings: AppSettings,
    backendProviders?: BackendChatProvider[]
): ActiveConnection {
    const transport: ModelTransport = settings.transport === 'backend' ? 'backend' : 'direct'

    if (transport === 'backend') {
        const providerId: BackendProviderId = settings.backend?.provider || 'ollama'
        const matched = backendProviders?.find(p => p.id === providerId)
        const providerName = matched?.name?.trim() || getDefaultBackendProviderName(providerId)

        const defaultModel = matched?.defaultModel?.trim() || matched?.models?.[0]?.trim() || 'qwen2.5:7b'
        const model = settings.backend?.model?.trim() || defaultModel

        const baseUrl = settings.backend?.url?.trim() || configuredApiBaseUrl || resolveBrowserOrigin()
        const isConfigured = Boolean(matched ? matched.configured : true) && Boolean(model)

        return {
            transport: 'backend',
            providerId,
            providerName,
            model,
            baseUrl,
            apiKeySource: 'backend',
            summaryLabel: `后端调用 · ${providerName} · ${model}`,
            capabilities: {
                chatStream: true,
                agentTools: matched?.capabilities?.agentTools ?? true,
                vision: false,
                rag: true,
            },
            visionDisabledReason: '当前连接不支持图片输入 (模型或后端接口未开启)',
            isConfigured,
            error: !isConfigured ? '后端服务未就绪或未选择模型' : undefined,
        }
    }

    // Direct mode
    const providerId: DirectProviderId = settings.provider || 'ollama'
    const providerName = getDefaultDirectProviderName(providerId)

    let model = ''
    let baseUrl = ''
    let apiKeySource: 'local' | 'none' = 'local'
    let isConfigured = false

    switch (providerId) {
        case 'openai':
            model = settings.openai?.model?.trim() || 'gpt-4o'
            baseUrl = settings.openai?.baseUrl?.trim() || 'https://api.openai.com'
            apiKeySource = 'local'
            isConfigured = Boolean(settings.openai?.apiKey?.trim()) && Boolean(model)
            break
        case 'claude':
            model = settings.claude?.model?.trim() || 'claude-sonnet-4-6'
            baseUrl = 'https://api.anthropic.com'
            apiKeySource = 'local'
            isConfigured = Boolean(settings.claude?.apiKey?.trim()) && Boolean(model)
            break
        case 'ollama':
        default:
            model = settings.ollama?.model?.trim() || 'qwen2.5:7b'
            baseUrl = settings.ollama?.url?.trim() || 'http://localhost:11434'
            apiKeySource = 'none'
            isConfigured = Boolean(model)
            break
    }

    const vision = supportsVision({
        provider: providerId,
        transport: 'direct',
        model,
        label: '',
        systemPrompt: '',
        maxContextTokens: 0,
        responseTimeoutSeconds: 0,
    })

    return {
        transport: 'direct',
        providerId,
        providerName,
        model,
        baseUrl,
        apiKeySource,
        summaryLabel: `前端直连 · ${providerName} · ${model}`,
        capabilities: {
            chatStream: true,
            agentTools: false,
            vision,
            rag: false,
        },
        visionDisabledReason: vision ? undefined : '当前模型不支持图片输入',
        isConfigured,
        error: !isConfigured ? (apiKeySource === 'local' ? '未填写 API Key 或未选择模型' : '未选择模型') : undefined,
    }
}
