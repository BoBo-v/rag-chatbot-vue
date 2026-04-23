import type { ChatError } from '../types/chat'

export function classifyError(err: unknown): ChatError {
    if (err instanceof DOMException && err.name === 'AbortError') {
        return { type: 'network', message: '请求已取消' }
    }

    if (err instanceof TypeError && err.message.includes('fetch')) {
        return { type: 'network', message: '无法连接到服务器，请检查网络或服务地址' }
    }

    if (err instanceof Error) {
        const msg = err.message

        const statusMatch = msg.match(/(\d{3})/)
        const status = statusMatch ? Number(statusMatch[1]) : undefined

        if (status === 401 || status === 403) {
            return { type: 'auth', message: 'API 密钥无效或已过期，请在设置中检查', status }
        }
        if (status === 429) {
            return { type: 'server', message: '请求过于频繁，请稍后再试', status }
        }
        if (status && status >= 500) {
            return { type: 'server', message: `服务端错误 (${status})，请稍后重试`, status }
        }
        if (status === 404) {
            return { type: 'server', message: '模型或接口地址不存在，请检查设置', status }
        }

        if (msg.includes('timeout') || msg.includes('Timeout')) {
            return { type: 'timeout', message: '请求超时，请检查网络连接' }
        }

        return { type: 'unknown', message: msg, status }
    }

    return { type: 'unknown', message: '发生未知错误' }
}
