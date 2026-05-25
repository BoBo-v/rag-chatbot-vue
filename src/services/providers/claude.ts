import type { Message } from '../../types/chat'
import { buildMessages } from '../context'
import { settings } from '../../stores/settings'
import { parseSSE } from './openai'

// Claude API 适配器。Claude 的消息格式和 OpenAI 不完全一样，所以单独转换。
export async function claudeStream(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
): Promise<void> {
    const cfg = settings.claude
    // buildMessages 返回统一上下文，其中 system 消息要单独放到 Claude 的 system 字段。
    const allMsgs = buildMessages(
        messages,
        userText,
        settings.systemPrompt,
        settings.maxContextTokens
    )

    const system = allMsgs.find(m => m.role === 'system')?.content ?? settings.systemPrompt
    const chatMessages = allMsgs
        .filter(m => m.role !== 'system')
        .map(m => {
            if (m.images?.length) {
                // Claude 的图片格式是 base64 source，不是 OpenAI 的 image_url。
                const content: Record<string, unknown>[] = []
                for (const img of m.images) {
                    content.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: img.mediaType,
                            data: img.base64,
                        },
                    })
                }
                if (m.content) {
                    content.push({ type: 'text', text: m.content })
                }
                return { role: m.role, content }
            }
            return { role: m.role, content: m.content }
        })

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
        // Claude 流式事件按 event 类型区分：文本增量在 content_block_delta 里。
        if (event === 'message_stop' || event === 'message_delta') {
            try {
                const obj = JSON.parse(data)
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

export function getClaudeModels(): string[] {
    // Claude 这里暂时使用静态列表，因为浏览器端直接拉模型列表并不稳定。
    return [
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
    ]
}
