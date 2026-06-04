import type { Message } from '../../types/chat'
import type { ModelRuntimeConfig } from '../../types/model'
import { buildMessages } from '../context'
import { readOllamaNdjsonStream } from './ollama'

export async function backendChatStream(
    messages: Message[],
    userText: string,
    runtime: ModelRuntimeConfig,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const chatMessages = buildMessages(
        messages,
        userText,
        runtime.systemPrompt,
        runtime.maxContextTokens,
    )

    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: runtime.backendProvider ?? 'ollama',
            model: runtime.backendModel || runtime.model,
            messages: chatMessages.map(message => ({
                role: message.role,
                content: message.content,
            })),
            rag: true,
        }),
        signal,
    })

    if (!res.ok) throw new Error(`RAG chat error ${res.status}: ${await res.text()}`)

    await readOllamaNdjsonStream(res, onChunk, onDone, signal)
}
