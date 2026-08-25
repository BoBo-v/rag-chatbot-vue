export const AGENT_EVENT_VERSION = 1 as const
export const AGENT_ACCESS_KEY_STORAGE_KEY = 'ai-chat.agent-access-key'

export type AgentProviderId = 'ollama'
export type AgentProfileId = 'calculator-v0' | 'tools-v0'
export type AgentRequestRole = 'user' | 'assistant'
export type AgentTerminalEventType = 'agent_completed' | 'agent_failed' | 'agent_cancelled'

export type AgentEventType =
    | 'agent_started'
    | 'agent_queued'
    | 'model_started'
    | 'model_completed'
    | 'tool_started'
    | 'tool_completed'
    | 'assistant_message'
    | 'heartbeat'
    | AgentTerminalEventType

export interface AgentRequestMessage {
    role: AgentRequestRole
    content: string
}

export interface AgentRunRequest {
    agentProfile: AgentProfileId
    provider: AgentProviderId
    model: string
    agentSessionId?: string
    agentTurnId?: string
    messages: AgentRequestMessage[]
}

export interface AgentUsage {
    inputTokens?: number
    outputTokens?: number
}

export interface AgentEvent {
    version: typeof AGENT_EVENT_VERSION
    sequence: number
    requestId: string
    agentRunId: string
    step: number
    timestamp: string
    type: AgentEventType
    data: Record<string, unknown>
}

export interface AgentProviderInfo {
    id: string
    name: string
    defaultModel: string
    configured: boolean
    capabilities: {
        chatStream: boolean
        agentTools: boolean
    }
    agentModels: string[]
}

export interface AgentStreamOptions {
    accessKey?: string
    signal?: AbortSignal
    onEvent: (event: AgentEvent) => void | Promise<void>
}

export class AgentClientError extends Error {
    readonly code: string
    readonly status?: number

    constructor(code: string, message: string, status?: number, options?: ErrorOptions) {
        super(message, options)
        this.name = 'AgentClientError'
        this.code = code
        this.status = status
    }
}

const agentEventTypes = new Set<AgentEventType>([
    'agent_started',
    'agent_queued',
    'model_started',
    'model_completed',
    'tool_started',
    'tool_completed',
    'assistant_message',
    'heartbeat',
    'agent_completed',
    'agent_failed',
    'agent_cancelled',
])

const terminalEventTypes = new Set<AgentEventType>([
    'agent_completed',
    'agent_failed',
    'agent_cancelled',
])

export async function fetchAgentProviders(signal?: AbortSignal): Promise<AgentProviderInfo[]> {
    const response = await fetch('/api/providers', { signal })
    if (!response.ok) throw await toApiError(response)

    const payload = await readJson<{ providers?: unknown }>(response)
    if (!payload || !Array.isArray(payload.providers)) {
        throw new AgentClientError('AGENT_PROVIDER_RESPONSE_INVALID', '模型厂商接口返回格式不正确。')
    }

    return payload.providers
        .filter(isAgentProviderInfo)
        .filter(provider => provider.configured && provider.capabilities.agentTools && provider.agentModels.length > 0)
}

export async function streamAgentRun(
    request: AgentRunRequest,
    options: AgentStreamOptions
): Promise<void> {
    let response: Response
    try {
        response = await fetch('/api/agent', {
            method: 'POST',
            headers: buildAgentHeaders(options.accessKey),
            body: JSON.stringify(request),
            signal: options.signal,
        })
    } catch (error) {
        throw normalizeNetworkError(error, options.signal)
    }

    if (!response.ok) throw await toApiError(response)
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
        throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 接口没有返回预期的 NDJSON 事件流。')
    }
    if (!response.body) {
        throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 接口返回了空响应流。')
    }

    const parser = new AgentEventParser(options.onEvent)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    try {
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            await parser.push(decoder.decode(value, { stream: true }))
        }
        await parser.push(decoder.decode())
        await parser.finish()
    } catch (error) {
        await reader.cancel().catch(() => undefined)
        throw normalizeNetworkError(error, options.signal)
    } finally {
        reader.releaseLock()
    }
}

export function loadAgentAccessKey(): string {
    if (typeof sessionStorage === 'undefined') return ''
    return sessionStorage.getItem(AGENT_ACCESS_KEY_STORAGE_KEY) ?? ''
}

export function saveAgentAccessKey(value: string): void {
    if (typeof sessionStorage === 'undefined') return
    const normalized = value.trim()
    if (normalized) sessionStorage.setItem(AGENT_ACCESS_KEY_STORAGE_KEY, normalized)
    else sessionStorage.removeItem(AGENT_ACCESS_KEY_STORAGE_KEY)
}

class AgentEventParser {
    private buffer = ''
    private sequence = 0
    private requestId = ''
    private agentRunId = ''
    private terminalReceived = false
    private readonly onEvent: AgentStreamOptions['onEvent']

    constructor(onEvent: AgentStreamOptions['onEvent']) {
        this.onEvent = onEvent
    }

    async push(chunk: string): Promise<void> {
        this.buffer += chunk
        const lines = this.buffer.split(/\r?\n/)
        this.buffer = lines.pop() ?? ''
        for (const line of lines) await this.consume(line)
    }

    async finish(): Promise<void> {
        if (this.buffer.trim()) await this.consume(this.buffer)
        this.buffer = ''
        if (!this.terminalReceived) {
            throw new AgentClientError('AGENT_STREAM_INCOMPLETE', 'Agent 事件流在终态返回前已结束。')
        }
    }

    private async consume(line: string): Promise<void> {
        if (!line.trim() || this.terminalReceived) return

        let value: unknown
        try {
            value = JSON.parse(line)
        } catch (error) {
            throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件流包含无效 JSON。', undefined, { cause: error })
        }

        const event = parseAgentEvent(value)
        if (event.sequence !== this.sequence + 1) {
            throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件序号不连续。')
        }
        if (this.sequence === 0) {
            this.requestId = event.requestId
            this.agentRunId = event.agentRunId
        } else if (event.requestId !== this.requestId || event.agentRunId !== this.agentRunId) {
            throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件运行标识在流中发生变化。')
        }

        this.sequence = event.sequence
        if (terminalEventTypes.has(event.type)) this.terminalReceived = true
        await this.onEvent(event)
    }
}

function parseAgentEvent(value: unknown): AgentEvent {
    if (!isRecord(value)) throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件必须是对象。')
    if (value.version !== AGENT_EVENT_VERSION) {
        throw new AgentClientError('AGENT_PROTOCOL_VERSION_UNSUPPORTED', `不支持 Agent 事件协议版本 ${String(value.version)}。`)
    }
    if (!Number.isInteger(value.sequence) || (value.sequence as number) < 1) {
        throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件序号无效。')
    }
    if (!Number.isInteger(value.step) || (value.step as number) < 0) {
        throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件步骤无效。')
    }
    if (typeof value.requestId !== 'string' || !value.requestId || typeof value.agentRunId !== 'string' || !value.agentRunId) {
        throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件缺少运行标识。')
    }
    if (typeof value.timestamp !== 'string' || Number.isNaN(Date.parse(value.timestamp))) {
        throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件时间无效。')
    }
    if (typeof value.type !== 'string' || !agentEventTypes.has(value.type as AgentEventType)) {
        throw new AgentClientError('AGENT_PROTOCOL_ERROR', `未知的 Agent 事件类型 ${String(value.type)}。`)
    }
    if (!isRecord(value.data)) throw new AgentClientError('AGENT_PROTOCOL_ERROR', 'Agent 事件 data 必须是对象。')

    return value as unknown as AgentEvent
}

function buildAgentHeaders(accessKey: string | undefined): Headers {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    const normalized = accessKey?.trim()
    if (normalized) headers.set('x-agent-api-key', normalized)
    return headers
}

async function toApiError(response: Response): Promise<AgentClientError> {
    const payload = await readJson<{ error?: unknown; message?: unknown; code?: unknown }>(response)
    const code = typeof payload?.code === 'string' ? payload.code : `HTTP_${response.status}`
    const message = typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
            ? payload.message
            : `Agent 请求失败，HTTP ${response.status}。`
    return new AgentClientError(code, message, response.status)
}

async function readJson<T>(response: Response): Promise<T | null> {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return null
    return response.json().catch(() => null) as Promise<T | null>
}

function normalizeNetworkError(error: unknown, signal?: AbortSignal): AgentClientError {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return new AgentClientError('CLIENT_ABORTED', 'Agent 请求已取消。', undefined, { cause: error })
    }
    if (error instanceof AgentClientError) return error
    return new AgentClientError(
        'AGENT_NETWORK_ERROR',
        error instanceof Error ? error.message : '无法连接 Agent 接口。',
        undefined,
        { cause: error }
    )
}

function isAgentProviderInfo(value: unknown): value is AgentProviderInfo {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.name === 'string'
        && typeof value.defaultModel === 'string'
        && typeof value.configured === 'boolean'
        && isRecord(value.capabilities)
        && typeof value.capabilities.chatStream === 'boolean'
        && typeof value.capabilities.agentTools === 'boolean'
        && Array.isArray(value.agentModels)
        && value.agentModels.every(model => typeof model === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
