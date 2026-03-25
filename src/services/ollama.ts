import type { Message } from '../types/chat'

/**
 * 带上下文的流式文本生成，支持多轮对话
 * @param messages - 历史消息数组，包含之前的对话记录
 * @param userText - 用户当前输入的文本
 * @param onChunk - 回调函数，在接收到每个数据块时调用，参数为生成的文本片段
 * @param onDone - 回调函数，在生成完成时调用
 */
export async function generateStreamWithContext(
    messages: Message[],
    userText: string,
    onChunk: (chunk: string) => void,
    onDone: () => void
) {
    // 1️⃣ 构建 prompt（把逻辑收进来）
    const prompt = buildPrompt([
        ...messages,
        {
            id: 'temp',
            role: 'user',
            content: userText,
            status: 'done'
        }
    ])

    // 2️⃣ 直接复用你原来的流式函数
    return generateStream(prompt, onChunk, onDone)
}
/**
 * 构建提示词，将消息数组格式化为对话文本
 * @param messages - 消息数组，每条消息包含 role 和 content 属性
 * @returns 格式化后的对话文本，用户消息前缀为"用户:"，AI 消息前缀为"AI:"，每行用换行符分隔
 */
export function buildPrompt(messages: Message[]) {
    const recent = messages.slice(-10)

    const system = `你是一个专业的 AI 助手，回答要简洁清晰。`

    const history = recent.map(msg => {
        return msg.role === 'user'
            ? `用户: ${msg.content}`
            : `AI: ${msg.content}`
    }).join('\n')

    return `${system}\n\n${history}\nAI:`
}

/**
 * 调用 Ollama API 生成文本，支持流式返回
 * @param prompt - 提示词，用于引导模型生成文本
 * @param onChunk - 回调函数，在接收到每个数据块时调用，参数为生成的文本片段
 * @param onDone - 回调函数，在生成完成时调用
 */
export async function generateStream(
    prompt: string, onChunk: (chunk: string) => void,
    onDone: () => void
) {
const res = await fetch('http://localhost:11434/api/generate', {
    //const res = await fetch('http://192.168.1.142:11434/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'qwen2.5:1.5b',
            prompt,
            stream: true // 流式返回
        })
    })

    const reader = res.body?.getReader()
    const decoder = new TextDecoder('utf-8')

    let buffer = ''

    while (true) {
        const { done, value } = await reader!.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

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
            let isDone = false
            if (jsons.done && !isDone) {
                onDone()
            }

        }
    }
}