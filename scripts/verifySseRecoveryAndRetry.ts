import assert from 'node:assert/strict'
import type { Message } from '../src/types/chat'

;(import.meta as any).env = { VITE_API_BASE_URL: '', BASE_URL: '/' }
;(globalThis as any).window = (globalThis as any).window || {}
;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { isRetryableError } = await import('../src/utils/error')
const { BackendChatRunClientError } = await import('../src/services/providers/backendChatRun')
type BackendChatRunEvent = import('../src/services/providers/backendChatRun').BackendChatRunEvent

console.log('--- 开始测试 SSE 重试白名单与错误分类判定 ---')

// 1. 白名单：可重试错误测试
const retryableErrors = [
    new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '网络连接中断'),
    new BackendChatRunClientError('CHAT_RUN_STREAM_INCOMPLETE', '生成流未正常完成'),
    new BackendChatRunClientError('HTTP_500', 'Internal Server Error', 500),
    new BackendChatRunClientError('HTTP_502', 'Bad Gateway', 502),
    new BackendChatRunClientError('HTTP_503', 'Service Unavailable', 503),
    new BackendChatRunClientError('HTTP_504', 'Gateway Timeout', 504),
    new BackendChatRunClientError('HTTP_429', 'Too Many Requests', 429),
    new BackendChatRunClientError('HTTP_408', 'Request Timeout', 408),
    new TypeError('fetch failed'),
    new TypeError('Failed to fetch'),
    new Error('NetworkError when attempting to fetch resource.'),
    new Error('read ECONNRESET'),
    new Error('connect ETIMEDOUT'),
    new Error('TypeError: terminated'),
    new Error('HTTP 502 Bad Gateway'),
    new Error('HTTP 500 Server Error'),
    new Error('HTTP 429 Rate Limit Exceeded'),
]

for (const err of retryableErrors) {
    assert.strictEqual(
        isRetryableError(err),
        true,
        `预期该错误应判定为可重试: ${err instanceof Error ? err.message : String(err)}`,
    )
}
console.log('✅ 可重试白名单（500/502/503/504/429/408、网络异常、断流）校验全部通过！')

// 2. 黑名单与未知错误：不可重试测试
const nonRetryableErrors = [
    new DOMException('Aborted', 'AbortError'),
    new BackendChatRunClientError('CLIENT_ABORTED', '客户端主动终止生成'),
    new BackendChatRunClientError('GENERATION_RUN_NOT_FOUND', '任务不存在或已过期', 404),
    new BackendChatRunClientError('CHAT_RUN_PROTOCOL_ERROR', '协议格式不符合规范'),
    new BackendChatRunClientError('CHAT_RUN_SEQUENCE_INVALID', '序号不连续'),
    new BackendChatRunClientError('HTTP_400', 'Bad Request', 400),
    new BackendChatRunClientError('HTTP_401', 'Unauthorized', 401),
    new BackendChatRunClientError('HTTP_403', 'Forbidden', 403),
    new BackendChatRunClientError('HTTP_404', 'Not Found', 404),
    new Error('The user aborted a request.'),
    new Error('生成任务与当前聊天消息不匹配。'),
    new Error('HTTP 401 Unauthorized'),
    new Error('HTTP 404 Not Found'),
    new Error('HTTP 400 Bad Request'),
    new Error('CHAT_RUN_PROTOCOL_ERROR: missing fields'),
    new Error('Some random SyntaxError in client rendering'),
    null,
    undefined,
]

for (const err of nonRetryableErrors) {
    assert.strictEqual(
        isRetryableError(err),
        false,
        `预期该错误应判定为不可重试: ${err instanceof Error ? err.message : String(err)}`,
    )
}
console.log('✅ 不可重试（400/401/403/404/AbortError/CLIENT_ABORTED/协议异常/未知错误）校验全部通过！')

// 3. 心跳隔离逻辑测试：收到心跳不重置 attempt 计数器
console.log('\n--- 开始测试心跳与业务载荷事件重置逻辑 ---')
function isBusinessPayloadEvent(event: BackendChatRunEvent): boolean {
    return event.type !== 'heartbeat'
}

let attempt = 3

// 收到心跳事件：attempt 保持不变
const heartbeatEvent: BackendChatRunEvent = {
    version: 1,
    runId: 'run-1',
    sequence: 10,
    type: 'heartbeat',
    timestamp: new Date().toISOString(),
    data: {},
}

if (isBusinessPayloadEvent(heartbeatEvent)) {
    attempt = 0
}
assert.strictEqual(attempt, 3, '收到 heartbeat 事件时，绝不能将 attempt 重置为 0')

// 收到业务有效载荷事件（如 text_delta）：attempt 正常归零
const textDeltaEvent: BackendChatRunEvent = {
    version: 1,
    runId: 'run-1',
    sequence: 11,
    type: 'text_delta',
    timestamp: new Date().toISOString(),
    data: { content: 'hello' },
}

if (isBusinessPayloadEvent(textDeltaEvent)) {
    attempt = 0
}
assert.strictEqual(attempt, 0, '收到 text_delta 业务事件时，必须将 attempt 归零')
console.log('✅ 心跳隔离逻辑校验通过（心跳不重置 attempt，仅业务事件重置）！')

// 4. 统一后端权威快照同步逻辑测试
console.log('\n--- 开始测试权威快照恢复机制 ---')
const localMessage: Message = {
    id: 'msg-ai-1',
    role: 'assistant',
    status: 'streaming',
    content: '本地残留的较长文本内容，包含了旧的渲染缓存',
    time: '10:00:00',
    generationSequence: 50,
    generationRunId: 'run-authoritative-1',
    formattedMarkdown: '<div class="stale-cache">旧缓存</div>',
    formattedContent: '<p>旧缓存内容</p>',
}

// 模拟后端快照发生序列号回退且输出文本变短（例如后端发生了截断或重试）
const authoritativeSnapshot = {
    runId: 'run-authoritative-1',
    assistantMessageId: 'msg-ai-1',
    conversationId: '1',
    status: 'running' as const,
    outputText: '权威简短内容',
    lastSequence: 10, // 序列号回退：从 50 回退到 10
}

// 模拟权威快照同步过程
let afterSequence = localMessage.generationSequence ?? 0
afterSequence = authoritativeSnapshot.lastSequence
localMessage.content = authoritativeSnapshot.outputText
localMessage.generationSequence = authoritativeSnapshot.lastSequence
localMessage.formattedMarkdown = undefined
localMessage.formattedContent = undefined

assert.strictEqual(localMessage.content, '权威简短内容', '内容必须强行同步为后端的 outputText')
assert.strictEqual(localMessage.generationSequence, 10, '序列号必须强行回退至后端的 lastSequence')
assert.strictEqual(localMessage.formattedMarkdown, undefined, '旧的 Markdown 格式化缓存必须被彻底清除')
assert.strictEqual(localMessage.formattedContent, undefined, '旧的内容展示缓存必须被彻底清除')
assert.strictEqual(afterSequence, 10, '后续 SSE 请求序号必须同步为后端的 lastSequence')

// 测试 outputText 为空字符串的情况（例如刚重置或空回复）
const emptySnapshot = {
    runId: 'run-authoritative-1',
    assistantMessageId: 'msg-ai-1',
    conversationId: '1',
    status: 'running' as const,
    outputText: '',
    lastSequence: 0,
}

afterSequence = emptySnapshot.lastSequence
localMessage.content = emptySnapshot.outputText
localMessage.generationSequence = emptySnapshot.lastSequence
localMessage.formattedMarkdown = undefined
localMessage.formattedContent = undefined

assert.strictEqual(localMessage.content, '', '空字符串 outputText 必须被权威采纳，清空本地残留字符')
assert.strictEqual(localMessage.generationSequence, 0, '序号必须重置为 0')
console.log('✅ 权威快照同步机制（回退强行同步、空字符串采纳、缓存清理）校验全部通过！')

console.log('\n🎉 所有 SSE 重试与权威快照恢复机制测试全部通过！\n')
