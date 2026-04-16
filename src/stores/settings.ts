import { reactive, watch } from 'vue'

export interface AppSettings {
    ollamaUrl: string
    model: string
    systemPrompt: string
    maxContextTokens: number
}

const STORAGE_KEY = 'ai-chat-settings'

const defaults: AppSettings = {
    ollamaUrl: 'http://localhost:11434',
    model: 'qwen2.5:7b',
    systemPrompt: '你是一个专业的 AI 助手，回答要简洁清晰。问你名字就叫小智来自XXX公司',
    maxContextTokens: 2000,
}

function load(): AppSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) return { ...defaults, ...JSON.parse(raw) }
    } catch {}
    return { ...defaults }
}

export const settings = reactive<AppSettings>(load())

watch(settings, (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...val }))
}, { deep: true })
