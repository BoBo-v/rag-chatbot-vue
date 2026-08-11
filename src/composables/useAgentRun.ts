import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import {
    AgentClientError,
    streamAgentRun,
    type AgentEvent,
    type AgentRunRequest,
    type AgentUsage,
} from '../services/agent'

export type AgentRunStatus =
    | 'idle'
    | 'connecting'
    | 'queued'
    | 'running'
    | 'using_tool'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled'

export interface AgentRunSummary {
    finishReason: string
    modelTurns: number
    toolCallCount: number
    usage: AgentUsage | null
}

export function useAgentRun() {
    const status = ref<AgentRunStatus>('idle')
    const events = ref<AgentEvent[]>([])
    const answer = ref('')
    const errorCode = ref('')
    const errorMessage = ref('')
    const requestId = ref('')
    const agentRunId = ref('')
    const currentStep = ref(0)
    const lastHeartbeatAt = ref('')
    const summary = ref<AgentRunSummary | null>(null)
    const controller = shallowRef<AbortController | null>(null)
    let runGeneration = 0
    let terminalReceived = false

    const isRunning = computed(() => [
        'connecting',
        'queued',
        'running',
        'using_tool',
        'cancelling',
    ].includes(status.value))

    async function run(request: AgentRunRequest, accessKey?: string): Promise<void> {
        if (isRunning.value) return
        resetRunState()
        status.value = 'connecting'
        const generation = ++runGeneration
        const activeController = new AbortController()
        controller.value = activeController

        try {
            await streamAgentRun(request, {
                accessKey,
                signal: activeController.signal,
                onEvent: event => {
                    if (generation !== runGeneration || terminalReceived) return
                    applyEvent(event)
                },
            })
        } catch (error) {
            if (generation !== runGeneration || terminalReceived) return
            const clientError = error instanceof AgentClientError
                ? error
                : new AgentClientError('AGENT_CLIENT_ERROR', error instanceof Error ? error.message : 'Agent 运行失败。')
            errorCode.value = clientError.code
            errorMessage.value = clientError.message
            status.value = clientError.code === 'CLIENT_ABORTED' ? 'cancelled' : 'failed'
            terminalReceived = true
        } finally {
            if (generation === runGeneration) controller.value = null
        }
    }

    function cancel(): void {
        if (!controller.value || terminalReceived) return
        status.value = 'cancelling'
        controller.value.abort()
    }

    function reset(): void {
        if (controller.value) controller.value.abort()
        runGeneration += 1
        controller.value = null
        resetRunState()
    }

    function applyEvent(event: AgentEvent): void {
        events.value.push(event)
        requestId.value = event.requestId
        agentRunId.value = event.agentRunId
        currentStep.value = event.step

        switch (event.type) {
            case 'agent_started':
            case 'model_started':
            case 'model_completed':
                status.value = 'running'
                break
            case 'agent_queued':
                status.value = 'queued'
                break
            case 'tool_started':
                status.value = 'using_tool'
                break
            case 'tool_completed':
                status.value = 'running'
                break
            case 'assistant_message':
                answer.value = readString(event.data.content)
                break
            case 'heartbeat':
                lastHeartbeatAt.value = event.timestamp
                break
            case 'agent_completed':
                summary.value = {
                    finishReason: readString(event.data.finishReason, 'unknown'),
                    modelTurns: readNumber(event.data.modelTurns),
                    toolCallCount: readNumber(event.data.toolCallCount),
                    usage: readUsage(event.data.usage),
                }
                status.value = 'completed'
                terminalReceived = true
                break
            case 'agent_failed':
                errorCode.value = readString(event.data.code, 'AGENT_FAILED')
                errorMessage.value = readString(event.data.message, 'Agent 运行失败。')
                status.value = 'failed'
                terminalReceived = true
                break
            case 'agent_cancelled':
                errorCode.value = readString(event.data.code, 'CLIENT_ABORTED')
                errorMessage.value = readString(event.data.message, 'Agent 请求已取消。')
                status.value = 'cancelled'
                terminalReceived = true
                break
        }
    }

    function resetRunState(): void {
        terminalReceived = false
        status.value = 'idle'
        events.value = []
        answer.value = ''
        errorCode.value = ''
        errorMessage.value = ''
        requestId.value = ''
        agentRunId.value = ''
        currentStep.value = 0
        lastHeartbeatAt.value = ''
        summary.value = null
    }

    onBeforeUnmount(cancel)

    return {
        status,
        events,
        answer,
        errorCode,
        errorMessage,
        requestId,
        agentRunId,
        currentStep,
        lastHeartbeatAt,
        summary,
        isRunning,
        run,
        cancel,
        reset,
    }
}

function readString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readUsage(value: unknown): AgentUsage | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const usage = value as Record<string, unknown>
    const inputTokens = readOptionalNumber(usage.inputTokens)
    const outputTokens = readOptionalNumber(usage.outputTokens)
    return inputTokens === undefined && outputTokens === undefined
        ? null
        : { inputTokens, outputTokens }
}

function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
