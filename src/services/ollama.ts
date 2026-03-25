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
            console.log('line', line,JSON.parse(line))
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