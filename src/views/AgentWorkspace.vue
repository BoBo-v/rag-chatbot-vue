<template>
  <section class="agent-workspace">
    <header class="agent-toolbar">
      <div class="agent-heading">
        <div class="agent-title-row">
          <h1>排障 Agent 工作台</h1>
          <span class="agent-status" :class="`is-${agent.status.value}`">
            <span class="agent-status-dot" aria-hidden="true"></span>
            {{ statusLabel }}
          </span>
        </div>
      </div>

      <div class="agent-controls">
        <label class="agent-model-field">
          <span class="field-label">模型</span>
          <div class="agent-select-wrapper">
            <select v-model="selectedModelKey" :disabled="providersLoading || agent.isRunning.value || modelOptions.length === 0">
              <option v-if="modelOptions.length === 0" value="">暂无可用模型</option>
              <option v-for="option in modelOptions" :key="option.key" :value="option.key">
                {{ option.providerName }} / {{ option.model }}
              </option>
            </select>
            <ChevronDown class="select-chevron" :size="13" aria-hidden="true" />
          </div>
        </label>

        <label class="agent-model-field">
          <span class="field-label">Profile</span>
          <div class="agent-select-wrapper">
            <select v-model="selectedProfile" :disabled="agent.isRunning.value">
              <option v-for="profile in profileOptions" :key="profile.id" :value="profile.id">
                {{ profile.label }}
              </option>
            </select>
            <ChevronDown class="select-chevron" :size="13" aria-hidden="true" />
          </div>
        </label>

        <label class="agent-key-field">
          <span class="field-label">密钥</span>
          <span class="agent-key-input">
            <KeyRound :size="14" class="key-icon" aria-hidden="true" />
            <input
              ref="accessKeyInput"
              v-model="accessKey"
              :type="showAccessKey ? 'text' : 'password'"
              maxlength="512"
              autocomplete="off"
              placeholder="可选密钥"
            />
            <button
              type="button"
              class="key-toggle-btn"
              :title="showAccessKey ? '隐藏密钥' : '显示密钥'"
              :aria-label="showAccessKey ? '隐藏 Agent 密钥' : '显示 Agent 密钥'"
              @click="showAccessKey = !showAccessKey"
            >
              <EyeOff v-if="showAccessKey" :size="13" aria-hidden="true" />
              <Eye v-else :size="13" aria-hidden="true" />
            </button>
          </span>
        </label>

        <button
          type="button"
          class="agent-icon-button"
          :title="historyCollapsed ? '展开会话记录' : '收起会话记录'"
          :aria-label="historyCollapsed ? '展开会话记录' : '收起会话记录'"
          :aria-expanded="!historyCollapsed"
          @click="historyCollapsed = !historyCollapsed"
        >
          <PanelLeft :size="16" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="agent-icon-button"
          :title="activityCollapsed ? '展开执行过程' : '收起执行过程'"
          :aria-label="activityCollapsed ? '展开执行过程' : '收起执行过程'"
          :aria-expanded="!activityCollapsed"
          @click="activityCollapsed = !activityCollapsed"
        >
          <PanelRight :size="16" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="agent-icon-button"
          title="清空运行记录"
          aria-label="清空运行记录"
          :disabled="agent.isRunning.value || messages.length === 0"
          @click="clearWorkspace"
        >
          <Trash2 :size="16" aria-hidden="true" />
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
        <div ref="messageFeed" class="agent-message-feed" aria-live="polite" @click="handleFeedClick">
          <!-- 空状态引导卡片 -->
          <div v-if="messages.length === 0 && !agent.isRunning.value" class="agent-empty">
            <div class="agent-empty-hero">
              <div class="agent-empty-icon">
                <Bot :size="30" :stroke-width="1.6" aria-hidden="true" />
              </div>
              <h2 class="agent-empty-title">Agent 智能执行工作台</h2>
              <p class="agent-empty-desc">具备自主规划决策、多步工具调用（全网检索、复杂计算、MCP系统）的自动化执行流</p>
            </div>

            <div class="agent-empty-suggestions">
              <button
                v-for="(card, idx) in agentSuggestions"
                :key="idx"
                type="button"
                class="agent-suggestion-card"
                @click="applySuggestion(card.prompt)"
              >
                <div class="suggestion-header">
                  <component :is="card.icon" :size="15" class="suggestion-icon" aria-hidden="true" />
                  <span class="suggestion-title">{{ card.title }}</span>
                </div>
                <p class="suggestion-snippet">{{ card.desc }}</p>
              </button>
            </div>
          </div>

          <article
            v-for="message in messages"
            :key="message.id"
            class="agent-message"
            :class="`is-${message.role}`"
          >
            <div class="agent-message-avatar" aria-hidden="true">
              <Bot v-if="message.role === 'assistant'" :size="16" />
              <UserRound v-else :size="16" />
            </div>
            <div class="agent-message-content">
              <span class="agent-message-role">{{ message.role === 'assistant' ? 'Agent' : '你' }}</span>
              <div
                v-if="message.role === 'assistant'"
                class="markdown-body agent-markdown-bubble"
                v-html="message.renderedContent"
              ></div>
              <p v-else class="agent-user-bubble">{{ message.content }}</p>
              <!-- 消息快捷操作栏（支持复制提问、编辑提问、复制Agent全文） -->
              <div class="agent-msg-actions" :class="{ 'is-user': message.role === 'user' }">
                <template v-if="message.role === 'user'">
                  <button
                    type="button"
                    class="agent-msg-action-btn"
                    data-tooltip="编辑问题"
                    aria-label="编辑问题"
                    @click="handleEditPrompt(message.content)"
                  >
                    <Pencil :size="13" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="agent-msg-action-btn"
                    :class="{ copied: copiedMsgId === message.id }"
                    :data-tooltip="copiedMsgId === message.id ? '已复制' : '复制问题'"
                    :aria-label="copiedMsgId === message.id ? '已复制' : '复制问题'"
                    @click="copyMessageContent(message.id, message.content, 'user')"
                  >
                    <Check v-if="copiedMsgId === message.id" :size="13" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else :size="13" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="agent-msg-action-btn"
                    :class="{ copied: copiedMsgId === message.id }"
                    :data-tooltip="copiedMsgId === message.id ? '已复制' : '复制全文'"
                    :aria-label="copiedMsgId === message.id ? '已复制' : '复制全文'"
                    @click="copyMessageContent(message.id, message.content, 'assistant')"
                  >
                    <Check v-if="copiedMsgId === message.id" :size="13" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else :size="13" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                </template>
              </div>
            </div>
          </article>

          <article v-if="agent.isRunning.value" class="agent-message is-assistant is-live">
            <div class="agent-message-avatar" aria-hidden="true">
              <LoaderCircle :size="16" class="spinning" />
            </div>
            <div class="agent-message-content">
              <span class="agent-message-role">Agent</span>
              <div class="agent-live-bubble">
                <span class="agent-pulse-dot" aria-hidden="true"></span>
                <p>{{ activeStatusText }}</p>
              </div>
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
              ref="promptTextareaRef"
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

          <article v-for="event in activityEvents" :key="event.sequence" class="agent-event" :class="[eventTone(event), `event-kind-${toolMetadata(event)?.kind || 'generic'}`]">
            <span class="agent-event-dot" aria-hidden="true"></span>
            <div class="agent-event-body">
              <div class="agent-event-title">
                <strong>{{ eventTitle(event) }}</strong>
                <time :datetime="event.timestamp">{{ formatEventTime(event.timestamp) }}</time>
              </div>
              <p>{{ eventDetail(event) }}</p>
              <div v-if="toolMetadata(event) || toolResult(event)" class="agent-tool-result">
                <template v-if="toolMetadata(event)?.kind === 'web_search'">
                  <div class="agent-search-results">
                    <a
                      v-for="item in webSearchResults(event)"
                      :key="item.url"
                      class="agent-search-result"
                      :href="item.url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div class="search-result-header">
                        <Globe :size="12" class="search-result-icon" aria-hidden="true" />
                        <span class="search-result-source">{{ item.source }}<template v-if="item.publishedAt"> · {{ item.publishedAt }}</template></span>
                      </div>
                      <strong>{{ item.title }}</strong>
                      <p>{{ item.snippet }}</p>
                    </a>
                  </div>
                </template>
                <template v-else-if="toolMetadata(event)?.kind === 'mcp'">
                  <div class="agent-mcp-result">
                    <strong>{{ readText(toolMetadata(event)?.serverToolName, 'readonly_mcp') }}</strong>
                    <pre v-if="structuredContent(event)">{{ structuredContent(event) }}</pre>
                  </div>
                </template>
                <details v-if="toolResult(event)" class="agent-raw-details">
                  <summary class="agent-raw-summary">查看原始数据</summary>
                  <pre>{{ toolResult(event) }}</pre>
                </details>
              </div>
            </div>
          </article>
        </div>

        <div v-if="agent.requestId.value" class="agent-run-meta">
          <div class="agent-meta-card">
            <span class="meta-label">Request ID</span>
            <span class="meta-val" :title="agent.requestId.value">{{ compactId(agent.requestId.value) }}</span>
          </div>
          <div class="agent-meta-card">
            <span class="meta-label">Run ID</span>
            <span class="meta-val" :title="agent.agentRunId.value">{{ compactId(agent.agentRunId.value) }}</span>
          </div>
          <div v-if="agent.summary.value" class="agent-meta-card">
            <span class="meta-label">调用统计</span>
            <span class="meta-val">{{ agent.summary.value.modelTurns }} 轮次 / {{ agent.summary.value.toolCallCount }} 工具</span>
          </div>
          <div v-if="agent.summary.value?.usage" class="agent-meta-card">
            <span class="meta-label">Token 消耗</span>
            <span class="meta-val">{{ formatUsage(agent.summary.value.usage) }}</span>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Activity,
  Bot,
  Calculator,
  Check,
  ChevronDown,
  CircleStop,
  CircleX,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  TriangleAlert,
  UserRound,
  Wrench,
} from 'lucide-vue-next'
import { useAgentRun } from '../composables/useAgentRun'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
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
  type AgentProfileId,
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
const selectedProfile = ref<AgentProfileId>('tools-v0')
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
const promptTextareaRef = ref<HTMLTextAreaElement | null>(null)
const { show: showToast } = useToast()
const copiedMsgId = ref<string | null>(null)

function copyMessageContent(id: string, text: string, role: 'assistant' | 'user' = 'assistant') {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    copiedMsgId.value = id
    const label = role === 'user' ? '提问内容' : 'Agent 回复全文'
    showToast(`已复制${label}`, 'success', 2000)
    setTimeout(() => {
      if (copiedMsgId.value === id) {
        copiedMsgId.value = null
      }
    }, 2000)
  }).catch(() => {
    showToast('复制失败，请手动选择复制', 'error')
  })
}

function handleEditPrompt(content: string) {
  prompt.value = content
  nextTick(() => {
    promptTextareaRef.value?.focus()
  })
  showToast('已载入问题到输入框', 'success', 2000)
}

function handleFeedClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // 处理代码块复制
  const copyBtn = target.closest('.code-copy-btn') as HTMLElement | null
  if (copyBtn) {
    const code = copyBtn.closest('.code-block-wrapper')?.querySelector('code')?.textContent ?? ''
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.textContent = '已复制 ✓'
      copyBtn.classList.add('copied')
      setTimeout(() => {
        copyBtn.textContent = '复制'
        copyBtn.classList.remove('copied')
      }, 2000)
    })
    return
  }

  // 处理代码块换行切换
  const wrapBtn = target.closest('.code-wrap-btn') as HTMLElement | null
  if (wrapBtn) {
    const wrapper = wrapBtn.closest('.code-block-wrapper')
    const pre = wrapper?.querySelector('pre')
    if (pre) {
      const isWrapped = pre.classList.toggle('wrap-text')
      wrapBtn.textContent = isWrapped ? '滚动' : '换行'
      wrapBtn.title = isWrapped ? '切换回横向滚动' : '切换自动折行'
      wrapBtn.classList.toggle('active', isWrapped)
    }
  }
}

const agentSuggestions = [
  {
    icon: Globe,
    title: '全网前沿技术调研',
    desc: '检索并总结 2025 年主流开源 AI Agent 框架的发展趋势与对比分析',
    prompt: '请帮我全网检索并总结 2025 年主流开源 AI Agent 框架（如 LangGraph, CrewAI, AutoGen 等）的最新发展趋势，并输出优缺点对比表格。',
  },
  {
    icon: Calculator,
    title: '复合多步金融计算',
    desc: '计算本金 10 万元按年化 4.5% 复合增长 15 年的本息总额与关键差值',
    prompt: '请帮我计算：本金 100,000 元，按年化 4.5% 复利增长 15 年，最终本息总额是多少？并分别列出第 5 年、第 10 年和第 15 年的资产总额与收益增量。',
  },
  {
    icon: Clock,
    title: '时间与项目规划',
    desc: '查询当前系统真实时间，规划未来两周的产品迭代里程碑时间表',
    prompt: '请先查询当前的系统实时时间与日期，然后基于当前日期，帮我制定一份接下来为期两周的产品敏捷开发迭代计划与关键里程碑时间表。',
  },
  {
    icon: Wrench,
    title: 'MCP 联动环境检索',
    desc: '结合本地 MCP 工具快速检索只读资源与系统配置概要',
    prompt: '请使用本地可用的只读 MCP 工具，检索当前系统的配置信息与环境变量概要，并给出格式清晰的摘要。',
  },
]

function applySuggestion(text: string) {
  prompt.value = text
}

let providerController: AbortController | null = null

const profileOptions: Array<{ id: AgentProfileId; label: string }> = [
  { id: 'calculator-v0', label: 'calculator-v0 · calculator' },
  { id: 'tools-v0', label: 'tools-v0 · calculator + datetime' },
  { id: 'agent-v1', label: 'agent-v1 · calculator + web_search + readonly_mcp' },
]

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
    agentProfile: selectedProfile.value,
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
  selectedProfile.value = session.agentProfile
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

interface WebSearchResultView {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
  source: string
}

function toolMetadata(event: AgentEvent): Record<string, unknown> | null {
  if (event.type !== 'tool_completed' || !isRecord(event.data.metadata)) return null
  return event.data.metadata
}

function webSearchResults(event: AgentEvent): WebSearchResultView[] {
  const metadata = toolMetadata(event)
  if (!metadata || metadata.kind !== 'web_search' || !Array.isArray(metadata.results)) return []
  const seen = new Set<string>()
  const results: WebSearchResultView[] = []
  for (const value of metadata.results) {
    if (!isRecord(value)) continue
    const url = readHttpUrl(value.url)
    const title = readText(value.title, '')
    if (!url || !title || seen.has(url)) continue
    seen.add(url)
    results.push({
      title,
      url,
      snippet: readText(value.snippet, ''),
      publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : null,
      source: readText(value.source, new URL(url).hostname),
    })
  }
  return results
}

function structuredContent(event: AgentEvent): string {
  const metadata = toolMetadata(event)
  if (!metadata || !isRecord(metadata.structuredContent)) return ''
  return JSON.stringify(metadata.structuredContent, null, 2)
}

function readHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
/* ─── 整体工作区容器 ───────────────────────────── */
.agent-workspace {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: var(--text-primary);
  background: var(--bg-canvas);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.agent-workspace:has(> .agent-notice) {
  grid-template-rows: auto auto minmax(0, 1fr);
}

/* ─── 顶部工具栏（轻量紧凑 56px） ──────────────── */
.agent-toolbar {
  min-width: 0;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(16px);
  z-index: 10;
}

.agent-heading {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.agent-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.agent-title-row h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.agent-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 3px 9px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.agent-status-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-faint);
  transition: all var(--motion-fast) ease;
}

.agent-status.is-running .agent-status-dot,
.agent-status.is-using_tool .agent-status-dot,
.agent-status.is-connecting .agent-status-dot,
.agent-status.is-queued .agent-status-dot,
.agent-status.is-cancelling .agent-status-dot {
  background: var(--warning);
  box-shadow: 0 0 8px var(--warning);
  animation: agent-pulse 1.4s ease-in-out infinite;
}

.agent-status.is-completed .agent-status-dot {
  background: var(--success);
  box-shadow: 0 0 6px var(--success-bg);
}

.agent-status.is-failed .agent-status-dot {
  background: var(--danger);
  box-shadow: 0 0 6px var(--danger-bg);
}

@keyframes agent-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.35); opacity: 0.65; }
}

/* ─── 顶栏控制器 ───────────────────────────────── */
.agent-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-model-field,
.agent-key-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  white-space: nowrap;
}

/* 精致定制 Select 下拉框 */
.agent-select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.agent-select-wrapper select {
  appearance: none;
  -webkit-appearance: none;
  height: 32px;
  padding: 0 26px 0 10px;
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  cursor: pointer;
  outline: none;
  max-width: 200px;
  transition: all var(--motion-fast) ease;
}

.agent-select-wrapper select:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--text-primary);
  background: var(--bg-surface-3);
}

.agent-select-wrapper select:focus {
  border-color: var(--accent-border);
  box-shadow: var(--focus-ring);
}

.select-chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: var(--text-muted);
  transition: transform var(--motion-fast) ease;
}

/* 紧凑 Agent 密钥输入框 */
.agent-key-input {
  position: relative;
  width: 155px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  background: var(--bg-surface-2);
  transition: width var(--motion-base) var(--ease-standard), border-color var(--motion-fast) ease;
}

.agent-key-input:hover {
  border-color: var(--border);
}

.agent-key-input:focus-within {
  width: 210px;
  border-color: var(--accent-border);
  box-shadow: var(--focus-ring);
  background: var(--bg-surface-3);
}

.agent-key-input .key-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.agent-key-input input {
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  padding: 0;
}

.key-toggle-btn {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--motion-fast) ease;
}

.key-toggle-btn:hover {
  color: var(--text-primary);
}

.agent-icon-button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  background: var(--bg-surface-2);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--motion-fast) ease;
}

.agent-icon-button:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
  transform: translateY(-1px);
}

.agent-icon-button[aria-expanded="false"] {
  color: var(--text-muted);
  opacity: 0.7;
}

button:disabled,
select:disabled,
textarea:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* ─── 警告通知栏 ───────────────────────────────── */
.agent-notice {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 18px;
  border-bottom: 1px solid var(--warning-border);
  color: var(--warning);
  background: var(--warning-bg);
  font-size: 12.5px;
}

.agent-notice span {
  flex: 1;
}

.agent-notice button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-xs);
  padding: 3px 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font-size: 11.5px;
  transition: background var(--motion-fast) ease;
}

.agent-notice button:hover {
  background: rgba(251, 191, 36, 0.15);
}

/* ─── 主体三栏布局与双侧栏折叠 ────────────────── */
.agent-main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  overflow: hidden;
  transition: grid-template-columns var(--motion-slow) var(--ease-standard);
}

/* 左侧历史折叠 */
.agent-main.is-history-collapsed {
  grid-template-columns: 0px minmax(0, 1fr) 320px;
}

.agent-main.is-history-collapsed .agent-history {
  display: none !important;
}

/* 右侧过程折叠 */
.agent-main.is-activity-collapsed {
  grid-template-columns: 240px minmax(0, 1fr) 0px;
}

.agent-main.is-activity-collapsed .agent-activity {
  display: none !important;
}

/* 双侧栏同时折叠（宽屏全屏画布） */
.agent-main.is-history-collapsed.is-activity-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.agent-conversation,
.agent-activity,
.agent-history {
  min-width: 0;
  min-height: 0;
}

/* ─── 会话历史侧栏 ─────────────────────────────── */
.agent-history {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
  backdrop-filter: blur(20px);
}

.agent-history-header {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.agent-history-header strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.agent-history-header > button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  cursor: pointer;
  transition: all var(--motion-fast) ease;
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
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px;
  align-items: center;
  margin-bottom: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition: all var(--motion-fast) ease;
}

.agent-history-item:hover {
  border-color: var(--border-subtle);
  background: var(--bg-surface-2);
}

.agent-history-item.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.agent-history-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
}

.agent-history-select {
  display: block;
  padding: 8px 6px 8px 10px;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  min-width: 0;
}

.agent-history-select strong,
.agent-history-select span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history-select strong {
  font-size: 12px;
  font-weight: 550;
  color: var(--text-secondary);
}

.agent-history-item.active .agent-history-select strong {
  color: var(--text-primary);
}

.agent-history-select span {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.agent-history-delete {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--motion-fast) ease, color var(--motion-fast) ease, background var(--motion-fast) ease;
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
  min-height: 140px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--text-faint);
  font-size: 11px;
}

/* ─── 中间对话区域 ─────────────────────────────── */
.agent-conversation {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  background: rgba(7, 7, 15, 0.16);
}

.agent-message-feed {
  min-height: 0;
  overflow-y: auto;
  padding: 24px max(24px, calc((100% - 820px) / 2));
}

/* 空状态与引导卡片 */
.agent-empty {
  min-height: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
}

.agent-empty-hero {
  text-align: center;
  margin-bottom: 22px;
}

.agent-empty-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  color: var(--accent);
  background: var(--accent-bg);
  box-shadow: var(--shadow-accent);
  margin: 0 auto 12px;
}

.agent-empty-title {
  font-size: 18px;
  font-weight: 650;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.agent-empty-desc {
  font-size: 12.5px;
  color: var(--text-muted);
  margin: 0;
  max-width: 480px;
  line-height: 1.5;
}

.agent-empty-suggestions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  max-width: 660px;
}

.agent-suggestion-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 11px 13px;
  text-align: left;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  cursor: pointer;
  transition: border-color var(--motion-fast) ease, background var(--motion-fast) ease, transform var(--motion-fast) ease;
}

.agent-suggestion-card:hover {
  border-color: var(--accent-border);
  background: var(--bg-surface-2);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.suggestion-icon {
  color: var(--accent);
}

.suggestion-snippet {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.45;
  margin: 0;
}

/* 消息行 */
.agent-message {
  max-width: 820px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0 auto 22px;
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
  border: none;
  background: linear-gradient(135deg, var(--accent-deep), var(--accent));
  color: #fff;
  box-shadow: 0 2px 10px var(--bubble-user-shadow);
}

.agent-message-content {
  min-width: 0;
  max-width: min(84%, 720px);
}

.agent-message-role {
  display: block;
  margin: 0 0 4px 2px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
}

.agent-message.is-user .agent-message-role {
  text-align: right;
  margin-right: 2px;
}

/* 用户气泡 */
.agent-user-bubble {
  margin: 0;
  padding: 11px 16px;
  border-radius: 16px 16px 4px 16px;
  color: #fff;
  background: linear-gradient(135deg, var(--accent-deeper), var(--accent-deep));
  box-shadow: 0 4px 18px var(--bubble-user-shadow);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: break-word;
  user-select: text;
}

/* 助手 Markdown 气泡（彻底消除 pre-wrap 强制断行缺陷） */
.agent-markdown-bubble {
  margin: 0;
  padding: 14px 18px;
  border: 1px solid var(--bubble-ai-border, var(--border-subtle));
  border-radius: 16px 16px 16px 4px;
  color: var(--text-primary);
  background: var(--bubble-ai-bg, var(--bg-surface));
  backdrop-filter: blur(14px);
  box-shadow: var(--shadow-sm);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: break-word;
  white-space: normal;
}

/* 消息底部快捷操作栏 */
.agent-msg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 6px;
  padding-right: 2px;
  opacity: 0.65;
  transition: opacity var(--motion-fast) ease;
}

.agent-msg-actions.is-user {
  justify-content: flex-end;
}

.agent-message:hover .agent-msg-actions {
  opacity: 1;
}

.agent-msg-action-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--motion-fast) ease;
}

.agent-msg-action-btn:hover {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: var(--accent-border);
  transform: translateY(-1px);
}

.agent-msg-action-btn.copied {
  color: var(--success);
  background: var(--success-bg);
  border-color: var(--success-border);
}

/* Tooltip 气泡提示 */
.agent-msg-action-btn[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) translateY(3px);
  padding: 4px 8px;
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(14px);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--motion-fast) ease, transform var(--motion-fast) ease, visibility var(--motion-fast);
  z-index: 50;
}

.agent-msg-action-btn[data-tooltip]::before {
  content: '';
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%) translateY(3px);
  border-width: 4px 4px 0 4px;
  border-style: solid;
  border-color: var(--border) transparent transparent transparent;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--motion-fast) ease, transform var(--motion-fast) ease, visibility var(--motion-fast);
  z-index: 51;
}

.agent-msg-action-btn[data-tooltip]:hover::after,
.agent-msg-action-btn[data-tooltip]:hover::before {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

.agent-msg-action-btn.copied[data-tooltip]::after {
  color: var(--success);
  border-color: var(--success-border);
}

/* 运行中骨架脉冲卡片 */
.agent-live-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--accent-border);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: 13px;
}

.agent-live-bubble p {
  margin: 0;
}

.agent-pulse-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: agent-pulse 1.4s ease-in-out infinite;
}

/* 失败/取消卡片 */
.agent-run-message {
  max-width: 820px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 auto 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
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
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid currentColor;
  border-radius: var(--radius-xs);
  padding: 3px 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  transition: all var(--motion-fast) ease;
}

.agent-run-message > button:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* ─── 任务输入框 (Composer) ────────────────────── */
.agent-composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px max(24px, calc((100% - 820px) / 2)) 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(16px);
}

.agent-composer-input {
  position: relative;
  min-width: 0;
  flex: 1;
}

.agent-composer textarea {
  width: 100%;
  min-height: 68px;
  max-height: 180px;
  display: block;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 14px 22px;
  color: var(--text-primary);
  background: var(--bg-input);
  line-height: 1.5;
  font-size: 13.5px;
  outline: none;
  transition: border-color var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.agent-composer textarea:focus {
  border-color: var(--accent-border);
  box-shadow: var(--focus-ring);
}

.agent-char-count {
  position: absolute;
  right: 10px;
  bottom: 6px;
  color: var(--text-faint);
  font-size: 10px;
  font-family: var(--font-mono);
  pointer-events: none;
}

.agent-action-button {
  min-width: 82px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  padding: 0 14px;
  color: #fff;
  background: linear-gradient(135deg, var(--accent-deep), var(--accent));
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
  transition: all var(--motion-fast) ease;
}

.agent-action-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-accent);
  filter: brightness(1.08);
}

.agent-action-button.is-stop {
  border-color: var(--danger-border);
  color: var(--danger);
  background: var(--danger-bg);
}

.agent-action-button.is-stop:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.22);
}

/* ─── 右侧执行过程时间轴 (Activity Panel) ──────── */
.agent-activity {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border-left: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.agent-activity-header {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.agent-activity-header strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.agent-activity-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-step {
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-pill);
  padding: 3px 7px;
  color: var(--accent-text);
  background: var(--accent-bg);
  font-family: var(--font-mono);
  font-size: 10px;
  white-space: nowrap;
}

.agent-activity-toggle {
  width: 28px;
  height: 28px;
  display: none;
  place-items: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
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

.agent-activity-list {
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
}

.agent-activity-empty {
  height: 100%;
  min-height: 140px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 6px;
  color: var(--text-faint);
  font-size: 11.5px;
}

.agent-event {
  position: relative;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 9px;
  padding: 3px 0 16px;
}

.agent-event:not(:last-child)::before {
  position: absolute;
  top: 13px;
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
  transition: all var(--motion-fast) ease;
}

.agent-event.is-active .agent-event-dot {
  background: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-border);
  animation: agent-dot-glow 1.5s infinite;
}

@keyframes agent-dot-glow {
  0%, 100% { box-shadow: 0 0 0 1px var(--accent-border); }
  50% { box-shadow: 0 0 0 4px var(--accent-bg); }
}

.agent-event.is-success .agent-event-dot {
  background: var(--success);
  box-shadow: 0 0 0 1px var(--success-border);
}

.agent-event.is-error .agent-event-dot {
  background: var(--danger);
  box-shadow: 0 0 0 1px var(--danger-border);
}

/* 语义彩色节点 */
.agent-event.event-kind-web_search .agent-event-dot {
  background: var(--cyan-400);
  box-shadow: 0 0 0 1px var(--data-accent-border);
}

.agent-event.event-kind-calculator .agent-event-dot {
  background: var(--amber-400);
  box-shadow: 0 0 0 1px var(--warning-border);
}

.agent-event.event-kind-mcp .agent-event-dot {
  background: var(--violet-400);
  box-shadow: 0 0 0 1px var(--accent-border);
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
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-event-title time {
  flex: 0 0 auto;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.agent-event-body p {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.agent-tool-result {
  min-width: 0;
  margin-top: 6px;
}

/* 精致搜索结果卡片 */
.agent-search-results {
  display: grid;
  gap: 6px;
}

.agent-search-result {
  display: block;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  text-decoration: none;
  transition: all var(--motion-fast) ease;
}

.agent-search-result:hover {
  border-color: var(--data-accent-border);
  background: var(--data-accent-bg);
  transform: translateY(-1px);
}

.search-result-header {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 2px;
}

.search-result-icon {
  color: var(--cyan-400);
  flex-shrink: 0;
}

.search-result-source {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--cyan-400);
}

.agent-search-result strong {
  display: block;
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.35;
}

.agent-search-result p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.agent-mcp-result > strong {
  display: block;
  margin-bottom: 4px;
  color: var(--text-primary);
  font-size: 11px;
}

.agent-mcp-result pre {
  margin: 0;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-subtle);
  background: var(--bg-input);
  font-family: var(--font-mono);
  font-size: 10px;
  max-height: 140px;
  overflow: auto;
}

/* 原始数据折叠 */
.agent-raw-details {
  margin-top: 4px;
}

.agent-raw-summary {
  cursor: pointer;
  font-size: 10.5px;
  color: var(--accent);
  padding: 2px 0;
  user-select: none;
  font-weight: 500;
}

.agent-raw-summary:hover {
  text-decoration: underline;
}

.agent-raw-details pre {
  max-height: 180px;
  margin: 4px 0 0;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  padding: 6px 8px;
  color: var(--text-secondary);
  background: var(--bg-input);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 底部指标卡片条 (2x2 Grid) */
.agent-run-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface-2);
}

.agent-meta-card {
  display: flex;
  flex-direction: column;
  padding: 5px 7px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.meta-label {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.meta-val {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 550;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spinning {
  animation: agent-spin 1s linear infinite;
}

@keyframes agent-spin {
  to { transform: rotate(360deg); }
}

/* ─── 响应式断点 ───────────────────────────────── */
@media (max-width: 1050px) {
  .agent-toolbar {
    flex-wrap: wrap;
    min-height: auto;
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
    box-shadow: 12px 0 28px rgba(0, 0, 0, 0.28);
  }
}

@media (max-width: 820px) {
  .agent-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 32px 32px 32px;
    width: 100%;
  }

  .agent-select-wrapper select,
  .agent-key-input {
    width: 100%;
  }

  .agent-main,
  .agent-main.is-history-collapsed {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(180px, 32vh);
  }

  .agent-main.is-activity-collapsed {
    grid-template-rows: minmax(0, 1fr) 46px;
  }

  .agent-activity {
    border-top: 1px solid var(--border-subtle);
    border-left: 0;
  }

  .agent-activity-header {
    min-height: 46px;
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
    padding: 8px 12px;
  }

  .agent-title-row h1 {
    font-size: 15px;
  }

  .agent-controls {
    grid-template-columns: minmax(0, 1fr) 32px 32px;
  }

  .agent-model-field {
    grid-column: 1 / -1;
  }

  .agent-empty-suggestions {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-message-feed {
    padding: 16px 12px;
  }

  .agent-message-content {
    max-width: calc(100% - 38px);
  }

  .agent-composer {
    padding: 10px 12px 14px;
  }

  .agent-msg-action-btn[data-tooltip]::after,
  .agent-msg-action-btn[data-tooltip]::before {
    display: none !important;
  }
}
</style>
