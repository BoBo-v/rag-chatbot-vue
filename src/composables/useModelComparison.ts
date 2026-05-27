import { computed, ref } from 'vue'
import { generateStreamWithContext } from '../services/stream'
import { classifyError } from '../utils/error'
import type { Message } from '../types/chat'
import type { ComparisonRun, ComparisonSession, ModelRuntimeConfig } from '../types/model'

const WORKFLOW_VERSION = 1
const PROMPT_VERSION = 1

interface RunController {
    runId: string
    controller: AbortController
}

interface StartComparisonOptions {
    prompt: string
    runtimes: ModelRuntimeConfig[]
    messages?: Message[]
    conversationId?: number
}

export function useModelComparison() {
    const session = ref<ComparisonSession | null>(null)
    const controllers = new Map<string, RunController>()

    const runs = computed(() => session.value?.runs ?? [])
    const isRunning = computed(() =>
        runs.value.some(run => run.status === 'loading' || run.status === 'streaming')
    )
    const successfulRuns = computed(() =>
        runs.value.filter(run => run.status === 'done' && run.content.trim())
    )

    function createSession(options: StartComparisonOptions): ComparisonSession {
        const now = Date.now()
        const sessionId = crypto.randomUUID()
        return {
            id: sessionId,
            conversationId: options.conversationId,
            prompt: options.prompt,
            runs: options.runtimes.map(runtime => ({
                id: crypto.randomUUID(),
                sessionId,
                config: { ...runtime },
                content: '',
                status: 'idle',
            })),
            workflowVersion: WORKFLOW_VERSION,
            promptVersion: PROMPT_VERSION,
            createdAt: now,
            updatedAt: now,
        }
    }

    function updateRun(runId: string, changes: Partial<ComparisonRun>): void {
        const currentSession = session.value
        if (!currentSession) return

        const run = currentSession.runs.find(item => item.id === runId)
        if (!run) return

        Object.assign(run, changes)
        currentSession.updatedAt = Date.now()
    }

    function appendRunContent(runId: string, chunk: string): void {
        const currentSession = session.value
        if (!currentSession) return

        const run = currentSession.runs.find(item => item.id === runId)
        if (!run) return

        run.content += chunk
        if (run.status === 'loading') {
            run.status = 'streaming'
        }
        currentSession.updatedAt = Date.now()
    }

    function finishRun(runId: string, status: ComparisonRun['status'], errorMessage?: string): void {
        const finishedAt = Date.now()
        const run = runs.value.find(item => item.id === runId)
        updateRun(runId, {
            status,
            errorMessage,
            finishedAt,
            latencyMs: run?.startedAt ? finishedAt - run.startedAt : undefined,
        })
        controllers.delete(runId)
    }

    async function runModel(run: ComparisonRun, messages: Message[] = []): Promise<void> {
        const controller = new AbortController()
        controllers.set(run.id, { runId: run.id, controller })

        updateRun(run.id, {
            content: '',
            status: 'loading',
            errorMessage: undefined,
            startedAt: Date.now(),
            finishedAt: undefined,
            latencyMs: undefined,
        })

        try {
            await generateStreamWithContext({
                messages,
                userText: session.value?.prompt ?? '',
                runtime: { ...run.config },
                onChunk: chunk => {
                    if (controller.signal.aborted) return
                    appendRunContent(run.id, chunk)
                },
                onDone: () => finishRun(run.id, controller.signal.aborted ? 'aborted' : 'done'),
                signal: controller.signal,
            })
        } catch (err) {
            if (controller.signal.aborted) {
                finishRun(run.id, 'aborted')
                return
            }

            const chatError = classifyError(err)
            finishRun(run.id, 'error', chatError.message)
        } finally {
            controllers.delete(run.id)
        }
    }

    async function startComparison(options: StartComparisonOptions): Promise<void> {
        stopAll()
        session.value = createSession(options)
        await Promise.all(session.value.runs.map(run => runModel(run, options.messages ?? [])))
    }

    function stopRun(runId: string): void {
        const run = runs.value.find(item => item.id === runId)
        if (!run || run.status === 'done' || run.status === 'error' || run.status === 'aborted') return

        const runController = controllers.get(runId)
        if (runController) {
            runController.controller.abort()
        } else {
            finishRun(runId, 'aborted')
        }
    }

    function stopAll(): void {
        for (const runController of controllers.values()) {
            runController.controller.abort()
        }
    }

    async function retryRun(runId: string, messages: Message[] = []): Promise<void> {
        const run = runs.value.find(item => item.id === runId)
        if (!run || run.status === 'loading' || run.status === 'streaming') return

        await runModel(run, messages)
    }

    return {
        session,
        runs,
        successfulRuns,
        isRunning,
        startComparison,
        stopRun,
        stopAll,
        retryRun,
    }
}
