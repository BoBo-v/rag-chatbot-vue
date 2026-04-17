import type { Message } from '../../types/chat'
import { buildMessages } from '../context'
import { settings } from '../../stores/settings'

/**
 * Ollama /api/chat — NDJSON 流式
 * 每行：{"message":{"content":"chunk"},"done":false}
 */
export async function ollamaStream(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const cfg = settings.ollama
    const chatMessages = buildMessages(
        messages,
        userText,
        settings.systemPrompt,
        settings.maxContextTokens
    )

    const res = await fetch(`${cfg.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: cfg.model,
            messages: chatMessages,
            stream: true,
        }),
        signal,
    })

    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let isDone = false
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

            for (const line of lines) {
                if (!line.trim()) continue
                try {
                    const obj = JSON.parse(line)
                    const chunk: string = obj.message?.content ?? ''
                    if (chunk) onChunk(chunk)
                    if (obj.done && !isDone) {
                        isDone = true
                        onDone()
                    }
                } catch {
                    // 忽略单行解析失败
                }
            }
        }
    } catch (err: any) {
        if (err.name !== 'AbortError') throw err
    } finally {
        reader.releaseLock()
        if (!isDone) {
            isDone = true
            onDone()
        }
    }
}

/** 拉取 Ollama 已安装模型列表 */
export async function fetchOllamaModels(): Promise<string[]> {
    try {
        const res = await fetch(`${settings.ollama.url}/api/tags`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.models ?? []).map((m: { name: string }) => m.name)
    } catch {
        return []
    }
}
