import type { AppSettings } from '../stores/settings'
import type {
    ActiveConnection,
    BackendProviderId,
    DirectProviderId,
    ModelTransport,
} from '../types/model'
import type { BackendChatProvider, BackendProvidersCatalog, CatalogState } from '../types/connection'
import { supportsVision } from './modelCapabilities'
import { resolveTargetBaseUrl } from './api'

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

export const toBackendProviderId = directToBackendProvider
export const toDirectProviderId = backendToDirectProvider

export function getDefaultBackendProviderName(providerId: BackendProviderId): string {
    switch (providerId) {
        case 'ollama':
            return 'Ollama (本地)'
        case 'openai':
            return 'OpenAI 服务'
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

export function resolveActiveConnection(
    settings: AppSettings,
    catalogOrProviders?: BackendProvidersCatalog | BackendChatProvider[]
): ActiveConnection {
    const transport: ModelTransport = settings.transport === 'backend' ? 'backend' : 'direct'

    if (transport === 'backend') {
        const providerId: BackendProviderId = settings.backend?.provider || 'ollama'
        const baseUrl = resolveTargetBaseUrl(settings.backend?.url)

        let catalogState: CatalogState | undefined
        let catalogError: string | undefined
        let providers: BackendChatProvider[] | undefined

        if (catalogOrProviders) {
            if (Array.isArray(catalogOrProviders)) {
                providers = catalogOrProviders
                catalogState = 'success'
            } else {
                const catalogBaseUrl = catalogOrProviders.baseUrl
                if (catalogBaseUrl && resolveTargetBaseUrl(catalogBaseUrl) !== baseUrl) {
                    catalogState = 'idle'
                    catalogError = '目录地址与当前配置不一致'
                    providers = undefined
                } else {
                    providers = catalogOrProviders.providers
                    catalogState = catalogOrProviders.state
                    catalogError = catalogOrProviders.error
                }
            }
        }

        const matched = providers?.find(p => p.id === providerId)
        const providerName = matched?.name?.trim() || getDefaultBackendProviderName(providerId)

        let model: string
        let isConfigured: boolean
        let error: string | undefined

        if (catalogState === 'loading') {
            isConfigured = false
            error = '后端服务目录正在加载中...'
            model = settings.backend?.model?.trim() || ''
        } else if (catalogState === 'error') {
            isConfigured = false
            error = catalogError || '后端服务元数据加载失败'
            model = settings.backend?.model?.trim() || ''
        } else if (catalogState === 'idle' || catalogOrProviders === undefined) {
            isConfigured = false
            error = catalogError || '后端服务目录未就绪'
            model = settings.backend?.model?.trim() || ''
        } else if (providers !== undefined) {
            if (!matched) {
                isConfigured = false
                error = `后端未配置厂商: ${providerName}`
                model = ''
            } else {
                let validModels: string[] = []
                if (Array.isArray(matched.models)) {
                    validModels = matched.models
                        .map(m => typeof m === 'string' ? m.trim() : (m as any)?.id?.trim())
                        .filter(Boolean)
                } else if (matched.defaultModel?.trim()) {
                    validModels = [matched.defaultModel.trim()]
                }

                const userModel = settings.backend?.model?.trim()
                if (userModel && validModels.includes(userModel)) {
                    model = userModel
                } else if (matched.defaultModel?.trim() && validModels.includes(matched.defaultModel.trim())) {
                    model = matched.defaultModel.trim()
                } else if (validModels.length > 0) {
                    model = validModels[0]
                } else {
                    model = ''
                }

                if (!matched.configured) {
                    isConfigured = false
                    error = matched.error || `${providerName} 未在后端配置可用密钥或地址`
                } else if (!model) {
                    isConfigured = false
                    error = `${providerName} 无可用模型候选`
                } else {
                    isConfigured = true
                    error = undefined
                }
            }
        } else {
            model = settings.backend?.model?.trim() || ''
            isConfigured = false
            error = '后端服务目录未就绪'
        }

        return {
            transport: 'backend',
            providerId,
            providerName,
            model,
            baseUrl,
            apiKeySource: 'backend',
            summaryLabel: `后端调用 · ${providerName} · ${model || '未选择'}`,
            capabilities: {
                chatStream: true,
                agentTools: matched?.capabilities?.agentTools ?? true,
                vision: false,
                rag: true,
            },
            visionDisabledReason: '当前连接不支持图片输入 (模型或后端接口未开启)',
            isConfigured,
            error,
        }
    }

    // Direct mode
    const providerId: DirectProviderId = settings.provider || 'ollama'
    const providerName = getDefaultDirectProviderName(providerId)

    let model: string
    let baseUrl: string
    let apiKeySource: 'local' | 'none'
    let isConfigured: boolean

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
