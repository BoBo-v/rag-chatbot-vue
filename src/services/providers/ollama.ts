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
                    // Ollama 每一行都是一个 JSON 对象，message.content 是本次增量文本。
                    const obj = JSON.parse(line)
                    const chunk: string = obj.message?.content ?? ''
                    if (chunk) onChunk(chunk)
                    if (obj.done && !isDone) {
                        isDone = true
                        onDone()
                    }
                } catch {
                }
            }
        }

        if (buffer.trim()) {
            try {
                const obj = JSON.parse(buffer.trim())
                const chunk: string = obj.message?.content ?? ''
                if (chunk) onChunk(chunk)
                if (obj.done && !isDone) {
                    isDone = true
                    onDone()
                }
            } catch {
            }
        }
    } catch (err: any) {
        if (err.name !== 'AbortError') throw err
    } finally {
        reader.releaseLock()
        if (!isDone) {
            onDone()
        }
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
