<template>
  <div class="compare-shell">
    <header class="compare-header">
      <div class="compare-title">
        <img class="logo-dot" src="/favicon.svg" alt="AI Chat" />
        <div>
          <h1>多模型对比</h1>
          <p>{{ headerHint }}</p>
        </div>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="compare-secondary"
          :class="{ active: historySidebarOpen }"
          @click="toggleHistorySidebar"
        >
          <History :size="15" aria-hidden="true" />
          对比历史
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="isRunning"
          @click="newComparison"
        >
          <Plus :size="15" aria-hidden="true" />
          新对比
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="!currentSession"
          @click="exportMarkdown"
        >
          <FileDown :size="15" aria-hidden="true" />
          导出 MD
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="!currentSession"
          @click="exportJson"
        >
          <Braces :size="15" aria-hidden="true" />
          导出 JSON
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="!isRunning"
          @click="stopAll"
        >
          <Square :size="13" :fill="'currentColor'" aria-hidden="true" />
          停止全部
        </button>
      </div>
    </header>

    <main class="compare-main" :class="{ 'history-collapsed': !historySidebarOpen }">
      <aside v-if="historySidebarOpen" class="comparison-sidebar">
        <CompareHistoryView
          :history="history"
          :active-session-id="currentSession?.id"
          :create-disabled="isRunning"
          @new-comparison="newComparison"
          @refresh="refreshHistory"
          @open="openHistory"
          @delete="deleteHistory"
        />
      </aside>

      <section class="comparison-workspace">
      <section v-if="isHistorySession" class="history-mode-banner">
        <div>
          <strong>历史查看模式</strong>
          <span>已恢复的记录不包含 API Key，适合查看和导出；需要重新请求请新建对比。</span>
        </div>
      </section>

      <section v-if="currentSession" class="stats-strip">
        <span class="stat-chip stat-total">模型 {{ sessionStats.total }}</span>
        <span class="stat-chip stat-success">成功 {{ sessionStats.done }}</span>
        <span class="stat-chip stat-error">失败 {{ sessionStats.error }}</span>
        <span class="stat-chip stat-aborted">停止 {{ sessionStats.aborted }}</span>
        <span v-if="sessionStats.running" class="stat-chip stat-running">生成中 {{ sessionStats.running }}</span>
        <span class="stat-chip stat-latency">平均耗时 {{ formatLatency(sessionStats.averageLatencyMs) }}</span>
      </section>

      <section
        class="compare-setup"
        :class="{ readonly: hasRuns, collapsed: isConfigCollapsed, dragging: dragOver }"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <div v-if="hasRuns" class="setup-readonly">
          <div class="setup-readonly-main">
            <div class="setup-summary-main">
              <span class="summary-label">问题</span>
              <span class="summary-prompt">{{ prompt }}</span>
            </div>
            <div class="setup-models">
              <span v-for="run in runs" :key="run.id" class="model-chip">
                {{ run.config.provider }} / {{ run.config.model || run.config.label }}
              </span>
            </div>
          </div>
          <button type="button" class="compare-secondary" @click="configOpen = !configOpen">
            {{ configOpen ? '隐藏参数' : '查看参数' }}
          </button>
        </div>

        <div v-if="hasRuns && configOpen" class="runtime-snapshot-grid">
          <article v-for="run in runs" :key="run.id" class="runtime-snapshot-card">
            <header>
              <strong>{{ run.config.provider }} / {{ run.config.model || run.config.label }}</strong>
              <span :class="`snapshot-status status-${run.status}`">{{ statusLabel(run.status) }}</span>
            </header>
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{{ run.config.provider }}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{{ run.config.model || '-' }}</dd>
              </div>
              <div>
                <dt>Base URL</dt>
                <dd>{{ run.config.baseUrl || '-' }}</dd>
              </div>
              <div>
                <dt>耗时</dt>
                <dd>{{ formatLatency(run.latencyMs) }}</dd>
              </div>
            </dl>
          </article>
        </div>

        <template v-else-if="!hasRuns">
          <div v-if="isConfigCollapsed" class="setup-summary">
            <div class="setup-summary-main">
              <span class="summary-label">问题</span>
              <span class="summary-prompt">{{ prompt }}</span>
            </div>
            <div class="setup-models">
              <span v-for="runtime in runtimeDrafts" :key="runtime.label + runtime.model" class="model-chip">
                {{ runtime.provider }} / {{ runtime.model }}
              </span>
            </div>
            <button type="button" class="compare-secondary" :disabled="isRunning" @click="configOpen = true">
              展开配置
            </button>
          </div>

          <template v-else>
          <input
            ref="imageInputRef"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            @change="handleImageSelect"
          />
          <input
            ref="fileInputRef"
            type="file"
            accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.toml,.js,.ts,.jsx,.tsx,.vue,.svelte,.py,.go,.rs,.java,.kt,.c,.cpp,.h,.hpp,.cs,.rb,.php,.swift,.sh,.bash,.zsh,.bat,.ps1,.html,.css,.scss,.less,.sass,.sql,.graphql,.proto,.env,.ini,.conf,.cfg,.log"
            multiple
            hidden
            @change="handleFileSelect"
          />
          <div class="prompt-panel">
            <label class="field-label" for="comparison-prompt">问题</label>
            <textarea
              id="comparison-prompt"
              v-model="prompt"
              class="prompt-input"
              :disabled="isRunning"
              placeholder="输入要让多个模型同时回答的问题"
              @paste="handlePaste"
            ></textarea>
          </div>

          <div v-if="pendingImages.length || pendingFiles.length" class="attachment-preview">
            <div v-if="pendingImages.length" class="image-preview-row">
              <div v-for="(img, index) in pendingImages" :key="img.name + index" class="image-preview-item">
                <img :src="`data:${img.mediaType};base64,${img.base64}`" :alt="img.name" />
                <button type="button" class="attachment-remove" :disabled="isRunning" @click="removeImage(index)">
                  ×
                </button>
              </div>
            </div>
            <div v-if="pendingFiles.length" class="file-preview-row">
              <div v-for="(file, index) in pendingFiles" :key="file.name + file.size" class="file-preview-item">
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">{{ formatFileSize(file.size) }}</span>
                <button type="button" class="attachment-remove" :disabled="isRunning" @click="removeFile(index)">
                  ×
                </button>
              </div>
            </div>
            <div class="attachment-risk-note">
              {{ attachmentNotice }}
            </div>
          </div>

          <div class="runtime-grid">
            <div v-for="(runtime, index) in runtimeDrafts" :key="index" class="runtime-editor">
              <div class="runtime-editor-header">
                <span>模型 {{ index + 1 }}</span>
                <button type="button" class="small-btn" :disabled="isRunning" @click="resetRuntime(index)">
                  同步当前设置
                </button>
              </div>

              <label class="field-label">Provider</label>
              <select v-model="runtime.provider" class="field-input" :disabled="isRunning" @change="normalizeRuntime(runtime)">
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI 兼容</option>
                <option value="claude">Claude</option>
              </select>

              <label class="field-label">Model</label>
              <input v-model="runtime.model" class="field-input" :disabled="isRunning" spellcheck="false" />

              <label class="field-label">Base URL</label>
              <input
                v-model="runtime.baseUrl"
                class="field-input"
                :disabled="isRunning || runtime.provider === 'claude'"
                spellcheck="false"
                placeholder="Claude 不使用此字段"
              />

              <label class="field-label">API Key</label>
              <input
                v-model="runtime.apiKey"
                class="field-input"
                :disabled="isRunning || runtime.provider === 'ollama'"
                type="password"
                spellcheck="false"
                placeholder="本地 Ollama 可留空"
              />
            </div>
          </div>

            <div class="compare-actions">
            <button
              type="button"
              class="compare-primary"
              :disabled="!canStart"
              @click="start"
            >
              开始对比
            </button>
            <button type="button" class="compare-secondary" :disabled="isRunning" @click="imageInputRef?.click()">
              添加图片
            </button>
            <button type="button" class="compare-secondary" :disabled="isRunning" @click="fileInputRef?.click()">
              添加文件
            </button>
            <button type="button" class="compare-secondary" :disabled="isRunning" @click="resetAllRuntimes">
              重置模型
            </button>
          </div>
          </template>
        </template>
      </section>

      <section class="run-grid" :class="{ empty: runs.length === 0 }">
        <div v-if="runs.length === 0" class="compare-empty">
          输入问题并确认两个模型后开始对比。
        </div>
        <ComparisonRunCard
          v-for="run in runs"
          :key="run.id"
          :run="run"
          :show-retry="!isHistorySession"
          @stop="stopRun"
          @retry="retryRun"
        />
      </section>

      <section v-if="codeComparisonCandidates.length > 0" class="code-compare-panel">
        <div class="code-compare-toolbar">
          <div>
            <h2>代码对比</h2>
            <p>同语言代码块可做只读对照</p>
          </div>
          <select v-model="selectedCodeLanguage" class="field-input code-language-select">
            <option
              v-for="candidate in codeComparisonCandidates"
              :key="candidate.language"
              :value="candidate.language"
            >
              {{ candidate.language }} · {{ candidate.blocks.length }} 段
            </option>
          </select>
        </div>
        <div class="code-compare-selectors">
          <select v-model.number="leftCodeIndex" class="field-input">
            <option
              v-for="(block, index) in selectedCodeBlocks"
              :key="`left-${block.runId}-${block.blockIndex}`"
              :value="index"
            >
              {{ block.modelName }} · #{{ block.blockIndex + 1 }}
            </option>
          </select>
          <select v-model.number="rightCodeIndex" class="field-input">
            <option
              v-for="(block, index) in selectedCodeBlocks"
              :key="`right-${block.runId}-${block.blockIndex}`"
              :value="index"
            >
              {{ block.modelName }} · #{{ block.blockIndex + 1 }}
            </option>
          </select>
        </div>
        <div v-if="isSameCodeBlock" class="code-compare-empty">
          请选择不同代码块查看差异。
        </div>
        <div v-else-if="leftCodeBlock && rightCodeBlock" class="code-diff-grid">
          <div class="code-diff-header">
            <span>{{ leftCodeBlock.modelName }} · #{{ leftCodeBlock.blockIndex + 1 }}</span>
            <span>{{ rightCodeBlock.modelName }} · #{{ rightCodeBlock.blockIndex + 1 }}</span>
          </div>
          <div class="code-diff-table">
            <div
              v-for="(line, index) in codeDiffLines"
              :key="`${line.type}-${line.leftLineNumber ?? 0}-${line.rightLineNumber ?? 0}-${index}`"
              class="code-diff-row"
              :class="`diff-${line.type}`"
            >
              <span class="diff-line-no">{{ line.leftLineNumber ?? '' }}</span>
              <code class="diff-cell diff-left-cell">{{ line.left ?? '' }}</code>
              <span class="diff-line-no">{{ line.rightLineNumber ?? '' }}</span>
              <code class="diff-cell diff-right-cell">{{ line.right ?? '' }}</code>
            </div>
          </div>
        </div>
      </section>

      </section>

      <aside class="comparison-inspector">
        <section class="summary-panel" :class="{ empty: !summaryRun }">
          <div class="summary-toolbar">
            <div class="summary-copy">
              <h2>汇总答案</h2>
              <p>{{ summaryHint }}</p>
            </div>
            <textarea
              v-model="summaryInstruction"
              class="summary-instruction"
              :disabled="isSummaryRunning || isHistorySession"
              placeholder="可选：输入你的汇总要求，例如更偏向步骤、结论先行、只保留代码差异等"
            ></textarea>
            <div v-if="successfulRuns.length > 0" class="summary-source-list">
              <span>将汇总</span>
              <span v-for="run in successfulRuns" :key="run.id" class="summary-source-chip">
                {{ run.config.provider }} / {{ run.config.model || run.config.label }}
              </span>
            </div>
            <div class="summary-actions">
              <select
                v-model="summaryRuntime.provider"
                class="field-input summary-select"
                :disabled="isSummaryRunning || isHistorySession"
                @change="normalizeRuntime(summaryRuntime)"
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI 兼容</option>
                <option value="claude">Claude</option>
              </select>
              <input
                v-model="summaryRuntime.model"
                class="field-input summary-model"
                :disabled="isSummaryRunning || isHistorySession"
                spellcheck="false"
              />
              <button type="button" class="compare-secondary" :disabled="isSummaryRunning || isHistorySession" @click="resetSummaryRuntime">
                同步当前设置
              </button>
              <button type="button" class="compare-primary" :disabled="!canSummarize" @click="summarize">
                生成汇总
              </button>
              <button type="button" class="compare-secondary" :disabled="!isSummaryRunning" @click="stopSummary">
                停止汇总
              </button>
            </div>
          </div>
          <ComparisonRunCard
            v-if="summaryRun"
            :run="summaryRun"
            :show-retry="false"
            @stop="stopSummary"
          />
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Braces, FileDown, History, Plus, Square } from 'lucide-vue-next'
import CompareHistoryView from './CompareHistoryView.vue'
import ComparisonRunCard from '../components/ComparisonRunCard.vue'
import { useAttachments } from '../composables/useAttachments'
import { useModelComparison } from '../composables/useModelComparison'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { getCodeComparisonCandidates } from '../services/comparisonCode'
import { createLineDiff } from '../services/comparisonDiff'
import {
  buildComparisonExportFilename,
  exportComparisonAsJson,
  exportComparisonAsMarkdown,
} from '../services/comparisonExport'
import { formatLatency, getSessionStats } from '../services/comparisonStats'
import { getVisionUnsupportedRuntimeLabels } from '../services/modelCapabilities'
import { createRuntimeFromSettings } from '../services/runtime'
import { settings } from '../stores/settings'
import type { ModelRuntimeConfig } from '../types/model'

const prompt = ref('')
const configOpen = ref(true)
const summaryInstruction = ref('')
const historySidebarOpen = ref(true)
const isHistorySession = ref(false)
const selectedCodeLanguage = ref('')
const leftCodeIndex = ref(0)
const rightCodeIndex = ref(1)
const dragOver = ref(false)
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const toast = useToast()
const { confirm } = useConfirm()
const {
  pendingImages,
  pendingFiles,
  addImages,
  addFiles,
  removeImage,
  removeFile,
  clearAttachments,
} = useAttachments(toast)
const comparison = useModelComparison()
const {
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
  summarizeWith,
  refreshHistory,
  loadSession,
  clearSession,
  removeSession,
} = comparison

const runtimeDrafts = reactive<ModelRuntimeConfig[]>([
  createRuntimeFromSettings(settings),
  createRuntimeFromSettings(settings),
])
const summaryRuntime = reactive<ModelRuntimeConfig>(createRuntimeFromSettings(settings))

const currentSession = computed(() => comparison.session.value)
const sessionStats = computed(() => getSessionStats(runs.value))
const codeComparisonCandidates = computed(() => getCodeComparisonCandidates(runs.value))
const selectedCodeCandidate = computed(() =>
  codeComparisonCandidates.value.find(candidate => candidate.language === selectedCodeLanguage.value)
  ?? codeComparisonCandidates.value[0]
)
const selectedCodeBlocks = computed(() => selectedCodeCandidate.value?.blocks ?? [])
const leftCodeBlock = computed(() => selectedCodeBlocks.value[leftCodeIndex.value])
const rightCodeBlock = computed(() => selectedCodeBlocks.value[rightCodeIndex.value])
const hasRuns = computed(() => runs.value.length > 0)
const isSameCodeBlock = computed(() => {
  const left = leftCodeBlock.value
  const right = rightCodeBlock.value
  return Boolean(left && right && left.runId === right.runId && left.blockIndex === right.blockIndex)
})
const codeDiffLines = computed(() => {
  const left = leftCodeBlock.value
  const right = rightCodeBlock.value
  if (!left || !right || isSameCodeBlock.value) return []
  return createLineDiff(left.content, right.content)
})
const isConfigCollapsed = computed(() => !configOpen.value && runs.value.length === 0)
const headerHint = computed(() => {
  if (isRunning.value) return '模型正在并发生成'
  if (isHistorySession.value) return '正在查看已保存的本地记录'
  return '已完成记录会保存到本地'
})
const canStart = computed(() =>
  !isRunning.value &&
  (prompt.value.trim().length > 0 || pendingImages.value.length > 0 || pendingFiles.value.length > 0) &&
  runtimeDrafts.length >= 2 &&
  runtimeDrafts.every(runtime => runtime.model.trim())
)
const canSummarize = computed(() =>
  !isHistorySession.value &&
  !isSummaryRunning.value &&
  successfulRuns.value.length > 0 &&
  summaryRuntime.model.trim().length > 0
)
const summaryHint = computed(() => {
  if (successfulRuns.value.length === 0) return '等待至少一个模型完成'
  return `将使用 ${successfulRuns.value.length} 个成功结果发送给 ${summaryRuntime.provider} / ${summaryRuntime.model}`
})
const attachmentNotice = computed(() => {
  const attachmentParts = [
    pendingImages.value.length ? `${pendingImages.value.length} 张图片` : '',
    pendingFiles.value.length ? `${pendingFiles.value.length} 个文件` : '',
  ].filter(Boolean).join('、')
  return `${attachmentParts} 会发送给每个参与对比的模型；汇总时只发送成功回答，不重复发送原始附件。`
})

function getCodeBlockKey(index: number): string {
  const block = selectedCodeBlocks.value[index]
  return block ? `${block.runId}:${block.blockIndex}` : ''
}

function findCodeBlockIndexByKey(key: string): number {
  if (!key) return -1
  return selectedCodeBlocks.value.findIndex(block => `${block.runId}:${block.blockIndex}` === key)
}

function normalizeCodeSelection(previousLeftKey = '', previousRightKey = ''): void {
  const blockCount = selectedCodeBlocks.value.length
  if (blockCount === 0) {
    leftCodeIndex.value = 0
    rightCodeIndex.value = 0
    return
  }

  const nextLeftIndex = findCodeBlockIndexByKey(previousLeftKey)
  const nextRightIndex = findCodeBlockIndexByKey(previousRightKey)
  leftCodeIndex.value = nextLeftIndex >= 0 ? nextLeftIndex : Math.min(leftCodeIndex.value, blockCount - 1)
  rightCodeIndex.value = nextRightIndex >= 0
    ? nextRightIndex
    : Math.min(rightCodeIndex.value, blockCount - 1)

  if (blockCount > 1 && leftCodeIndex.value === rightCodeIndex.value) {
    rightCodeIndex.value = leftCodeIndex.value === 0 ? 1 : 0
  }
}

watch(() => comparison.session.value, currentSession => {
  if (!currentSession) {
    prompt.value = ''
    summaryInstruction.value = ''
    configOpen.value = true
    isHistorySession.value = false
    return
  }
  prompt.value = currentSession.prompt
  summaryInstruction.value = currentSession.summaryInstruction ?? ''
  configOpen.value = currentSession.runs.length === 0
})

watch(codeComparisonCandidates, candidates => {
  const previousLanguage = selectedCodeLanguage.value
  const previousLeftKey = getCodeBlockKey(leftCodeIndex.value)
  const previousRightKey = getCodeBlockKey(rightCodeIndex.value)
  const currentLanguageExists = candidates.some(candidate => candidate.language === selectedCodeLanguage.value)
  if (!currentLanguageExists) {
    selectedCodeLanguage.value = candidates[0]?.language ?? ''
  }
  normalizeCodeSelection(
    previousLanguage === selectedCodeLanguage.value ? previousLeftKey : '',
    previousLanguage === selectedCodeLanguage.value ? previousRightKey : ''
  )
})

watch(selectedCodeLanguage, () => {
  normalizeCodeSelection()
})

onMounted(() => {
  void refreshHistory()
})

function cloneRuntime(runtime: ModelRuntimeConfig): ModelRuntimeConfig {
  return {
    provider: runtime.provider,
    transport: runtime.transport,
    label: runtime.label,
    model: runtime.model,
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    systemPrompt: runtime.systemPrompt,
    maxContextTokens: runtime.maxContextTokens,
    responseTimeoutSeconds: runtime.responseTimeoutSeconds,
    backendRagMode: runtime.backendRagMode,
    backendProvider: runtime.backendProvider,
    backendModel: runtime.backendModel,
  }
}

function normalizeRuntime(runtime: ModelRuntimeConfig): void {
  if (runtime.provider === 'ollama') {
    runtime.baseUrl = runtime.baseUrl || settings.ollama.url
    runtime.apiKey = undefined
    runtime.model = runtime.model || settings.ollama.model
  } else if (runtime.provider === 'openai') {
    runtime.baseUrl = runtime.baseUrl || settings.openai.baseUrl
    runtime.apiKey = runtime.apiKey ?? settings.openai.apiKey
    runtime.model = runtime.model || settings.openai.model
  } else {
    runtime.baseUrl = undefined
    runtime.apiKey = runtime.apiKey ?? settings.claude.apiKey
    runtime.model = runtime.model || settings.claude.model
  }
  runtime.systemPrompt = settings.systemPrompt
  runtime.maxContextTokens = settings.maxContextTokens
  runtime.responseTimeoutSeconds = settings.responseTimeoutSeconds
  runtime.label = `${runtime.provider} - ${runtime.model}`
}

function resetRuntime(index: number): void {
  runtimeDrafts[index] = createRuntimeFromSettings(settings)
}

function resetAllRuntimes(): void {
  resetRuntime(0)
  resetRuntime(1)
}

function resetSummaryRuntime(): void {
  Object.assign(summaryRuntime, createRuntimeFromSettings(settings))
}

function statusLabel(status: string): string {
  switch (status) {
    case 'idle':
      return '待开始'
    case 'loading':
      return '连接中'
    case 'streaming':
      return '生成中'
    case 'done':
      return '完成'
    case 'error':
      return '失败'
    case 'aborted':
      return '已停止'
    default:
      return status
  }
}

async function start(): Promise<void> {
  if (!canStart.value) return
  isHistorySession.value = false
  const runtimes = runtimeDrafts.map(runtime => {
    normalizeRuntime(runtime)
    return cloneRuntime(runtime)
  })
  if (pendingImages.value.length > 0) {
    const unsupported = getVisionUnsupportedRuntimeLabels(runtimes)
    if (unsupported.length > 0) {
      toast.show(`图片对比需要视觉模型，请调整: ${unsupported.join('、')}`, 'warning', 7000)
      return
    }
  }
  configOpen.value = false
  const promptText = prompt.value.trim()
    || (pendingImages.value.length > 0 ? '请分析这些图片' : '')
    || (pendingFiles.value.length > 0 ? '请分析这些文件' : '')
  await startComparison({
    prompt: promptText,
    runtimes,
    images: pendingImages.value.map(image => ({ ...image })),
    files: pendingFiles.value.map(file => ({ ...file })),
  })
  clearAttachments()
}

function toggleHistorySidebar(): void {
  historySidebarOpen.value = !historySidebarOpen.value
  if (historySidebarOpen.value) {
    void refreshHistory()
  }
}

function newComparison(): void {
  clearSession()
  prompt.value = ''
  summaryInstruction.value = ''
  clearAttachments()
  configOpen.value = true
  isHistorySession.value = false
}

async function openHistory(sessionId: string): Promise<void> {
  await loadSession(sessionId)
  isHistorySession.value = true
}

async function deleteHistory(sessionId: string): Promise<void> {
  const confirmed = await confirm({
    title: '删除对比记录',
    message: '确定删除这条本地对比记录吗？删除后无法恢复。',
    confirmText: '删除',
    danger: true,
  })
  if (!confirmed) return

  const deletingCurrentSession = currentSession.value?.id === sessionId
  try {
    await removeSession(sessionId)
    if (deletingCurrentSession) {
      isHistorySession.value = false
    }
    toast.show('已删除对比记录', 'success')
  } catch (err) {
    console.warn('[comparison] 删除对比记录失败', err)
    toast.show('删除对比记录失败，请稍后重试', 'error')
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function handleImageSelect(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    addImages(Array.from(input.files))
    input.value = ''
  }
}

function handleFileSelect(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    addFiles(Array.from(input.files))
    input.value = ''
  }
}

function handlePaste(event: ClipboardEvent): void {
  if (isRunning.value) return
  const items = event.clipboardData?.items
  if (!items) return

  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }
  if (imageFiles.length > 0) {
    event.preventDefault()
    addImages(imageFiles)
  }
}

function handleDragOver(): void {
  if (!isRunning.value) {
    dragOver.value = true
  }
}

function handleDragLeave(): void {
  dragOver.value = false
}

function handleDrop(event: DragEvent): void {
  dragOver.value = false
  if (isRunning.value) return

  const files = event.dataTransfer?.files
  if (!files) return

  const droppedFiles = Array.from(files)
  const imageFiles = droppedFiles.filter(file => file.type.startsWith('image/'))
  const textFiles = droppedFiles.filter(file => !file.type.startsWith('image/'))
  if (imageFiles.length > 0) addImages(imageFiles)
  if (textFiles.length > 0) addFiles(textFiles)
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function exportMarkdown(): void {
  const session = currentSession.value
  if (!session) return
  try {
    downloadTextFile(
      buildComparisonExportFilename(session, 'md'),
      exportComparisonAsMarkdown(session),
      'text/markdown;charset=utf-8'
    )
    toast.show('已导出 Markdown', 'success')
  } catch (err) {
    console.warn('[comparison] 导出 Markdown 失败', err)
    toast.show('导出 Markdown 失败', 'error')
  }
}

function exportJson(): void {
  const session = currentSession.value
  if (!session) return
  try {
    downloadTextFile(
      buildComparisonExportFilename(session, 'json'),
      exportComparisonAsJson(session),
      'application/json;charset=utf-8'
    )
    toast.show('已导出 JSON', 'success')
  } catch (err) {
    console.warn('[comparison] 导出 JSON 失败', err)
    toast.show('导出 JSON 失败', 'error')
  }
}

async function retryRun(runId: string): Promise<void> {
  await comparison.retryRun(runId)
}

async function summarize(): Promise<void> {
  if (!canSummarize.value) return
  normalizeRuntime(summaryRuntime)
  await summarizeWith(cloneRuntime(summaryRuntime), summaryInstruction.value)
}
</script>

<style scoped>
.compare-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  --compare-bg: var(--bg-canvas);
  --compare-panel: var(--bg-elevated);
  --compare-panel-strong: var(--bg-surface);
  --compare-soft: var(--bg-surface-2);
  --compare-input: var(--bg-input);
  --compare-line: var(--border);
  --compare-line-strong: var(--border-subtle);
  --compare-text: var(--text-primary);
  --compare-muted: var(--text-secondary);
  --compare-faint: var(--text-muted);
  --compare-primary: var(--accent-deep);
  --compare-primary-strong: var(--accent-text);
  --compare-primary-soft: var(--accent-bg);
  --compare-scroll-track: var(--bg-surface-2);
  --compare-scroll-thumb: var(--scrollbar-thumb);
  --compare-success-text: #34d399;
  --compare-success-bg: rgba(45, 157, 120, 0.16);
  --compare-success-border: rgba(52, 211, 153, 0.28);
  --compare-error-text: #fb7185;
  --compare-error-bg: rgba(244, 63, 94, 0.14);
  --compare-error-border: rgba(251, 113, 133, 0.32);
  --compare-warning-text: #fbbf24;
  --compare-warning-bg: rgba(245, 158, 11, 0.14);
  --compare-warning-border: rgba(251, 191, 36, 0.30);
  --compare-shadow: 0 18px 46px rgba(0, 0, 0, 0.18);
  background: var(--compare-bg);
  color: var(--text-primary);
  font-family: 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

:global([data-theme="light"]) .compare-shell {
  --compare-bg: #eeecfb;
  --compare-panel: rgba(248, 247, 255, 0.86);
  --compare-panel-strong: #ffffff;
  --compare-soft: #f3f0fb;
  --compare-input: #f5f3ff;
  --compare-line: #d8d4eb;
  --compare-line-strong: #c5bfe0;
  --compare-text: #17162a;
  --compare-muted: #76718f;
  --compare-faint: #918baa;
  --compare-primary: #8357e8;
  --compare-primary-strong: #6f3fd9;
  --compare-primary-soft: #ede6ff;
  --compare-scroll-track: #f4f1ff;
  --compare-scroll-thumb: #b9addf;
  --compare-success-text: #1f8a67;
  --compare-success-bg: rgba(45, 157, 120, 0.12);
  --compare-success-border: rgba(45, 157, 120, 0.28);
  --compare-error-text: #dc4d62;
  --compare-error-bg: #fff5f7;
  --compare-error-border: #f1bdc6;
  --compare-warning-text: #a1711b;
  --compare-warning-bg: rgba(182, 133, 37, 0.10);
  --compare-warning-border: rgba(182, 133, 37, 0.30);
  --compare-shadow: 0 18px 46px rgba(84, 69, 141, 0.14);
}

.compare-shell,
.compare-shell * {
  scrollbar-width: thin;
  scrollbar-color: var(--compare-scroll-thumb) var(--compare-scroll-track);
}

.compare-shell::-webkit-scrollbar,
.compare-shell *::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}

.compare-shell::-webkit-scrollbar-track,
.compare-shell *::-webkit-scrollbar-track {
  background: var(--compare-scroll-track);
  border-radius: 999px;
}

.compare-shell::-webkit-scrollbar-thumb,
.compare-shell *::-webkit-scrollbar-thumb {
  border: 2px solid var(--compare-scroll-track);
  border-radius: 999px;
  background: var(--compare-scroll-thumb);
}

.compare-shell::-webkit-scrollbar-thumb:hover,
.compare-shell *::-webkit-scrollbar-thumb:hover {
  background: var(--compare-primary-strong);
}

.compare-shell::-webkit-scrollbar-corner,
.compare-shell *::-webkit-scrollbar-corner {
  background: transparent;
}

.compare-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid var(--compare-line);
  background: var(--bg-topbar);
  backdrop-filter: blur(14px);
}

.compare-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.compare-title h1 {
  margin: 0;
  color: var(--compare-text);
  font-size: 16px;
  line-height: 1;
  letter-spacing: 0;
}

.compare-title p {
  margin: 2px 0 0;
  color: var(--compare-muted);
  font-size: 12px;
}

.logo-dot {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: block;
  object-fit: contain;
  background: var(--compare-panel-strong);
  padding: 3px;
  box-shadow: 0 10px 22px rgba(111, 63, 217, 0.28);
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-right: 186px;
}

.compare-main {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr) 328px;
  gap: 18px;
  width: min(1440px, calc(100vw - 48px));
  min-height: 0;
  margin: 22px auto;
}

.compare-main.history-collapsed {
  grid-template-columns: minmax(0, 1fr) 328px;
}

.comparison-sidebar,
.comparison-workspace,
.comparison-inspector {
  min-height: 0;
  min-width: 0;
}

.comparison-sidebar {
  display: grid;
}

.comparison-inspector {
  display: grid;
}

.comparison-workspace {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  background: var(--compare-panel);
  box-shadow: var(--compare-shadow);
}

.history-mode-banner {
  padding: 10px 18px;
  border-bottom: 1px solid var(--compare-line);
  background: var(--compare-primary-soft);
}

.history-mode-banner div {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--compare-muted);
  font-size: 12px;
  line-height: 1.5;
}

.history-mode-banner strong {
  color: var(--compare-primary-strong);
  font-size: 12px;
  flex-shrink: 0;
}

.stats-strip {
  padding: 10px 18px;
  border-bottom: 1px solid var(--compare-line);
  background: var(--compare-soft);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}

.stat-chip {
  border: 1px solid var(--compare-line);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--compare-soft);
  color: var(--compare-muted);
  font-size: 12px;
  line-height: 1.4;
  font-weight: 650;
}

.stat-total,
.stat-latency {
  border-color: var(--compare-line);
  background: var(--compare-soft);
  color: var(--compare-muted);
}

.stat-success {
  border-color: var(--compare-success-border);
  background: var(--compare-success-bg);
  color: var(--compare-success-text);
}

.stat-error {
  border-color: var(--compare-error-border);
  background: var(--compare-error-bg);
  color: var(--compare-error-text);
}

.stat-aborted {
  border-color: var(--compare-warning-border);
  background: var(--compare-warning-bg);
  color: var(--compare-warning-text);
}

.stat-running {
  border-color: var(--accent-border);
  background: var(--compare-primary-soft);
  color: var(--compare-primary-strong);
}

.small-btn.danger {
  color: var(--compare-error-text);
  border-color: var(--compare-error-border);
  background: var(--compare-error-bg);
}

.compare-setup {
  padding: 18px;
  border-bottom: 1px solid var(--compare-line);
  background: transparent;
}

.compare-setup.dragging {
  outline: 2px solid var(--accent-border);
  outline-offset: -4px;
  background: var(--accent-bg);
}

.compare-setup.collapsed {
  padding: 14px 18px;
}

.compare-setup.readonly {
  padding: 12px 18px;
}

.setup-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
}

.setup-summary-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.setup-readonly {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.setup-readonly-main {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.summary-label {
  flex-shrink: 0;
  color: var(--compare-muted);
  font-size: 12px;
  font-weight: 700;
}

.summary-prompt {
  min-width: 0;
  color: var(--compare-text);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-snapshot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  max-height: 220px;
  margin-top: 12px;
  overflow: auto;
}

.runtime-snapshot-card {
  min-width: 0;
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  background: var(--compare-soft);
  overflow: hidden;
}

.runtime-snapshot-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--compare-line);
}

.runtime-snapshot-card strong {
  min-width: 0;
  overflow: hidden;
  color: var(--compare-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snapshot-status {
  flex-shrink: 0;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--compare-primary-soft);
  color: var(--compare-primary-strong);
  font-size: 12px;
  font-weight: 700;
}

.snapshot-status.status-loading,
.snapshot-status.status-streaming {
  border-color: var(--compare-success-border);
  background: var(--compare-success-bg);
  color: var(--compare-success-text);
}

.snapshot-status.status-done {
  border-color: var(--accent-border);
  background: var(--compare-primary-soft);
  color: var(--compare-primary-strong);
}

.snapshot-status.status-error {
  border-color: var(--compare-error-border);
  background: var(--compare-error-bg);
  color: var(--compare-error-text);
}

.snapshot-status.status-aborted {
  border-color: var(--compare-warning-border);
  background: var(--compare-warning-bg);
  color: var(--compare-warning-text);
}

.runtime-snapshot-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  margin: 0;
  padding: 12px;
}

.runtime-snapshot-card dl div {
  min-width: 0;
}

.runtime-snapshot-card dt {
  margin: 0 0 4px;
  color: var(--compare-muted);
  font-size: 12px;
  font-weight: 650;
}

.runtime-snapshot-card dd {
  margin: 0;
  overflow: hidden;
  color: var(--compare-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setup-models {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.model-chip {
  max-width: 220px;
  border: 1px solid var(--compare-line);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--compare-soft);
  color: var(--compare-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-panel {
  margin: 0 0 14px;
}

.attachment-preview {
  margin: 0 0 14px;
  display: grid;
  gap: 8px;
}

.image-preview-row,
.file-preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-preview-item {
  position: relative;
  width: 72px;
  height: 72px;
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--compare-soft);
}

.image-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.file-preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  min-height: 34px;
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--compare-soft);
  color: var(--compare-muted);
  font-size: 12px;
}

.file-name {
  min-width: 0;
  color: var(--compare-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  flex-shrink: 0;
  color: var(--compare-muted);
}

.attachment-risk-note {
  border: 1px solid var(--compare-warning-border);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--compare-warning-bg);
  color: var(--compare-warning-text);
  font-size: 12px;
  line-height: 1.45;
}

.attachment-remove {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--compare-line);
  border-radius: 50%;
  padding: 0;
  background: var(--compare-panel-strong);
  color: var(--compare-muted);
  cursor: pointer;
}

.image-preview-item .attachment-remove {
  position: absolute;
  top: 4px;
  right: 4px;
}

.field-label {
  display: block;
  margin: 0 0 6px;
  color: var(--compare-muted);
  font-size: 12px;
  font-weight: 650;
}

.prompt-input,
.field-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--compare-line-strong);
  border-radius: 8px;
  background: var(--compare-input);
  color: var(--compare-text);
  outline: none;
  font: inherit;
  font-size: 13px;
}

.field-input {
  color-scheme: inherit;
}

select.field-input {
  appearance: none;
  cursor: pointer;
  background-color: var(--compare-input);
  background-image: linear-gradient(45deg, transparent 50%, var(--compare-muted) 50%),
    linear-gradient(135deg, var(--compare-muted) 50%, transparent 50%);
  background-position: calc(100% - 17px) 14px, calc(100% - 11px) 14px;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-right: 34px;
}

select.field-input option {
  background: var(--compare-panel-strong);
  color: var(--compare-text);
}

.prompt-input {
  min-height: 104px;
  resize: vertical;
  padding: 12px;
  line-height: 1.55;
}

.field-input {
  height: 34px;
  padding: 0 10px;
  margin-bottom: 10px;
}

.prompt-input:focus,
.field-input:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--compare-primary-soft);
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.runtime-editor {
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  padding: 14px;
  background: var(--compare-soft);
  overflow: hidden;
}

.runtime-editor:nth-child(1) {
  border-top: 3px solid #6f79ee;
}

.runtime-editor:nth-child(2) {
  border-top: 3px solid #9264e9;
}

.runtime-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  color: var(--compare-text);
  font-size: 13px;
  font-weight: 700;
}

.compare-actions {
  margin: 14px 0 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.compare-primary,
.compare-secondary,
.small-btn {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.compare-primary {
  height: 42px;
  min-width: 132px;
  padding: 0 16px;
  border-color: transparent;
  color: #fff;
  font-weight: 700;
  background: linear-gradient(135deg, var(--compare-primary), #6b79eb);
  box-shadow: 0 14px 26px rgba(111, 63, 217, 0.26);
}

.compare-secondary,
.small-btn {
  height: 32px;
  padding: 0 12px;
  color: var(--compare-muted);
  background: var(--compare-soft);
}

.compare-secondary.active {
  border-color: var(--accent-border);
  background: var(--compare-primary-soft);
  color: var(--compare-primary-strong);
}

.small-btn {
  height: 26px;
  font-size: 12px;
}

button:disabled,
input:disabled,
select:disabled,
textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.run-grid {
  min-height: 0;
  overflow: auto;
  padding: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(320px, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 14px;
}

.summary-panel {
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 14px 18px;
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  background: var(--compare-panel);
  box-shadow: var(--compare-shadow);
}

.summary-panel.empty {
  align-self: start;
  max-height: none;
}

.summary-toolbar {
  display: grid;
  grid-template-columns: 1fr;
  align-items: stretch;
  gap: 12px;
  margin: 0 0 10px;
}

.summary-copy {
  min-width: 0;
}

.summary-toolbar h2 {
  margin: 0;
  color: var(--compare-text);
  font-size: 15px;
  line-height: 1.35;
  letter-spacing: 0;
}

.summary-toolbar p {
  margin: 3px 0 0;
  color: var(--compare-muted);
  font-size: 12px;
}

.summary-instruction {
  width: 100%;
  min-height: 96px;
  max-height: 160px;
  box-sizing: border-box;
  border: 1px solid var(--compare-line-strong);
  border-radius: 8px;
  padding: 8px 10px;
  resize: vertical;
  background: var(--compare-input);
  color: var(--compare-text);
  outline: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}

.summary-instruction:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--compare-primary-soft);
}

.summary-source-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--compare-muted);
  font-size: 12px;
  line-height: 1.45;
}

.summary-source-chip {
  max-width: 100%;
  border: 1px solid var(--compare-line);
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--compare-soft);
  color: var(--compare-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-actions {
  display: grid;
  grid-template-columns: 1fr;
  justify-content: stretch;
  gap: 8px;
  min-width: 0;
}

.summary-select,
.summary-model {
  width: 100%;
  margin-bottom: 0;
}

.summary-panel :deep(.comparison-run-card) {
  min-height: 320px;
  margin: 0;
}

.run-grid.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.compare-empty {
  color: var(--compare-muted);
  font-size: 14px;
}

.code-compare-panel {
  max-height: 38vh;
  overflow: auto;
  padding: 14px 18px;
  border-top: 1px solid var(--compare-line);
  background: var(--compare-soft);
}

.code-compare-toolbar,
.code-compare-selectors,
.code-compare-grid,
.code-diff-grid,
.code-compare-empty {
  max-width: 1180px;
  margin: 0;
}

.code-compare-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.code-compare-toolbar h2 {
  margin: 0;
  color: var(--compare-text);
  font-size: 15px;
  line-height: 1.35;
  letter-spacing: 0;
}

.code-compare-toolbar p {
  margin: 3px 0 0;
  color: var(--compare-muted);
  font-size: 12px;
}

.code-language-select {
  width: 180px;
  margin-bottom: 0;
}

.code-compare-selectors {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 10px;
}

.code-compare-selectors .field-input {
  margin-bottom: 0;
}

.code-compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.code-compare-column {
  min-width: 0;
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-elevated);
}

.code-compare-column header {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-faint);
  color: var(--text-secondary);
  font-size: 12px;
}

.code-compare-column pre {
  max-height: 260px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  background: var(--bg-code);
  color: var(--text-code);
  font-size: 12px;
  line-height: 1.55;
  text-align: left;
}

.code-compare-column code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  white-space: pre;
}

.code-compare-empty {
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--compare-panel-strong);
  color: var(--compare-muted);
  font-size: 13px;
  text-align: center;
}

.code-diff-grid {
  min-width: 0;
  border: 1px solid var(--compare-line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--compare-panel-strong);
}

.code-diff-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border-bottom: 1px solid var(--border-faint);
  color: var(--text-secondary);
  font-size: 12px;
}

.code-diff-header span {
  min-width: 0;
  padding: 8px 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-diff-header span + span {
  border-left: 1px solid var(--border-faint);
}

.code-diff-table {
  max-height: 260px;
  overflow: auto;
  background: var(--bg-code);
}

.code-diff-row {
  display: grid;
  grid-template-columns: 48px minmax(320px, 1fr) 48px minmax(320px, 1fr);
  min-width: 760px;
  color: var(--text-code);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.55;
}

.diff-line-no {
  padding: 0 8px;
  border-right: 1px solid var(--border-faint);
  color: var(--text-faint);
  text-align: right;
  user-select: none;
}

.diff-cell {
  min-width: 0;
  padding: 0 10px;
  overflow: visible;
  white-space: pre;
}

.diff-left-cell {
  border-right: 1px solid var(--border-faint);
}

.diff-added .diff-right-cell,
.diff-added .diff-line-no:nth-child(3) {
  background: rgba(34, 197, 94, 0.14);
}

.diff-removed .diff-left-cell,
.diff-removed .diff-line-no:first-child {
  background: rgba(239, 68, 68, 0.14);
}

.diff-same .diff-cell,
.diff-same .diff-line-no {
  background: transparent;
}

@media (max-width: 1180px) {
  .compare-shell {
    overflow: auto;
  }

  .compare-main {
    width: calc(100vw - 28px);
  }

  .compare-main {
    flex: 0 0 auto;
    grid-template-columns: 260px minmax(0, 1fr);
    grid-template-rows: minmax(540px, auto) auto;
    gap: 14px;
    margin: 16px auto 14px;
  }

  .compare-main.history-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .comparison-inspector {
    grid-column: 1 / -1;
  }

  .comparison-sidebar,
  .comparison-workspace {
    min-height: min(640px, calc(100vh - 108px));
  }

  .header-actions {
    padding-right: 0;
  }

  .run-grid {
    grid-template-columns: 1fr;
  }

  .summary-toolbar {
    grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1fr) minmax(220px, 0.8fr);
    align-items: center;
  }

  .summary-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-panel :deep(.comparison-run-card) {
    min-height: 240px;
  }
}

@media (max-width: 820px) {
  .compare-header {
    height: auto;
    min-height: 52px;
    align-items: flex-start;
    flex-direction: column;
    padding: 10px 14px;
  }

  .header-actions {
    width: 100%;
    padding-right: 0;
    justify-content: flex-start;
  }

  .compare-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    margin: 14px auto;
  }

  .compare-main.history-collapsed {
    grid-template-columns: 1fr;
  }

  .comparison-sidebar {
    min-height: 320px;
  }

  .comparison-workspace {
    min-height: 560px;
  }

  .compare-setup {
    padding: 12px 14px;
  }

  .history-mode-banner {
    padding: 10px 14px;
  }

  .history-mode-banner div {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .stats-strip {
    justify-content: flex-start;
    padding: 8px 14px;
  }

  .setup-summary {
    grid-template-columns: 1fr;
  }

  .setup-readonly {
    grid-template-columns: 1fr;
  }

  .setup-readonly > .compare-secondary {
    justify-self: flex-start;
  }

  .setup-models {
    justify-content: flex-start;
  }

  .runtime-grid,
  .runtime-snapshot-grid,
  .run-grid {
    grid-template-columns: 1fr;
  }

  .run-grid {
    padding: 12px 14px;
  }

  .code-compare-panel {
    padding: 12px 14px;
  }

  .compare-actions {
    flex-wrap: wrap;
    justify-content: stretch;
  }

  .code-compare-toolbar,
  .code-compare-selectors,
  .code-compare-grid {
    grid-template-columns: 1fr;
  }

  .code-compare-toolbar {
    display: grid;
  }

  .code-language-select {
    width: 100%;
  }

  .summary-toolbar {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .summary-actions {
    width: 100%;
    grid-template-columns: 1fr;
    justify-content: stretch;
  }

  .summary-select,
  .summary-model {
    width: 100%;
  }

  .compare-primary,
  .compare-secondary {
    flex: 1;
  }
}

@media (max-width: 560px) {
  .compare-main {
    width: calc(100vw - 16px);
  }

  .compare-header {
    padding: 10px 8px;
  }

  .compare-title p {
    white-space: normal;
  }

  .header-actions,
  .compare-actions,
  .summary-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .compare-secondary,
  .compare-primary {
    width: 100%;
    min-width: 0;
  }

  .comparison-sidebar {
    min-height: 280px;
  }

  .comparison-workspace,
  .summary-panel {
    border-radius: 8px;
  }

  .setup-summary-main {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .summary-prompt,
  .model-chip {
    max-width: 100%;
  }

  .runtime-snapshot-card dl {
    grid-template-columns: 1fr;
  }

  .run-grid {
    grid-auto-rows: minmax(280px, auto);
  }

  .summary-panel {
    max-height: 42vh;
    margin-bottom: 12px;
    padding: 12px;
  }

  .summary-panel.empty {
    max-height: none;
  }

  .code-diff-row {
    grid-template-columns: 40px minmax(240px, 1fr) 40px minmax(240px, 1fr);
    min-width: 640px;
  }
}

/* Violet console visual layer */
.compare-shell {
  --compare-bg: var(--bg-canvas);
  --compare-panel: var(--bg-elevated);
  --compare-panel-strong: var(--bg-surface);
  --compare-soft: var(--bg-surface-2);
  --compare-input: var(--bg-input);
  --compare-line: var(--border-subtle);
  --compare-line-strong: var(--border);
  --compare-text: var(--text-primary);
  --compare-muted: var(--text-secondary);
  --compare-faint: var(--text-muted);
  --compare-primary: var(--accent-deep);
  --compare-primary-strong: var(--accent-text);
  --compare-primary-soft: var(--accent-bg);
  --compare-scroll-track: transparent;
  --compare-scroll-thumb: var(--scrollbar-thumb);
  --compare-success-text: var(--success);
  --compare-success-bg: var(--success-bg);
  --compare-success-border: var(--success-border);
  --compare-error-text: var(--danger);
  --compare-error-bg: var(--danger-bg);
  --compare-error-border: var(--danger-border);
  --compare-warning-text: var(--warning);
  --compare-warning-bg: var(--warning-bg);
  --compare-warning-border: var(--warning-border);
  --compare-shadow: var(--shadow-sm);
  overflow: hidden;
  background-color: var(--bg-canvas);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 32px 32px;
  font-family: var(--font-sans);
}

:global([data-theme="light"]) .compare-shell {
  --compare-bg: var(--bg-canvas);
  --compare-panel: var(--bg-elevated);
  --compare-panel-strong: var(--bg-surface);
  --compare-soft: var(--bg-surface-2);
  --compare-input: var(--bg-input);
  --compare-line: var(--border-subtle);
  --compare-line-strong: var(--border);
  --compare-text: var(--text-primary);
  --compare-muted: var(--text-secondary);
  --compare-faint: var(--text-muted);
  --compare-primary: var(--accent-deep);
  --compare-primary-strong: var(--accent-text);
  --compare-primary-soft: var(--accent-bg);
  --compare-scroll-track: transparent;
  --compare-scroll-thumb: var(--scrollbar-thumb);
  --compare-success-text: var(--success);
  --compare-success-bg: var(--success-bg);
  --compare-success-border: var(--success-border);
  --compare-error-text: var(--danger);
  --compare-error-bg: var(--danger-bg);
  --compare-error-border: var(--danger-border);
  --compare-warning-text: var(--warning);
  --compare-warning-bg: var(--warning-bg);
  --compare-warning-border: var(--warning-border);
  --compare-shadow: var(--shadow-sm);
}

.compare-header {
  height: 64px;
  min-height: 64px;
  padding: 0 18px;
  border-bottom-color: var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(14px);
}

.compare-title { gap: 10px; }

.compare-title h1 {
  font-size: 16px;
  font-weight: 650;
}

.compare-title p {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.logo-dot {
  width: 32px;
  height: 32px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  padding: 2px;
  background: var(--accent-bg);
  box-shadow: var(--shadow-accent);
}

.header-actions {
  gap: 6px;
  padding-right: 0;
}

.header-actions .compare-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.compare-main {
  width: min(1500px, calc(100% - 32px));
  grid-template-columns: 276px minmax(0, 1fr) 316px;
  gap: 12px;
  margin: 16px auto;
}

.compare-main.history-collapsed {
  grid-template-columns: minmax(0, 1fr) 316px;
}

.comparison-workspace,
.summary-panel,
.code-compare-panel {
  border-color: var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-sm);
}

.history-mode-banner,
.stats-strip {
  border-bottom-color: var(--border-subtle);
  background: var(--bg-surface-2);
}

.stat-chip,
.model-chip,
.snapshot-status {
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-weight: 500;
}

.compare-setup {
  padding: 16px 18px;
  border-bottom-color: var(--border-subtle);
  background: transparent;
}

.prompt-input,
.field-input,
.summary-select,
.summary-model,
.code-language-select,
.code-block-select {
  border-color: var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: var(--bg-input);
}

.prompt-input:focus,
.field-input:focus,
.summary-select:focus,
.summary-model:focus,
.code-language-select:focus,
.code-block-select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.runtime-editor,
.runtime-snapshot-card {
  border-color: var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
  box-shadow: none;
}

.runtime-editor:nth-child(1),
.runtime-editor:nth-child(2) {
  border-top-color: var(--accent-border);
}

.compare-primary,
.compare-secondary,
.small-btn {
  min-height: 36px;
  border-radius: var(--radius-sm);
}

.compare-primary {
  border: 1px solid var(--accent-border);
  color: #ffffff;
  background: var(--accent-deep);
  box-shadow: 0 0 18px var(--accent-glow);
}

.compare-primary:hover:not(:disabled) {
  background: var(--accent-deeper);
}

.compare-secondary,
.small-btn {
  border-color: var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.compare-secondary:hover:not(:disabled),
.small-btn:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.run-grid {
  gap: 12px;
  padding: 14px 18px 18px;
}

.code-diff-table {
  max-width: 100%;
  overflow-x: auto;
  border-color: var(--border-subtle);
  border-radius: var(--radius-sm);
}

@media (max-width: 1180px) {
  .compare-shell { overflow: hidden; }

  .compare-main {
    width: calc(100% - 24px);
    grid-template-columns: 244px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    margin: 12px auto;
  }

  .compare-main.history-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .comparison-sidebar,
  .comparison-workspace {
    min-height: min(620px, calc(100dvh - 100px));
  }
}

@media (max-width: 820px) {
  .compare-shell { overflow: hidden; }

  .compare-header {
    height: auto;
    min-height: 0;
    gap: 8px;
    padding: 9px 10px 8px;
  }

  .header-actions {
    width: 100%;
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .header-actions .compare-secondary {
    width: auto;
    flex: 0 0 auto;
    min-height: 38px;
  }

  .compare-main,
  .compare-main.history-collapsed {
    width: 100%;
    height: 0;
    min-height: 0;
    flex: 1 1 0;
    margin: 0;
    padding: 10px;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    gap: 10px;
    overflow-y: auto;
  }

  .comparison-sidebar { min-height: 300px; }

  .comparison-workspace {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 560px;
    overflow: visible;
  }

  .comparison-inspector { grid-column: auto; }

  .compare-setup,
  .run-grid,
  .code-compare-panel,
  .summary-panel {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding-right: 12px;
    padding-left: 12px;
  }

  .prompt-panel,
  .prompt-input,
  .runtime-grid,
  .runtime-editor,
  .runtime-snapshot-grid,
  .runtime-snapshot-card,
  .compare-actions,
  .summary-toolbar,
  .summary-actions {
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .runtime-grid,
  .runtime-snapshot-grid,
  .run-grid,
  .code-compare-grid,
  .summary-toolbar,
  .summary-actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .compare-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .compare-primary,
  .compare-secondary,
  .small-btn {
    min-height: 44px;
  }
}

@media (max-width: 560px) {
  .compare-title p { max-width: 240px; }

  .header-actions,
  .compare-actions,
  .summary-actions {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .compare-actions .compare-primary,
  .compare-actions .compare-secondary,
  .summary-actions .compare-primary,
  .summary-actions .compare-secondary {
    width: auto;
    min-width: 118px;
    flex: 0 0 auto;
  }

  .comparison-workspace,
  .summary-panel {
    border-radius: var(--radius-md);
  }

  .runtime-editor,
  .runtime-snapshot-card {
    padding: 12px;
  }

  .code-diff-row {
    grid-template-columns: 38px minmax(220px, 1fr) 38px minmax(220px, 1fr);
    min-width: 560px;
  }
}
</style>
