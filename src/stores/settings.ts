import { reactive, watch } from 'vue'

// 全局设置模块：所有页面和服务层都从这里读取当前模型、主题、API Key 等配置。
// 这里使用 Vue 的 reactive，让 UI 修改设置后，其他地方能立即感知变化。

export type ProviderType = 'ollama' | 'openai' | 'claude'
export type ThemeType   = 'dark' | 'light' | 'system'

export interface AppSettings {
    provider: ProviderType
    theme: ThemeType
    systemPrompt: string
    maxContextTokens: number
    responseTimeoutSeconds: number
    showModelInTopbar: boolean
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
    provider: 'ollama',
    theme: 'dark',
    systemPrompt: '你是一个专业的 AI 助手，回答要简洁清晰。',
    maxContextTokens: 128000,
    responseTimeoutSeconds: 30,
    showModelInTopbar: true,
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
            // 深度合并，保留未存字段的默认值
            return {
                ...defaults,
                ...saved,
                theme:  saved.theme  ?? defaults.theme,
                responseTimeoutSeconds: normalizeTimeout(saved.responseTimeoutSeconds),
                ollama: { ...defaults.ollama, ...saved.ollama },
                openai: { ...defaults.openai, ...saved.openai },
                claude: { ...defaults.claude, ...saved.claude },
            }
        }
    } catch {}
    return { ...defaults, ollama: { ...defaults.ollama }, openai: { ...defaults.openai }, claude: { ...defaults.claude } }
}

function normalizeTimeout(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return defaults.responseTimeoutSeconds
    return Math.min(300, Math.max(5, Math.round(parsed)))
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
