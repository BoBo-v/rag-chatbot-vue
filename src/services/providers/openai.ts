import type { Message } from '../../types/chat'
import { buildMessages } from '../context'
import { settings } from '../../stores/settings'

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

    const openaiMessages = chatMessages.map(m => {
        if (m.images?.length) {
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
            'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
            model: cfg.model,
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

export async function parseSSE(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal | undefined,
    onLine: (event: string, data: string) => void
): Promise<void> {
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
