import { apiFetch } from './api'

export type ConnectionTestTransport = 'direct' | 'backend'

export interface TestConnectionOptions {
    transport: ConnectionTestTransport
    provider: string
    model: string
    baseUrl?: string
    apiKey?: string
    timeoutMs?: number // default 30000
    signal?: AbortSignal
}

export type ConnectionTestFailureReason =
    | 'timeout'
    | 'aborted'
    | 'http_error'
    | 'stream_error'
    | 'no_text_delta'
    | 'network_error'

export interface TestConnectionResult {
    ok: boolean
    firstToken?: string
    durationMs: number
    error?: string
    reason?: ConnectionTestFailureReason
    status?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

export async function testConnection(options: TestConnectionOptions): Promise<TestConnectionResult> {
    const startTime = performance.now()
    const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_TIMEOUT_MS

    const internalAbort = new AbortController()
    let isTimeout = false

    const timeoutTimer = setTimeout(() => {
        isTimeout = true
        internalAbort.abort(new Error('TEST_TIMEOUT'))
    }, timeoutMs)

    let externalAbortListener: (() => void) | undefined
    if (options.signal) {
        if (options.signal.aborted) {
            clearTimeout(timeoutTimer)
            return {
                ok: false,
                durationMs: 0,
                reason: 'aborted',
                error: '测试已取消',
            }
        }
        externalAbortListener = () => {
            internalAbort.abort(options.signal?.reason)
        }
        options.signal.addEventListener('abort', externalAbortListener, { once: true })
    }

    try {
        if (options.transport === 'backend') {
            return await testBackendConnection(options, internalAbort.signal, startTime, timeoutMs)
        }
        return await testDirectConnection(options, internalAbort.signal, startTime)
    } catch (err: unknown) {
        const durationMs = Math.round(performance.now() - startTime)
        if (isTimeout) {
            return {
                ok: false,
                durationMs,
                reason: 'timeout',
                error: `等待首个 Token 超时 (${Math.round(timeoutMs / 1000)}s)`,
            }
        }
        if (options.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
            return {
                ok: false,
                durationMs,
                reason: 'aborted',
                error: '测试已取消',
            }
        }
        return {
            ok: false,
            durationMs,
            reason: 'network_error',
            error: err instanceof Error ? err.message : String(err),
        }
    } finally {
        clearTimeout(timeoutTimer)
        if (externalAbortListener && options.signal) {
            options.signal.removeEventListener('abort', externalAbortListener)
        }
    }
}

async function testBackendConnection(
    options: TestConnectionOptions,
    signal: AbortSignal,
    startTime: number,
    timeoutMs: number,
): Promise<TestConnectionResult> {
    const res = await apiFetch('/api/chat/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: options.provider,
            model: options.model,
            timeoutMs,
        }),
        signal,
    }, {
        baseUrl: options.baseUrl,
        skipAuthInterception: true,
    })

    const durationMs = Math.round(performance.now() - startTime)

    if (!res.ok) {
        let errMessage = ''
        try {
            const errJson = await res.json()
            errMessage = errJson.error || errJson.message || ''
        } catch {
            errMessage = await res.text().catch(() => '')
        }
        return {
            ok: false,
            durationMs,
            status: res.status,
            reason: 'http_error',
            error: classifyHttpStatusError(res.status, errMessage),
        }
    }

    const reader = res.body?.getReader()
    if (!reader) {
        return {
            ok: false,
            durationMs,
            reason: 'network_error',
            error: '未能读取后端响应流',
        }
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let firstToken = ''

    try {
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            if (!value) continue

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue
                let parsed: any
                try {
                    parsed = JSON.parse(trimmed)
                } catch {
                    continue
                }

                if (parsed.error) {
                    return {
                        ok: false,
                        durationMs: Math.round(performance.now() - startTime),
                        reason: 'stream_error',
                        error: parsed.error,
                    }
                }

                const content = parsed.message?.content
                if (typeof content === 'string' && content.trim().length > 0) {
                    firstToken = content
                    break
                }
            }

            if (firstToken) break
        }
    } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
    }

    if (!firstToken) {
        return {
            ok: false,
            durationMs: Math.round(performance.now() - startTime),
            reason: 'no_text_delta',
            error: '模型返回空响应，未收到有效文本 Token',
        }
    }

    return {
        ok: true,
        firstToken,
        durationMs: Math.round(performance.now() - startTime),
    }
}

async function testDirectConnection(
    options: TestConnectionOptions,
    signal: AbortSignal,
    startTime: number,
): Promise<TestConnectionResult> {
    let url = ''
    const headers = new Headers({ 'Content-Type': 'application/json' })
    let body: any = null

    if (options.provider === 'ollama') {
        const rawUrl = (options.baseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '')
        url = `${rawUrl}/api/chat`
        body = {
            model: options.model,
            messages: [{ role: 'user', content: 'hi' }],
            stream: true,
        }
    } else if (options.provider === 'openai') {
        if (!options.apiKey?.trim()) {
            return {
                ok: false,
                durationMs: 0,
                reason: 'http_error',
                error: '请先填写 API Key',
            }
        }
        const rawBase = (options.baseUrl || 'https://api.openai.com').trim().replace(/\/+$/, '')
        if (rawBase.endsWith('/chat/completions')) {
            url = rawBase
        } else if (rawBase.endsWith('/v1')) {
            url = `${rawBase}/chat/completions`
        } else {
            url = `${rawBase}/v1/chat/completions`
        }

        // 开发环境代理以避开官方域名的浏览器跨域
        const isDev = Boolean((import.meta as any).env?.DEV)
        if (isDev && url.startsWith('https://api.openai.com/v1/')) {
            url = url.replace('https://api.openai.com/v1/', '/__ai_proxy/openai/')
        }

        headers.set('Authorization', `Bearer ${options.apiKey.trim()}`)
        body = {
            model: options.model,
            messages: [{ role: 'user', content: 'hi' }],
            stream: true,
            max_tokens: 5,
        }
    } else if (options.provider === 'claude') {
        if (!options.apiKey?.trim()) {
            return {
                ok: false,
                durationMs: 0,
                reason: 'http_error',
                error: '请先填写 Claude API Key',
            }
        }
        url = 'https://api.anthropic.com/v1/messages'
        headers.set('x-api-key', options.apiKey.trim())
        headers.set('anthropic-version', '2023-06-01')
        headers.set('anthropic-dangerous-direct-browser-access', 'true')
        body = {
            model: options.model,
            messages: [{ role: 'user', content: 'hi' }],
            stream: true,
            max_tokens: 5,
        }
    } else {
        return {
            ok: false,
            durationMs: 0,
            reason: 'network_error',
            error: `不支持的直连厂商: ${options.provider}`,
        }
    }

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
    })

    const durationMs = Math.round(performance.now() - startTime)

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
            ok: false,
            durationMs,
            status: res.status,
            reason: 'http_error',
            error: classifyHttpStatusError(res.status, text),
        }
    }

    const reader = res.body?.getReader()
    if (!reader) {
        return {
            ok: false,
            durationMs,
            reason: 'network_error',
            error: '未能读取模型响应流',
        }
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let firstToken = ''

    try {
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            if (!value) continue

            buffer += decoder.decode(value, { stream: true })

            if (options.provider === 'ollama') {
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''
                for (const line of lines) {
                    const trimmed = line.trim()
                    if (!trimmed) continue
                    let parsed: any
                    try { parsed = JSON.parse(trimmed) } catch { continue }
                    if (parsed.error) {
                        return {
                            ok: false,
                            durationMs: Math.round(performance.now() - startTime),
                            reason: 'stream_error',
                            error: parsed.error,
                        }
                    }
                    const text = parsed.message?.content
                    if (typeof text === 'string' && text.trim().length > 0) {
                        firstToken = text
                        break
                    }
                }
            } else if (options.provider === 'openai') {
                // SSE blocks
                const blocks = buffer.split('\n\n')
                buffer = blocks.pop() ?? ''
                for (const block of blocks) {
                    const dataLines = block.split('\n')
                        .map(l => l.replace(/\r$/, ''))
                        .filter(l => l.startsWith('data:'))
                        .map(l => l.slice(5).trim())
                    for (const data of dataLines) {
                        if (data === '[DONE]') break
                        let parsed: any
                        try { parsed = JSON.parse(data) } catch { continue }
                        if (parsed.error) {
                            const errStr = typeof parsed.error === 'object' ? parsed.error.message : String(parsed.error)
                            return {
                                ok: false,
                                durationMs: Math.round(performance.now() - startTime),
                                reason: 'stream_error',
                                error: errStr,
                            }
                        }
                        const delta = parsed.choices?.[0]?.delta?.content
                        if (typeof delta === 'string' && delta.trim().length > 0) {
                            firstToken = delta
                            break
                        }
                    }
                    if (firstToken) break
                }
            } else if (options.provider === 'claude') {
                // Claude SSE blocks
                const blocks = buffer.split('\n\n')
                buffer = blocks.pop() ?? ''
                for (const block of blocks) {
                    const dataLines = block.split('\n')
                        .map(l => l.replace(/\r$/, ''))
                        .filter(l => l.startsWith('data:'))
                        .map(l => l.slice(5).trim())
                    for (const data of dataLines) {
                        let parsed: any
                        try { parsed = JSON.parse(data) } catch { continue }
                        if (parsed.type === 'error') {
                            return {
                                ok: false,
                                durationMs: Math.round(performance.now() - startTime),
                                reason: 'stream_error',
                                error: parsed.error?.message || 'Claude stream error',
                            }
                        }
                        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                            const text = parsed.delta.text
                            if (typeof text === 'string' && text.trim().length > 0) {
                                firstToken = text
                                break
                            }
                        }
                    }
                    if (firstToken) break
                }
            }

            if (firstToken) break
        }
    } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
    }

    if (!firstToken) {
        return {
            ok: false,
            durationMs: Math.round(performance.now() - startTime),
            reason: 'no_text_delta',
            error: '模型返回空响应，未收到有效文本 Token',
        }
    }

    return {
        ok: true,
        firstToken,
        durationMs: Math.round(performance.now() - startTime),
    }
}

function classifyHttpStatusError(status: number, message: string): string {
    if (status === 401) return `401 认证失败：${message || 'API Key 无效或未授权'}`
    if (status === 403) return `403 权限拒绝：${message || '上游服务禁止访问'}`
    if (status === 402) return `402 余额不足：${message || '账户欠费或配额已耗尽'}`
    if (status === 429) return `429 限流：${message || '请求速率或并发超限'}`
    if (status === 504) return `504 等待首个 Token 超时：${message || '上游服务响应超时'}`
    return message || `服务响应错误 (HTTP ${status})`
}
