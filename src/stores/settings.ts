import { reactive, watch } from 'vue'

// 全局设置模块：所有页面和服务层都从这里读取当前模型、主题、API Key 等配置。
// 这里使用 Vue 的 reactive，让 UI 修改设置后，其他地方能立即感知变化。

export type ProviderType = 'ollama' | 'openai' | 'claude'
export type ThemeType   = 'dark' | 'light' | 'system'
export type BackendChatProviderType = 'ollama' | 'openai' | 'anthropic'
export type BackendRagMode = 'auto' | 'off' | 'force'
export type TransportMode = 'direct' | 'backend'

export interface AppSettings {
    transport: TransportMode
    provider: ProviderType
    theme: ThemeType
    systemPrompt: string
    maxContextTokens: number
    responseTimeoutSeconds: number
    showModelInTopbar: boolean
    ragMode: BackendRagMode
    backend: {
        provider: BackendChatProviderType
        model: string
    }
    ollama: {
        url: string
        model: string
    }
    openai: {
        apiKey: string
        baseUrl: string   // 支持 DeepSeek / 通义 / Kimi 等兼容地址
        model: string
    }
    claude: {
        apiKey: string
        model: string
    }
}

const STORAGE_KEY = 'ai-chat-settings'

// 默认设置。用户第一次打开应用，或者 localStorage 读取失败时会使用这些值。
const defaults: AppSettings = {
    transport: 'direct',
    provider: 'ollama',
    theme: 'dark',
    systemPrompt: '你是一个专业的 AI 助手，回答要简洁清晰。',
    maxContextTokens: 128000,
    responseTimeoutSeconds: 30,
    showModelInTopbar: true,
    ragMode: 'auto',
    backend: {
        provider: 'ollama',
        model: 'qwen2.5:7b',
    },
    ollama: {
        url: 'http://localhost:11434',
        model: 'qwen2.5:7b',
    },
    openai: {
        apiKey: '',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
    },
    claude: {
        apiKey: '',
        model: 'claude-sonnet-4-6',
    },
}

function load(): AppSettings {
    try {
        // localStorage 是浏览器本地持久化存储，刷新页面后仍然存在。
        // 注意：API Key 存在这里只是适合个人本地工具，公开部署应改为后端代理。
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const saved = JSON.parse(raw)
            // 只读取当前版本需要的字段。旧字段只用于迁移，不再写回 settings。
            return {
                ...defaults,
                provider: normalizeProvider(saved.provider),
                transport: normalizeTransportMode(saved.transport ?? saved.connectionMode, saved.ollama?.useBackendChat),
                theme: normalizeTheme(saved.theme),
                systemPrompt: typeof saved.systemPrompt === 'string' ? saved.systemPrompt : defaults.systemPrompt,
                maxContextTokens: normalizeMaxContextTokens(saved.maxContextTokens),
                responseTimeoutSeconds: normalizeTimeout(saved.responseTimeoutSeconds),
                showModelInTopbar: typeof saved.showModelInTopbar === 'boolean' ? saved.showModelInTopbar : defaults.showModelInTopbar,
                ragMode: normalizeBackendRagMode(saved.ragMode ?? saved.ollama?.backendRagMode, saved.ollama?.enableBackendRag),
                backend: {
                    provider: normalizeBackendProvider(saved.backend?.provider ?? saved.ollama?.backendProvider),
                    model: stringOrDefault(saved.backend?.model ?? saved.ollama?.backendModel, defaults.backend.model),
                },
                ollama: {
                    url: stringOrDefault(saved.ollama?.url, defaults.ollama.url),
                    model: stringOrDefault(saved.ollama?.model, defaults.ollama.model),
                },
                openai: {
                    apiKey: stringOrDefault(saved.openai?.apiKey, defaults.openai.apiKey),
                    baseUrl: stringOrDefault(saved.openai?.baseUrl, defaults.openai.baseUrl),
                    model: stringOrDefault(saved.openai?.model, defaults.openai.model),
                },
                claude: {
                    apiKey: stringOrDefault(saved.claude?.apiKey, defaults.claude.apiKey),
                    model: stringOrDefault(saved.claude?.model, defaults.claude.model),
                },
            }
        }
    } catch {}
    return {
        ...defaults,
        backend: { ...defaults.backend },
        ollama: { ...defaults.ollama },
        openai: { ...defaults.openai },
        claude: { ...defaults.claude },
    }
}

function normalizeProvider(value: unknown): ProviderType {
    if (value === 'ollama' || value === 'openai' || value === 'claude') return value
    return defaults.provider
}

function normalizeTheme(value: unknown): ThemeType {
    if (value === 'dark' || value === 'light' || value === 'system') return value
    return defaults.theme
}

function normalizeTransportMode(value: unknown, legacyUseBackendChat?: unknown): TransportMode {
    if (value === 'direct' || value === 'backend') return value
    return legacyUseBackendChat === true ? 'backend' : defaults.transport
}

function normalizeBackendProvider(value: unknown): BackendChatProviderType {
    if (value === 'ollama' || value === 'openai' || value === 'anthropic') return value
    return defaults.backend.provider
}

function normalizeBackendRagMode(value: unknown, legacyEnabled?: unknown): BackendRagMode {
    if (value === 'auto' || value === 'off' || value === 'force') return value
    if (legacyEnabled === false) return 'off'
    if (legacyEnabled === true) return 'force'
    return defaults.ragMode
}

function normalizeTimeout(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return defaults.responseTimeoutSeconds
    return Math.min(300, Math.max(5, Math.round(parsed)))
}

function normalizeMaxContextTokens(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return defaults.maxContextTokens
    return Math.max(1, Math.round(parsed))
}

function stringOrDefault(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback
}

export const settings = reactive<AppSettings>(load())

// deep watch 会监听嵌套字段，比如 settings.openai.apiKey。
// 任何设置变动都会自动保存，用户不需要手动管理 localStorage。
watch(settings, (val) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
    } catch (e) {
        console.warn('设置保存失败，可能存储空间不足', e)
    }
}, { deep: true })
