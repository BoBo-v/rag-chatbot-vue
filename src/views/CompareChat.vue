<template>
  <div class="compare-shell">
    <header class="compare-header">
      <div class="compare-title">
        <span class="logo-dot"></span>
        <div>
          <h1>多模型对比</h1>
          <p>{{ headerHint }}</p>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="compare-secondary" @click="toggleHistory">
          历史记录
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="isRunning"
          @click="newComparison"
        >
          新对比
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="!currentSession"
          @click="exportMarkdown"
        >
          导出 MD
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="!currentSession"
          @click="exportJson"
        >
          导出 JSON
        </button>
        <button
          type="button"
          class="compare-secondary"
          :disabled="!isRunning"
          @click="stopAll"
        >
          停止全部
        </button>
      </div>
    </header>

    <main class="compare-main" :class="{ 'has-summary': Boolean(summaryRun) }">
      <section v-if="isHistorySession" class="history-mode-banner">
        <div>
          <strong>历史查看模式</strong>
          <span>已恢复的记录不包含 API Key，适合查看和导出；需要重新请求请新建对比。</span>
        </div>
      </section>

      <section v-if="historyOpen" class="history-panel">
        <div class="history-toolbar">
          <div>
            <h2>历史对比</h2>
            <p>{{ history.length ? `共 ${history.length} 条本地记录` : '暂无已保存记录' }}</p>
          </div>
          <button type="button" class="compare-secondary" @click="refreshHistory">
            刷新
          </button>
        </div>
        <div v-if="history.length" class="history-list">
          <article
            v-for="item in history"
            :key="item.id"
            class="history-item"
            :class="{ active: comparison.session.value?.id === item.id }"
          >
            <button type="button" class="history-open" @click="openHistory(item.id)">
              <span class="history-prompt">{{ item.prompt }}</span>
              <span class="history-meta">
                {{ formatDate(item.updatedAt) }} · {{ item.runCount }} 个结果
              </span>
            </button>
            <button type="button" class="small-btn danger" @click="deleteHistory(item.id)">
              删除
            </button>
          </article>
        </div>
      </section>

      <section class="compare-setup" :class="{ collapsed: isConfigCollapsed }">
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
          <div class="prompt-panel">
            <label class="field-label" for="comparison-prompt">问题</label>
            <textarea
              id="comparison-prompt"
              v-model="prompt"
              class="prompt-input"
              :disabled="isRunning"
              placeholder="输入要让多个模型同时回答的问题"
            ></textarea>
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
            <button type="button" class="compare-secondary" :disabled="isRunning" @click="resetAllRuntimes">
              重置模型
            </button>
            <button v-if="runs.length > 0" type="button" class="compare-secondary" :disabled="isRunning" @click="configOpen = false">
              收起配置
            </button>
          </div>
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ComparisonRunCard from '../components/ComparisonRunCard.vue'
import { useModelComparison } from '../composables/useModelComparison'
import {
  buildComparisonExportFilename,
  exportComparisonAsJson,
  exportComparisonAsMarkdown,
} from '../services/comparisonExport'
import { createRuntimeFromSettings } from '../services/runtime'
import { settings } from '../stores/settings'
import type { ModelRuntimeConfig } from '../types/model'

const prompt = ref('')
const configOpen = ref(true)
const summaryInstruction = ref('')
const historyOpen = ref(false)
const isHistorySession = ref(false)
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
const isConfigCollapsed = computed(() => !configOpen.value && runs.value.length > 0)
const headerHint = computed(() => {
  if (isRunning.value) return '模型正在并发生成'
  if (isHistorySession.value) return '正在查看已保存的本地记录'
  return '已完成记录会保存到本地'
})
const canStart = computed(() =>
  !isRunning.value &&
  prompt.value.trim().length > 0 &&
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

onMounted(() => {
  void refreshHistory()
})

function cloneRuntime(runtime: ModelRuntimeConfig): ModelRuntimeConfig {
  return {
    provider: runtime.provider,
    label: runtime.label,
    model: runtime.model,
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    systemPrompt: runtime.systemPrompt,
    maxContextTokens: runtime.maxContextTokens,
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

async function start(): Promise<void> {
  if (!canStart.value) return
  isHistorySession.value = false
  const runtimes = runtimeDrafts.map(runtime => {
    normalizeRuntime(runtime)
    return cloneRuntime(runtime)
  })
  configOpen.value = false
  await startComparison({ prompt: prompt.value.trim(), runtimes })
}

function toggleHistory(): void {
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) {
    void refreshHistory()
  }
}

function newComparison(): void {
  clearSession()
  prompt.value = ''
  summaryInstruction.value = ''
  configOpen.value = true
  isHistorySession.value = false
}

async function openHistory(sessionId: string): Promise<void> {
  await loadSession(sessionId)
  isHistorySession.value = true
  historyOpen.value = false
}

async function deleteHistory(sessionId: string): Promise<void> {
  const deletingCurrentSession = currentSession.value?.id === sessionId
  await removeSession(sessionId)
  if (deletingCurrentSession) {
    isHistorySession.value = false
  }
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
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
  downloadTextFile(
    buildComparisonExportFilename(session, 'md'),
    exportComparisonAsMarkdown(session),
    'text/markdown;charset=utf-8'
  )
}

function exportJson(): void {
  const session = currentSession.value
  if (!session) return
  downloadTextFile(
    buildComparisonExportFilename(session, 'json'),
    exportComparisonAsJson(session),
    'application/json;charset=utf-8'
  )
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
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.compare-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(24px);
}

.compare-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.compare-title h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 17px;
  line-height: 1.3;
  letter-spacing: 0;
}

.compare-title p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.logo-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 14px var(--accent);
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.compare-main {
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
}

.history-mode-banner {
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--accent-bg);
}

.history-mode-banner div {
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.history-mode-banner strong {
  color: var(--accent-text);
  font-size: 12px;
  flex-shrink: 0;
}

.history-panel {
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
}

.history-toolbar {
  max-width: 1180px;
  margin: 0 auto 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.history-toolbar h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.35;
  letter-spacing: 0;
}

.history-toolbar p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.history-list {
  max-width: 1180px;
  max-height: 220px;
  margin: 0 auto;
  overflow: auto;
  display: grid;
  gap: 8px;
}

.history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg-surface-2);
}

.history-item.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.history-open {
  min-width: 0;
  border: 0;
  padding: 0;
  text-align: left;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.history-prompt,
.history-meta {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-prompt {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
}

.history-meta {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 12px;
}

.small-btn.danger {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.10);
}

.compare-setup {
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
}

.compare-setup.collapsed {
  padding: 8px 24px;
}

.setup-summary {
  max-width: 1180px;
  margin: 0 auto;
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

.summary-label {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.summary-prompt {
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  overflow: hidden;
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
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 3px 8px;
  background: var(--bg-surface-2);
  color: var(--text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-panel {
  max-width: 1180px;
  margin: 0 auto 12px;
}

.field-label {
  display: block;
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.prompt-input,
.field-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--settings-input-bg);
  color: var(--text-primary);
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
  background-color: var(--settings-input-bg);
  background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
    linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
  background-position: calc(100% - 17px) 14px, calc(100% - 11px) 14px;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-right: 34px;
}

select.field-input option {
  background: var(--settings-select-bg);
  color: var(--text-primary);
}

.prompt-input {
  min-height: 76px;
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
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.runtime-grid {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.runtime-editor {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 10px;
  background: var(--bg-surface-2);
}

.runtime-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.compare-actions {
  max-width: 1180px;
  margin: 12px auto 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.compare-primary,
.compare-secondary,
.small-btn {
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
}

.compare-primary {
  height: 34px;
  padding: 0 16px;
  border-color: var(--accent-border);
  color: #fff;
  background: linear-gradient(135deg, var(--accent-deep), var(--accent-deeper));
}

.compare-secondary,
.small-btn {
  height: 32px;
  padding: 0 12px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
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
  padding: 14px 24px 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(320px, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 14px;
}

.summary-panel {
  max-height: 34vh;
  min-height: 74px;
  overflow: auto;
  padding: 10px 24px 14px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
}

.summary-panel.empty {
  max-height: 148px;
}

.summary-toolbar {
  display: grid;
  grid-template-columns: minmax(150px, 0.9fr) minmax(240px, 1.3fr) minmax(300px, 1.7fr);
  align-items: start;
  gap: 16px;
  max-width: 1180px;
  margin: 0 auto 10px;
}

.summary-copy {
  min-width: 0;
}

.summary-toolbar h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.35;
  letter-spacing: 0;
}

.summary-toolbar p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.summary-instruction {
  width: 100%;
  min-height: 34px;
  max-height: 72px;
  box-sizing: border-box;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px 10px;
  resize: vertical;
  background: var(--settings-input-bg);
  color: var(--text-primary);
  outline: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}

.summary-instruction:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.summary-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.summary-select,
.summary-model {
  width: 150px;
  margin-bottom: 0;
}

.summary-panel :deep(.comparison-run-card) {
  max-width: 1180px;
  min-height: 220px;
  margin: 0 auto;
}

.run-grid.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.compare-empty {
  color: var(--text-faint);
  font-size: 14px;
}

@media (max-width: 860px) {
  .compare-header {
    height: auto;
    min-height: 52px;
    padding: 10px 14px;
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

  .history-panel {
    padding: 12px 14px;
  }

  .setup-summary {
    grid-template-columns: 1fr;
  }

  .setup-models {
    justify-content: flex-start;
  }

  .runtime-grid,
  .run-grid {
    grid-template-columns: 1fr;
  }

  .run-grid {
    padding: 12px 14px;
  }

  .compare-actions {
    justify-content: stretch;
  }

  .summary-toolbar {
    grid-template-columns: 1fr;
  }

  .summary-actions {
    width: 100%;
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
</style>
