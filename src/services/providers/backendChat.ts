import type { Message } from '../../types/chat'
import type { ModelRuntimeConfig } from '../../types/model'
import { buildMessages, type ChatMessage } from '../context'
import { readOllamaNdjsonStream } from './ollama'
import type { RagCitation, RagContextInfo } from '../../types/chat'

function toBackendRagValue(runtime: ModelRuntimeConfig): 'auto' | boolean {
    switch (runtime.backendRagMode) {
        case 'off':
            return false
        case 'force':
            return true
        case 'auto':
        default:
            return 'auto'
    }
}

function toRagMode(runtime: ModelRuntimeConfig): RagContextInfo['mode'] {
    return runtime.backendRagMode ?? 'auto'
}

function buildBackendChatBody(
    messages: Message[],
    userText: string,
    runtime: ModelRuntimeConfig
): Record<string, unknown> {
    const chatMessages = buildMessages(
        messages,
        userText,
        runtime.systemPrompt,
        runtime.maxContextTokens,
    )
    const sanitizedMessages = sanitizeBackendMessages(chatMessages)

    return {
        provider: runtime.backendProvider ?? 'ollama',
        model: runtime.backendModel || runtime.model,
        messages: sanitizedMessages.map(message => ({
            role: message.role,
            content: message.content,
        })),
        rag: toBackendRagValue(runtime),
    }
}

function sanitizeBackendMessages(messages: ChatMessage[]): ChatMessage[] {
    const sanitized = messages
        .map(message => ({
            ...message,
            content: message.content.trim(),
        }))
        .filter(message => message.content.length > 0)

    if (sanitized.length > 0) return sanitized

    return [{ role: 'user', content: '请继续' }]
}

export async function fetchBackendChatContext(
    messages: Message[],
    userText: string,
    runtime: ModelRuntimeConfig,
    signal?: AbortSignal
): Promise<RagContextInfo> {
    // /api/chat/context 只返回 RAG 注入信息，不调用模型。这里用于解释“本次回答用了哪些资料”。
    const res = await fetch('/api/chat/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBackendChatBody(messages, userText, runtime)),
        signal,
    })

    if (!res.ok) throw new Error(`Backend chat context error ${res.status}: ${await res.text()}`)

    const data = await res.json() as {
        enabled?: boolean
        results?: RagCitation[]
    }

    const enabled = Boolean(data.enabled)
    const results = enabled
        ? (data.results ?? []).filter(item => item.text.trim().length > 0)
        : []

    return {
        mode: toRagMode(runtime),
        enabled,
        results,
    }
}

export async function backendChatStream(
    messages: Message[],
    userText: string,
    runtime: ModelRuntimeConfig,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBackendChatBody(messages, userText, runtime)),
        signal,
    })

    if (!res.ok) throw new Error(`Backend chat error ${res.status}: ${await res.text()}`)

    await readOllamaNdjsonStream(res, onChunk, onDone, signal)
}
