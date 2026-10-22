import type { Message } from '../../types/chat'
import type { ModelRuntimeConfig } from '../../types/model'
import { buildMessages } from '../context'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com'
const DEV_OPENAI_PROXY_PREFIX = '/__ai_proxy/openai'

// 兼容用户填写 https://xxx 和 https://xxx/v1 两种写法，避免最终请求变成 /v1/v1。
export function normalizeOpenAIBaseUrl(baseUrl?: string): string {
    let base = (baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '')

    while (base.endsWith('/v1')) {
        base = base.slice(0, -3).replace(/\/+$/, '')
    }

    return base || DEFAULT_OPENAI_BASE_URL
}

// 开发环境用 Vite 同源代理绕过浏览器 CORS；生产环境仍直接访问配置的厂商地址。
export function openAIEndpoint(baseUrl: string | undefined, path: string): string {
    const base = normalizeOpenAIBaseUrl(baseUrl)

    if (import.meta.env?.DEV && /^https?:\/\//i.test(base)) {
        return `${DEV_OPENAI_PROXY_PREFIX}${path}?baseUrl=${encodeURIComponent(base)}`
    }

    return `${base}${path}`
}

export function openAIHeaders(apiKey: string): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
    }
}

// 错误日志里展示真实厂商地址，不展示本地代理地址，方便排查鉴权和模型权限问题。
export function openAIDisplayEndpoint(baseUrl: string | undefined, path: string): string {
    return `${normalizeOpenAIBaseUrl(baseUrl)}${path}`
}

// OpenAI 兼容接口适配器。
export async function openaiStream(
    messages: Message[],
    userText: string,
    runtime: ModelRuntimeConfig,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    // 先构造统一上下文，再转换成 OpenAI 的 messages 格式。
    const chatMessages = buildMessages(
        messages,
        userText,
        runtime.systemPrompt,
        runtime.maxContextTokens
    )

    const openaiMessages = chatMessages.map(m => {
        if (m.images?.length) {
            // OpenAI 视觉模型使用 content 数组，图片用 data URL 传入。
            const content: Record<string, unknown>[] = []
            for (const img of m.images) {
                content.push({
                    type: 'image_url',
                    image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
                })
            }
            if (m.content) {
                content.push({ type: 'text', text: m.content })
            }
            return { role: m.role, content }
        }
        return { role: m.role, content: m.content }
    })

    const res = await fetch(openAIEndpoint(runtime.baseUrl, '/v1/chat/completions'), {
        method: 'POST',
        headers: openAIHeaders(runtime.apiKey ?? ''),
        body: JSON.stringify({
            model: runtime.model,
            messages: openaiMessages,
            stream: true,
        }),
        signal,
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`OpenAI error ${res.status} from ${openAIDisplayEndpoint(runtime.baseUrl, '/v1/chat/completions')}: ${errText}`)
    }

    if (!res.body) throw new Error('OpenAI response has no stream body')
    let doneCalled = false
    // OpenAI 流式响应是 Server-Sent Events，每个 data 行是一段 JSON。
    await parseSSE(res.body, signal, (_event, data) => {
        if (data === '[DONE]') {
            if (!doneCalled) { doneCalled = true; onDone() }
            return false
        }
        const obj = JSON.parse(data)
        if (obj.error) throw new Error(`OpenAI stream error: ${obj.error.message || JSON.stringify(obj.error)}`)
        const chunk = obj.choices?.[0]?.delta?.content
        if (typeof chunk === 'string' && chunk) onChunk(chunk)
        if (obj.choices?.[0]?.finish_reason && !doneCalled) {
            doneCalled = true
            onDone()
            return false
        }
    })
    if (!doneCalled && !signal?.aborted) throw new Error('OpenAI stream ended before completion')
}

export async function fetchOpenAIModels(runtime: ModelRuntimeConfig): Promise<string[]> {
    if (!runtime.apiKey) return []
    try {
        const res = await fetch(openAIEndpoint(runtime.baseUrl, '/v1/models'), {
            headers: openAIHeaders(runtime.apiKey),
        })
        if (!res.ok) {
            console.warn(
                `OpenAI models error ${res.status} from ${openAIDisplayEndpoint(runtime.baseUrl, '/v1/models')}:`,
                await res.text()
            )
            return []
        }
        const data = await res.json()
        return (data.data ?? [])
            .map((m: { id: string }) => m.id)
            .filter((id: string) => id.includes('gpt') || id.includes('deepseek') || id.includes('qwen') || id.includes('moonshot') || !id.startsWith('ft:'))
            .sort()
    } catch {
        return []
    }
}

export async function parseSSE(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal | undefined,
    onLine: (event: string, data: string) => void | boolean
): Promise<void> {
    // SSE 是按文本行传输的，网络 chunk 可能把一行拆成两段，所以需要 buffer 暂存不完整行。
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = ''
    let dataLines: string[] = []
    let stopped = false
    const cancelReader = () => { void reader.cancel().catch(() => undefined) }
    signal?.addEventListener('abort', cancelReader, { once: true })

    const dispatch = () => {
        if (dataLines.length > 0 && !signal?.aborted) {
            stopped = onLine(currentEvent, dataLines.join('\n')) === false
        }
        currentEvent = ''
        dataLines = []
    }
    const processLine = (line: string) => {
        if (line === '') {
            dispatch()
            return
        }
        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        let value = colon === -1 ? '' : line.slice(colon + 1)
        if (value.startsWith(' ')) value = value.slice(1)
        if (field === 'event') currentEvent = value
        else if (field === 'data') dataLines.push(value)
    }

    try {
        while (true) {
            if (signal?.aborted) return
            const { done, value } = await reader.read()
            if (signal?.aborted) return
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() ?? ''

            for (const line of lines) {
                if (signal?.aborted) return
                processLine(line)
                if (stopped) return
            }
        }
        buffer += decoder.decode()
        if (signal?.aborted) return
        if (buffer) processLine(buffer.replace(/\r$/, ''))
        if (!stopped) dispatch()
    } finally {
        signal?.removeEventListener('abort', cancelReader)
        cancelReader()
        reader.releaseLock()
    }
}
