import { apiFetch } from './api'
import { openAIEndpoint, openAIHeaders } from './providers/openai'
import { CLAUDE_API_ENDPOINT, claudeHeaders } from './providers/claude'

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
        let result: TestConnectionResult
        if (options.transport === 'backend') {
            result = await testBackendConnection(options, internalAbort.signal, startTime, timeoutMs)
        } else {
            result = await testDirectConnection(options, internalAbort.signal, startTime)
        }

        if (internalAbort.signal.aborted || options.signal?.aborted) {
            const durationMs = Math.round(performance.now() - startTime)
            if (isTimeout) {
                return {
                    ok: false,
                    durationMs,
                    reason: 'timeout',
                    error: `等待首个 Token 超时 (${Math.round(timeoutMs / 1000)}s)`,
                }
            }
            return {
                ok: false,
                durationMs,
                reason: 'aborted',
                error: '测试已取消',
            }
        }

        return result
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
        if (internalAbort.signal.aborted || options.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
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
        let errMessage: string
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

    const parseNdjsonBuffer = (): { errorResult?: TestConnectionResult } => {
        const lines = buffer.split(/\r?\n/)
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
                    errorResult: {
                        ok: false,
                        durationMs: Math.round(performance.now() - startTime),
                        reason: 'stream_error',
                        error: parsed.error,
                    },
                }
            }

            const content = parsed.message?.content
            if (typeof content === 'string' && content.trim().length > 0) {
                firstToken = content
                break
            }
        }
        return {}
    }

    try {
        while (true) {
            if (signal.aborted) {
                throw new DOMException('This operation was aborted', 'AbortError')
            }
            const { value, done } = await reader.read()
            if (done) break
            if (!value) continue

            buffer += decoder.decode(value, { stream: true })
            const { errorResult } = parseNdjsonBuffer()
            if (errorResult) return errorResult

            if (firstToken) break
        }

        if (!firstToken) {
            buffer += decoder.decode()
            if (buffer.trim()) {
                const { errorResult } = parseNdjsonBuffer()
                if (errorResult) return errorResult
            }
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
    let url: string
    let headers: Headers
    let body: any

    if (options.provider === 'ollama') {
        const rawUrl = (options.baseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '')
        url = `${rawUrl}/api/chat`
        headers = new Headers({ 'Content-Type': 'application/json' })
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
        url = openAIEndpoint(options.baseUrl, '/v1/chat/completions')
        headers = new Headers(openAIHeaders(options.apiKey))
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
        url = CLAUDE_API_ENDPOINT
        headers = new Headers(claudeHeaders(options.apiKey))
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

    const parseDirectBuffer = (): { errorResult?: TestConnectionResult } => {
        if (options.provider === 'ollama') {
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue
                let parsed: any
                try { parsed = JSON.parse(trimmed) } catch { continue }
                if (parsed.error) {
                    return {
                        errorResult: {
                            ok: false,
                            durationMs: Math.round(performance.now() - startTime),
                            reason: 'stream_error',
                            error: parsed.error,
                        },
                    }
                }
                const text = parsed.message?.content
                if (typeof text === 'string' && text.trim().length > 0) {
                    firstToken = text
                    break
                }
            }
        } else if (options.provider === 'openai' || options.provider === 'claude') {
            const blocks = buffer.split(/\r?\n\r?\n/)
            buffer = blocks.pop() ?? ''
            for (const block of blocks) {
                const lines = block.split(/\r?\n/)
                const dataLines: string[] = []
                let isErrorEvent = false
                for (const rawLine of lines) {
                    const line = rawLine.trim()
                    if (line.startsWith('event:')) {
                        const eventType = line.slice(6).trim()
                        if (eventType === 'error') {
                            isErrorEvent = true
                        }
                    } else if (line.startsWith('data:')) {
                        dataLines.push(line.slice(5).trim())
                    }
                }
                if (dataLines.length === 0) continue

                const rawData = dataLines.join('\n')
                if (rawData === '[DONE]') break

                let parsed: any
                try {
                    parsed = JSON.parse(rawData)
                } catch {
                    continue
                }

                if (options.provider === 'openai') {
                    if (parsed.error) {
                        const errStr = typeof parsed.error === 'object' ? parsed.error.message : String(parsed.error)
                        return {
                            errorResult: {
                                ok: false,
                                durationMs: Math.round(performance.now() - startTime),
                                reason: 'stream_error',
                                error: errStr,
                            },
                        }
                    }
                    const delta = parsed.choices?.[0]?.delta?.content
                    if (typeof delta === 'string' && delta.trim().length > 0) {
                        firstToken = delta
                        break
                    }
                } else if (options.provider === 'claude') {
                    if (isErrorEvent || parsed.type === 'error') {
                        return {
                            errorResult: {
                                ok: false,
                                durationMs: Math.round(performance.now() - startTime),
                                reason: 'stream_error',
                                error: parsed.error?.message || 'Claude stream error',
                            },
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
            }
        }
        return {}
    }

    try {
        while (true) {
            if (signal.aborted) {
                throw new DOMException('This operation was aborted', 'AbortError')
            }
            const { value, done } = await reader.read()
            if (done) break
            if (!value) continue

            buffer += decoder.decode(value, { stream: true })
            const { errorResult } = parseDirectBuffer()
            if (errorResult) return errorResult

            if (firstToken) break
        }

        if (!firstToken) {
            buffer += decoder.decode()
            if (buffer.trim()) {
                const { errorResult } = parseDirectBuffer()
                if (errorResult) return errorResult
            }
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
