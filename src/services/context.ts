import type { Message } from '../types/chat'

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

function estimateTokens(text: string): number {
    // 中文约 1 token/字，英文约 0.5 token/词，此处粗估
    return text.length
}

/**
 * 将对话历史 + 当前用户输入，构建成结构化的 messages 数组
 *
 * - 过滤掉正在生成中的 AI 占位消息（loading/streaming）
 * - 自动裁剪超出 token 预算的旧消息
 * - 检测重复：handleSend 会提前把用户消息写入 messages，避免再追加一次
 */
export function buildMessages(
    messages: Message[],
    userText: string,
    systemPrompt: string,
    maxContextTokens: number
): ChatMessage[] {
    const userMsg = userText.trim() || '请继续'

    // 只保留已完成的消息（排除正在生成的 AI 占位）
    const finished = messages.filter(
        m => m.status === 'done' || m.status === 'aborted' || m.status === 'error'
    )

    // 按 token 预算从新到旧选取历史
    const budget = maxContextTokens - estimateTokens(systemPrompt) - estimateTokens(userMsg)
    const selected: ChatMessage[] = []
    let used = 0
    for (let i = finished.length - 1; i >= 0; i--) {
        const m = finished[i]
        if (m.role !== 'user' && m.role !== 'assistant') continue
        const t = estimateTokens(m.content)
        if (used + t > budget) break
        selected.unshift({ role: m.role, content: m.content })
        used += t
    }

    // handleSend 会提前把用户消息 push 进 messages，避免重复追加
    const lastSelected = selected[selected.length - 1]
    const alreadyHasUserMsg =
        lastSelected?.role === 'user' && lastSelected?.content === userMsg

    return [
        { role: 'system', content: systemPrompt },
        ...selected,
        ...(alreadyHasUserMsg ? [] : [{ role: 'user' as const, content: userMsg }]),
    ]
}
