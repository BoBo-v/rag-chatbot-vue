<template>
  <section class="agent-workspace">
    <header class="agent-toolbar">
      <div class="agent-heading">
        <span class="agent-eyebrow">Agent V0</span>
        <div class="agent-title-row">
          <h1>Agent 工作台</h1>
          <span class="agent-status" :class="`is-${agent.status.value}`">
            <span aria-hidden="true"></span>
            {{ statusLabel }}
          </span>
        </div>
      </div>

      <div class="agent-controls">
        <label class="agent-model-field">
          <span>模型</span>
          <select v-model="selectedModelKey" :disabled="providersLoading || agent.isRunning.value || modelOptions.length === 0">
            <option v-if="modelOptions.length === 0" value="">暂无可用模型</option>
            <option v-for="option in modelOptions" :key="option.key" :value="option.key">
              {{ option.providerName }} / {{ option.model }}
            </option>
          </select>
        </label>

        <label class="agent-key-field">
          <span>Agent 密钥</span>
          <span class="agent-key-input">
            <KeyRound :size="15" aria-hidden="true" />
            <input
              ref="accessKeyInput"
              v-model="accessKey"
              :type="showAccessKey ? 'text' : 'password'"
              maxlength="512"
              autocomplete="off"
              placeholder="loopback 模式可留空"
            />
            <button
              type="button"
              :title="showAccessKey ? '隐藏密钥' : '显示密钥'"
              :aria-label="showAccessKey ? '隐藏 Agent 密钥' : '显示 Agent 密钥'"
              @click="showAccessKey = !showAccessKey"
            >
              <EyeOff v-if="showAccessKey" :size="15" aria-hidden="true" />
              <Eye v-else :size="15" aria-hidden="true" />
            </button>
          </span>
        </label>

        <button
          type="button"
          class="agent-icon-button"
          title="显示或隐藏会话记录"
          aria-label="显示或隐藏会话记录"
          :aria-expanded="!historyCollapsed"
          @click="historyCollapsed = !historyCollapsed"
        >
          <PanelLeft :size="17" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="agent-icon-button"
          title="清空运行记录"
          aria-label="清空运行记录"
          :disabled="agent.isRunning.value || messages.length === 0"
          @click="clearWorkspace"
        >
          <Trash2 :size="17" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="providerError" class="agent-notice" role="status">
      <TriangleAlert :size="17" aria-hidden="true" />
      <span>{{ providerError }}</span>
      <button type="button" :disabled="providersLoading" @click="loadProviders">
        <RefreshCw :size="15" :class="{ spinning: providersLoading }" aria-hidden="true" />
        重试
      </button>
    </div>

    <div
      class="agent-main"
      :class="{
        'is-activity-collapsed': activityCollapsed,
        'is-history-collapsed': historyCollapsed,
      }"
    >
      <aside class="agent-history" aria-label="Agent 会话记录">
        <header class="agent-history-header">
          <div>
            <span class="agent-eyebrow">History</span>
            <strong>会话记录</strong>
          </div>
          <button
            type="button"
            title="新建 Agent 会话"
            aria-label="新建 Agent 会话"
            :disabled="agent.isRunning.value"
            @click="clearWorkspace"
          >
            <Plus :size="17" aria-hidden="true" />
          </button>
        </header>

        <div v-if="historyLoading" class="agent-history-state">
          <LoaderCircle :size="18" class="spinning" aria-hidden="true" />
          <span>加载中</span>
        </div>
        <div v-else-if="historyError" class="agent-history-state is-error" role="status">
          <TriangleAlert :size="18" aria-hidden="true" />
          <span>{{ historyError }}</span>
          <button type="button" @click="restoreAgentHistory">重试</button>
        </div>
        <div v-else-if="sessions.length === 0" class="agent-history-state">
          <MessageSquare :size="20" aria-hidden="true" />
          <span>暂无会话记录</span>
        </div>
        <div v-else class="agent-history-list">
          <article
            v-for="session in sessions"
            :key="session.id"
            class="agent-history-item"
            :class="{ active: activeSessionId === session.id }"
          >
            <button
              type="button"
              class="agent-history-select"
              :disabled="agent.isRunning.value"
              @click="selectAgentSession(session.id)"
            >
              <strong>{{ session.title }}</strong>
              <span>{{ formatAgentSessionMeta(session) }}</span>
            </button>
            <button
              type="button"
              class="agent-history-delete"
              title="删除会话"
              aria-label="删除会话"
              :disabled="agent.isRunning.value"
              @click="removeAgentSession(session)"
            >
              <Trash2 :size="14" aria-hidden="true" />
            </button>
          </article>
        </div>
      </aside>

      <section class="agent-conversation" aria-label="Agent 对话">
        <div ref="messageFeed" class="agent-message-feed" aria-live="polite">
          <div v-if="messages.length === 0 && !agent.isRunning.value" class="agent-empty">
            <Bot :size="28" :stroke-width="1.5" aria-hidden="true" />
            <strong>等待任务</strong>
          </div>

          <article
            v-for="message in messages"
            :key="message.id"
            class="agent-message"
            :class="`is-${message.role}`"
          >
            <div class="agent-message-avatar" aria-hidden="true">
              <Bot v-if="message.role === 'assistant'" :size="17" />
              <UserRound v-else :size="17" />
            </div>
            <div class="agent-message-content">
              <span class="agent-message-role">{{ message.role === 'assistant' ? 'Agent' : '你' }}</span>
              <div
                v-if="message.role === 'assistant'"
                class="markdown-body"
                v-html="message.renderedContent"
              ></div>
              <p v-else>{{ message.content }}</p>
            </div>
          </article>

          <article v-if="agent.isRunning.value" class="agent-message is-assistant is-live">
            <div class="agent-message-avatar" aria-hidden="true">
              <LoaderCircle :size="17" class="spinning" />
            </div>
            <div class="agent-message-content">
              <span class="agent-message-role">Agent</span>
              <p>{{ activeStatusText }}</p>
            </div>
          </article>

          <article v-if="agent.status.value === 'failed'" class="agent-run-message is-error" role="alert">
            <CircleX :size="18" aria-hidden="true" />
            <div>
              <strong>{{ agent.errorCode.value || 'AGENT_FAILED' }}</strong>
              <p>{{ displayErrorMessage }}</p>
            </div>
            <button type="button" :disabled="!canRetry" @click="retryLastTask">
              <RotateCcw :size="15" aria-hidden="true" />
              重新运行
            </button>
          </article>

          <article v-else-if="agent.status.value === 'cancelled'" class="agent-run-message is-cancelled" role="status">
            <CircleStop :size="18" aria-hidden="true" />
            <div>
              <strong>运行已取消</strong>
              <p>{{ displayErrorMessage }}</p>
            </div>
            <button type="button" :disabled="!canRetry" @click="retryLastTask">
              <RotateCcw :size="15" aria-hidden="true" />
              重新运行
            </button>
          </article>
        </div>

        <form class="agent-composer" @submit.prevent="submitTask">
          <div class="agent-composer-input">
            <textarea
              v-model="prompt"
              rows="3"
              maxlength="8000"
              :disabled="agent.isRunning.value"
              placeholder="输入需要 Agent 执行的任务"
              aria-label="Agent 任务"
              @keydown="handlePromptKeydown"
            ></textarea>
            <span class="agent-char-count">{{ prompt.length }}/8000</span>
          </div>
          <button
            v-if="agent.isRunning.value"
            type="button"
            class="agent-action-button is-stop"
            :disabled="agent.status.value === 'cancelling'"
            @click="agent.cancel"
          >
            <CircleStop :size="17" aria-hidden="true" />
            {{ agent.status.value === 'cancelling' ? '停止中' : '停止' }}
          </button>
          <button
            v-else
            type="submit"
            class="agent-action-button"
            :disabled="!canSubmit"
          >
            <Play :size="17" fill="currentColor" aria-hidden="true" />
            运行
          </button>
        </form>
      </section>

      <aside class="agent-activity" :class="{ 'is-collapsed': activityCollapsed }" aria-label="Agent 执行过程">
        <header class="agent-activity-header">
          <div>
            <span class="agent-eyebrow">Execution</span>
            <strong>执行过程</strong>
          </div>
          <div class="agent-activity-actions">
            <span v-if="agent.currentStep.value > 0" class="agent-step">Step {{ agent.currentStep.value }}/3</span>
            <button
              type="button"
              class="agent-activity-toggle"
              title="展开或收起执行过程"
              :aria-expanded="!activityCollapsed"
              aria-label="展开或收起执行过程"
              @click="activityCollapsed = !activityCollapsed"
            >
              <ChevronDown :size="17" :class="{ rotated: !activityCollapsed }" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div class="agent-activity-list">
          <div v-if="activityEvents.length === 0" class="agent-activity-empty">
            <Activity :size="22" :stroke-width="1.5" aria-hidden="true" />
            <span>暂无执行事件</span>
          </div>

          <article v-for="event in activityEvents" :key="event.sequence" class="agent-event" :class="eventTone(event)">
            <span class="agent-event-dot" aria-hidden="true"></span>
            <div class="agent-event-body">
              <div class="agent-event-title">
                <strong>{{ eventTitle(event) }}</strong>
                <time :datetime="event.timestamp">{{ formatEventTime(event.timestamp) }}</time>
              </div>
              <p>{{ eventDetail(event) }}</p>
              <div v-if="toolResult(event)" class="agent-tool-result">
                <span>工具返回结果</span>
                <pre>{{ toolResult(event) }}</pre>
              </div>
            </div>
          </article>
        </div>

        <dl v-if="agent.requestId.value" class="agent-run-meta">
          <div>
            <dt>Request ID</dt>
            <dd :title="agent.requestId.value">{{ compactId(agent.requestId.value) }}</dd>
          </div>
          <div>
            <dt>Agent Run ID</dt>
            <dd :title="agent.agentRunId.value">{{ compactId(agent.agentRunId.value) }}</dd>
          </div>
          <div v-if="agent.summary.value">
            <dt>调用统计</dt>
            <dd>{{ agent.summary.value.modelTurns }} 模型 / {{ agent.summary.value.toolCallCount }} 工具</dd>
          </div>
          <div v-if="agent.summary.value?.usage">
            <dt>Token</dt>
            <dd>{{ formatUsage(agent.summary.value.usage) }}</dd>
          </div>
        </dl>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Activity,
  Bot,
  ChevronDown,
  CircleStop,
  CircleX,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  PanelLeft,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  TriangleAlert,
  UserRound,
} from 'lucide-vue-next'
import { useAgentRun } from '../composables/useAgentRun'
import { useConfirm } from '../composables/useConfirm'
import {
  appendAgentMessage,
  createAgentSession,
  deleteAgentSession,
  listAgentSessions,
  loadAgentSession,
  type AgentSessionListItem,
  type AgentSessionRuntime,
  type AgentStoredMessage,
} from '../services/agentPersistence'
import {
  AgentClientError,
  fetchAgentProviders,
  loadAgentAccessKey,
  saveAgentAccessKey,
  type AgentEvent,
  type AgentProviderId,
  type AgentProviderInfo,
  type AgentRunRequest,
  type AgentUsage,
} from '../services/agent'
import { renderMarkdown } from '../utils/markdown'

interface AgentModelOption {
  key: string
  provider: AgentProviderId
  providerName: string
  model: string
}

interface WorkspaceMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  renderedContent?: string
  createdAt: number
}

const AGENT_CONTEXT_MAX_MESSAGES = 20
const AGENT_CONTEXT_MESSAGE_MAX_CHARS = 8000
const AGENT_CONTEXT_TOTAL_MAX_CHARS = 30_000

const agent = useAgentRun()
const { confirm } = useConfirm()
const providers = ref<AgentProviderInfo[]>([])
const providersLoading = ref(false)
const providerError = ref('')
const selectedModelKey = ref('')
const accessKey = ref(loadAgentAccessKey())
const accessKeyInput = ref<HTMLInputElement | null>(null)
const showAccessKey = ref(false)
const activityCollapsed = ref(false)
const historyCollapsed = ref(false)
const prompt = ref('')
const messages = ref<WorkspaceMessage[]>([])
const sessions = ref<AgentSessionListItem[]>([])
const activeSessionId = ref<string | null>(null)
const historyLoading = ref(false)
const historyError = ref('')
const messageFeed = ref<HTMLElement | null>(null)
const lastRequest = ref<AgentRunRequest | null>(null)
const pendingModelKey = ref('')
let providerController: AbortController | null = null

const modelOptions = computed<AgentModelOption[]>(() => providers.value.flatMap(provider =>
  provider.agentModels.map(model => ({
    key: `${provider.id}:${model}`,
    provider: provider.id as AgentProviderId,
    providerName: provider.name,
    model,
  })),
))

const selectedModel = computed(() => modelOptions.value.find(option => option.key === selectedModelKey.value) ?? null)
const canSubmit = computed(() => Boolean(
  prompt.value.trim()
  && selectedModel.value
  && !providersLoading.value
  && !historyLoading.value
))
const canRetry = computed(() => Boolean(lastRequest.value && !agent.isRunning.value))
const activityEvents = computed(() => agent.events.value.filter(event => event.type !== 'heartbeat'))
const displayErrorMessage = computed(() => describeAgentError(agent.errorCode.value, agent.errorMessage.value))

const statusLabel = computed(() => ({
  idle: '就绪',
  connecting: '连接中',
  queued: '排队中',
  running: '运行中',
  using_tool: '执行工具',
  cancelling: '停止中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}[agent.status.value]))

const activeStatusText = computed(() => {
  switch (agent.status.value) {
    case 'connecting': return '正在建立 Agent 事件连接...'
    case 'queued': return '模型资源繁忙，任务正在队列中等待...'
    case 'running': return `模型正在处理第 ${Math.max(agent.currentStep.value, 1)} 步...`
    case 'using_tool': return '正在执行已批准的后端工具...'
    case 'cancelling': return '正在终止模型和工具调用...'
    default: return 'Agent 正在运行...'
  }
})

watch(accessKey, saveAgentAccessKey)
watch(modelOptions, options => {
  if (pendingModelKey.value && options.some(option => option.key === pendingModelKey.value)) {
    selectedModelKey.value = pendingModelKey.value
    pendingModelKey.value = ''
    return
  }
  if (!options.some(option => option.key === selectedModelKey.value)) {
    selectedModelKey.value = options[0]?.key ?? ''
  }
}, { immediate: true })
watch(() => [agent.events.value.length, messages.value.length], scrollToLatest)

onMounted(() => {
  activityCollapsed.value = window.matchMedia('(max-width: 820px)').matches
  historyCollapsed.value = window.matchMedia('(max-width: 1180px)').matches
  void loadProviders()
  void restoreAgentHistory()
})
onBeforeUnmount(() => providerController?.abort())

async function loadProviders(): Promise<void> {
  providerController?.abort()
  const activeController = new AbortController()
  providerController = activeController
  providersLoading.value = true
  providerError.value = ''
  try {
    providers.value = await fetchAgentProviders(activeController.signal)
    if (providers.value.length === 0) providerError.value = '后端尚未开放支持工具调用的 Agent 模型。'
  } catch (error) {
    if (activeController.signal.aborted) return
    providers.value = []
    providerError.value = error instanceof AgentClientError ? error.message : '无法读取 Agent 模型列表。'
  } finally {
    if (providerController === activeController) providersLoading.value = false
  }
}

async function submitTask(): Promise<void> {
  const task = prompt.value.trim()
  const runtime = selectedModel.value
  if (!task || !runtime || agent.isRunning.value) return

  const request: AgentRunRequest = {
    agentProfile: 'tools-v0',
    provider: runtime.provider,
    model: runtime.model,
    agentTurnId: crypto.randomUUID(),
    messages: buildAgentContextMessages(task),
  }
  lastRequest.value = request
  const userMessage: WorkspaceMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: task,
    createdAt: Date.now(),
  }
  messages.value.push(userMessage)
  prompt.value = ''
  await persistAgentUserMessage(request, userMessage)
  const requestWithSession: AgentRunRequest = {
    ...request,
    ...(activeSessionId.value ? { agentSessionId: activeSessionId.value } : {}),
  }
  lastRequest.value = requestWithSession
  await executeRequest(requestWithSession)
}

function buildAgentContextMessages(task: string): AgentRunRequest['messages'] {
  const candidates: AgentRunRequest['messages'] = [
    ...messages.value.map(message => ({
      role: message.role,
      content: truncateAgentContextContent(message.content),
    })),
    { role: 'user', content: task },
  ]
  const selected: AgentRunRequest['messages'] = []
  let totalChars = 0

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index]
    if (!message || selected.length >= AGENT_CONTEXT_MAX_MESSAGES) break
    if (totalChars + message.content.length > AGENT_CONTEXT_TOTAL_MAX_CHARS) break
    selected.unshift(message)
    totalChars += message.content.length
  }

  if (selected.length > 1 && selected[0]?.role === 'assistant') selected.shift()
  return selected
}

function truncateAgentContextContent(content: string): string {
  if (content.length <= AGENT_CONTEXT_MESSAGE_MAX_CHARS) return content

  const marker = '\n\n[中间内容已截断]\n\n'
  const retainedChars = AGENT_CONTEXT_MESSAGE_MAX_CHARS - marker.length
  const headChars = Math.ceil(retainedChars / 2)
  return `${content.slice(0, headChars)}${marker}${content.slice(-Math.floor(retainedChars / 2))}`
}

async function retryLastTask(): Promise<void> {
  if (!lastRequest.value || agent.isRunning.value) return
  await executeRequest(lastRequest.value)
}

async function executeRequest(request: AgentRunRequest): Promise<void> {
  await agent.run(request, accessKey.value)

  if (agent.status.value === 'completed' && agent.answer.value.trim()) {
    const assistantMessage: WorkspaceMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: agent.answer.value,
      renderedContent: renderMarkdown(agent.answer.value),
      createdAt: Date.now(),
    }
    messages.value.push(assistantMessage)
    await persistAgentAssistantMessage(request, assistantMessage)
  } else if (agent.errorCode.value === 'AGENT_UNAUTHORIZED') {
    showAccessKey.value = true
    await nextTick()
    accessKeyInput.value?.focus()
  }
}

function clearWorkspace(): void {
  if (agent.isRunning.value) return
  activeSessionId.value = null
  messages.value = []
  lastRequest.value = null
  prompt.value = ''
  agent.reset()
}

async function restoreAgentHistory(): Promise<void> {
  historyLoading.value = true
  historyError.value = ''
  try {
    sessions.value = await listAgentSessions()
    const latestSession = sessions.value[0]
    if (latestSession) await openAgentSession(latestSession.id)
  } catch (error) {
    historyError.value = '无法读取本地会话记录'
    console.warn('[agent] 读取会话记录失败', error)
  } finally {
    historyLoading.value = false
  }
}

async function selectAgentSession(sessionId: string): Promise<void> {
  if (agent.isRunning.value || sessionId === activeSessionId.value) return
  historyLoading.value = true
  historyError.value = ''
  try {
    await openAgentSession(sessionId)
  } catch (error) {
    historyError.value = '无法加载所选会话'
    console.warn('[agent] 加载会话失败', error)
  } finally {
    historyLoading.value = false
  }
}

async function openAgentSession(sessionId: string): Promise<void> {
  const session = await loadAgentSession(sessionId)
  if (!session) {
    await refreshAgentSessionList()
    return
  }

  activeSessionId.value = session.id
  messages.value = session.messages.map(message => ({
    ...message,
    renderedContent: message.role === 'assistant' ? renderMarkdown(message.content) : undefined,
  }))
  lastRequest.value = null
  prompt.value = ''
  agent.reset()
  applyAgentSessionRuntime(session)
  if (window.matchMedia('(max-width: 1050px)').matches) historyCollapsed.value = true
  scrollToLatest()
}

async function removeAgentSession(session: AgentSessionListItem): Promise<void> {
  if (agent.isRunning.value) return
  const confirmed = await confirm({
    title: '删除 Agent 会话',
    message: `确定删除“${session.title}”吗？删除后无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!confirmed) return

  try {
    await deleteAgentSession(session.id)
    const deletingActiveSession = activeSessionId.value === session.id
    await refreshAgentSessionList()
    if (deletingActiveSession) {
      clearWorkspace()
      const nextSession = sessions.value[0]
      if (nextSession) await openAgentSession(nextSession.id)
    }
  } catch (error) {
    historyError.value = '删除本地会话失败'
    console.warn('[agent] 删除会话失败', error)
  }
}

async function persistAgentUserMessage(
  request: AgentRunRequest,
  message: WorkspaceMessage
): Promise<void> {
  const runtime = toAgentSessionRuntime(request)
  try {
    if (activeSessionId.value) {
      await appendAgentMessage(activeSessionId.value, runtime, toAgentStoredMessage(message))
    } else {
      const session = await createAgentSession(runtime, toAgentStoredMessage(message))
      activeSessionId.value = session.id
    }
    await refreshAgentSessionList()
  } catch (error) {
    historyError.value = '本地会话保存失败'
    console.warn('[agent] 保存用户消息失败', error)
  }
}

async function persistAgentAssistantMessage(
  request: AgentRunRequest,
  message: WorkspaceMessage
): Promise<void> {
  if (!activeSessionId.value) return
  try {
    await appendAgentMessage(
      activeSessionId.value,
      toAgentSessionRuntime(request),
      toAgentStoredMessage(message)
    )
    await refreshAgentSessionList()
  } catch (error) {
    historyError.value = 'Agent 回答保存失败'
    console.warn('[agent] 保存回答失败', error)
  }
}

async function refreshAgentSessionList(): Promise<void> {
  sessions.value = await listAgentSessions()
  historyError.value = ''
}

function applyAgentSessionRuntime(session: AgentSessionListItem): void {
  const modelKey = `${session.provider}:${session.model}`
  if (modelOptions.value.some(option => option.key === modelKey)) {
    selectedModelKey.value = modelKey
    pendingModelKey.value = ''
  } else {
    pendingModelKey.value = modelKey
  }
}

function toAgentSessionRuntime(request: AgentRunRequest): AgentSessionRuntime {
  return {
    agentProfile: request.agentProfile,
    provider: request.provider,
    model: request.model,
  }
}

function toAgentStoredMessage(message: WorkspaceMessage): AgentStoredMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }
}

function formatAgentSessionMeta(session: AgentSessionListItem): string {
  const updatedAt = new Date(session.updatedAt).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${updatedAt} · ${session.messageCount} 条消息`
}

function handlePromptKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void submitTask()
}

function scrollToLatest(): void {
  void nextTick(() => {
    if (messageFeed.value) messageFeed.value.scrollTop = messageFeed.value.scrollHeight
  })
}

function eventTitle(event: AgentEvent): string {
  switch (event.type) {
    case 'agent_started': return 'Agent 已启动'
    case 'agent_queued': return '等待模型资源'
    case 'model_started': return `模型调用 #${event.step}`
    case 'model_completed': return `模型调用 #${event.step} 完成`
    case 'tool_started': return `执行工具 ${readText(event.data.name, 'unknown')}`
    case 'tool_completed': return `工具 ${readText(event.data.name, 'unknown')} 已结束`
    case 'assistant_message': return '最终答复已生成'
    case 'agent_completed': return 'Agent 运行完成'
    case 'agent_failed': return 'Agent 运行失败'
    case 'agent_cancelled': return 'Agent 运行取消'
    case 'heartbeat': return '连接保持中'
  }
}

function eventDetail(event: AgentEvent): string {
  switch (event.type) {
    case 'agent_started': return `${readText(event.data.provider)} / ${readText(event.data.model)}`
    case 'agent_queued': return `当前队列位置 ${readNumber(event.data.position)}`
    case 'model_started': return `请求模型 ${readText(event.data.model)}`
    case 'model_completed': {
      const toolCalls = readNumber(event.data.toolCallCount)
      return toolCalls > 0 ? `模型请求 ${toolCalls} 次工具调用` : `结束原因 ${readText(event.data.finishReason, 'unknown')}`
    }
    case 'tool_started': return `第 ${readNumber(event.data.ordinal)} 次工具调用`
    case 'tool_completed': return `${event.data.isError === true ? '执行失败' : '执行成功'} · ${readNumber(event.data.durationMs)} ms`
    case 'assistant_message': return `第 ${event.step} 步生成答复`
    case 'agent_completed': return `${readNumber(event.data.modelTurns)} 次模型调用 · ${readNumber(event.data.toolCallCount)} 次工具调用`
    case 'agent_failed': return readText(event.data.message, 'Agent 运行失败。')
    case 'agent_cancelled': return readText(event.data.message, 'Agent 运行已取消。')
    case 'heartbeat': return '事件连接正常'
  }
}

function eventTone(event: AgentEvent): string {
  if (event.type === 'agent_failed' || (event.type === 'tool_completed' && event.data.isError === true)) return 'is-error'
  if (event.type === 'agent_completed' || event.type === 'assistant_message' || event.type === 'tool_completed') return 'is-success'
  if (event.type === 'agent_cancelled') return 'is-muted'
  return 'is-active'
}

function toolResult(event: AgentEvent): string {
  return event.type === 'tool_completed' ? readText(event.data.result, '') : ''
}

function formatEventTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function compactId(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`
}

function formatUsage(usage: AgentUsage): string {
  return `${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out`
}

function readText(value: unknown, fallback = '-'): string {
  return typeof value === 'string' && value ? value : fallback
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function describeAgentError(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    AGENT_UNAUTHORIZED: 'Agent 密钥不正确或尚未配置。',
    AGENT_LOOPBACK_REQUIRED: '当前 Agent 只允许从后端所在主机访问。',
    AGENT_QUEUE_FULL: '模型等待队列已满，请稍后重新运行。',
    AGENT_QUEUE_TIMEOUT: '等待模型执行超时，请稍后重新运行。',
    AGENT_TIMEOUT: 'Agent 整次运行超时，模型和工具调用已停止。',
    MODEL_TIMEOUT: '模型调用超时，请检查 Ollama 运行状态后重试。',
    TOOL_TIMEOUT: '工具执行超时，本次 Agent 运行已停止。',
    MODEL_PROVIDER_FAILED: '模型服务调用失败，请检查 Ollama 服务和模型状态。',
    MODEL_RESPONSE_INVALID: '模型返回的工具调用格式不符合 Agent 协议。',
    TOOL_ARGUMENTS_INVALID: '模型生成的工具参数未通过后端校验。',
    TOOL_EXECUTION_FAILED: '后端工具执行失败，本次运行已停止。',
    AGENT_LIMIT_EXCEEDED: '本次运行已达到模型或工具调用上限。',
    AGENT_STREAM_INCOMPLETE: 'Agent 连接在返回最终状态前已断开。',
    AGENT_PROTOCOL_ERROR: 'Agent 事件流不符合前端协议校验。',
    AGENT_PROTOCOL_VERSION_UNSUPPORTED: '前后端 Agent 事件协议版本不兼容。',
    AGENT_NETWORK_ERROR: '无法连接 Agent 接口，请检查后端服务。',
    NOT_FOUND: 'Agent 接口尚未开放，请检查后端 AGENT_ENABLED 和访问模式。',
    CLIENT_ABORTED: '本次运行已停止，可以重新运行同一任务。',
  }
  return messages[code] ?? (fallback || 'Agent 运行失败。')
}
</script>

<style scoped>
.agent-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: var(--text-primary);
  background: var(--bg-canvas);
}

.agent-workspace:has(> .agent-notice) {
  grid-template-rows: auto auto minmax(0, 1fr);
}

.agent-toolbar {
  min-width: 0;
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(14px);
}

.agent-heading,
.agent-controls,
.agent-model-field,
.agent-key-field {
  min-width: 0;
}

.agent-eyebrow,
.agent-model-field > span,
.agent-key-field > span:first-child {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.2;
  text-transform: uppercase;
}

.agent-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.agent-title-row h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.agent-status {
  min-width: 72px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 4px 8px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.agent-status > span {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-faint);
}

.agent-status.is-running > span,
.agent-status.is-using_tool > span,
.agent-status.is-connecting > span,
.agent-status.is-queued > span,
.agent-status.is-cancelling > span {
  background: var(--warning);
  box-shadow: 0 0 8px var(--warning);
}

.agent-status.is-completed > span {
  background: var(--success);
}

.agent-status.is-failed > span {
  background: var(--danger);
}

.agent-controls {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 10px;
}

.agent-model-field select,
.agent-key-input {
  height: 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
}

.agent-model-field select {
  width: 230px;
  padding: 0 30px 0 10px;
  font-size: 13px;
}

.agent-key-input {
  width: 250px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding-left: 10px;
  color: var(--text-muted);
}

.agent-key-input:focus-within,
.agent-model-field select:focus {
  border-color: var(--accent-border);
  box-shadow: var(--focus-ring);
  outline: none;
}

.agent-key-input input {
  min-width: 0;
  height: 100%;
  flex: 1;
  border: 0;
  padding: 0;
  background: transparent;
  outline: none;
  font-size: 13px;
}

.agent-key-input button,
.agent-icon-button {
  width: 36px;
  height: 36px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.agent-key-input button:hover,
.agent-icon-button:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-surface-2);
}

.agent-icon-button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  background: var(--bg-input);
}

button:disabled,
select:disabled,
textarea:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.agent-notice {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--warning-border);
  color: var(--warning);
  background: var(--warning-bg);
  font-size: 13px;
}

.agent-notice span {
  min-width: 0;
  flex: 1;
}

.agent-notice button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-sm);
  padding: 5px 9px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.agent-history {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
}

.agent-history-header {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.agent-history-header strong {
  font-size: 14px;
}

.agent-history-header > button {
  width: 32px;
  height: 32px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  cursor: pointer;
}

.agent-history-header > button:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.agent-history-list {
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.agent-history-item {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  align-items: center;
  margin-bottom: 3px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.agent-history-item:hover {
  border-color: var(--border-subtle);
  background: var(--bg-surface-2);
}

.agent-history-item.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.agent-history-select,
.agent-history-delete {
  min-width: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.agent-history-select {
  display: block;
  padding: 9px 7px 9px 9px;
  text-align: left;
}

.agent-history-select strong,
.agent-history-select span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history-select strong {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.agent-history-item.active .agent-history-select strong {
  color: var(--text-primary);
}

.agent-history-select span {
  margin-top: 4px;
  color: var(--text-faint);
  font-size: 9px;
}

.agent-history-delete {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--text-faint);
  opacity: 0;
}

.agent-history-item:hover .agent-history-delete,
.agent-history-item.active .agent-history-delete,
.agent-history-delete:focus-visible {
  opacity: 1;
}

.agent-history-delete:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-bg);
}

.agent-history-state {
  min-height: 160px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  padding: 18px;
  color: var(--text-faint);
  font-size: 11px;
  text-align: center;
}

.agent-history-state.is-error {
  color: var(--danger);
}

.agent-history-state > button {
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.agent-main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(210px, 240px) minmax(0, 1fr) minmax(290px, 340px);
}

.agent-main.is-history-collapsed {
  grid-template-columns: minmax(0, 1fr) minmax(290px, 340px);
}

.agent-main.is-history-collapsed .agent-history {
  display: none;
}

.agent-conversation,
.agent-activity {
  min-width: 0;
  min-height: 0;
}

.agent-conversation {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.agent-message-feed {
  min-height: 0;
  overflow-y: auto;
  padding: 28px max(24px, calc((100% - 820px) / 2));
}

.agent-empty {
  height: 100%;
  min-height: 180px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: var(--text-muted);
}

.agent-empty strong {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.agent-message {
  max-width: 820px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 auto 24px;
}

.agent-message.is-user {
  flex-direction: row-reverse;
}

.agent-message-avatar {
  width: 32px;
  height: 32px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.agent-message.is-user .agent-message-avatar {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.agent-message-content {
  min-width: 0;
  max-width: min(76%, 700px);
}

.agent-message-role {
  display: block;
  margin: 0 0 5px;
  color: var(--text-muted);
  font-size: 11px;
}

.agent-message.is-user .agent-message-role {
  text-align: right;
}

.agent-message-content > p,
.agent-message-content > .markdown-body {
  overflow-wrap: anywhere;
  margin: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  color: var(--text-primary);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.agent-message.is-user .agent-message-content > p {
  border-color: var(--accent-border);
  color: var(--text-primary);
  background: var(--accent-bg);
}

.agent-message.is-live .agent-message-content > p {
  color: var(--text-secondary);
}

.agent-run-message {
  max-width: 820px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 auto 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  color: var(--text-secondary);
  background: var(--bg-surface);
}

.agent-run-message.is-error {
  border-color: var(--danger-border);
  color: var(--danger);
  background: var(--danger-bg);
}

.agent-run-message.is-cancelled {
  border-color: var(--warning-border);
  color: var(--warning);
  background: var(--warning-bg);
}

.agent-run-message strong,
.agent-run-message p {
  margin: 0;
}

.agent-run-message p {
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 13px;
}

.agent-run-message > div {
  min-width: 0;
  flex: 1;
}

.agent-run-message > button {
  min-height: 30px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  padding: 4px 9px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
}

.agent-composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 14px max(24px, calc((100% - 820px) / 2)) 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
}

.agent-composer-input {
  position: relative;
  min-width: 0;
  flex: 1;
}

.agent-composer textarea {
  width: 100%;
  min-height: 72px;
  max-height: 180px;
  display: block;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 11px 14px 24px;
  color: var(--text-primary);
  background: var(--bg-input);
  line-height: 1.5;
  outline: none;
}

.agent-composer textarea:focus {
  border-color: var(--accent-border);
  box-shadow: var(--focus-ring);
}

.agent-char-count {
  position: absolute;
  right: 10px;
  bottom: 7px;
  color: var(--text-faint);
  font-size: 10px;
  pointer-events: none;
}

.agent-action-button {
  min-width: 92px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  padding: 0 15px;
  color: #fff;
  background: var(--accent-deep);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.agent-action-button:hover:not(:disabled) {
  background: var(--accent-deeper);
}

.agent-action-button.is-stop {
  border-color: var(--danger-border);
  color: var(--danger);
  background: var(--danger-bg);
}

.agent-activity {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border-left: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.agent-activity-header {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.agent-activity-header strong {
  font-size: 14px;
}

.agent-activity-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.agent-activity-toggle {
  width: 32px;
  height: 32px;
  display: none;
  place-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--bg-surface-2);
  cursor: pointer;
}

.agent-activity-toggle svg {
  transition: transform var(--motion-fast) ease;
}

.agent-activity-toggle svg.rotated {
  transform: rotate(180deg);
}

.agent-step {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 4px 8px;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  font-family: var(--font-mono);
  font-size: 10px;
  white-space: nowrap;
}

.agent-activity-list {
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
}

.agent-activity-empty {
  height: 100%;
  min-height: 160px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--text-faint);
  font-size: 12px;
}

.agent-event {
  position: relative;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 9px;
  padding: 4px 0 18px;
}

.agent-event:not(:last-child)::before {
  position: absolute;
  top: 14px;
  bottom: -2px;
  left: 5px;
  width: 1px;
  background: var(--border-subtle);
  content: '';
}

.agent-event-dot {
  position: relative;
  z-index: 1;
  width: 11px;
  height: 11px;
  margin-top: 3px;
  border: 2px solid var(--bg-surface);
  border-radius: 50%;
  background: var(--text-faint);
  box-shadow: 0 0 0 1px var(--border);
}

.agent-event.is-active .agent-event-dot {
  background: var(--data-accent);
  box-shadow: 0 0 0 1px var(--data-accent-border);
}

.agent-event.is-success .agent-event-dot {
  background: var(--success);
  box-shadow: 0 0 0 1px var(--success-border);
}

.agent-event.is-error .agent-event-dot {
  background: var(--danger);
  box-shadow: 0 0 0 1px var(--danger-border);
}

.agent-event-body {
  min-width: 0;
}

.agent-event-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.agent-event-title strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-event-title time {
  flex: 0 0 auto;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9px;
}

.agent-event-body p {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.agent-tool-result {
  min-width: 0;
  margin-top: 8px;
}

.agent-tool-result > span {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}

.agent-tool-result pre {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px;
  color: var(--text-secondary);
  background: var(--bg-input);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.agent-run-meta {
  margin: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface-2);
}

.agent-run-meta > div {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;
}

.agent-run-meta dt,
.agent-run-meta dd {
  margin: 0;
  font-size: 10px;
}

.agent-run-meta dt {
  color: var(--text-muted);
}

.agent-run-meta dd {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spinning {
  animation: agent-spin 1s linear infinite;
}

@keyframes agent-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1050px) {
  .agent-toolbar {
    align-items: flex-start;
  }

  .agent-controls {
    flex-wrap: wrap;
  }

  .agent-model-field select,
  .agent-key-input {
    width: 210px;
  }

  .agent-main {
    position: relative;
    grid-template-columns: minmax(0, 1fr) 290px;
  }

  .agent-history {
    position: absolute;
    z-index: var(--z-navigation);
    top: 0;
    bottom: 0;
    left: 0;
    width: min(280px, calc(100% - 48px));
    box-shadow: 12px 0 28px rgba(0, 0, 0, 0.18);
  }
}

@media (max-width: 820px) {
  .agent-toolbar {
    display: grid;
    gap: 12px;
  }

  .agent-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 38px 38px;
  }

  .agent-model-field select,
  .agent-key-input {
    width: 100%;
  }

  .agent-main,
  .agent-main.is-history-collapsed {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(180px, 32vh);
  }

  .agent-main.is-activity-collapsed {
    grid-template-rows: minmax(0, 1fr) 55px;
  }

  .agent-activity {
    border-top: 1px solid var(--border-subtle);
    border-left: 0;
  }

  .agent-activity-header {
    min-height: 54px;
  }

  .agent-activity-toggle {
    display: grid;
  }

  .agent-activity.is-collapsed {
    grid-template-rows: auto;
  }

  .agent-activity.is-collapsed .agent-activity-list,
  .agent-activity.is-collapsed .agent-run-meta {
    display: none;
  }
}

@media (max-width: 560px) {
  .agent-toolbar {
    padding: 10px 12px;
  }

  .agent-title-row h1 {
    font-size: 17px;
  }

  .agent-controls {
    grid-template-columns: minmax(0, 1fr) 38px 38px;
  }

  .agent-model-field {
    grid-column: 1 / -1;
  }

  .agent-key-field {
    min-width: 0;
  }

  .agent-notice {
    padding-inline: 12px;
  }

  .agent-main {
    grid-template-rows: minmax(0, 1fr) minmax(160px, 28vh);
  }

  .agent-message-feed {
    padding: 18px 12px;
  }

  .agent-message-content {
    max-width: calc(100% - 42px);
  }

  .agent-composer {
    padding: 10px 12px 12px;
  }

  .agent-composer textarea {
    min-height: 64px;
  }

  .agent-action-button {
    min-width: 44px;
    width: 44px;
    padding: 0;
    font-size: 0;
  }

  .agent-activity-header,
  .agent-activity-list,
  .agent-run-meta {
    padding-inline: 12px;
  }
}
</style>
