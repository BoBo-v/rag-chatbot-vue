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

    if (err instanceof Error) {
        const msg = err.message || ''

        const statusMatch = msg.match(/\b([45]\d{2})\b/)
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

        return { type: 'unknown', message: msg || '执行异常，请重试', status }
    }

    return { type: 'unknown', message: '发生未知错误' }
}

/**
 * 永久不可重试的业务错误码（无论 HTTP 状态码为何，均绝对不进行重试）
 * 核心契约：业务错误码优先级绝对高于 HTTP 状态码（例如 CHAT_RUN_PROTOCOL_ERROR / GENERATION_RUN_NOT_FOUND 即使携带 500 也严禁重试）
 */
const PERMANENT_NON_RETRYABLE_CODES = new Set([
    'CLIENT_ABORTED',
    'CHAT_RUN_PROTOCOL_ERROR',
    'CHAT_RUN_SEQUENCE_INVALID',
    'GENERATION_RUN_NOT_FOUND',
    'CHAT_RUN_INVALID_REQUEST',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_KEY_MISMATCH',
    'AUTH_TOKEN_MISSING',
    'AUTH_INVALID_TOKEN',
    'AUTH_EXPIRED_TOKEN',
    'AUTH_FORBIDDEN',
    'CSRF_PROTECTION_FAILED',
])

const RETRYABLE_NETWORK_CODES = new Set([
    'CHAT_RUN_NETWORK_ERROR',
    'CHAT_RUN_STREAM_INCOMPLETE',
])

/**
 * 基于严格结构化策略判定错误是否允许进行 SSE / 任务恢复重试。
 *
 * 核心规则：
 * 1. 业务错误码优先级绝对高于 HTTP 状态码；
 * 2. 严格仅依据明确的错误类 (BackendChatRunClientError)、结构化错误码 (code) 和 HTTP 状态码 (status)；
 * 3. 彻底移除任何基于 message 字符串的模糊子串匹配或正则嗅探；
 * 4. 任何未被标准化的异常（包括业务回调抛出的本地 TypeError、语法错误等）默认不可重试。
 */
export function isRetryableError(err: unknown): boolean {
    if (!err) return false

    // 1. 客户端主动中断/取消：绝对不可重试
    if (err instanceof DOMException && err.name === 'AbortError') return false

    // 2. 严格依赖结构化后端错误白名单判断
    if (err instanceof BackendChatRunClientError) {
        // 关键安全契约：业务错误码绝对优先！协议错误、任务不存在等终态错误即便带有 500 也严禁重试
        if (PERMANENT_NON_RETRYABLE_CODES.has(err.code)) {
            return false
        }

        // 显式声明的传输层重试错误码
        if (RETRYABLE_NETWORK_CODES.has(err.code)) {
            return true
        }

        // 仅在非终态错误码的前提下，依据 HTTP 状态码判断瞬时故障（408/429/5xx）
        if (typeof err.status === 'number') {
            if ([408, 429].includes(err.status) || (err.status >= 500 && err.status < 600)) {
                return true
            }
            return false
        }

        return false
    }

    // 其余非结构化异常（包含本地回调 Bug、原生 TypeError、SyntaxError 等）一律不可重试
    return false
}
