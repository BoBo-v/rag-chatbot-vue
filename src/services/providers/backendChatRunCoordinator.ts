import { isRetryableError } from '../../utils/error'
import {
    BackendChatRunClientError,
    getBackendChatRun,
    streamBackendChatRunEvents,
    type BackendChatRunEvent,
    type BackendChatRunSnapshot,
} from './backendChatRun'

export interface RecoveryCoordinatorDependencies {
    getSnapshot?: (runId: string, signal?: AbortSignal) => Promise<BackendChatRunSnapshot>
    streamEvents?: (
        runId: string,
        options: {
            afterSequence: number
            signal?: AbortSignal
            onHeartbeat?: () => void
            onEvent: (event: BackendChatRunEvent) => Promise<void> | void
        },
    ) => Promise<void>
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
    randomJitter?: () => number
    retryDelays?: readonly number[]
}

export interface RunRecoveryCoordinatorOptions {
    runId: string
    initialSequence: number
    needInitialSnapshot?: boolean
    signal?: AbortSignal
    onSnapshotFetch?: (snapshot: BackendChatRunSnapshot) => Promise<boolean | void> | boolean | void // return true to terminate early
    onSnapshotSync: (snapshot: BackendChatRunSnapshot) => void
    getCurrentSequence?: () => number
    onHeartbeat?: () => void
    onEvent: (event: BackendChatRunEvent) => Promise<void> | void
    onProgress?: () => void
    onRetryNotice?: (attempt: number, maxAttempts: number) => void
    deps?: RecoveryCoordinatorDependencies
}

export function isBusinessPayloadEvent(event: BackendChatRunEvent): boolean {
    return event.type !== 'heartbeat'
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000] as const

async function defaultSleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return
    return new Promise((resolve) => {
        const onAbort = () => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }
        const timer = setTimeout(() => {
            if (signal) signal.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        if (signal) signal.addEventListener('abort', onAbort, { once: true })
    })
}

/**
 * 生产级生成任务恢复协调器
 * - 统一管理权威快照同步、断流重试退避算法与状态机
 * - 规则：连续失败最多重试 5 次；收到业务有效载荷后连续失败计数清零；心跳不重置计数
 * - 严格隔离网络故障与本地回调异常：本地回调（onEvent/onHeartbeat）抛出的异常绝不触发重连
 */
export async function runBackendChatRunRecoveryCoordinator(
    options: RunRecoveryCoordinatorOptions,
): Promise<void> {
    const deps = options.deps || {}
    const getSnapshotFn = deps.getSnapshot || ((r, s) => getBackendChatRun(r, { signal: s }))
    const streamEventsFn = deps.streamEvents || streamBackendChatRunEvents
    const sleepFn = deps.sleep || defaultSleepWithAbort
    const jitterFn = deps.randomJitter || (() => Math.floor(Math.random() * 500))
    const retryDelays = deps.retryDelays || DEFAULT_RETRY_DELAYS

    let attempt = 0
    let afterSequence = options.initialSequence
    let shouldFetchSnapshot = options.needInitialSnapshot ?? false

    while (true) {
        if (options.signal?.aborted) return

        // 1. 若是重试轮次或显式要求，先获取后端权威快照（严格仅对传输层捕获重试）
        if (attempt > 0 || shouldFetchSnapshot) {
            let snapshot
            try {
                snapshot = await getSnapshotFn(options.runId, options.signal)
            } catch (snapErr) {
                if (options.signal?.aborted) return
                if (!isRetryableError(snapErr) || attempt >= retryDelays.length) {
                    throw snapErr
                }
                const baseDelay = retryDelays[attempt]
                const delay = baseDelay + jitterFn()
                attempt++
                options.onRetryNotice?.(attempt, retryDelays.length)
                await sleepFn(delay, options.signal)
                continue
            }

            if (options.signal?.aborted) return

            // 本地快照消费回调隔离：快照拉取成功后执行，任何本地异常绝不误判为传输故障，直接原样抛出
            const earlyTerminate = await options.onSnapshotFetch?.(snapshot)
            if (earlyTerminate) return

            afterSequence = snapshot.lastSequence
            options.onSnapshotSync(snapshot)
            shouldFetchSnapshot = false
        } else if (options.getCurrentSequence) {
            afterSequence = options.getCurrentSequence()
        }

        // 2. 订阅后端事件流，并严格监控消费回调（onEvent / onProgress / onHeartbeat）错误来源
        let callbackError: { error: unknown } | null = null
        try {
            await streamEventsFn(options.runId, {
                afterSequence,
                signal: options.signal,
                onHeartbeat: () => {
                    try {
                        options.onHeartbeat?.()
                    } catch (err) {
                        callbackError = { error: err }
                        throw err
                    }
                },
                onEvent: async (event) => {
                    try {
                        if (isBusinessPayloadEvent(event)) {
                            if (attempt > 0) {
                                options.onProgress?.()
                                attempt = 0
                            }
                        }
                        await options.onEvent(event)
                    } catch (err) {
                        callbackError = { error: err }
                        throw err
                    }
                },
            })
            // 流正常接收并终态结束
            return
        } catch (err: unknown) {
            if (options.signal?.aborted || (err instanceof BackendChatRunClientError && err.code === 'CLIENT_ABORTED')) {
                return
            }

            // 核心安全规则：如果异常来源于业务消费回调（onEvent / onProgress / onHeartbeat），绝不重连，原样抛出
            const userCallbackError = callbackError as { error: unknown } | null
            if (userCallbackError !== null) {
                throw userCallbackError.error
            }

            // 传输层可重试判断
            if (!isRetryableError(err) || attempt >= retryDelays.length) {
                throw err
            }

            const baseDelay = retryDelays[attempt]
            const delay = baseDelay + jitterFn()
            attempt++
            options.onRetryNotice?.(attempt, retryDelays.length)
            await sleepFn(delay, options.signal)
        }
    }
}
