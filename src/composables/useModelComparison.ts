import { computed, ref } from 'vue'
import { generateStreamWithContext } from '../services/stream'
import {
    deleteComparisonSession,
    listComparisonSessions,
    loadComparisonSession,
    saveComparisonSession,
    type ComparisonSessionListItem,
} from '../services/comparisonPersistence'
import { classifyError } from '../utils/error'
import type { FileAttachment, ImageAttachment, Message } from '../types/chat'
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
    images?: ImageAttachment[]
    files?: FileAttachment[]
}

export function useModelComparison() {
    const session = ref<ComparisonSession | null>(null)
    const history = ref<ComparisonSessionListItem[]>([])
    const controllers = new Map<string, RunController>()
    let persistQueue = Promise.resolve()

    const runs = computed(() => session.value?.runs ?? [])
    const isRunning = computed(() =>
        runs.value.some(run => run.status === 'loading' || run.status === 'streaming')
    )
    const successfulRuns = computed(() =>
        runs.value.filter(run => run.status === 'done' && run.content.trim())
    )
    const summaryRun = computed(() => session.value?.summaryRun ?? null)
    const isSummaryRunning = computed(() =>
        summaryRun.value?.status === 'loading' || summaryRun.value?.status === 'streaming'
    )

    function createSession(options: StartComparisonOptions): ComparisonSession {
        const now = Date.now()
        const sessionId = crypto.randomUUID()
        return {
            id: sessionId,
            conversationId: options.conversationId,
            prompt: options.prompt,
            images: options.images?.map(image => ({ ...image })),
            files: options.files?.map(file => ({ ...file })),
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

    function findRun(runId: string): ComparisonRun | undefined {
        const currentSession = session.value
        if (!currentSession) return undefined

        if (currentSession.summaryRun?.id === runId) {
            return currentSession.summaryRun
        }
        return currentSession.runs.find(item => item.id === runId)
    }

    function updateRun(runId: string, changes: Partial<ComparisonRun>): void {
        const currentSession = session.value
        if (!currentSession) return

        const run = findRun(runId)
        if (!run) return

        Object.assign(run, changes)
        currentSession.updatedAt = Date.now()
    }

    async function persistCurrentSession(summaryInstruction?: string): Promise<void> {
        persistQueue = persistQueue
            .catch(() => undefined)
            .then(async () => {
                if (!session.value) return
                await saveComparisonSession(session.value, summaryInstruction)
                await refreshHistory()
            })
        await persistQueue
    }

    function appendRunContent(runId: string, chunk: string): void {
        const currentSession = session.value
        if (!currentSession) return

        const run = findRun(runId)
        if (!run) return

        run.content += chunk
        if (run.status === 'loading') {
            run.status = 'streaming'
        }
        currentSession.updatedAt = Date.now()
    }

    function finishRun(runId: string, status: ComparisonRun['status'], errorMessage?: string): void {
        const finishedAt = Date.now()
        const run = findRun(runId)
        updateRun(runId, {
            status,
            errorMessage,
            finishedAt,
            latencyMs: run?.startedAt ? finishedAt - run.startedAt : undefined,
        })
        controllers.delete(runId)
    }

    function buildSummaryPrompt(
        prompt: string,
        sourceRuns: ComparisonRun[],
        summaryInstruction?: string
    ): string {
        const answers = sourceRuns.map((run, index) => {
            const modelName = `${run.config.provider} / ${run.config.model}`
            return `## 回答 ${index + 1}: ${modelName}\n\n${run.content.trim()}`
        }).join('\n\n---\n\n')
        const instruction = summaryInstruction?.trim()
        const instructionBlock = instruction
            ? ['用户的汇总要求：', instruction, '']
            : []

        return [
            '你将看到同一个问题下多个模型的回答。',
            '请综合它们的信息，输出一个最终答案。',
            '',
            '要求：',
            '1. 不要盲目投票，优先选择事实更完整、逻辑更严谨的内容。',
            '2. 如果多个回答冲突，请指出冲突点。',
            '3. 如果信息不足，请明确说明不确定之处。',
            '4. 不要声称某个模型一定正确。',
            '5. 最后给出可直接使用的最终回答。',
            '',
            `原始问题：\n${prompt}`,
            '',
            ...instructionBlock,
            `模型回答：\n${answers}`,
        ].join('\n')
    }

    async function runModel(
        run: ComparisonRun,
        userText: string,
        messages: Message[] = [],
        summaryInstruction?: string
    ): Promise<void> {
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
                userText,
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
            await persistCurrentSession(summaryInstruction)
        }
    }

    async function startComparison(options: StartComparisonOptions): Promise<void> {
        stopAll()
        session.value = createSession(options)
        await persistCurrentSession()
        const promptMessages = options.images?.length || options.files?.length
            ? [
                ...(options.messages ?? []),
                {
                    id: crypto.randomUUID(),
                    role: 'user' as const,
                    content: options.prompt,
                    images: options.images?.map(image => ({ ...image })),
                    files: options.files?.map(file => ({ ...file })),
                    status: 'done' as const,
                },
            ]
            : options.messages ?? []
        await Promise.all(session.value.runs.map(run =>
            runModel(run, session.value?.prompt ?? '', promptMessages)
        ))
    }

    function stopRun(runId: string): void {
        const run = findRun(runId)
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
        const run = findRun(runId)
        if (!run || run.status === 'loading' || run.status === 'streaming') return

        await runModel(run, session.value?.prompt ?? '', messages)
    }

    async function summarizeWith(
        runtime: ModelRuntimeConfig,
        summaryInstruction?: string
    ): Promise<void> {
        const currentSession = session.value
        const sourceRuns = successfulRuns.value
        if (!currentSession || sourceRuns.length === 0 || isSummaryRunning.value) return

        const summaryId = crypto.randomUUID()
        const summary: ComparisonRun = {
            id: summaryId,
            sessionId: currentSession.id,
            config: { ...runtime },
            content: '',
            status: 'idle',
            sourceRunIds: sourceRuns.map(run => run.id),
        }
        currentSession.summaryRun = summary
        currentSession.updatedAt = Date.now()
        await persistCurrentSession(summaryInstruction)

        await runModel(
            summary,
            buildSummaryPrompt(currentSession.prompt, sourceRuns, summaryInstruction),
            [],
            summaryInstruction
        )
    }

    function stopSummary(): void {
        const currentSummaryRun = summaryRun.value
        if (!currentSummaryRun) return
        stopRun(currentSummaryRun.id)
    }

    async function refreshHistory(): Promise<void> {
        history.value = await listComparisonSessions()
    }

    async function loadSession(sessionId: string): Promise<void> {
        stopAll()
        const restoredSession = await loadComparisonSession(sessionId)
        if (!restoredSession) return
        session.value = restoredSession
        await refreshHistory()
    }

    async function loadLatestCompletedSession(): Promise<void> {
        await refreshHistory()
        const latest = history.value[0]
        if (!latest) return
        await loadSession(latest.id)
    }

    function clearSession(): void {
        stopAll()
        session.value = null
    }

    async function removeSession(sessionId: string): Promise<void> {
        if (session.value?.id === sessionId) {
            stopAll()
        }
        await deleteComparisonSession(sessionId)
        if (session.value?.id === sessionId) {
            session.value = null
        }
        await refreshHistory()
    }

    return {
        session,
        history,
        runs,
        summaryRun,
        successfulRuns,
        isRunning,
        isSummaryRunning,
        startComparison,
        stopRun,
        stopSummary,
        stopAll,
        retryRun,
        summarizeWith,
        refreshHistory,
        loadSession,
        loadLatestCompletedSession,
        clearSession,
        removeSession,
    }
}
