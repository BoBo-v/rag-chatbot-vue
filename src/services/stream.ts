import type { Message } from '../types/chat'
import type { ModelRuntimeConfig } from '../types/model'
import { settings } from '../stores/settings'
import { createRuntimeFromSettings } from './runtime'
import { ollamaStream, fetchOllamaModels } from './providers/ollama'
import { openaiStream, fetchOpenAIModels } from './providers/openai'
import { claudeStream, getClaudeModels } from './providers/claude'

const CONNECT_TIMEOUT_MS = 30_000

export interface GenerateStreamWithContextOptions {
    messages: Message[]
    userText: string
    runtime: ModelRuntimeConfig
    onChunk: (chunk: string) => void
    onDone: () => void
    signal?: AbortSignal
}

// 统一的流式生成入口。
// UI 不需要知道当前用的是 Ollama、OpenAI 还是 Claude，只调用这个函数即可。
/**
 * 统一流式生成入口 — 根据 settings.provider 分发到对应适配器
 * 连接阶段 30 秒超时；收到第一个 chunk 后取消超时计时器，流式阶段不限时
 */
export async function generateStreamWithContext(options: GenerateStreamWithContextOptions): Promise<void> {
    const { messages, userText, runtime, onChunk, onDone, signal } = options
    const timeoutCtrl = new AbortController()
    const timer = setTimeout(() => timeoutCtrl.abort(), CONNECT_TIMEOUT_MS)

    // 外部 signal 用于“停止生成”，timeoutCtrl 用于“连接超时”。
    // AbortSignal.any 会把两个取消来源合并成一个 signal。
    const mergedSignal = signal
        ? AbortSignal.any([signal, timeoutCtrl.signal])
        : timeoutCtrl.signal

    let receivedFirstChunk = false
    const wrappedOnChunk = (chunk: string) => {
        // 只限制连接阶段：一旦收到第一个 chunk，就说明服务端已经响应。
        if (!receivedFirstChunk) {
            receivedFirstChunk = true
            clearTimeout(timer)
        }
        onChunk(chunk)
    }

    try {
        // 根据设置面板中选择的 provider 分发到对应适配器。
        switch (runtime.provider) {
            case 'openai':
                await openaiStream(messages, userText, runtime, wrappedOnChunk, onDone, mergedSignal)
                break
            case 'claude':
                await claudeStream(messages, userText, runtime, wrappedOnChunk, onDone, mergedSignal)
                break
            case 'ollama':
            default:
                await ollamaStream(messages, userText, runtime, wrappedOnChunk, onDone, mergedSignal)
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
    const runtime = createRuntimeFromSettings(settings)
    // 设置面板刷新模型列表时会调用这里。
    switch (runtime.provider) {
        case 'openai':
            return fetchOpenAIModels(runtime)
        case 'claude':
            return getClaudeModels()
        case 'ollama':
        default:
            return fetchOllamaModels(runtime)
    }
}
