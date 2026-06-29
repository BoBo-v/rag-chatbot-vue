import type { ImageAttachment, Message } from '../types/chat'

// 发送给模型 provider 前的统一消息格式。provider 适配器会再转换成 OpenAI/Claude/Ollama 各自要求的结构。
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
    images?: { base64: string; mediaType: ImageAttachment['mediaType'] }[]
    files?: { name: string; content: string }[]
}

// 预留的工具调用类型。目前主流程还没有使用 tools，但放在这里方便后续扩展。
export interface Tool{
    name: string
    description: string
    parameters: Record<string, unknown>
    function: (input: {
        expression: Record<string, unknown>
    }) => Promise<string>
}

function estimateTokens(text: string): number {
    // 粗略估算 token 数。真实项目可以替换成模型对应 tokenizer。
    return text.length
}

const IMAGE_TOKEN_COST = 1000

// 从完整消息列表中截取一段“能放进上下文窗口”的历史对话。
// 这里优先保留最近消息，超过预算时丢弃更早的消息。
export function buildMessages(
    messages: Message[],
    userText: string,
    systemPrompt: string,
    maxContextTokens: number
): ChatMessage[] {
    const userMsg = userText.trim() || '请继续'
    const normalizedSystemPrompt = systemPrompt.trim()

    const finished = messages.filter(
        m => m.status === 'done' || m.status === 'aborted' || m.status === 'error'
    )

    const unlimited = maxContextTokens >= 1100000
    const budget = unlimited ? Infinity : maxContextTokens - estimateTokens(normalizedSystemPrompt) - estimateTokens(userMsg)
    const selected: ChatMessage[] = []
    let used = 0
    // 倒序遍历：从最新消息开始选，保证模型优先看到最近上下文。
    for (let i = finished.length - 1; i >= 0; i--) {
        const m = finished[i]
        if (m.role !== 'user' && m.role !== 'assistant') continue
        let fileTokens = 0
        if (m.files?.length) {
            for (const f of m.files) fileTokens += estimateTokens(f.content)
        }
        const t = estimateTokens(m.content) + (m.images?.length ?? 0) * IMAGE_TOKEN_COST + fileTokens
        if (!unlimited && used + t > budget) break
        let content = m.content
        if (m.files?.length) {
            // 上传的文本文件会被拼进 prompt，让模型能读取文件内容。
            const fileBlocks = m.files.map(f => `<file name="${f.name}">\n${f.content}\n</file>`).join('\n\n')
            content = fileBlocks + (content ? '\n\n' + content : '')
        }
        if (!content.trim() && !m.images?.length) continue
        const chatMsg: ChatMessage = { role: m.role, content }
        if (m.images?.length) {
            chatMsg.images = m.images.map(img => ({ base64: img.base64, mediaType: img.mediaType }))
        }
        selected.unshift(chatMsg)
        used += t
    }

    const lastSelected = selected[selected.length - 1]
    // 如果当前用户消息已经在 selected 中，就不要再追加一份，避免重复提问。
    if (lastSelected?.role === 'user') {
        if (lastSelected.images?.length) {
            if (!lastSelected.content) {
                lastSelected.content = userMsg
            }
            return withSystemPrompt(selected, normalizedSystemPrompt)
        }
        if (lastSelected.content === userMsg) {
            return withSystemPrompt(selected, normalizedSystemPrompt)
        }
    }

    return withSystemPrompt([
        ...selected,
        { role: 'user' as const, content: userMsg },
    ], normalizedSystemPrompt)
}

function withSystemPrompt(messages: ChatMessage[], systemPrompt: string): ChatMessage[] {
    return systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages
}
