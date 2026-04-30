import type { Message } from '../types/chat'

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
    images?: { base64: string; mediaType: string }[]
    files?: { name: string; content: string }[]
}
export interface Tool{
    name: string
    description: string
    parameters: Record<string, unknown>
    function: (input: {
        expression: Record<string, unknown>
    }) => Promise<string>
}

function estimateTokens(text: string): number {
    return text.length
}

const IMAGE_TOKEN_COST = 1000

export function buildMessages(
    messages: Message[],
    userText: string,
    systemPrompt: string,
    maxContextTokens: number
): ChatMessage[] {
    const userMsg = userText.trim() || '请继续'

    const finished = messages.filter(
        m => m.status === 'done' || m.status === 'aborted' || m.status === 'error'
    )

    const budget = maxContextTokens - estimateTokens(systemPrompt) - estimateTokens(userMsg)
    const selected: ChatMessage[] = []
    let used = 0
    for (let i = finished.length - 1; i >= 0; i--) {
        const m = finished[i]
        if (m.role !== 'user' && m.role !== 'assistant') continue
        let fileTokens = 0
        if (m.files?.length) {
            for (const f of m.files) fileTokens += estimateTokens(f.content)
        }
        const t = estimateTokens(m.content) + (m.images?.length ?? 0) * IMAGE_TOKEN_COST + fileTokens
        if (used + t > budget) break
        let content = m.content
        if (m.files?.length) {
            const fileBlocks = m.files.map(f => `<file name="${f.name}">\n${f.content}\n</file>`).join('\n\n')
            content = fileBlocks + (content ? '\n\n' + content : '')
        }
        const chatMsg: ChatMessage = { role: m.role, content }
        if (m.images?.length) {
            chatMsg.images = m.images.map(img => ({ base64: img.base64, mediaType: img.mediaType }))
        }
        selected.unshift(chatMsg)
        used += t
    }

    const lastSelected = selected[selected.length - 1]
    if (lastSelected?.role === 'user') {
        if (lastSelected.images?.length) {
            if (!lastSelected.content) {
                lastSelected.content = userMsg
            }
            return [
                { role: 'system', content: systemPrompt },
                ...selected,
            ]
        }
        if (lastSelected.content === userMsg) {
            return [
                { role: 'system', content: systemPrompt },
                ...selected,
            ]
        }
    }

    return [
        { role: 'system', content: systemPrompt },
        ...selected,
        { role: 'user' as const, content: userMsg },
    ]
}
