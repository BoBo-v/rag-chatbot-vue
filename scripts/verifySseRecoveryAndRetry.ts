import assert from 'node:assert/strict'
import type { Message } from '../src/types/chat'

;(import.meta as any).env = { VITE_API_BASE_URL: '', BASE_URL: '/' }
;(globalThis as any).window = (globalThis as any).window || {}
;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { isRetryableError } = await import('../src/utils/error')
const {
    BackendChatRunClientError,
    streamBackendChatRunEvents,
} = await import('../src/services/providers/backendChatRun')
const {
    runBackendChatRunRecoveryCoordinator,
} = await import('../src/services/providers/backendChatRunCoordinator')
type BackendChatRunSnapshot = import('../src/services/providers/backendChatRun').BackendChatRunSnapshot
type BackendChatRunClientErrorType = import('../src/services/providers/backendChatRun').BackendChatRunClientError

console.log('=== [1/3] 验证 isRetryableError 纯结构化白名单判定 ===')

// 1. 结构化可重试错误（网络中断、流截断、408/429/5xx）
const retryableErrors = [
    new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '网络连接中断'),
    new BackendChatRunClientError('CHAT_RUN_STREAM_INCOMPLETE', '生成流未正常完成'),
    new BackendChatRunClientError('HTTP_500', 'Internal Server Error', 500),
    new BackendChatRunClientError('HTTP_502', 'Bad Gateway', 502),
    new BackendChatRunClientError('HTTP_503', 'Service Unavailable', 503),
    new BackendChatRunClientError('HTTP_504', 'Gateway Timeout', 504),
    new BackendChatRunClientError('HTTP_429', 'Too Many Requests', 429),
    new BackendChatRunClientError('HTTP_408', 'Request Timeout', 408),
]

for (const err of retryableErrors) {
    assert.strictEqual(
        isRetryableError(err),
        true,
        `预期结构化错误应判定为可重试: ${err.code} (status: ${err.status})`,
    )
}

// 2. 任何非结构化异常（包含带 fetch 字样的普通 TypeError）与黑名单状态码一律不可重试
const nonRetryableErrors = [
    new TypeError('Failed to fetch'),
    new TypeError('fetch failed'),
    new TypeError('Failed to fetch user profile'),
    new Error('NetworkError when attempting to fetch resource.'),
    new Error('read ECONNRESET'),
    new Error('connect ETIMEDOUT'),
    new Error('TypeError: terminated'),
    new DOMException('Aborted', 'AbortError'),
    new BackendChatRunClientError('CLIENT_ABORTED', '客户端主动终止生成'),
    new BackendChatRunClientError('GENERATION_RUN_NOT_FOUND', '任务不存在或已过期', 404),
    new BackendChatRunClientError('GENERATION_RUN_NOT_FOUND', '任务不存在或已过期（即使携带 500）', 500),
    new BackendChatRunClientError('CHAT_RUN_PROTOCOL_ERROR', '协议格式不符合规范'),
    new BackendChatRunClientError('CHAT_RUN_PROTOCOL_ERROR', '协议格式不符合规范（即使携带 500）', 500),
    new BackendChatRunClientError('CHAT_RUN_SEQUENCE_INVALID', '序号不连续'),
    new BackendChatRunClientError('IDEMPOTENCY_KEY_MISMATCH', '幂等键不匹配（即使携带 500）', 500),
    new BackendChatRunClientError('AUTH_INVALID_TOKEN', '认证失败（即使携带 500）', 500),
    new BackendChatRunClientError('HTTP_400', 'Bad Request', 400),
    new BackendChatRunClientError('HTTP_401', 'Unauthorized', 401),
    new BackendChatRunClientError('HTTP_403', 'Forbidden', 403),
    new BackendChatRunClientError('HTTP_404', 'Not Found', 404),
    null,
    undefined,
]

for (const err of nonRetryableErrors) {
    assert.strictEqual(
        isRetryableError(err),
        false,
        `预期该错误绝不可重试: ${err instanceof Error ? err.message : String(err)}`,
    )
}
console.log('✅ isRetryableError 纯结构化白名单判定全部通过（彻底杜绝文本猜测）！')

console.log('\n=== [2/3] 验证真实 streamBackendChatRunEvents 异常转换与透传 ===')

// 用例 A：底层 reader.read() 失败，确认被准确转换为 CHAT_RUN_NETWORK_ERROR
{
    const originalFetch = globalThis.fetch
    try {
        globalThis.fetch = async () => {
            const stream = new ReadableStream<Uint8Array>({
                pull() {
                    throw new Error('TCP connection reset by peer')
                },
            })
            return new Response(stream, {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
            })
        }

        let caught: unknown = null
        try {
            await streamBackendChatRunEvents('run-reader-fail', {
                onEvent: async () => {},
            })
        } catch (err) {
            caught = err
        }

        assert.ok(caught instanceof BackendChatRunClientError, '必须被包装为 BackendChatRunClientError')
        assert.strictEqual((caught as any).code, 'CHAT_RUN_NETWORK_ERROR', 'code 必须为 CHAT_RUN_NETWORK_ERROR')
        assert.strictEqual(isRetryableError(caught), true, '读取流故障必须判定为可重试')
    } finally {
        globalThis.fetch = originalFetch
    }
}
console.log('✅ reader.read() 故障准确转换为 CHAT_RUN_NETWORK_ERROR 并判定为可重试！')

// 用例 B：业务 onEvent 抛出 TypeError('Failed to fetch user profile')，确认原样抛出且不可重试
{
    const originalFetch = globalThis.fetch
    try {
        const encoder = new TextEncoder()
        const sseData = 'id: 1\nevent: text_delta\ndata: {"version":1,"runId":"run-callback-fail","sequence":1,"type":"text_delta","timestamp":"2026-10-14T00:00:00Z","data":{"content":"hi"}}\n\n'
        globalThis.fetch = async () => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(encoder.encode(sseData))
                    controller.close()
                },
            })
            return new Response(stream, {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
            })
        }

        let caught: unknown = null
        try {
            await streamBackendChatRunEvents('run-callback-fail', {
                onEvent: async () => {
                    throw new TypeError('Failed to fetch user profile')
                },
            })
        } catch (err) {
            caught = err
        }

        assert.ok(caught instanceof TypeError, '回调异常必须保持原始 TypeError 类型，绝不可被改写')
        assert.strictEqual((caught as TypeError).message, 'Failed to fetch user profile')
        assert.strictEqual(isRetryableError(caught), false, '回调中的 TypeError 即使带有 fetch 字样也绝不可重试')
    } finally {
        globalThis.fetch = originalFetch
    }
}
console.log('✅ onEvent 异常原样抛出，未被改写，且判定为不可重试！')

// 用例 C：网关返回 502 + HTML 错误页，确认状态码 502 被保留且判定为可重试
{
    const originalFetch = globalThis.fetch
    try {
        globalThis.fetch = async () => {
            return new Response('<html><head><title>502 Bad Gateway</title></head><body>502</body></html>', {
                status: 502,
                headers: { 'content-type': 'text/html' },
            })
        }

        let caught: unknown = null
        try {
            await streamBackendChatRunEvents('run-502-html', {
                onEvent: async () => {},
            })
        } catch (err) {
            caught = err
        }

        assert.ok(caught instanceof BackendChatRunClientError, '必须为 BackendChatRunClientError')
        assert.strictEqual((caught as any).status, 502, 'HTTP 状态码 502 必须被精确保留')
        assert.strictEqual(isRetryableError(caught), true, '502 HTML 响应必须判定为可重试')
    } finally {
        globalThis.fetch = originalFetch
    }
}
console.log('✅ 网关 502 HTML 响应正确保留状态码 502 并判定为可重试！')

console.log('\n=== [3/3] 验证生产级恢复协调器状态机完整执行逻辑 ===')

// 场景 1：流读取失败 -> 触发退避重试，连续失败最多 5 次后抛出
{
    const attemptsObserved: number[] = []
    const sleepCalls: number[] = []
    let streamCalls = 0

    let caught: unknown = null
    try {
        await runBackendChatRunRecoveryCoordinator({
            runId: 'run-retry-5',
            initialSequence: 0,
            onSnapshotSync: () => {},
            onEvent: async () => {},
            onRetryNotice: (attempt) => attemptsObserved.push(attempt),
            deps: {
                getSnapshot: async () => ({
                    runId: 'run-retry-5',
                    assistantMessageId: 'msg-1',
                    conversationId: '1',
                    status: 'running',
                    outputText: '',
                    lastSequence: 0,
                } as any),
                streamEvents: async () => {
                    streamCalls++
                    throw new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '网络故障')
                },
                sleep: async (ms) => {
                    sleepCalls.push(ms)
                },
                randomJitter: () => 10,
                retryDelays: [100, 200, 400, 800, 1500],
            },
        })
    } catch (err) {
        caught = err
    }

    assert.ok(caught instanceof BackendChatRunClientError)
    assert.strictEqual(streamCalls, 6, '首次尝试失败 + 5 次重试，总共调用 6 次')
    assert.deepStrictEqual(attemptsObserved, [1, 2, 3, 4, 5], '重试计数必须连续递增至 5')
    assert.deepStrictEqual(sleepCalls, [110, 210, 410, 810, 1510], '退避延迟 + jitter 准确调用')
}
console.log('✅ 场景 1：流读取失败按退避策略重连，连续失败 5 次后终止并通过！')

// 场景 2：回调抛出 TypeError('Failed to fetch user profile') -> 绝不重连，保留原始错误立即退出
{
    let streamCalls = 0
    let sleepCalled = false
    let caught: unknown = null

    try {
        await runBackendChatRunRecoveryCoordinator({
            runId: 'run-cb-err',
            initialSequence: 0,
            onSnapshotSync: () => {},
            onEvent: async () => {
                throw new TypeError('Failed to fetch user profile')
            },
            deps: {
                streamEvents: async (_id, opts) => {
                    streamCalls++
                    await opts.onEvent({ type: 'text_delta' } as any)
                },
                sleep: async () => {
                    sleepCalled = true
                },
            },
        })
    } catch (err) {
        caught = err
    }

    assert.ok(caught instanceof TypeError, '必须原样抛出原始 TypeError')
    assert.strictEqual((caught as TypeError).message, 'Failed to fetch user profile')
    assert.strictEqual(streamCalls, 1, '业务回调抛错后绝不可重连，只调用一次')
    assert.strictEqual(sleepCalled, false, '不可进入退避睡眠')
}
console.log('✅ 场景 2：回调抛出带有 fetch 字样的 TypeError 绝不重连，保留原始错误并通过！')

// 场景 3：HTTP 401 -> 不重试，立即退出
{
    let streamCalls = 0
    let caught: unknown = null

    try {
        await runBackendChatRunRecoveryCoordinator({
            runId: 'run-401',
            initialSequence: 0,
            onSnapshotSync: () => {},
            onEvent: async () => {},
            deps: {
                streamEvents: async () => {
                    streamCalls++
                    throw new BackendChatRunClientError('HTTP_401', '未授权', 401)
                },
                sleep: async () => {},
            },
        })
    } catch (err) {
        caught = err
    }

    assert.ok(caught instanceof BackendChatRunClientError)
    assert.strictEqual((caught as any).status, 401)
    assert.strictEqual(streamCalls, 1, 'HTTP 401 绝不重试')
}
console.log('✅ 场景 3：HTTP 401 立即退出，不重试并通过！')

// 场景 4：HTTP 502 响应体为 HTML -> 正确识别为 HTTP 502 并重试
{
    let attempts = 0
    let streamCalls = 0

    await runBackendChatRunRecoveryCoordinator({
        runId: 'run-502',
        initialSequence: 0,
        onSnapshotSync: () => {},
        onEvent: async () => {},
        onRetryNotice: (att) => { attempts = att },
        deps: {
            getSnapshot: async () => ({
                status: 'running',
                lastSequence: 0,
                outputText: '',
            } as any),
            streamEvents: async () => {
                streamCalls++
                if (streamCalls === 1) {
                    throw new BackendChatRunClientError('HTTP_502', 'Bad Gateway', 502)
                }
                // 第二次成功
            },
            sleep: async () => {},
        },
    })

    assert.strictEqual(streamCalls, 2, '502 故障后成功进行了第二次重连')
    assert.strictEqual(attempts, 1, '记录了 1 次重试')
}
console.log('✅ 场景 4：HTTP 502 HTML 正确触发重试并通过！')

// 场景 5：快照响应体读取中断 -> 按传输错误处理并重试
{
    let snapshotCalls = 0
    let streamCalls = 0

    await runBackendChatRunRecoveryCoordinator({
        runId: 'run-snap-fail',
        initialSequence: 0,
        needInitialSnapshot: true,
        onSnapshotSync: () => {},
        onEvent: async () => {},
        deps: {
            getSnapshot: async () => {
                snapshotCalls++
                if (snapshotCalls === 1) {
                    throw new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '读取快照网络中断')
                }
                return { status: 'running', lastSequence: 5, outputText: 'ok' } as any
            },
            streamEvents: async () => {
                streamCalls++
            },
            sleep: async () => {},
        },
    })

    assert.strictEqual(snapshotCalls, 2, '快照失败后重试拉取快照')
    assert.strictEqual(streamCalls, 1, '快照恢复后正常建立流连接')
}
console.log('✅ 场景 5：快照读取中断按传输错误进入重试并通过！')

// 场景 6：收到心跳后再次断流 -> 失败计数继续增加，绝不被清零
{
    const retryCounts: number[] = []
    let streamCalls = 0

    try {
        await runBackendChatRunRecoveryCoordinator({
            runId: 'run-heartbeat',
            initialSequence: 0,
            onSnapshotSync: () => {},
            onEvent: async () => {},
            onRetryNotice: (att) => retryCounts.push(att),
            deps: {
                getSnapshot: async () => ({ status: 'running', lastSequence: 0, outputText: '' } as any),
                streamEvents: async (_id, opts) => {
                    streamCalls++
                    // 仅收到心跳事件，无业务载荷
                    opts.onHeartbeat?.()
                    throw new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '心跳后断网')
                },
                sleep: async () => {},
                retryDelays: [10, 20, 30],
            },
        })
    } catch {}

    assert.strictEqual(streamCalls, 4, '初次 + 3次重试共4次')
    assert.deepStrictEqual(retryCounts, [1, 2, 3], '仅收到心跳时，重试计数绝对没有被重置为 0，持续递增')
}
console.log('✅ 场景 6：仅收到心跳后断流，重试计数继续增加并通过！')

// 场景 7：重试期间用户取消 -> sleep 立即停止，不再请求
{
    const controller = new AbortController()
    let streamCalls = 0
    let sleepStarted = false

    const coordinatorPromise = runBackendChatRunRecoveryCoordinator({
        runId: 'run-abort',
        initialSequence: 0,
        signal: controller.signal,
        onSnapshotSync: () => {},
        onEvent: async () => {},
        deps: {
            streamEvents: async () => {
                streamCalls++
                throw new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '网络故障')
            },
            sleep: async (_ms, signal) => {
                sleepStarted = true
                return new Promise((resolve) => {
                    signal?.addEventListener('abort', () => resolve(), { once: true })
                })
            },
        },
    })

    // 等待进入 sleep
    await new Promise((r) => setTimeout(r, 20))
    assert.strictEqual(sleepStarted, true, '已进入退避 sleep')
    // 用户主动点击取消
    controller.abort()
    await coordinatorPromise

    assert.strictEqual(streamCalls, 1, '取消后不再发起后续连接')
}
console.log('✅ 场景 7：重试等待期间用户取消立即停止并通过！')

// 场景 8：重连快照已完成 -> 应用终态快照，退出，不再订阅 SSE
{
    let streamCalls = 0
    let terminalApplied = false

    await runBackendChatRunRecoveryCoordinator({
        runId: 'run-terminal',
        initialSequence: 0,
        needInitialSnapshot: true,
        onSnapshotFetch: (snapshot) => {
            if (snapshot.status === 'completed') {
                terminalApplied = true
                return true // 终态退出
            }
        },
        onSnapshotSync: () => {},
        onEvent: async () => {},
        deps: {
            getSnapshot: async () => ({
                status: 'completed',
                lastSequence: 100,
                outputText: '已完成的内容',
            } as any),
            streamEvents: async () => {
                streamCalls++
            },
        },
    })

    assert.strictEqual(terminalApplied, true, '终态快照被成功检测并应用')
    assert.strictEqual(streamCalls, 0, '终态后绝不再建立 SSE 订阅')
}
console.log('✅ 场景 8：重连快照已完成直接应用终态，不再订阅 SSE并通过！')

// 场景 9：快照序号回退、输出为空 -> 权威状态、序号与 Markdown 缓存正确重置
{
    const localMessage: Message = {
        id: 'msg-ai-1',
        role: 'assistant',
        status: 'streaming',
        content: '旧内容缓存',
        time: '10:00:00',
        generationSequence: 80,
        generationRunId: 'run-auth-reset',
        formattedMarkdown: '<div>旧HTML</div>',
        formattedContent: '旧渲染',
    }

    const authoritativeSnapshot: BackendChatRunSnapshot = {
        runId: 'run-auth-reset',
        runType: 'chat',
        conversationId: '1',
        turnId: 'turn-1',
        sourceUserMessageId: 'user-1',
        assistantMessageId: 'msg-ai-1',
        status: 'running',
        provider: 'ollama',
        model: 'deepseek-r1:1.5b',
        regeneratedFromRunId: null,
        outputText: '', // 输出被重置为空
        lastSequence: 12, // 序号从 80 回退到 12
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-10-14T00:00:00Z',
        startedAt: '2026-10-14T00:00:00Z',
        finishedAt: null,
        cancelRequestedAt: null,
    }

    let syncedSequence = 0

    await runBackendChatRunRecoveryCoordinator({
        runId: 'run-auth-reset',
        initialSequence: localMessage.generationSequence ?? 0,
        needInitialSnapshot: true,
        onSnapshotSync: (snapshot) => {
            localMessage.content = snapshot.outputText
            localMessage.generationSequence = snapshot.lastSequence
            localMessage.formattedMarkdown = undefined
            localMessage.formattedContent = undefined
            syncedSequence = snapshot.lastSequence
        },
        onEvent: async () => {},
        deps: {
            getSnapshot: async () => authoritativeSnapshot,
            streamEvents: async () => {},
        },
    })

    assert.strictEqual(localMessage.content, '', '内容必须强行同步为权威空输出')
    assert.strictEqual(localMessage.generationSequence, 12, '序列号必须强行回退到 12')
    assert.strictEqual(localMessage.formattedMarkdown, undefined, '旧 Markdown 缓存必须清除')
    assert.strictEqual(localMessage.formattedContent, undefined, '旧 Content 缓存必须清除')
    assert.strictEqual(syncedSequence, 12, '同步序号保持一致')
}
console.log('✅ 场景 9：快照序号回退、空输出及缓存清理正确同步并通过！')

// 场景 10：业务 onProgress 抛出结构化网络错误 -> 必须原样抛出，严禁被当作传输错误重试
{
    let streamCalls = 0
    let sleepCalled = false
    let caught: unknown = null

    try {
        await runBackendChatRunRecoveryCoordinator({
            runId: 'run-progress-err',
            initialSequence: 0,
            onSnapshotSync: () => {},
            onProgress: () => {
                // 模拟业务回调内发起其它请求并抛出具备网络特征的结构化异常
                throw new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '业务 onProgress 内部网络异常')
            },
            onEvent: async () => {},
            deps: {
                getSnapshot: async () => ({
                    status: 'running',
                    lastSequence: 1,
                    outputText: '',
                } as any),
                streamEvents: async (_id, opts) => {
                    streamCalls++
                    if (streamCalls === 1) {
                        // 首次触发网络重试，使得 attempt > 0
                        throw new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '首轮断流')
                    }
                    // 第二轮重试收到有效载荷，触发 options.onProgress()
                    await opts.onEvent({ type: 'text_delta', sequence: 2 } as any)
                },
                sleep: async () => {
                    sleepCalled = true
                },
            },
        })
    } catch (err) {
        caught = err
    }

    assert.ok(caught instanceof BackendChatRunClientError, '必须原样抛出 onProgress 的异常')
    assert.strictEqual((caught as BackendChatRunClientErrorType).message, '业务 onProgress 内部网络异常')
    assert.strictEqual(streamCalls, 2, '第二轮 onProgress 抛错后绝不可开启第三轮重连')
    assert.strictEqual(sleepCalled, true, '首轮网络断流经历过一次退避')
}
console.log('✅ 场景 10：业务 onProgress 即使抛出结构化网络错误也绝不重连并通过！')

// 场景 11：业务 onSnapshotSync / onSnapshotFetch 抛出结构化网络错误 -> 快照拉取成功后绝不触发快照重试
{
    let snapshotCalls = 0
    let sleepCalls = 0
    let caught: unknown = null

    try {
        await runBackendChatRunRecoveryCoordinator({
            runId: 'run-snapsync-err',
            initialSequence: 0,
            needInitialSnapshot: true,
            onSnapshotSync: () => {
                throw new BackendChatRunClientError('CHAT_RUN_NETWORK_ERROR', '快照消费业务同步异常')
            },
            onEvent: async () => {},
            deps: {
                getSnapshot: async () => {
                    snapshotCalls++
                    return { status: 'running', lastSequence: 5, outputText: 'ok' } as any
                },
                streamEvents: async () => {},
                sleep: async () => {
                    sleepCalls++
                },
            },
        })
    } catch (err) {
        caught = err
    }

    assert.ok(caught instanceof BackendChatRunClientError, '必须原样抛出 onSnapshotSync 的异常')
    assert.strictEqual((caught as BackendChatRunClientErrorType).message, '快照消费业务同步异常')
    assert.strictEqual(snapshotCalls, 1, '快照成功拉取后，消费回调抛错绝不重新拉取快照')
    assert.strictEqual(sleepCalls, 0, '消费异常绝不进入重试退避等待')
}
console.log('✅ 场景 11：快照消费回调抛出结构化网络错误绝不被快照重试吞没并通过！')

console.log('\n========================================')
console.log('🎉 所有 SSE 错误分类与恢复协调器测试全部通过！')
console.log('========================================')
