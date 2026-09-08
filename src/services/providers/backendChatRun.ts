import type { Message, RagCitation } from '../../types/chat'
import type { ModelRuntimeConfig } from '../../types/model'
import { buildBackendChatBody } from './backendChat'

export const BACKEND_CHAT_RUN_EVENT_VERSION = 1 as const

export type BackendChatRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type BackendChatRunEventType =
    | 'run_started'
    | 'rag_context'
    | 'text_delta'
    | 'run_completed'
    | 'run_failed'
    | 'run_cancelled'

export interface BackendChatRunSnapshot {
    runId: string
    runType: 'chat'
    conversationId: string
    turnId: string
    sourceUserMessageId: string
    assistantMessageId: string
    status: BackendChatRunStatus
    provider: string
    model: string
    regeneratedFromRunId: string | null
    outputText: string
    lastSequence: number
    errorCode: string | null
    errorMessage: string | null
    createdAt: string
    startedAt: string | null
    finishedAt: string | null
    cancelRequestedAt: string | null
}

export interface BackendChatRunEvent {
    version: typeof BACKEND_CHAT_RUN_EVENT_VERSION
    runId: string
    sequence: number
    type: BackendChatRunEventType
    timestamp: string
    data: Record<string, unknown>
}

export interface CreateBackendChatRunInput {
    messages: Message[]
    userText: string
    runtime: ModelRuntimeConfig
    conversationId: string | number
    turnId: string
    sourceUserMessageId: string
    assistantMessageId: string
    regeneratedFromRunId?: string
}

export interface CreateBackendChatRunResult {
    created: boolean
    run: BackendChatRunSnapshot
}

export interface BackendChatRunRequestOptions {
    accessKey?: string
    signal?: AbortSignal
}

export interface StreamBackendChatRunOptions extends BackendChatRunRequestOptions {
    afterSequence?: number
    onEvent: (event: BackendChatRunEvent) => void | Promise<void>
}

export class BackendChatRunClientError extends Error {
    readonly code: string
    readonly status?: number

    constructor(code: string, message: string, status?: number, options?: ErrorOptions) {
        super(message, options)
        this.name = 'BackendChatRunClientError'
        this.code = code
        this.status = status
    }
}

const eventTypes = new Set<BackendChatRunEventType>([
    'run_started',
    'rag_context',
    'text_delta',
    'run_completed',
    'run_failed',
    'run_cancelled',
])

export async function createBackendChatRun(
    input: CreateBackendChatRunInput,
    options: BackendChatRunRequestOptions = {},
): Promise<CreateBackendChatRunResult> {
    const headers = buildHeaders(options.accessKey)
    headers.set('Content-Type', 'application/json')
    headers.set('Idempotency-Key', input.turnId)

    const response = await request('/api/chat/runs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            ...buildBackendChatBody(input.messages, input.userText, input.runtime),
            conversationId: input.conversationId,
            turnId: input.turnId,
            sourceUserMessageId: input.sourceUserMessageId,
            assistantMessageId: input.assistantMessageId,
            regeneratedFromRunId: input.regeneratedFromRunId,
        }),
        signal: options.signal,
    }, options.signal)

    if (!response.ok) throw await toApiError(response)
    const payload = await readJson(response)
    if (!isRecord(payload) || typeof payload.created !== 'boolean') {
        throw protocolError('创建生成任务接口返回格式不正确。')
    }
    return {
        created: payload.created,
        run: parseRunSnapshot(payload.run),
    }
}

export async function getBackendChatRun(
    runId: string,
    options: BackendChatRunRequestOptions = {},
): Promise<BackendChatRunSnapshot> {
    const response = await request(`/api/chat/runs/${encodeURIComponent(runId)}`, {
        headers: buildHeaders(options.accessKey),
        signal: options.signal,
    }, options.signal)
    if (!response.ok) throw await toApiError(response)
    const payload = await readJson(response)
    if (!isRecord(payload)) throw protocolError('生成任务快照接口返回格式不正确。')
    return parseRunSnapshot(payload.run)
}

export async function cancelBackendChatRun(
    runId: string,
    options: BackendChatRunRequestOptions = {},
): Promise<BackendChatRunSnapshot> {
    const response = await request(`/api/chat/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
        headers: buildHeaders(options.accessKey),
        signal: options.signal,
    }, options.signal)
    if (!response.ok) throw await toApiError(response)
    const payload = await readJson(response)
    if (!isRecord(payload)) throw protocolError('取消生成任务接口返回格式不正确。')
    return parseRunSnapshot(payload.run)
}

export async function streamBackendChatRunEvents(
    runId: string,
    options: StreamBackendChatRunOptions,
): Promise<void> {
    const afterSequence = normalizeSequence(options.afterSequence)
    const headers = buildHeaders(options.accessKey)
    headers.set('Accept', 'text/event-stream')
    if (afterSequence > 0) headers.set('Last-Event-ID', String(afterSequence))

    const response = await request(`/api/chat/runs/${encodeURIComponent(runId)}/events`, {
        headers,
        signal: options.signal,
    }, options.signal)
    if (!response.ok) throw await toApiError(response)
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        throw protocolError('生成任务事件接口没有返回预期的 SSE 流。')
    }
    if (!response.body) throw protocolError('生成任务事件接口返回了空响应流。')

    const parser = new BackendChatRunSseParser(runId, afterSequence, options.onEvent)
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

export function ragContextFromRunEvent(event: BackendChatRunEvent): {
    enabled: boolean
    mode: 'auto' | 'off' | 'force'
    citations: RagCitation[]
} | null {
    if (event.type !== 'rag_context') return null
    const mode = event.data.mode
    const citations = event.data.citations
    if ((mode !== 'auto' && mode !== 'off' && mode !== 'force') || !Array.isArray(citations)) return null
    return {
        enabled: event.data.enabled === true,
        mode,
        citations: citations.filter(isRagCitation),
    }
}

class BackendChatRunSseParser {
    private buffer = ''
    private lastSequence: number
    private terminalReceived = false

    constructor(
        private readonly runId: string,
        afterSequence: number,
        private readonly onEvent: StreamBackendChatRunOptions['onEvent'],
    ) {
        this.lastSequence = afterSequence
    }

    async push(chunk: string): Promise<void> {
        this.buffer += chunk
        const blocks = this.buffer.split(/\r?\n\r?\n/)
        this.buffer = blocks.pop() ?? ''
        for (const block of blocks) await this.consume(block)
    }

    async finish(): Promise<void> {
        if (this.buffer.trim()) await this.consume(this.buffer)
        this.buffer = ''
        if (!this.terminalReceived) {
            throw new BackendChatRunClientError('CHAT_RUN_STREAM_INCOMPLETE', '生成任务事件流在终态返回前已结束。')
        }
    }

    private async consume(block: string): Promise<void> {
        if (!block.trim() || block.trimStart().startsWith(':') || this.terminalReceived) return
        const lines = block.split(/\r?\n/)
        const rawId = lines.find(line => line.startsWith('id:'))?.slice(3).trim()
        const eventType = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
        const dataText = lines
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart())
            .join('\n')
        if (!rawId || !eventType || !dataText || !/^[1-9][0-9]*$/.test(rawId)) {
            throw protocolError('生成任务事件缺少有效的 id、event 或 data。')
        }

        let value: unknown
        try {
            value = JSON.parse(dataText)
        } catch (error) {
            throw protocolError('生成任务事件包含无效 JSON。', error)
        }
        const event = parseRunEvent(value)
        const id = Number(rawId)
        if (event.runId !== this.runId || event.sequence !== id || event.type !== eventType) {
            throw protocolError('生成任务事件标识不一致。')
        }
        if (event.sequence <= this.lastSequence) {
            throw protocolError('生成任务事件序号没有递增。')
        }

        this.lastSequence = event.sequence
        this.terminalReceived = isTerminalEvent(event.type)
        await this.onEvent(event)
    }
}

function parseRunSnapshot(value: unknown): BackendChatRunSnapshot {
    if (!isRecord(value)
        || typeof value.runId !== 'string'
        || value.runType !== 'chat'
        || typeof value.conversationId !== 'string'
        || typeof value.turnId !== 'string'
        || typeof value.sourceUserMessageId !== 'string'
        || typeof value.assistantMessageId !== 'string'
        || !isRunStatus(value.status)
        || typeof value.provider !== 'string'
        || typeof value.model !== 'string'
        || typeof value.outputText !== 'string'
        || !Number.isInteger(value.lastSequence)) {
        throw protocolError('生成任务快照字段不完整。')
    }
    return value as unknown as BackendChatRunSnapshot
}

function parseRunEvent(value: unknown): BackendChatRunEvent {
    if (!isRecord(value)
        || value.version !== BACKEND_CHAT_RUN_EVENT_VERSION
        || typeof value.runId !== 'string'
        || !Number.isInteger(value.sequence)
        || typeof value.type !== 'string'
        || !eventTypes.has(value.type as BackendChatRunEventType)
        || typeof value.timestamp !== 'string'
        || !isRecord(value.data)) {
        throw protocolError('生成任务事件格式不正确。')
    }
    return value as unknown as BackendChatRunEvent
}

function buildHeaders(accessKey?: string): Headers {
    const headers = new Headers()
    const normalized = accessKey?.trim()
    if (normalized) headers.set('x-api-key', normalized)
    return headers
}

async function request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    try {
        return await fetch(url, init)
    } catch (error) {
        throw normalizeNetworkError(error, signal)
    }
}

async function toApiError(response: Response): Promise<BackendChatRunClientError> {
    const payload = await readJson(response)
    const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`
    const message = isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `生成任务请求失败，HTTP ${response.status}。`
    return new BackendChatRunClientError(code, message, response.status)
}

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text()
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch (error) {
        throw protocolError('生成任务接口返回了无效 JSON。', error)
    }
}

function normalizeNetworkError(error: unknown, signal?: AbortSignal): BackendChatRunClientError {
    if (error instanceof BackendChatRunClientError) return error
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return new BackendChatRunClientError('CLIENT_ABORTED', '生成任务订阅已停止。', undefined, { cause: error })
    }
    return new BackendChatRunClientError(
        'CHAT_RUN_NETWORK_ERROR',
        error instanceof Error ? error.message : '无法连接生成任务接口。',
        undefined,
        { cause: error },
    )
}

function protocolError(message: string, cause?: unknown): BackendChatRunClientError {
    return new BackendChatRunClientError('CHAT_RUN_PROTOCOL_ERROR', message, undefined, { cause })
}

function normalizeSequence(value?: number): number {
    if (value === undefined) return 0
    if (!Number.isSafeInteger(value) || value < 0) throw protocolError('事件起始序号必须是非负整数。')
    return value
}

function isRunStatus(value: unknown): value is BackendChatRunStatus {
    return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed' || value === 'cancelled'
}

function isTerminalEvent(type: BackendChatRunEventType): boolean {
    return type === 'run_completed' || type === 'run_failed' || type === 'run_cancelled'
}

function isRagCitation(value: unknown): value is RagCitation {
    return isRecord(value)
        && typeof value.fileId === 'string'
        && typeof value.filename === 'string'
        && Number.isInteger(value.chunkIndex)
        && typeof value.score === 'number'
        && typeof value.vectorScore === 'number'
        && typeof value.keywordScore === 'number'
        && typeof value.text === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
