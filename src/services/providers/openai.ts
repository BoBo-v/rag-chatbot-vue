import type { Message } from '../../types/chat'
import type { ModelRuntimeConfig } from '../../types/model'
import { buildMessages } from '../context'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com'
const DEV_OPENAI_PROXY_PREFIX = '/__ai_proxy/openai'

// 兼容用户填写 https://xxx 和 https://xxx/v1 两种写法，避免最终请求变成 /v1/v1。
function normalizeOpenAIBaseUrl(baseUrl?: string): string {
    let base = (baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '')

    while (base.endsWith('/v1')) {
        base = base.slice(0, -3).replace(/\/+$/, '')
    }

    return base || DEFAULT_OPENAI_BASE_URL
}

// 开发环境用 Vite 同源代理绕过浏览器 CORS；生产环境仍直接访问配置的厂商地址。
function openAIEndpoint(baseUrl: string | undefined, path: string): string {
    const base = normalizeOpenAIBaseUrl(baseUrl)

    if (import.meta.env.DEV && /^https?:\/\//i.test(base)) {
        return `${DEV_OPENAI_PROXY_PREFIX}${path}?baseUrl=${encodeURIComponent(base)}`
    }

    return `${base}${path}`
}

// 错误日志里展示真实厂商地址，不展示本地代理地址，方便排查鉴权和模型权限问题。
function openAIDisplayEndpoint(baseUrl: string | undefined, path: string): string {
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
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${runtime.apiKey ?? ''}`,
        },
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

    let doneCalled = false
    // OpenAI 流式响应是 Server-Sent Events，每个 data 行是一段 JSON。
    await parseSSE(res.body!, signal, (_event, data) => {
        if (data === '[DONE]') {
            if (!doneCalled) { doneCalled = true; onDone() }
            return
        }
        try {
            const obj = JSON.parse(data)
            const chunk: string = obj.choices?.[0]?.delta?.content ?? ''
            if (chunk) onChunk(chunk)
            if (obj.choices?.[0]?.finish_reason === 'stop' && !doneCalled) {
                doneCalled = true
                onDone()
            }
        } catch {
        }
    })
    if (!doneCalled) onDone()
}

export async function fetchOpenAIModels(runtime: ModelRuntimeConfig): Promise<string[]> {
    if (!runtime.apiKey) return []
    try {
        const res = await fetch(openAIEndpoint(runtime.baseUrl, '/v1/models'), {
            headers: { Authorization: `Bearer ${runtime.apiKey}` },
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
    onLine: (event: string, data: string) => void
): Promise<void> {
    // SSE 是按文本行传输的，网络 chunk 可能把一行拆成两段，所以需要 buffer 暂存不完整行。
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let aborted = false

    signal?.addEventListener('abort', () => {
        aborted = true
        reader.cancel()
    })

    try {
        while (true) {
            if (aborted) break
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            let currentEvent = ''
            for (const line of lines) {
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim()
                } else if (line.startsWith('data:')) {
                    const data = line.slice(5).trim()
                    if (data) {
                        onLine(currentEvent, data)
                        currentEvent = ''
                    }
                } else if (line === '') {
                    currentEvent = ''
                }
            }
        }
        if (buffer.trim()) {
            const line = buffer.trim()
            if (line.startsWith('data:')) {
                const data = line.slice(5).trim()
                if (data) onLine('', data)
            }
        }
    } catch (err: any) {
        if (err.name !== 'AbortError') throw err
    } finally {
        reader.releaseLock()
    }
}
