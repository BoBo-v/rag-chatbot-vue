import type { Message } from '../../types/chat'
import { buildMessages } from '../context'
import { settings } from '../../stores/settings'
import { parseSSE } from './openai'

/**
 * Anthropic Claude API
 * 协议：SSE，带 event 字段
 * event: content_block_delta → data: {"delta":{"text":"chunk"}}
 * event: message_stop        → 结束
 *
 * 注意：浏览器直接调用需要后端代理，或在请求头加
 *   anthropic-dangerous-direct-browser-access: true
 */
export async function claudeStream(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const cfg = settings.claude
    const allMsgs = buildMessages(
        messages,
        userText,
        settings.systemPrompt,
        settings.maxContextTokens
    )

    // Claude API：system 单独传，messages 只含 user/assistant
    const system = allMsgs.find(m => m.role === 'system')?.content ?? settings.systemPrompt
    const chatMessages = allMsgs
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }))

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': cfg.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: cfg.model,
            system,
            messages: chatMessages,
            stream: true,
            max_tokens: 4096,
        }),
        signal,
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Claude error ${res.status}: ${errText}`)
    }

    let doneCalled = false

    await parseSSE(res.body!, signal, (event, data) => {
        if (event === 'message_stop' || event === 'message_delta') {
            try {
                const obj = JSON.parse(data)
                // message_delta 里的 stop_reason 也代表结束
                if (obj.type === 'message_stop' || obj.delta?.stop_reason) {
                    if (!doneCalled) { doneCalled = true; onDone() }
                }
            } catch {}
            if (event === 'message_stop' && !doneCalled) {
                doneCalled = true
                onDone()
            }
            return
        }

        if (event === 'content_block_delta') {
            try {
                const obj = JSON.parse(data)
                const chunk: string = obj.delta?.text ?? ''
                if (chunk) onChunk(chunk)
            } catch {}
        }
    })

    if (!doneCalled) onDone()
}

/** Claude 已知可用模型（API 无列表接口） */
export function getClaudeModels(): string[] {
    return [
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
    ]
}
