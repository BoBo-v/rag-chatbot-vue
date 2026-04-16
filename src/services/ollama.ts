import type { Message } from '../types/chat'
import { settings } from '../stores/settings'

/**
 * 带上下文的流式文本生成，支持多轮对话
 */
export async function generateStreamWithContext(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
) {
    const allMessages = userText
        ? [...messages, { id: 'temp', role: 'user' as const, content: userText, status: 'done' as const }]
        : messages
    const prompt = buildPrompt(allMessages)
    return generateStream(prompt, onChunk, onDone, signal)
}

/**
 * 构建提示词，将消息数组格式化为对话文本
 */
export function buildPrompt(messages: Message[]) {
    const system = settings.systemPrompt
    const MAX_TOKENS = settings.maxContextTokens

    let totalTokens = estimateTokens(system)
    const selected: Message[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        const msgText = msg.role === 'user' ? `用户: ${msg.content}` : `AI: ${msg.content}`
        const tokens = estimateTokens(msgText)
        if (totalTokens + tokens > MAX_TOKENS) break
        selected.unshift(msg)
        totalTokens += tokens
    }

    const history = selected
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(msg => {
            const content = msg.content
                .replace(/^AI:\s*/g, '')
                .replace(/^用户:\s*/g, '')
            return msg.role === 'user' ? `用户: ${content}` : `AI: ${content}`
        })
        .join('\n')

    return `${system}\n\n${history}\nAI:`
}

/**
 * 获取 Ollama 可用模型列表
 */
export async function fetchOllamaModels(): Promise<string[]> {
    try {
        const res = await fetch(`${settings.ollamaUrl}/api/tags`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.models ?? []).map((m: { name: string }) => m.name)
    } catch {
        return []
    }
}

/**
 * 调用 Ollama API 生成文本，支持流式返回
 */
export async function generateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    signal?: AbortSignal
) {
    const res = await fetch(`${settings.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: settings.model,
            prompt,
            stream: true
        }),
        signal
    })
    console.log('res',res)
    const reader = res.body?.getReader()
    const decoder = new TextDecoder('utf-8')

    let buffer = ''
    let isDone = false
    let aborted = false

    signal?.addEventListener('abort', () => {// 取消请求
        aborted = true
        reader?.cancel()
    })

    try {
        while (true) {
            if (aborted) break// 取消请求
            const {done, value} = await reader!.read()

            if (done) break

            buffer += decoder.decode(value, {stream: true})

            // 按行拆分（关键）
            const lines = buffer.split('\n')

            // 最后一行可能不完整，留着
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (!line.trim()) continue
                //console.log('line', line,JSON.parse(line))
                const jsons = JSON.parse(line)
                try {
                    onChunk(jsons.response || '')
                } catch (e) {
                    console.error('解析失败', line)
                }

                if (jsons.done && !isDone) {
                    isDone = true
                    onDone()
                }

            }
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.log('请求被中断')
        } else {
            console.error(err)
        }
    }finally {
        reader?.releaseLock()// 释放锁
        if (!isDone) {
            isDone = true
            onDone()
        }
    }
}
/**
 * 估算文本的 token 数量
 * @param text - 需要估算的文本字符串
 * @returns 估算的 token 数量（基于字符长度）
 */
function estimateTokens(text: string): number {
    // 粗略估算：1个中文 ≈ 1 token，英文 ≈ 0.5
    return text.length
}