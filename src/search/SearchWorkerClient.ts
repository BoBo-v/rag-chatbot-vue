import type { WorkerRequest, WorkerRequestInput, WorkerResponse } from './types'

type PendingRequest = {
    resolve: (payload: unknown) => void
    reject: (reason?: unknown) => void
}

export class SearchWorkerClient {
    private readonly worker: Worker
    private readonly pending = new Map<string, PendingRequest>()

    constructor() {
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
