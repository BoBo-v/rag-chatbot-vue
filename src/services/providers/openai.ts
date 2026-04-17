import type { Message } from '../../types/chat'
import { buildMessages } from '../context'
import { settings } from '../../stores/settings'

/**
 * OpenAI 兼容接口（OpenAI / DeepSeek / 通义千问 / Kimi 等）
 * 协议：SSE，每行 "data: {...}" 或 "data: [DONE]"
 * 内容字段：obj.choices[0].delta.content
 */
export async function openaiStream(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const cfg = settings.openai
    const baseUrl = cfg.baseUrl.replace(/\/$/, '')
    const chatMessages = buildMessages(
        messages,
        userText,
        settings.systemPrompt,
        settings.maxContextTokens
    )

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
            model: cfg.model,
            messages: chatMessages,
            stream: true,
        }),
        signal,
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`OpenAI error ${res.status}: ${errText}`)
    }

    await parseSSE(res.body!, signal, (event, data) => {
        if (data === '[DONE]') {
            onDone()
            return
        }
        try {
            const obj = JSON.parse(data)
            const chunk: string = obj.choices?.[0]?.delta?.content ?? ''
            if (chunk) onChunk(chunk)
            // 部分服务在 choices[0].finish_reason === 'stop' 时不发 [DONE]
            if (obj.choices?.[0]?.finish_reason === 'stop') onDone()
        } catch {
            // 忽略解析异常
        }
    })
}

/** 拉取 OpenAI 兼容接口的模型列表 */
export async function fetchOpenAIModels(): Promise<string[]> {
    const cfg = settings.openai
    if (!cfg.apiKey) return []
    try {
        const baseUrl = cfg.baseUrl.replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/v1/models`, {
            headers: { Authorization: `Bearer ${cfg.apiKey}` },
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

// ── 通用 SSE 解析器 ────────────────────────────────────────────
export async function parseSSE(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal | undefined,
    onLine: (event: string, data: string) => void
): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let aborted = false
    let isDone = false

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
            // SSE 用 \n\n 分隔事件块，但也可能逐行到来
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
                        if (data === '[DONE]') isDone = true
                        currentEvent = ''
                    }
                } else if (line === '') {
                    currentEvent = ''
                }
            }
        }
    } catch (err: any) {
        if (err.name !== 'AbortError') throw err
    } finally {
        reader.releaseLock()
    }
}
