<template>
  <section class="rag-eval-shell">
    <!-- 左侧测试集与难例管理面板 -->
    <div class="rag-eval-sidebar">
      <div class="rag-eval-toolbar">
        <div>
          <span class="rag-eval-eyebrow">Benchmark Suite</span>
          <strong>评测用例集</strong>
        </div>
        <div class="rag-eval-suite-actions">
          <button type="button" class="rag-eval-primary" :disabled="isRunning || isGenerating" @click="addCase" title="添加空白测试用例">
            <Plus :size="14" aria-hidden="true" />
            添加
          </button>
        </div>
      </div>

      <!-- 知识库出题源文件选择 -->
      <div class="rag-eval-source-row">
        <div class="source-label font-mono">
          <span>出题源:</span>
          <UiSelect
            v-model="selectedSourceFileId"
            :options="sourceFileOptions"
            header-text="指定自动出题依据文档"
            root-class="rag-eval-source-ui-select"
          />
        </div>
      </div>

      <div class="rag-eval-import-row">
        <!-- AI 自动化出题与线上难例拉取 -->
        <button
          type="button"
          class="rag-eval-secondary rag-eval-highlight-btn"
          :disabled="isRunning || isGenerating"
          @click="generateCases"
          title="从知识库切片逆向合成单跳、口语化与未收录越界测试用例"
        >
          <Sparkles :size="14" class="text-cyan-400" aria-hidden="true" />
          {{ isGenerating ? 'AI 出题中...' : '自动出题' }}
        </button>
        <button
          type="button"
          class="rag-eval-secondary"
          :disabled="isRunning || isSampling"
          @click="sampleLogs"
          title="从生产观测数据库中抽取低分或高延迟线上难例"
        >
          <History :size="14" aria-hidden="true" />
          {{ isSampling ? '采样中...' : '线上难例' }}
        </button>
        <button type="button" class="rag-eval-secondary" :disabled="isRunning" @click="importInputRef?.click()">
          <Upload :size="14" aria-hidden="true" />
          导入
        </button>
        <button type="button" class="rag-eval-secondary" :disabled="cases.length === 0" @click="exportCases">
          <Download :size="14" aria-hidden="true" />
          导出
        </button>
        <button type="button" class="rag-eval-secondary" :disabled="!hasCompletedResults" @click="exportReport">
          <FileDown :size="14" aria-hidden="true" />
          导出结果
        </button>
        <input ref="importInputRef" type="file" accept="application/json,.json" hidden @change="importCases" />
      </div>

      <!-- 用例列表 -->
      <div class="rag-eval-case-list">
        <button
          v-for="(item, index) in cases"
          :key="item.id"
          type="button"
          class="rag-eval-case-item"
          :class="{
            active: item.id === selectedCaseId,
            passed: resultMap[item.id]?.passed,
            failed: resultMap[item.id]?.status === 'failed' || resultMap[item.id]?.status === 'error'
          }"
          @click="selectedCaseId = item.id"
        >
          <span class="rag-eval-case-index">#{{ index + 1 }}</span>
          <span class="rag-eval-case-main">
            <div class="rag-eval-case-title-row">
              <span v-if="item.category" class="rag-eval-cat-pill" :class="getCategoryClass(item.category)">
                {{ getCategoryLabel(item.category) }}
              </span>
              <strong>{{ item.name || item.question || '未命名用例' }}</strong>
            </div>
            <span class="rag-eval-case-subtext">{{ item.question }}</span>
          </span>
          <span class="rag-eval-case-state" :class="getCaseStateClass(item.id)">
            {{ getCaseStateLabel(item.id) }}
          </span>
        </button>

        <div v-if="cases.length === 0" class="rag-eval-empty">
          暂无评测用例，可点击顶部【自动出题】或【添加】快速构建
        </div>
      </div>
    </div>

    <!-- 右侧主体工作区 -->
    <div class="rag-eval-main">
      <!-- 顶部控制与全量执行栏 -->
      <div class="rag-eval-runbar">
        <div>
          <span class="rag-eval-eyebrow">Reliability & Hallucination Benchmark</span>
          <strong>{{ isRunning ? `评测运行中 (${runProgress.done}/${runProgress.total})` : 'RAG 可靠性评测与幻觉检测' }}</strong>
        </div>
        <div class="rag-eval-run-actions">
          <button
            type="button"
            class="rag-eval-secondary"
            :disabled="isRunning || !selectedCase"
            @click="runSelectedLocal"
            title="仅在当前前端对选中用例进行基础向量检索比对"
          >
            <Play :size="13" aria-hidden="true" />
            检索当前
          </button>
          <button
            type="button"
            class="rag-eval-secondary"
            :disabled="isRunning || runnableCases.length === 0"
            @click="runAllLocal"
            title="仅运行基础向量检索命中测试"
          >
            <Play :size="13" aria-hidden="true" />
            检索全部
          </button>
          <!-- 深度端到端评测主按钮 -->
          <button
            type="button"
            class="rag-eval-primary rag-eval-e2e-btn"
            :disabled="isRunning || runnableCases.length === 0"
            @click="runAllE2E"
            title="执行全链路端到端评测：检索召回 + 模型回答生成 + 事实蕴含幻觉检测 + 契约合规检查"
          >
            <Zap :size="14" aria-hidden="true" />
            {{ isRunning ? '端到端评测中...' : '🚀 执行端到端评测' }}
          </button>
          <button
            type="button"
            class="rag-eval-secondary"
            :disabled="isRunning"
            @click="openReportModal"
            title="查看全盘 Markdown 可靠性评测诊断报告"
          >
            <FileText :size="13" aria-hidden="true" />
            诊断报告
          </button>
        </div>
      </div>

      <!-- 核心可靠性度量大盘 (Summary Dashboard) -->
      <div class="rag-eval-summary">
        <div class="summary-card">
          <span>用例总数</span>
          <strong>{{ summary.total }}</strong>
        </div>
        <div class="summary-card">
          <span>综合通过率</span>
          <strong :class="{ 'rate-high': summary.passRate >= 0.8, 'rate-mid': summary.passRate >= 0.5 && summary.passRate < 0.8, 'rate-low': summary.passRate < 0.5 }">
            {{ formatPercent(summary.passRate) }}
          </strong>
        </div>
        <div class="summary-card">
          <span>检索命中率 (Hit@K)</span>
          <strong :class="{ 'rate-high': summary.topKHitRate >= 0.9, 'rate-mid': summary.topKHitRate >= 0.7, 'rate-low': summary.topKHitRate < 0.7 }">
            {{ formatPercent(summary.topKHitRate) }}
          </strong>
        </div>
        <div class="summary-card">
          <span>倒数排位 (MRR)</span>
          <strong>{{ summary.averageMrr ? summary.averageMrr.toFixed(3) : (summary.averageExpectedRank ? (1 / summary.averageExpectedRank).toFixed(3) : '-') }}</strong>
        </div>
        <div class="summary-card highlight-metric">
          <span>真实忠实度 (无幻觉)</span>
          <strong
            v-if="summary.averageFaithfulness !== undefined"
            :class="{ 'rate-high': summary.averageFaithfulness >= 0.85, 'rate-mid': summary.averageFaithfulness >= 0.70, 'rate-low': summary.averageFaithfulness < 0.70 }"
          >
            {{ formatPercent(summary.averageFaithfulness) }}
          </strong>
          <span v-else class="text-xs text-muted-foreground">需端到端评测</span>
        </div>
        <div class="summary-card highlight-metric">
          <span>契约与转二线合规</span>
          <strong
            v-if="summary.policyComplianceRate !== undefined"
            :class="{ 'rate-high': summary.policyComplianceRate >= 0.95, 'rate-mid': summary.policyComplianceRate >= 0.80, 'rate-low': summary.policyComplianceRate < 0.80 }"
          >
            {{ formatPercent(summary.policyComplianceRate) }}
          </strong>
          <span v-else class="text-xs text-muted-foreground">需端到端评测</span>
        </div>
        <div class="summary-card">
          <span>越界拒答率</span>
          <strong>{{ formatPercent(summary.negativeRejectionRate) }}</strong>
        </div>
        <div class="summary-card">
          <span>平均检索延迟</span>
          <strong>{{ averageLatencyText }}</strong>
        </div>
      </div>

      <!-- 下半部分：用例编辑表单 vs 结果呈现面板 -->
      <div class="rag-eval-workspace">
        <!-- 用例编辑表单 -->
        <form v-if="selectedCase" class="rag-eval-editor" @submit.prevent>
          <div class="rag-eval-editor-header">
            <div>
              <span class="rag-eval-eyebrow">Case Editor</span>
              <strong>用例详情与期望标准</strong>
            </div>
            <button type="button" class="rag-eval-danger" :disabled="isRunning" @click="removeSelectedCase">
              删除用例
            </button>
          </div>

          <div class="rag-eval-two-cols">
            <label>
              <span>用例名称</span>
              <input v-model="selectedCase.name" type="text" placeholder="如：Vite 代理重写测试" />
            </label>
            <label>
              <span>用例分类</span>
              <UiSelect
                v-model="selectedCase.category"
                :options="categoryOptions"
                header-text="选择用例分类"
                root-class="rag-eval-form-ui-select"
              />
            </label>
          </div>

          <label>
            <span>评测提问 (Query)</span>
            <textarea v-model="selectedCase.question" rows="3" placeholder="输入用户的实际提问或工单内容"></textarea>
          </label>

          <div class="rag-eval-two-cols">
            <label>
              <span>期望支撑文件 (Target Files)</span>
              <textarea v-model="expectedFilesText" rows="3" placeholder="每行一个目标支撑文档文件名，支持模糊包含"></textarea>
            </label>
            <label>
              <span>期望关键词 (Keywords)</span>
              <textarea v-model="expectedKeywordsText" rows="3" placeholder="每行一个关键术语或参数名"></textarea>
            </label>
          </div>

          <div class="rag-eval-controls">
            <label>
              <span>场景规范</span>
              <UiSelect
                v-model="selectedCase.scenario"
                :options="scenarioOptions"
                header-text="业务场景"
                root-class="rag-eval-form-ui-select"
              />
            </label>
            <label>
              <span>匹配模式</span>
              <UiSelect
                v-model="selectedCase.matchMode"
                :options="matchModeOptions"
                header-text="检索匹配模式"
                root-class="rag-eval-form-ui-select"
              />
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

          <div class="rag-eval-checkbox-row">
            <label class="rag-eval-checkbox">
              <input v-model="selectedCase.expectedNoResults" type="checkbox" />
              <span>期望无检索结果 (NO_EVIDENCE)</span>
            </label>
            <label class="rag-eval-checkbox">
              <input v-model="selectedCase.expectedHandoff" type="checkbox" />
              <span>期望建议转二线人工</span>
            </label>
          </div>

          <label>
            <span>基准标准答案 / 备注 (Ground Truth & Notes)</span>
            <input v-model="selectedCase.notes" type="text" placeholder="可选，说明该用例的测试意图与验收依据" />
          </label>
        </form>

        <div v-else class="rag-eval-editor rag-eval-empty-state">
          请在左侧选择或添加一个测试用例
        </div>

        <!-- 结果呈现与幻觉诊断面板 -->
        <section class="rag-eval-results">
          <div class="rag-eval-results-header">
            <div>
              <span class="rag-eval-eyebrow">Diagnostic Results</span>
              <strong>评测与质检结果</strong>
            </div>
            <span v-if="selectedResult" class="rag-eval-result-badge" :class="selectedResult.status">
              {{ selectedResult.passed ? '✓ 通过' : selectedResult.status === 'error' ? '⚠ 异常' : '✗ 未通过' }}
            </span>
          </div>

          <template v-if="selectedResult">
            <!-- 失败原因横幅 -->
            <div v-if="selectedResult.failureReason" class="rag-eval-failure">
              <strong>失分原因：</strong> {{ selectedResult.failureReason }}
            </div>

            <!-- 核心统计指标小条 -->
            <div class="rag-eval-result-stats font-mono">
              <span>Top1: <strong>{{ selectedResult.top1Hit ? '命中' : '未命中' }}</strong></span>
              <span>TopK: <strong>{{ selectedResult.topKHit ? '命中' : '未命中' }}</strong></span>
              <span>MRR: <strong>{{ selectedResult.mrr ? selectedResult.mrr.toFixed(3) : (selectedResult.expectedRank ? (1 / selectedResult.expectedRank).toFixed(2) : '-') }}</strong></span>
              <span>最高分: <strong>{{ formatOptionalScore(selectedResult.bestScore) }}</strong></span>
              <span v-if="selectedResult.faithfulnessScore !== undefined">
                忠实度: <strong :class="selectedResult.faithfulnessScore >= 0.85 ? 'text-emerald-400' : 'text-amber-400'">{{ (selectedResult.faithfulnessScore * 100).toFixed(1) }}%</strong>
              </span>
              <span v-if="selectedResult.durationMs">耗时: <strong>{{ selectedResult.durationMs }}ms</strong></span>
            </div>

            <!-- ⚠️ 幻觉排查告警栏 (未获知识库支撑的陈述) -->
            <div
              v-if="selectedResult.unsupportedStatements && selectedResult.unsupportedStatements.length > 0"
              class="rag-eval-hallucination-alert"
            >
              <div class="alert-title">
                <AlertTriangle :size="16" class="text-rose-400" aria-hidden="true" />
                <strong>检测到 {{ selectedResult.unsupportedStatements.length }} 处无依据编造陈述（幻觉嫌疑）：</strong>
              </div>
              <ul class="alert-list">
                <li v-for="(stmt, sIdx) in selectedResult.unsupportedStatements" :key="sIdx">
                  {{ stmt }}
                </li>
              </ul>
            </div>

            <!-- 🚨 业务合规与契约告警栏 -->
            <div
              v-if="selectedResult.policyCompliance && !selectedResult.policyCompliance.passed"
              class="rag-eval-policy-alert"
            >
              <div class="alert-title">
                <ShieldAlert :size="16" class="text-amber-400" aria-hidden="true" />
                <strong>违反技术支持契约规则：</strong>
              </div>
              <ul class="alert-list">
                <li v-for="(v, vIdx) in selectedResult.policyCompliance.violations" :key="vIdx">
                  {{ v }}
                </li>
              </ul>
            </div>

            <!-- 💡 大模型端到端回答全文展示 (双段式工单呈现) -->
            <div v-if="selectedResult.generatedAnswer" class="rag-eval-generated-box">
              <div class="box-header">
                <Bot :size="15" aria-hidden="true" />
                <span>大模型生成回答全文</span>
                <button type="button" class="copy-text-btn" @click="copyText(selectedResult.generatedAnswer)">
                  复制回答
                </button>
              </div>
              <pre class="box-content">{{ selectedResult.generatedAnswer }}</pre>
            </div>

            <!-- 知识库召回切片明细 -->
            <div class="rag-eval-section-title">
              <span>检索召回切片 ({{ selectedResult.results.length }} chunks)</span>
            </div>

            <div class="rag-eval-hit-list">
              <article
                v-for="hit in selectedResult.results"
                :key="hit.result.id"
                class="rag-eval-hit"
                :class="{ matched: hit.passed }"
              >
                <header class="font-mono">
                  <div class="rag-eval-hit-title">
                    <span class="rag-eval-hit-rank">#{{ hit.rank }}</span>
                    <strong>{{ hit.result.filename }}</strong>
                  </div>
                  <span class="rag-eval-hit-score-badge">{{ formatScore(hit.result.score) }}</span>
                </header>

                <!-- 3D 分数芯片行 -->
                <div class="rag-eval-3d-scores font-mono">
                  <div class="rag-eval-score-chip score-total">Score: <strong>{{ formatScore(hit.result.score) }}</strong></div>
                  <div class="rag-eval-score-chip score-vec">Vec: <strong>{{ formatScore(hit.result.vectorScore) }}</strong></div>
                  <div class="rag-eval-score-chip score-fts">FTS5: <strong>{{ formatScore(hit.result.keywordScore) }}</strong></div>
                </div>

                <!-- 命中标签行 -->
                <div class="rag-eval-match-tags font-mono">
                  <span class="rag-eval-chunk-tag">chunk #{{ hit.result.chunkIndex }}</span>
                  <span class="rag-eval-match-pill" :class="{ 'is-matched': hit.fileMatched }">
                    {{ hit.fileMatched ? '✓ 文件命中' : '✗ 文件未命中' }}
                  </span>
                  <span class="rag-eval-match-pill" :class="{ 'is-matched': hit.keywordMatched }">
                    {{ hit.keywordMatched ? '✓ 关键词命中' : '✗ 关键词未命中' }}
                  </span>
                </div>

                <p>{{ hit.result.text }}</p>
              </article>

              <div v-if="selectedResult.results.length === 0" class="rag-eval-empty">
                没有召回到任何切片 (NO_EVIDENCE)
              </div>
            </div>
          </template>

          <div v-else class="rag-eval-empty-state">
            运行端到端评测或单项检索后，此处将展示命中切片、模型回答全文及幻觉诊断
          </div>
        </section>
      </div>
    </div>

    <!-- 诊断报告模态弹窗 (Markdown Report Dialog) -->
    <div v-if="showReportModal" class="rag-eval-modal-mask" @click.self="showReportModal = false">
      <div class="rag-eval-modal-container">
        <div class="rag-eval-modal-header">
          <div class="modal-title-group">
            <FileText :size="18" class="text-cyan-400" aria-hidden="true" />
            <strong>RAG 系统可靠性评测诊断报告</strong>
          </div>
          <div class="modal-actions">
            <button type="button" class="rag-eval-secondary" @click="copyReportMarkdown">
              <Copy :size="14" aria-hidden="true" />
              复制 Markdown
            </button>
            <button type="button" class="modal-close-btn" @click="showReportModal = false">
              <X :size="18" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="rag-eval-modal-body markdown-body" v-html="renderedReportHtml"></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  Bot,
  Copy,
  Download,
  FileDown,
  FileText,
  History,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-vue-next'
import { useToast } from '../composables/useToast'
import { listKnowledgeFiles, searchKnowledge, type StoredKnowledgeFile } from '../services/knowledge'
import {
  buildRagEvalReport,
  createErrorRunResult,
  createRagEvalCase,
  DEFAULT_RAG_EVAL_MIN_SCORE,
  DEFAULT_RAG_EVAL_TOP_K,
  evaluateRagSearchResults,
  fetchLatestEvalReport,
  fetchSampledLogs,
  fetchSyntheticCases,
  mergeBackendResultIntoRunResult,
  normalizeMinScore,
  normalizeRagEvalCases,
  normalizeTopK,
  RAG_EVAL_STORAGE_KEY,
  runBackendRagEval,
  serializeRagEvalCases,
  splitList,
  summarizeRagEvalResults,
  type RagEvalCase,
  type RagEvalRunResult,
} from '../services/ragEval'
import { renderMarkdown } from '../utils/markdown'
import UiSelect, { type UiSelectOption } from '../components/UiSelect.vue'

const toast = useToast()
const cases = ref<RagEvalCase[]>([])
const selectedCaseId = ref('')
const resultMap = ref<Record<string, RagEvalRunResult | undefined>>({})
const importInputRef = ref<HTMLInputElement | null>(null)

// 知识库候选文件与出题指定源
const knowledgeFiles = ref<StoredKnowledgeFile[]>([])
const selectedSourceFileId = ref('')

const sourceFileOptions = computed<UiSelectOption[]>(() => [
  { value: '', label: '📚 全部文档 (全库多样性采样)' },
  ...knowledgeFiles.value.map(file => ({
    value: file.id,
    label: `📄 ${file.filename}`,
    subtext: `${file.chunkCount}切片`,
  })),
])

const categoryOptions: UiSelectOption[] = [
  { value: 'SINGLE_HOP', label: '单跳精准事实 (SINGLE_HOP)' },
  { value: 'MULTI_HOP', label: '多切片综合推理 (MULTI_HOP)' },
  { value: 'COLLOQUIAL', label: '口语/错别字/倒装 (COLLOQUIAL)' },
  { value: 'NEGATIVE', label: '越界/未收录负样本 (NEGATIVE)' },
  { value: 'ADVERSARIAL', label: '提示词越狱/诱导断言 (ADVERSARIAL)' },
]

const scenarioOptions: UiSelectOption[] = [
  { value: 'ticket', label: 'ticket (技术支持工单契约)' },
  { value: 'general', label: 'general (通用知识库问答)' },
]

const matchModeOptions: UiSelectOption[] = [
  { value: 'auto', label: 'auto (自动判定)' },
  { value: 'any', label: 'any (命中任一)' },
  { value: 'all', label: 'all (文件与关键词均命中)' },
  { value: 'file', label: 'file (仅匹配文件)' },
  { value: 'keyword', label: 'keyword (仅匹配关键词)' },
]

// 运行与加载状态
const isRunning = ref(false)
const isGenerating = ref(false)
const isSampling = ref(false)
const runProgress = ref({ done: 0, total: 0 })

// 诊断报告弹窗状态
const showReportModal = ref(false)
const reportMarkdownText = ref('')

const selectedCase = computed(() => cases.value.find(item => item.id === selectedCaseId.value))
const selectedResult = computed(() => selectedCase.value ? resultMap.value[selectedCase.value.id] : undefined)
const runnableCases = computed(() => cases.value.filter(item => item.question && item.question.trim()))
const hasCompletedResults = computed(() =>
  Object.values(resultMap.value).some(result => result && result.status !== 'idle' && result.status !== 'running')
)
const summary = computed(() => summarizeRagEvalResults(cases.value, resultMap.value))

const averageLatencyText = computed(() => {
  const completed = Object.values(resultMap.value).filter((r): r is RagEvalRunResult => Boolean(r && r.durationMs !== undefined))
  if (completed.length === 0) return '-'
  const avg = completed.reduce((sum, r) => sum + (r.durationMs || 0), 0) / completed.length
  return `${avg.toFixed(0)}ms`
})

const renderedReportHtml = computed(() => {
  if (!reportMarkdownText.value) return '<p class="text-muted">暂无报告内容</p>'
  return renderMarkdown(reportMarkdownText.value)
})

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
  loadKnowledgeFiles()
})

async function loadKnowledgeFiles() {
  try {
    knowledgeFiles.value = await listKnowledgeFiles()
  } catch {
    // 忽略加载知识库文件异常
  }
}

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

// 自动合成用例 (支持指定文件与随机多样性)
async function generateCases() {
  if (isGenerating.value) return
  isGenerating.value = true
  try {
    const fileId = selectedSourceFileId.value || undefined
    const targetFile = knowledgeFiles.value.find(f => f.id === fileId)
    const generated = await fetchSyntheticCases({
      fileId,
      limitPerCategory: 2,
      randomSeed: Date.now(),
    })
    if (generated.length === 0) {
      toast.show('未能从选定知识库文件中提取切片合成用例，请检查切片是否有效', 'warning')
      return
    }
    cases.value = [...cases.value, ...generated]
    selectedCaseId.value = generated[0].id
    const scopeDesc = targetFile ? `《${targetFile.filename}》` : '全库切片'
    toast.show(`已成功基于 ${scopeDesc} 自动合成 ${generated.length} 条全新评测用例`, 'success')
  } catch (error) {
    toast.show(error instanceof Error ? error.message : '自动出题失败', 'error')
  } finally {
    isGenerating.value = false
  }
}

// 线上日志难例采样
async function sampleLogs() {
  if (isSampling.value) return
  isSampling.value = true
  try {
    const sampled = await fetchSampledLogs({ limit: 6 })
    if (sampled.length === 0) {
      toast.show('生产日志中暂无低分或慢查询难例', 'warning')
      return
    }
    cases.value = [...cases.value, ...sampled]
    selectedCaseId.value = sampled[0].id
    toast.show(`已成功采样导入 ${sampled.length} 条线上难例`, 'success')
  } catch (error) {
    toast.show(error instanceof Error ? error.message : '难例采样失败', 'error')
  } finally {
    isSampling.value = false
  }
}

// 单项检索
async function runSelectedLocal() {
  const current = selectedCase.value
  if (!current) return
  await runCasesLocal([current])
}

// 全量检索
async function runAllLocal() {
  await runCasesLocal(runnableCases.value)
}

async function runCasesLocal(targetCases: RagEvalCase[]) {
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

// 核心端到端评测 (AI + 幻觉检测 + 契约合规)
async function runAllE2E() {
  const targets = runnableCases.value
  if (targets.length === 0 || isRunning.value) return
  isRunning.value = true
  runProgress.value = { done: 0, total: targets.length }

  for (const tc of targets) {
    resultMap.value[tc.id] = {
      caseId: tc.id,
      status: 'running',
      passed: false,
      top1Hit: false,
      topKHit: false,
      failureReason: '',
      results: [],
    }
  }

  try {
    const res = await runBackendRagEval(targets)
    if (res.ok && Array.isArray(res.results)) {
      reportMarkdownText.value = res.markdownReport || ''
      for (const item of res.results) {
        const matchedCase = targets.find(t => t.id === item.testCaseId)
        if (matchedCase) {
          resultMap.value[matchedCase.id] = mergeBackendResultIntoRunResult(matchedCase, item)
        }
      }
      runProgress.value = { done: targets.length, total: targets.length }
      toast.show(`端到端评测完成！综合通过率: ${(res.report.overallPassRate * 100).toFixed(1)}%`, 'success')
    }
  } catch (error) {
    toast.show(error instanceof Error ? error.message : '端到端评测运行失败', 'error')
    // 将状态置为 error
    for (const tc of targets) {
      if (resultMap.value[tc.id]?.status === 'running') {
        resultMap.value[tc.id] = createErrorRunResult(tc, error)
      }
    }
  } finally {
    isRunning.value = false
  }
}

// 查看诊断报告模态弹窗
async function openReportModal() {
  try {
    const { reportMarkdown } = await fetchLatestEvalReport()
    reportMarkdownText.value = reportMarkdown
    showReportModal.value = true
  } catch (error) {
    toast.show(error instanceof Error ? error.message : '获取报告失败', 'error')
  }
}

function copyReportMarkdown() {
  copyText(reportMarkdownText.value)
  toast.show('已复制诊断报告 Markdown 到剪贴板', 'success')
}

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text).catch(() => {
    toast.show('复制失败，请手动选取复制', 'warning')
  })
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

function getCategoryClass(category?: string): string {
  switch (category) {
    case 'SINGLE_HOP': return 'cat-single'
    case 'MULTI_HOP': return 'cat-multi'
    case 'COLLOQUIAL': return 'cat-colloquial'
    case 'NEGATIVE': return 'cat-negative'
    case 'ADVERSARIAL': return 'cat-adversarial'
    default: return 'cat-default'
  }
}

function getCategoryLabel(category?: string): string {
  switch (category) {
    case 'SINGLE_HOP': return '单跳事实'
    case 'MULTI_HOP': return '多跳推理'
    case 'COLLOQUIAL': return '口语倒装'
    case 'NEGATIVE': return '未收录'
    case 'ADVERSARIAL': return '安全对抗'
    default: return category || '用例'
  }
}

function getCaseStateLabel(caseId: string): string {
  const result = resultMap.value[caseId]
  if (!result) return '未运行'
  if (result.status === 'running') return '运行中'
  if (result.status === 'error') return '异常'
  return result.passed ? '通过' : '未通过'
}

function getCaseStateClass(caseId: string): string {
  const result = resultMap.value[caseId]
  if (!result) return ''
  if (result.status === 'running') return 'text-amber-400'
  if (result.status === 'error') return 'text-rose-400'
  return result.passed ? 'text-emerald-400 font-bold' : 'text-rose-400'
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
    // 忽略异常
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
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 1px;
  background: var(--border-subtle);
  overflow: hidden;
  font-family: var(--font-sans);
}

.rag-eval-sidebar,
.rag-eval-main,
.rag-eval-editor,
.rag-eval-results {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
}

.rag-eval-toolbar,
.rag-eval-runbar,
.rag-eval-editor-header,
.rag-eval-results-header,
.rag-eval-import-row,
.rag-eval-run-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rag-eval-toolbar,
.rag-eval-runbar {
  min-height: 58px;
  padding: 0 16px;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
}

.rag-eval-eyebrow {
  display: block;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-mono);
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
  min-height: 32px;
  border-radius: var(--radius-sm);
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.rag-eval-primary {
  border: 1px solid var(--accent-border);
  color: #fff;
  background: var(--accent-deep);
  box-shadow: 0 0 14px var(--accent-glow);
}

.rag-eval-primary:hover:not(:disabled) {
  background: var(--accent-deeper);
}

.rag-eval-e2e-btn {
  background: linear-gradient(135deg, #0284c7, #0d9488);
  font-weight: 600;
  box-shadow: 0 0 16px rgba(13, 148, 136, 0.35);
}

.rag-eval-secondary {
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.rag-eval-secondary:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.rag-eval-highlight-btn {
  border-color: rgba(6, 182, 212, 0.4);
  background: rgba(6, 182, 212, 0.08);
}

.rag-eval-danger {
  border: 1px solid var(--danger-border);
  color: var(--danger);
  background: var(--danger-bg);
}

.rag-eval-primary:disabled,
.rag-eval-secondary:disabled,
.rag-eval-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rag-eval-source-row {
  padding: 8px 12px;
  background: var(--bg-surface-3);
  border-bottom: 1px solid var(--border-subtle);
}

.source-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.rag-eval-source-ui-select {
  flex: 1;
  min-width: 0;
}

.rag-eval-source-ui-select :deep(.ui-select-trigger) {
  height: 28px;
  font-size: 11.5px;
}

.rag-eval-form-ui-select {
  width: 100%;
}

.rag-eval-form-ui-select :deep(.ui-select-trigger) {
  height: 34px;
  font-size: 12.5px;
  background: rgba(255, 255, 255, 0.05);
}

[data-theme="light"] .rag-eval-form-ui-select :deep(.ui-select-trigger) {
  background: #f3f4f6;
  border-color: rgba(0, 0, 0, 0.08);
  color: #374151;
}

.rag-eval-source-select {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 0 26px 0 12px;
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  outline: none;
  text-overflow: ellipsis;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(156,163,175,0.7)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: all var(--motion-fast, 0.15s) ease;
}

.rag-eval-source-select:hover {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background-color: var(--accent-bg);
}

.rag-eval-source-select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

[data-theme="light"] .rag-eval-source-select {
  background-color: #f3f4f6;
  border-color: rgba(0, 0, 0, 0.08);
  color: #4b5563;
}

[data-theme="light"] .rag-eval-source-select:hover {
  background-color: #e5e7eb;
  border-color: var(--accent-border);
  color: var(--accent-text);
}

.rag-eval-import-row {
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.rag-eval-case-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
}

.rag-eval-case-item {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: inherit;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.rag-eval-case-item:hover {
  background: var(--bg-surface-2);
}

.rag-eval-case-item.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.rag-eval-case-item.passed {
  border-left: 3px solid #10b981;
}

.rag-eval-case-item.failed {
  border-left: 3px solid #f43f5e;
}

.rag-eval-case-index {
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-mono);
}

.rag-eval-case-main {
  min-width: 0;
}

.rag-eval-case-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rag-eval-case-title-row strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.rag-eval-cat-pill {
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9.5px;
  font-weight: 700;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.cat-single { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.cat-multi { background: rgba(14, 165, 233, 0.15); color: #38bdf8; }
.cat-colloquial { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
.cat-negative { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.cat-adversarial { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
.cat-default { background: var(--bg-surface-3); color: var(--text-muted); }

.rag-eval-case-subtext {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-case-state {
  font-size: 11px;
  font-family: var(--font-mono);
}

/* 顶部大盘度量栏 */
.rag-eval-summary {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 1px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--border-subtle);
}

.rag-eval-summary .summary-card {
  min-width: 0;
  padding: 10px 12px;
  background: var(--bg-surface-2);
}

.rag-eval-summary .summary-card.highlight-metric {
  background: rgba(14, 165, 233, 0.05);
}

.rag-eval-summary span {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-summary strong {
  display: block;
  margin-top: 4px;
  font-size: 14.5px;
  font-family: var(--font-mono);
  color: var(--data-accent);
}

.rag-eval-summary strong.rate-high { color: #10b981; }
.rag-eval-summary strong.rate-mid { color: #f59e0b; }
.rag-eval-summary strong.rate-low { color: #f43f5e; }

/* 工作区与左右分栏 */
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
  margin-bottom: 12px;
}

.rag-eval-editor label > span,
.rag-eval-controls label > span {
  display: block;
  margin-bottom: 5px;
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-editor input,
.rag-eval-editor textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  outline: none;
  color: var(--text-primary);
  background: var(--bg-input);
  font: inherit;
  font-size: 12.5px;
}

.rag-eval-editor select {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 0 30px 0 14px;
  outline: none;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='rgba(156,163,175,0.7)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  transition: all var(--motion-fast, 0.15s) ease;
}

.rag-eval-editor select:hover {
  border-color: var(--accent-border);
  background-color: var(--accent-bg);
  color: var(--accent-text);
}

.rag-eval-editor select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

[data-theme="light"] .rag-eval-editor select {
  background-color: #f3f4f6;
  border-color: rgba(0, 0, 0, 0.08);
  color: #374151;
}

[data-theme="light"] .rag-eval-editor select:hover {
  background-color: #e5e7eb;
}

.rag-eval-editor textarea {
  resize: vertical;
  line-height: 1.5;
}

.rag-eval-two-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.rag-eval-controls {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr;
  gap: 8px;
}

.rag-eval-checkbox-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 12px;
}

.rag-eval-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 0 !important;
  cursor: pointer;
}

.rag-eval-checkbox input {
  width: auto;
  margin: 0;
}

.rag-eval-result-badge {
  border-radius: var(--radius-pill);
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.rag-eval-result-badge.passed {
  color: #86efac;
  background: rgba(34, 197, 94, 0.15);
}

.rag-eval-result-badge.failed,
.rag-eval-result-badge.error {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.15);
}

.rag-eval-failure {
  margin-bottom: 12px;
  border: 1px solid rgba(244, 63, 94, 0.3);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.08);
  font-size: 12px;
}

.rag-eval-result-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  color: var(--text-muted);
  font-size: 11px;
}

.rag-eval-result-stats strong {
  color: var(--text-primary);
}

/* 幻觉排查与合规警告栏 */
.rag-eval-hallucination-alert {
  margin-bottom: 12px;
  border: 1px solid rgba(244, 63, 94, 0.4);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  background: rgba(244, 63, 94, 0.09);
}

.rag-eval-policy-alert {
  margin-bottom: 12px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  background: rgba(245, 158, 11, 0.09);
}

.alert-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  margin-bottom: 6px;
}

.alert-list {
  margin: 0;
  padding-left: 18px;
  font-size: 11.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 模型生成回答全文框 */
.rag-eval-generated-box {
  margin-bottom: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  overflow: hidden;
}

.box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-surface-3);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.copy-text-btn {
  background: none;
  border: 0;
  color: var(--data-accent);
  font-size: 11px;
  cursor: pointer;
}

.box-content {
  margin: 0;
  padding: 12px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text-primary);
  max-height: 220px;
  overflow-y: auto;
}

.rag-eval-section-title {
  margin: 12px 0 8px 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.rag-eval-hit {
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
}

.rag-eval-hit.matched {
  border-color: rgba(34, 197, 94, 0.3);
}

.rag-eval-hit header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rag-eval-hit-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.rag-eval-hit-rank {
  color: #818cf8;
  font-weight: 700;
  font-size: 11px;
}

.rag-eval-hit-score-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: #6366f1;
  color: #ffffff;
  font-weight: 700;
  font-size: 11px;
}

.rag-eval-3d-scores {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-top: 8px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--bg-surface-3);
  border: 1px solid var(--border-subtle);
  font-size: 10px;
  text-align: center;
}

.rag-eval-score-chip.score-total strong { color: #6366f1; }
.rag-eval-score-chip.score-vec strong { color: #0284c7; }
.rag-eval-score-chip.score-fts strong { color: #059669; }

.rag-eval-match-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  font-size: 10px;
}

.rag-eval-chunk-tag {
  color: var(--text-muted);
}

.rag-eval-match-pill {
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(244, 63, 94, 0.12);
  color: #f43f5e;
  font-weight: 600;
}

.rag-eval-match-pill.is-matched {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.rag-eval-hit p {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rag-eval-empty,
.rag-eval-empty-state {
  padding: 30px 16px;
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}

/* 诊断报告模态弹窗 */
.rag-eval-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
}

.rag-eval-modal-container {
  width: 100%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.rag-eval-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface-2);
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

.modal-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-close-btn {
  background: none;
  border: 0;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.modal-close-btn:hover {
  color: var(--text-primary);
  background: var(--bg-surface-3);
}

.rag-eval-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  line-height: 1.7;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  font-size: 12.5px;
}

.markdown-body :deep(th) {
  background: var(--bg-surface-2);
}

.markdown-body :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 3px solid var(--accent);
  background: var(--bg-surface-2);
  color: var(--text-secondary);
}

@media (max-width: 1180px) {
  .rag-eval-shell {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }
  .rag-eval-sidebar { min-height: 280px; }
  .rag-eval-summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .rag-eval-workspace { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .rag-eval-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rag-eval-two-cols,
  .rag-eval-controls { grid-template-columns: 1fr; }
}
</style>
