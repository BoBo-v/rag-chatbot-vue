import type { WorkerRequest, WorkerRequestInput, WorkerResponse } from './types'

type PendingRequest = {
    resolve: (payload: unknown) => void
    reject: (reason?: unknown) => void
}

// 主线程和搜索 Web Worker 的通信封装。
// 调用 request() 时会生成 requestId，worker 回包时再用 requestId 找到对应 Promise。
export class SearchWorkerClient {
    private readonly worker: Worker
    private readonly pending = new Map<string, PendingRequest>()

    constructor() {
        // Vite 会把 worker 文件单独打包；type: 'module' 允许 worker 内使用 import/export。
        this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
        this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
            const response = event.data
            const pending = this.pending.get(response.requestId)
            if (!pending) return

            this.pending.delete(response.requestId)
            if (response.type === 'ERROR') {
                pending.reject(new Error(response.error))
            } else {
                pending.resolve(response.payload)
            }
        })
        this.worker.addEventListener('error', (event) => {
            for (const pending of this.pending.values()) {
                pending.reject(event.error ?? new Error(event.message))
            }
            this.pending.clear()
        })
    }

    request<T>(message: WorkerRequestInput): Promise<T> {
        const requestId = crypto.randomUUID()
        const request = { ...message, requestId } as WorkerRequest

        return new Promise<T>((resolve, reject) => {
            // 先登记 pending，再 postMessage，避免 worker 很快返回时找不到回调。
            this.pending.set(requestId, {
                resolve: payload => resolve(payload as T),
                reject,
            })
            this.worker.postMessage(request)
        })
    }

    dispose(): void {
        this.worker.terminate()
        this.pending.clear()
    }
}
