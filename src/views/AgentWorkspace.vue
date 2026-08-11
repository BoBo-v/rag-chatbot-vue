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

    <div class="agent-main">
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
              <p>{{ agent.errorMessage.value }}</p>
            </div>
          </article>

          <article v-else-if="agent.status.value === 'cancelled'" class="agent-run-message is-cancelled" role="status">
            <CircleStop :size="18" aria-hidden="true" />
            <div>
              <strong>运行已取消</strong>
              <p>{{ agent.errorMessage.value || '本次运行已停止，可以重新提交任务。' }}</p>
            </div>
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

      <aside class="agent-activity" aria-label="Agent 执行过程">
        <header class="agent-activity-header">
          <div>
            <span class="agent-eyebrow">Execution</span>
            <strong>执行过程</strong>
          </div>
          <span v-if="agent.currentStep.value > 0" class="agent-step">Step {{ agent.currentStep.value }}/3</span>
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
  CircleStop,
  CircleX,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
  UserRound,
} from 'lucide-vue-next'
import { useAgentRun } from '../composables/useAgentRun'
import {
  AgentClientError,
  fetchAgentProviders,
  loadAgentAccessKey,
  saveAgentAccessKey,
  type AgentEvent,
  type AgentProviderId,
  type AgentProviderInfo,
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
  id: number
  role: 'user' | 'assistant'
  content: string
  renderedContent?: string
}

const agent = useAgentRun()
const providers = ref<AgentProviderInfo[]>([])
const providersLoading = ref(false)
const providerError = ref('')
const selectedModelKey = ref('')
const accessKey = ref(loadAgentAccessKey())
const showAccessKey = ref(false)
const prompt = ref('')
const messages = ref<WorkspaceMessage[]>([])
const messageFeed = ref<HTMLElement | null>(null)
let nextMessageId = 1
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
const canSubmit = computed(() => Boolean(prompt.value.trim() && selectedModel.value && !providersLoading.value))
const activityEvents = computed(() => agent.events.value.filter(event => event.type !== 'heartbeat'))

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
  if (!options.some(option => option.key === selectedModelKey.value)) {
    selectedModelKey.value = options[0]?.key ?? ''
  }
}, { immediate: true })
watch(() => [agent.events.value.length, messages.value.length], scrollToLatest)

onMounted(loadProviders)
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

  messages.value.push({ id: nextMessageId++, role: 'user', content: task })
  prompt.value = ''
  await agent.run({
    agentProfile: 'calculator-v0',
    provider: runtime.provider,
    model: runtime.model,
    messages: [{ role: 'user', content: task }],
  }, accessKey.value)

  if (agent.status.value === 'completed' && agent.answer.value.trim()) {
    messages.value.push({
      id: nextMessageId++,
      role: 'assistant',
      content: agent.answer.value,
      renderedContent: renderMarkdown(agent.answer.value),
    })
  }
}

function clearWorkspace(): void {
  messages.value = []
  agent.reset()
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
</script>

<style scoped>
.agent-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  color: var(--text-primary);
  background: var(--bg-canvas);
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

.agent-main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(290px, 340px);
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
    grid-template-columns: minmax(0, 1fr) 290px;
  }
}

@media (max-width: 820px) {
  .agent-toolbar {
    display: grid;
    gap: 12px;
  }

  .agent-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 38px;
  }

  .agent-model-field select,
  .agent-key-input {
    width: 100%;
  }

  .agent-main {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(180px, 32vh);
  }

  .agent-activity {
    border-top: 1px solid var(--border-subtle);
    border-left: 0;
  }

  .agent-activity-header {
    min-height: 54px;
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
    grid-template-columns: minmax(0, 1fr) 38px;
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
