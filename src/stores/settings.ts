import { reactive, watch } from 'vue'

export type ProviderType = 'ollama' | 'openai' | 'claude'
export type ThemeType   = 'dark' | 'light' | 'system'

export interface AppSettings {
    provider: ProviderType
    theme: ThemeType
    systemPrompt: string
    maxContextTokens: number
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

const defaults: AppSettings = {
    provider: 'ollama',
    theme: 'dark',
    systemPrompt: '你是一个专业的 AI 助手，回答要简洁清晰。',
    maxContextTokens: 128000,
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
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const saved = JSON.parse(raw)
            // 深度合并，保留未存字段的默认值
            return {
                ...defaults,
                ...saved,
                theme:  saved.theme  ?? defaults.theme,
                ollama: { ...defaults.ollama, ...saved.ollama },
                openai: { ...defaults.openai, ...saved.openai },
                claude: { ...defaults.claude, ...saved.claude },
            }
        }
    } catch {}
    return { ...defaults, ollama: { ...defaults.ollama }, openai: { ...defaults.openai }, claude: { ...defaults.claude } }
}

export const settings = reactive<AppSettings>(load())

watch(settings, (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
}, { deep: true })
