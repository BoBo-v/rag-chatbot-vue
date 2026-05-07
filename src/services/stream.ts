import type { Message } from '../types/chat'
import { settings } from '../stores/settings'
import { ollamaStream, fetchOllamaModels } from './providers/ollama'
import { openaiStream, fetchOpenAIModels } from './providers/openai'
import { claudeStream, getClaudeModels } from './providers/claude'

const CONNECT_TIMEOUT_MS = 30_000

/**
 * 统一流式生成入口 — 根据 settings.provider 分发到对应适配器
 * 连接阶段 30 秒超时；收到第一个 chunk 后取消超时计时器，流式阶段不限时
 */
export async function generateStreamWithContext(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const timeoutCtrl = new AbortController()
    const timer = setTimeout(() => timeoutCtrl.abort(), CONNECT_TIMEOUT_MS)

    const mergedSignal = signal
        ? AbortSignal.any([signal, timeoutCtrl.signal])
        : timeoutCtrl.signal

    let receivedFirstChunk = false
    const wrappedOnChunk = (chunk: string) => {
        if (!receivedFirstChunk) {
            receivedFirstChunk = true
            clearTimeout(timer)
        }
        onChunk(chunk)
    }

    try {
        switch (settings.provider) {
            case 'openai':
                await openaiStream(messages, userText, wrappedOnChunk, onDone, mergedSignal)
                break
            case 'claude':
                await claudeStream(messages, userText, wrappedOnChunk, onDone, mergedSignal)
                break
            case 'ollama':
            default:
                await ollamaStream(messages, userText, wrappedOnChunk, onDone, mergedSignal)
                break
        }
    } catch (err) {
        clearTimeout(timer)
        if (timeoutCtrl.signal.aborted && !(signal?.aborted)) {
            throw new DOMException('Request timed out', 'TimeoutError')
        }
        throw err
    } finally {
        clearTimeout(timer)
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
