import type { WorkerRequest, WorkerRequestInput, WorkerResponse } from './types'

type PendingRequest = {
    resolve: (payload: unknown) => void
    reject: (reason?: unknown) => void
    timer: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT_MS = 15_000

export class SearchWorkerClient {
    private worker: Worker
    private readonly pending = new Map<string, PendingRequest>()

    constructor() {
        this.worker = this.createWorker()
    }

    private createWorker(): Worker {
        const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })

        worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
            const response = event.data
            const pending = this.pending.get(response.requestId)
            if (!pending) return

            this.pending.delete(response.requestId)
            clearTimeout(pending.timer)

            if (response.type === 'ERROR') {
                pending.reject(new Error(response.error))
            } else {
                pending.resolve(response.payload)
            }
        })

        worker.addEventListener('error', (event) => {
            this.rejectPending(event.error ?? new Error(event.message || 'Search worker failed'))
            this.restartWorker()
        })

        return worker
    }

    private rejectPending(reason: unknown): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(reason)
        }
        this.pending.clear()
    }

    private restartWorker(): void {
        this.worker.terminate()
        this.worker = this.createWorker()
    }

    request<T>(message: WorkerRequestInput): Promise<T> {
        const requestId = crypto.randomUUID()
        const request = { ...message, requestId } as WorkerRequest

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (!this.pending.has(requestId)) return
                this.rejectPending(new Error('Search worker request timed out'))
                this.restartWorker()
            }, REQUEST_TIMEOUT_MS)

            this.pending.set(requestId, {
                resolve: payload => resolve(payload as T),
                reject,
                timer,
            })

            try {
                this.worker.postMessage(request)
            } catch (err) {
                clearTimeout(timer)
                this.pending.delete(requestId)
                reject(err)
            }
        })
    }

    dispose(): void {
        this.worker.terminate()
        this.rejectPending(new Error('Search worker disposed'))
    }
}
