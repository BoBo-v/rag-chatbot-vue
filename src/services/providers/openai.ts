import type { Message } from '../../types/chat'
import type { ModelRuntimeConfig } from '../../types/model'
import { buildMessages } from '../context'

// OpenAI 兼容接口适配器。
// DeepSeek、通义、Kimi 等只要兼容 /v1/chat/completions，也可以通过 baseUrl 走这里。
export async function openaiStream(
    messages: Message[],
    userText: string,
    runtime: ModelRuntimeConfig,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const baseUrl = (runtime.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '')
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

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
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
        throw new Error(`OpenAI error ${res.status}: ${errText}`)
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
        const baseUrl = (runtime.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/v1/models`, {
            headers: { Authorization: `Bearer ${runtime.apiKey}` },
        })
        if (!res.ok) return []
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
