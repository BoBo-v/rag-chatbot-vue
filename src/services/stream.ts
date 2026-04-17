import type { Message } from '../types/chat'
import { settings } from '../stores/settings'
import { ollamaStream, fetchOllamaModels } from './providers/ollama'
import { openaiStream, fetchOpenAIModels } from './providers/openai'
import { claudeStream, getClaudeModels } from './providers/claude'

/**
 * 统一流式生成入口 — 根据 settings.provider 分发到对应适配器
 */
export async function generateStreamWithContext(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    switch (settings.provider) {
        case 'openai':
            return openaiStream(messages, userText, onChunk, onDone, signal)
        case 'claude':
            return claudeStream(messages, userText, onChunk, onDone, signal)
        case 'ollama':
        default:
            return ollamaStream(messages, userText, onChunk, onDone, signal)
    }
}

/**
 * 获取当前 provider 的可用模型列表
 */
export async function fetchModels(): Promise<string[]> {
    switch (settings.provider) {
        case 'openai':
            return fetchOpenAIModels()
        case 'claude':
            return getClaudeModels()
        case 'ollama':
        default:
            return fetchOllamaModels()
    }
}
