import type { Message } from '../types/chat'

interface TypewriterStreamOptions {
    appendToMessage: (id: string, chunk: string) => void
    updateMessage: (id: string, changes: Omit<Partial<Message>, 'id'>) => void
    formatFinishedMessage: (id: string) => void | Promise<void>
    scheduleScroll: () => void
    isAborted: () => boolean
}

export function useTypewriterStream(options: TypewriterStreamOptions) {
    let queue: string[] = []
    let isFlushing = false
    let pendingDoneId: string | null = null
    let pendingDoneResolve: (() => void) | null = null
    let abortedBuffer: {
        messageId: string
        text: string
        timer: ReturnType<typeof setTimeout>
    } | null = null

    function reset(): void {
        queue = []
        isFlushing = false
        pendingDoneId = null
        pendingDoneResolve = null
    }

    function hasPendingOutput(): boolean {
        return queue.length > 0 || isFlushing
    }

    function finishPendingMessage(): void {
        if (!pendingDoneId) return

        const id = pendingDoneId
        pendingDoneId = null

        if (options.isAborted()) {
            updateAborted(id)
        } else {
            options.updateMessage(id, { status: 'done' })
            void options.formatFinishedMessage(id)
        }

        pendingDoneResolve?.()
        pendingDoneResolve = null
    }

    function updateAborted(id: string): void {
        options.updateMessage(id, { status: 'aborted', canContinue: true })
    }

    function preserveAbortedQueue(messageId: string): void {
        const text = queue.splice(0).join('')
        if (!text) return

        if (abortedBuffer) {
            clearTimeout(abortedBuffer.timer)
        }

        const buffer = {
            messageId,
            text,
            timer: setTimeout(() => {
                if (abortedBuffer === buffer) {
                    abortedBuffer = null
                }
            }, 30_000),
        }
        abortedBuffer = buffer
    }

    function restoreAbortedOutput(messageId: string): boolean {
        if (!abortedBuffer || abortedBuffer.messageId !== messageId) return false

        clearTimeout(abortedBuffer.timer)
        const text = abortedBuffer.text
        abortedBuffer = null

        if (!text) return false
        options.appendToMessage(messageId, text)
        options.scheduleScroll()
        return true
    }

    function abort(messageId: string): void {
        preserveAbortedQueue(messageId)
        isFlushing = false

        if (pendingDoneId === messageId) {
            pendingDoneId = null
            pendingDoneResolve?.()
            pendingDoneResolve = null
        }

        updateAborted(messageId)
    }

    function push(messageId: string, chunk: string): void {
        queue.push(chunk)
        flush(messageId)
    }

    function flush(messageId: string): void {
        if (isFlushing) return
        isFlushing = true

        function step() {
            if (options.isAborted()) {
                preserveAbortedQueue(messageId)
                isFlushing = false
                finishPendingMessage()
                return
            }

            if (queue.length === 0) {
                isFlushing = false
                finishPendingMessage()
                return
            }

            let text = ''
            const batchSize = Math.min(queue.length, 3)
            for (let i = 0; i < batchSize; i++) {
                text += queue.shift()!
            }
            options.appendToMessage(messageId, text)
            options.scheduleScroll()
            requestAnimationFrame(step)
        }

        requestAnimationFrame(step)
    }

    function markDone(messageId: string): void {
        if (options.isAborted()) {
            updateAborted(messageId)
        } else if (hasPendingOutput()) {
            pendingDoneId = messageId
        } else {
            options.updateMessage(messageId, { status: 'done' })
            void options.formatFinishedMessage(messageId)
        }
    }

    async function waitForPendingDone(timeoutMs = 30_000): Promise<void> {
        if (!pendingDoneId) return

        if (options.isAborted()) {
            const id = pendingDoneId
            pendingDoneId = null
            preserveAbortedQueue(id)
            updateAborted(id)
            isFlushing = false
            pendingDoneResolve?.()
            pendingDoneResolve = null
            return
        }

        await Promise.race([
            new Promise<void>(resolve => { pendingDoneResolve = resolve }),
            new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
        ])

        if (!pendingDoneId) return

        const id = pendingDoneId
        pendingDoneId = null

        if (options.isAborted()) {
            preserveAbortedQueue(id)
            updateAborted(id)
        } else {
            if (queue.length > 0) {
                const remaining = queue.splice(0).join('')
                options.appendToMessage(id, remaining)
            }
            options.updateMessage(id, { status: 'done' })
            void options.formatFinishedMessage(id)
        }

        isFlushing = false
        pendingDoneResolve = null
    }

    return {
        reset,
        push,
        markDone,
        waitForPendingDone,
        restoreAbortedOutput,
        abort,
    }
}
