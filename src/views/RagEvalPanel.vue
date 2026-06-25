<template>
  <section class="rag-eval-shell">
    <div class="rag-eval-sidebar">
      <div class="rag-eval-toolbar">
        <div>
          <span class="rag-eval-eyebrow">Test Set</span>
          <strong>测试集</strong>
        </div>
        <button type="button" class="rag-eval-primary" :disabled="isRunning" @click="addCase">
          添加
        </button>
      </div>

      <div class="rag-eval-import-row">
        <button type="button" class="rag-eval-secondary" :disabled="isRunning" @click="importInputRef?.click()">
          导入 JSON
        </button>
        <button type="button" class="rag-eval-secondary" :disabled="cases.length === 0" @click="exportCases">
          导出测试集
        </button>
        <button type="button" class="rag-eval-secondary" :disabled="!hasCompletedResults" @click="exportReport">
          导出报告
        </button>
        <input ref="importInputRef" type="file" accept="application/json,.json" hidden @change="importCases" />
      </div>

      <div class="rag-eval-case-list">
        <button
          v-for="(item, index) in cases"
          :key="item.id"
          type="button"
          class="rag-eval-case-item"
          :class="{ active: item.id === selectedCaseId, passed: resultMap[item.id]?.passed, failed: resultMap[item.id]?.status === 'failed' || resultMap[item.id]?.status === 'error' }"
          @click="selectedCaseId = item.id"
        >
          <span class="rag-eval-case-index">#{{ index + 1 }}</span>
          <span class="rag-eval-case-main">
            <strong>{{ item.question || '未命名问题' }}</strong>
            <span>{{ describeExpectations(item) }}</span>
          </span>
          <span class="rag-eval-case-state">{{ getCaseStateLabel(item.id) }}</span>
        </button>

        <div v-if="cases.length === 0" class="rag-eval-empty">
          还没有测试用例
        </div>
      </div>
    </div>

    <div class="rag-eval-main">
      <div class="rag-eval-runbar">
        <div>
          <span class="rag-eval-eyebrow">Retrieval Eval</span>
          <strong>{{ isRunning ? `运行中 ${runProgress.done}/${runProgress.total}` : 'RAG 检索评测' }}</strong>
        </div>
        <div class="rag-eval-run-actions">
          <button type="button" class="rag-eval-secondary" :disabled="isRunning || !selectedCase" @click="runSelected">
            运行当前
          </button>
          <button type="button" class="rag-eval-primary" :disabled="isRunning || runnableCases.length === 0" @click="runAll">
            {{ isRunning ? '运行中...' : '运行全部' }}
          </button>
        </div>
      </div>

      <div class="rag-eval-summary">
        <div>
          <span>总数</span>
          <strong>{{ summary.total }}</strong>
        </div>
        <div>
          <span>通过率</span>
          <strong>{{ formatPercent(summary.passRate) }}</strong>
        </div>
        <div>
          <span>Top1 命中</span>
          <strong>{{ formatPercent(summary.top1HitRate) }}</strong>
        </div>
        <div>
          <span>TopK 命中</span>
          <strong>{{ formatPercent(summary.topKHitRate) }}</strong>
        </div>
        <div>
          <span>平均最高分</span>
          <strong>{{ formatOptionalScore(summary.averageBestScore) }}</strong>
        </div>
        <div>
          <span>平均排名</span>
          <strong>{{ formatOptionalScore(summary.averageExpectedRank) }}</strong>
        </div>
        <div>
          <span>无结果</span>
          <strong>{{ summary.noResultCount }}</strong>
        </div>
        <div>
          <span>低分</span>
          <strong>{{ summary.lowScoreCount }}</strong>
        </div>
      </div>

      <div class="rag-eval-workspace">
        <form v-if="selectedCase" class="rag-eval-editor" @submit.prevent>
          <div class="rag-eval-editor-header">
            <div>
              <span class="rag-eval-eyebrow">Case</span>
              <strong>用例编辑</strong>
            </div>
            <button type="button" class="rag-eval-danger" :disabled="isRunning" @click="removeSelectedCase">
              删除
            </button>
          </div>

          <label>
            <span>问题</span>
            <textarea v-model="selectedCase.question" rows="3" placeholder="输入要检索的问题"></textarea>
          </label>

          <div class="rag-eval-two-cols">
            <label>
              <span>期望文件</span>
              <textarea v-model="expectedFilesText" rows="3" placeholder="每行一个文件名，支持包含匹配"></textarea>
            </label>
            <label>
              <span>期望关键词</span>
              <textarea v-model="expectedKeywordsText" rows="3" placeholder="每行一个关键词"></textarea>
            </label>
          </div>

          <div class="rag-eval-controls">
            <label>
              <span>匹配模式</span>
              <select v-model="selectedCase.matchMode">
                <option value="auto">auto</option>
                <option value="any">any</option>
                <option value="all">all</option>
                <option value="file">file</option>
                <option value="keyword">keyword</option>
              </select>
            </label>
            <label>
              <span>Top K</span>
              <input v-model.number="selectedCase.topK" type="number" min="1" max="20" />
            </label>
            <label>
              <span>Min Score</span>
              <input v-model.number="selectedCase.minScore" type="number" min="0" max="1" step="0.05" />
            </label>
          </div>

          <label class="rag-eval-checkbox">
            <input v-model="selectedCase.expectedNoResults" type="checkbox" />
            <span>期望无检索结果</span>
          </label>

          <label>
            <span>备注</span>
            <input v-model="selectedCase.notes" type="text" placeholder="可选，用来说明这个用例验证什么" />
          </label>
        </form>

        <div v-else class="rag-eval-editor rag-eval-empty-state">
          选择或添加一个测试用例
        </div>

        <section class="rag-eval-results">
          <div class="rag-eval-results-header">
            <div>
              <span class="rag-eval-eyebrow">Result</span>
              <strong>运行结果</strong>
            </div>
            <span v-if="selectedResult" class="rag-eval-result-badge" :class="selectedResult.status">
              {{ selectedResult.passed ? '通过' : selectedResult.status === 'error' ? '错误' : '未通过' }}
            </span>
          </div>

          <template v-if="selectedResult">
            <div v-if="selectedResult.failureReason" class="rag-eval-failure">
              {{ selectedResult.failureReason }}
            </div>

            <div class="rag-eval-result-stats">
              <span>Top1 {{ selectedResult.top1Hit ? '命中' : '未命中' }}</span>
              <span>TopK {{ selectedResult.topKHit ? '命中' : '未命中' }}</span>
              <span>最高分 {{ formatOptionalScore(selectedResult.bestScore) }}</span>
              <span>期望排名 {{ selectedResult.expectedRank ?? '-' }}</span>
            </div>

            <div class="rag-eval-hit-list">
              <article
                v-for="hit in selectedResult.results"
                :key="hit.result.id"
                class="rag-eval-hit"
                :class="{ matched: hit.passed }"
              >
                <header>
                  <strong>#{{ hit.rank }} {{ hit.result.filename }}</strong>
                  <span>{{ formatScore(hit.result.score) }}</span>
                </header>
                <div class="rag-eval-score-row">
                  <span>vector {{ formatScore(hit.result.vectorScore) }}</span>
                  <span>keyword {{ formatScore(hit.result.keywordScore) }}</span>
                  <span>chunk #{{ hit.result.chunkIndex }}</span>
                  <span>{{ hit.fileMatched ? '文件命中' : '文件未命中' }}</span>
                  <span>{{ hit.keywordMatched ? '关键词命中' : '关键词未命中' }}</span>
                </div>
                <p>{{ hit.result.text }}</p>
              </article>

              <div v-if="selectedResult.results.length === 0" class="rag-eval-empty">
                没有检索结果
              </div>
            </div>
          </template>

          <div v-else class="rag-eval-empty-state">
            运行评测后查看命中 chunk、分数和失败原因
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useToast } from '../composables/useToast'
import { searchKnowledge } from '../services/knowledge'
import {
  buildRagEvalReport,
  createErrorRunResult,
  createRagEvalCase,
  DEFAULT_RAG_EVAL_MIN_SCORE,
  DEFAULT_RAG_EVAL_TOP_K,
  evaluateRagSearchResults,
  normalizeMinScore,
  normalizeRagEvalCases,
  normalizeTopK,
  RAG_EVAL_STORAGE_KEY,
  serializeRagEvalCases,
  splitList,
  summarizeRagEvalResults,
  type RagEvalCase,
  type RagEvalRunResult,
} from '../services/ragEval'

const toast = useToast()
const cases = ref<RagEvalCase[]>([])
const selectedCaseId = ref('')
const resultMap = ref<Record<string, RagEvalRunResult | undefined>>({})
const importInputRef = ref<HTMLInputElement | null>(null)
const isRunning = ref(false)
const runProgress = ref({ done: 0, total: 0 })

const selectedCase = computed(() => cases.value.find(item => item.id === selectedCaseId.value))
const selectedResult = computed(() => selectedCase.value ? resultMap.value[selectedCase.value.id] : undefined)
const runnableCases = computed(() => cases.value.filter(item => item.question.trim()))
const hasCompletedResults = computed(() =>
  Object.values(resultMap.value).some(result => result && result.status !== 'idle' && result.status !== 'running')
)
const summary = computed(() => summarizeRagEvalResults(cases.value, resultMap.value))
const expectedFilesText = computed({
  get: () => selectedCase.value?.expectedFiles.join('\n') ?? '',
  set: value => {
    if (selectedCase.value) selectedCase.value.expectedFiles = splitList(value)
  },
})
const expectedKeywordsText = computed({
  get: () => selectedCase.value?.expectedKeywords.join('\n') ?? '',
  set: value => {
    if (selectedCase.value) selectedCase.value.expectedKeywords = splitList(value)
  },
})

onMounted(() => {
  cases.value = loadStoredCases()
  if (cases.value.length === 0) cases.value = [createRagEvalCase()]
  selectedCaseId.value = cases.value[0]?.id ?? ''
})

watch(cases, saveCases, { deep: true })

function addCase() {
  const testCase = createRagEvalCase()
  cases.value.push(testCase)
  selectedCaseId.value = testCase.id
}

function removeSelectedCase() {
  const current = selectedCase.value
  if (!current) return
  const index = cases.value.findIndex(item => item.id === current.id)
  cases.value = cases.value.filter(item => item.id !== current.id)
  const { [current.id]: removed, ...rest } = resultMap.value
  void removed
  resultMap.value = rest
  selectedCaseId.value = cases.value[Math.max(0, index - 1)]?.id ?? cases.value[0]?.id ?? ''
}

async function runSelected() {
  const current = selectedCase.value
  if (!current) return
  await runCases([current])
}

async function runAll() {
  await runCases(runnableCases.value)
}

async function runCases(targetCases: RagEvalCase[]) {
  if (targetCases.length === 0 || isRunning.value) return
  isRunning.value = true
  runProgress.value = { done: 0, total: targetCases.length }
  try {
    for (const testCase of targetCases) {
      resultMap.value = {
        ...resultMap.value,
        [testCase.id]: {
          caseId: testCase.id,
          status: 'running',
          passed: false,
          top1Hit: false,
          topKHit: false,
          failureReason: '',
          results: [],
        },
      }
      const startedAt = performance.now()
      try {
        const results = await searchKnowledge({
          q: testCase.question.trim(),
          topK: normalizeTopK(testCase.topK ?? DEFAULT_RAG_EVAL_TOP_K),
          minScore: normalizeMinScore(testCase.minScore ?? DEFAULT_RAG_EVAL_MIN_SCORE),
          fileId: testCase.fileId,
        })
        const evaluated = evaluateRagSearchResults(testCase, results)
        evaluated.durationMs = Math.round(performance.now() - startedAt)
        resultMap.value = { ...resultMap.value, [testCase.id]: evaluated }
      } catch (error) {
        resultMap.value = { ...resultMap.value, [testCase.id]: createErrorRunResult(testCase, error) }
      } finally {
        runProgress.value = { ...runProgress.value, done: runProgress.value.done + 1 }
      }
    }
  } finally {
    isRunning.value = false
  }
}

async function importCases(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const importedCases = normalizeRagEvalCases(JSON.parse(text))
    cases.value = importedCases
    selectedCaseId.value = importedCases[0]?.id ?? ''
    resultMap.value = {}
    toast.show(`已导入 ${importedCases.length} 条测试用例`, 'success')
  } catch (error) {
    toast.show(error instanceof Error ? error.message : '导入失败', 'error')
  }
}

function exportCases() {
  downloadTextFile(`rag-eval-cases-${formatDateForFilename()}.json`, serializeRagEvalCases(cases.value), 'application/json;charset=utf-8')
}

function exportReport() {
  downloadTextFile(`rag-eval-report-${formatDateForFilename()}.json`, buildRagEvalReport(cases.value, resultMap.value), 'application/json;charset=utf-8')
}

function describeExpectations(testCase: RagEvalCase): string {
  if (testCase.expectedNoResults) return `期望无结果 · ${testCase.matchMode}`
  const files = testCase.expectedFiles.length
  const keywords = testCase.expectedKeywords.length
  if (files === 0 && keywords === 0) return '未设置期望'
  return `${files} 文件 · ${keywords} 关键词 · ${testCase.matchMode}`
}

function getCaseStateLabel(caseId: string): string {
  const result = resultMap.value[caseId]
  if (!result) return '未运行'
  if (result.status === 'running') return '运行中'
  if (result.status === 'error') return '错误'
  return result.passed ? '通过' : '失败'
}

function loadStoredCases(): RagEvalCase[] {
  try {
    const raw = localStorage.getItem(RAG_EVAL_STORAGE_KEY)
    if (!raw) return []
    return normalizeRagEvalCases(JSON.parse(raw))
  } catch {
    return []
  }
}

function saveCases() {
  try {
    localStorage.setItem(RAG_EVAL_STORAGE_KEY, serializeRagEvalCases(cases.value))
  } catch {
    // Ignore localStorage failures; editing should continue to work.
  }
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
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

function formatDateForFilename(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatScore(value: number): string {
  return value.toFixed(3)
}

function formatOptionalScore(value: number | undefined): string {
  return value === undefined ? '-' : formatScore(value)
}
</script>

<style scoped>
.rag-eval-shell {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 1px;
  background: var(--border-subtle);
}

.rag-eval-sidebar,
.rag-eval-main,
.rag-eval-editor,
.rag-eval-results {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: rgba(7, 7, 15, 0.42);
  backdrop-filter: blur(18px);
}

[data-theme="light"] .rag-eval-sidebar,
[data-theme="light"] .rag-eval-main,
[data-theme="light"] .rag-eval-editor,
[data-theme="light"] .rag-eval-results {
  background: rgba(255, 255, 255, 0.78);
}

.rag-eval-toolbar,
.rag-eval-runbar,
.rag-eval-editor-header,
.rag-eval-results-header,
.rag-eval-import-row,
.rag-eval-run-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rag-eval-toolbar,
.rag-eval-runbar {
  min-height: 62px;
  padding: 0 18px;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
}

.rag-eval-eyebrow {
  display: block;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.rag-eval-toolbar strong,
.rag-eval-runbar strong,
.rag-eval-editor-header strong,
.rag-eval-results-header strong {
  display: block;
  font-size: 14px;
}

.rag-eval-primary,
.rag-eval-secondary,
.rag-eval-danger {
  height: 34px;
  border-radius: 8px;
  padding: 0 14px;
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  cursor: pointer;
  white-space: nowrap;
}

.rag-eval-primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #0891b2, #059669);
}

.rag-eval-danger {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(239, 68, 68, 0.10);
}

.rag-eval-primary:disabled,
.rag-eval-secondary:disabled,
.rag-eval-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rag-eval-import-row {
  flex-wrap: wrap;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.rag-eval-case-list {
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}

.rag-eval-case-item {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 11px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.rag-eval-case-item:hover {
  background: var(--bg-surface-2);
}

.rag-eval-case-item.active {
  border-color: rgba(20, 184, 166, 0.32);
  background: rgba(20, 184, 166, 0.12);
}

.rag-eval-case-item.passed {
  border-color: rgba(34, 197, 94, 0.24);
}

.rag-eval-case-item.failed {
  border-color: rgba(248, 113, 113, 0.28);
}

.rag-eval-case-index,
.rag-eval-case-state {
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-case-main {
  min-width: 0;
}

.rag-eval-case-main strong,
.rag-eval-case-main span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rag-eval-case-main strong {
  font-size: 13px;
}

.rag-eval-case-main span {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-main {
  overflow: hidden;
}

.rag-eval-summary {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 1px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--border-subtle);
}

.rag-eval-summary div {
  min-width: 0;
  padding: 12px 14px;
  background: var(--bg-surface-3);
}

.rag-eval-summary span {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-summary strong {
  display: block;
  margin-top: 4px;
  font-size: 15px;
}

.rag-eval-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(0, 1.1fr);
  gap: 1px;
  background: var(--border-subtle);
}

.rag-eval-editor,
.rag-eval-results {
  overflow-y: auto;
  padding: 16px;
}

.rag-eval-editor-header,
.rag-eval-results-header {
  justify-content: space-between;
  margin-bottom: 14px;
}

.rag-eval-editor label {
  display: block;
  margin-bottom: 13px;
}

.rag-eval-editor label > span,
.rag-eval-controls label > span {
  display: block;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-editor input,
.rag-eval-editor textarea,
.rag-eval-editor select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 10px 11px;
  outline: none;
  color: var(--text-primary);
  background: var(--bg-surface-2);
  font: inherit;
  font-size: 13px;
}

.rag-eval-editor .rag-eval-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rag-eval-editor .rag-eval-checkbox input {
  width: auto;
}

.rag-eval-editor .rag-eval-checkbox > span {
  margin: 0;
}

.rag-eval-editor textarea {
  resize: vertical;
  line-height: 1.55;
}

.rag-eval-two-cols,
.rag-eval-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.rag-eval-controls {
  grid-template-columns: 1.2fr 0.8fr 0.8fr;
}

.rag-eval-result-badge {
  border-radius: 999px;
  padding: 3px 9px;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  font-size: 11px;
  font-weight: 700;
}

.rag-eval-result-badge.passed {
  color: #86efac;
  background: rgba(34, 197, 94, 0.12);
}

.rag-eval-result-badge.failed,
.rag-eval-result-badge.error {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
}

.rag-eval-failure {
  margin-bottom: 12px;
  border: 1px solid rgba(248, 113, 113, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.08);
  font-size: 12px;
}

.rag-eval-result-stats,
.rag-eval-score-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-result-stats {
  margin-bottom: 12px;
}

.rag-eval-hit-list {
  min-height: 0;
}

.rag-eval-hit {
  margin-bottom: 10px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface-2);
}

.rag-eval-hit.matched {
  border-color: rgba(34, 197, 94, 0.28);
}

.rag-eval-hit header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rag-eval-hit header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.rag-eval-hit header span {
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-score-row {
  margin-top: 7px;
}

.rag-eval-hit p {
  margin-top: 9px;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.rag-eval-empty,
.rag-eval-empty-state {
  padding: 24px 12px;
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}

.rag-eval-empty-state {
  justify-content: center;
}

@media (max-width: 1180px) {
  .rag-eval-shell,
  .rag-eval-workspace {
    grid-template-columns: 1fr;
  }

  .rag-eval-sidebar {
    min-height: 300px;
  }

  .rag-eval-summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .rag-eval-toolbar,
  .rag-eval-runbar {
    align-items: flex-start;
    flex-direction: column;
    padding: 12px 14px;
  }

  .rag-eval-run-actions,
  .rag-eval-import-row {
    width: 100%;
  }

  .rag-eval-primary,
  .rag-eval-secondary {
    flex: 1;
  }

  .rag-eval-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rag-eval-two-cols,
  .rag-eval-controls {
    grid-template-columns: 1fr;
  }
}
</style>
