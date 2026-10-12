import type { ChatError } from '../types/chat'
import { BackendChatRunClientError } from '../services/providers/backendChatRun'

// 把底层异常转换成用户更容易理解的友好错误提示。
// 服务层抛出 Error/DOMException/BackendChatRunClientError，UI 层通过这个函数精准分类并转化为中文文案。
export function classifyError(err: unknown): ChatError {
    if (err instanceof DOMException) {
        if (err.name === 'TimeoutError') {
            const timeoutSeconds = err.message.match(/after\s+(\d+)\s+seconds/i)?.[1]
            const message = timeoutSeconds
                ? `等待模型首个响应超过 ${timeoutSeconds} 秒，请检查网络连接后重试`
                : '请求超时，请检查网络连接后重试'
            return { type: 'timeout', message }
        }
        if (err.name === 'AbortError') {
            return { type: 'network', message: '请求已取消' }
        }
    }

    // 优先解构生成任务客户端业务错误码，消除原始英文报错
    if (err instanceof BackendChatRunClientError) {
        if (err.code === 'CLIENT_ABORTED') {
            return { type: 'network', message: '生成任务订阅已取消' }
        }
        if (err.code === 'CHAT_RUN_NETWORK_ERROR') {
            return { type: 'network', message: '网络连接中断，无法连接到生成服务，请检查网络' }
        }
        if (err.code === 'CHAT_RUN_STREAM_INCOMPLETE') {
            return { type: 'network', message: '生成任务事件流意外中断，请点击重试' }
        }
        if (err.code === 'GENERATION_RUN_NOT_FOUND' || err.status === 404) {
            return { type: 'server', message: '生成任务缓存已过期或不存在，请重新发送', status: 404 }
        }
        if (err.status === 401 || err.status === 403) {
            return { type: 'auth', message: '登录状态已失效或无权访问，请重新登录', status: err.status }
        }
        if (err.status === 429) {
            return { type: 'server', message: '请求过于频繁，请稍后再试', status: 429 }
        }
        if (err.status && err.status >= 500) {
            return { type: 'server', message: `服务端生成异常 (HTTP ${err.status})，请稍后重试`, status: err.status }
        }
        return { type: 'server', message: err.message || '生成任务执行失败', status: err.status }
    }

    if (err instanceof TypeError && err.message.includes('fetch')) {
        return { type: 'network', message: '无法连接到服务器，请检查网络或后端服务状态' }
    }

    if (err instanceof Error) {
        const msg = err.message

        if (msg.includes('Failed to fetch') || msg.includes('fetch failed') || msg.includes('NetworkError')) {
            return { type: 'network', message: '无法连接到服务器，请检查网络或后端服务状态' }
        }

        const statusMatch = msg.match(/(\d{3})/)
        const status = statusMatch ? Number(statusMatch[1]) : undefined

        if (status === 401 || status === 403) {
            return { type: 'auth', message: '登录状态或 API 密钥无效，请重新登录或在设置中检查', status }
        }
        if (status === 429) {
            return { type: 'server', message: '请求过于频繁，请稍后再试', status }
        }
        if (status && status >= 500) {
            return { type: 'server', message: `服务端错误 (HTTP ${status})，请稍后重试`, status }
        }
        if (status === 404) {
            return { type: 'server', message: '模型或接口地址不存在，请检查设置', status }
        }

        if (msg.includes('timeout') || msg.includes('Timeout')) {
            return { type: 'timeout', message: '请求超时，请检查网络连接后重试' }
        }

        return { type: 'unknown', message: msg, status }
    }

    return { type: 'unknown', message: '发生未知错误' }
}
