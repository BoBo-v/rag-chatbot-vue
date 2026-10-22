import type { Message } from '../../types/chat'
import type { ModelRuntimeConfig } from '../../types/model'
import { buildMessages } from '../context'

// Ollama 本地模型适配器。默认请求 http://localhost:11434/api/chat。
export async function ollamaStream(
    messages: Message[],
    userText: string,
    runtime: ModelRuntimeConfig,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const baseUrl = (runtime.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
    // Ollama 支持 messages 格式；图片模型需要把 base64 图片放在 images 字段里。
    const chatMessages = buildMessages(
        messages,
        userText,
        runtime.systemPrompt,
        runtime.maxContextTokens
    )

    const ollamaMessages = chatMessages.map(m => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content }
        if (m.images?.length) {
            msg.images = m.images.map(img => img.base64)
        }
        return msg
    })

    const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: runtime.model,
            messages: ollamaMessages,
            stream: true,
        }),
        signal,
    })

    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)

    await readOllamaNdjsonStream(res, onChunk, onDone, signal)
}

export async function readOllamaNdjsonStream(
    res: Response,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    if (!res.body) throw new Error('Ollama response has no stream body')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let isDone = false
    const cancelReader = () => { void reader.cancel().catch(() => undefined) }
    signal?.addEventListener('abort', cancelReader, { once: true })

    const processLine = (line: string) => {
        if (!line.trim()) return
        const obj = JSON.parse(line) as {
            message?: { content?: string }
            done?: boolean
            error?: string
        }
        if (!obj || typeof obj !== 'object') throw new Error('Invalid Ollama stream frame')
        if (obj.error) throw new Error(`Ollama stream error: ${obj.error}`)
        const chunk = obj.message?.content
        if (typeof chunk === 'string' && chunk) onChunk(chunk)
        if (obj.done === true && !signal?.aborted) {
            isDone = true
            onDone()
        }
    }

    try {
        while (true) {
            if (signal?.aborted) return
            const { done, value } = await reader.read()
            if (signal?.aborted) return
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
                if (signal?.aborted) return
                processLine(line)
                if (isDone) return
            }
        }

        buffer += decoder.decode()
        if (signal?.aborted) return
        processLine(buffer)
        if (!isDone) throw new Error('Ollama stream ended before done:true')
    } finally {
        signal?.removeEventListener('abort', cancelReader)
        cancelReader()
        reader.releaseLock()
    }
}

export async function fetchOllamaModels(runtime: ModelRuntimeConfig): Promise<string[]> {
    // 设置面板点击“刷新模型列表”时调用 /api/tags。
    try {
        const baseUrl = (runtime.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/api/tags`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.models ?? []).map((m: { name: string }) => m.name)
    } catch {
        return []
    }
}
