<template>
  <div>
    <!-- 移动端半透明磨砂遮罩 (点击遮罩收起抽屉) -->
    <transition name="drawer-fade">
      <div
        v-if="props.open"
        class="rag-drawer-backdrop"
        aria-hidden="true"
        @click="handleClose"
      />
    </transition>

    <!-- 右侧 RAG 抽屉面板 -->
    <transition name="drawer-slide">
      <aside
        v-if="props.open"
        class="rag-drawer-pane"
        role="complementary"
        aria-label="RAG 检索链路与切片透视"
      >
        <!-- 抽屉顶部头部 -->
        <header class="rag-drawer-header">
          <div class="rag-drawer-title-row">
            <div class="title-left">
              <span class="status-indicator-dot" />
              <h2 class="rag-drawer-title">{{ drawerTitle }}</h2>
            </div>
            <div class="title-right">
              <span v-if="displayResults.length" class="topk-badge">
                Top-{{ displayResults.length }}
              </span>
              <button
                type="button"
                class="drawer-close-btn"
                title="收起详情面板 (Esc)"
                aria-label="收起详情面板"
                @click="handleClose"
              >
                <X :size="16" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- 双 Tab 切换器 -->
          <div class="rag-drawer-tabs">
            <button
              type="button"
              class="rag-tab-btn"
              :class="{ active: activeTab === 'chunks' }"
              @click="activeTab = 'chunks'"
            >
              <Layers :size="14" aria-hidden="true" />
              <span>命中切片 ({{ displayResults.length }})</span>
            </button>
            <button
              type="button"
              class="rag-tab-btn"
              :class="{ active: activeTab === 'prompt' }"
              @click="activeTab = 'prompt'"
            >
              <FileText :size="14" aria-hidden="true" />
              <span>注入 Prompt 预览</span>
            </button>
          </div>
        </header>

        <!-- 抽屉主体内容区 -->
        <div class="rag-drawer-body">
          <!-- ── TAB 1: 命中切片列表 ── -->
          <div v-if="activeTab === 'chunks'" class="rag-tab-content chunks-view">
            <!-- 决策定性状态条 (与工单/通用场景联动) -->
            <div v-if="evidenceBadge" class="rag-summary-badge-banner" :class="evidenceBadge.level">
              <div class="banner-head">
                <component :is="evidenceBadge.icon" :size="15" class="banner-icon" aria-hidden="true" />
                <strong class="banner-title">{{ evidenceBadge.text }}</strong>
                <span class="banner-action-tag">{{ evidenceBadge.action }}</span>
              </div>
              <p class="banner-detail">{{ evidenceBadge.detail }}</p>
            </div>

            <!-- 顶部三宫格概览分值卡片 -->
            <div v-if="displayResults.length" class="rag-metric-grid">
              <div class="metric-card metric-total">
                <span class="metric-label">最高综合 Score</span>
                <span class="metric-value font-mono">{{ formatScore(maxScore) }}</span>
              </div>
              <div class="metric-card metric-vector">
                <span class="metric-label">向量 Vector</span>
                <span class="metric-value font-mono">{{ formatScore(maxVectorScore) }}</span>
              </div>
              <div class="metric-card metric-keyword">
                <span class="metric-label">关键词 Keyword</span>
                <span class="metric-value font-mono">{{ formatScore(maxKeywordScore) }}</span>
              </div>
            </div>

            <!-- 空状态 / 待命状态提示 -->
            <div v-if="!props.context" class="rag-drawer-empty rag-drawer-standby">
              <div class="standby-icon-badge">
                <Layers :size="28" class="standby-icon" aria-hidden="true" />
              </div>
              <h3 class="standby-title">知识库检索链路已就绪</h3>
              <p class="empty-text">
                {{ isGeneral
                  ? '在左侧发送问题后，系统将自动检索知识库，并在此实时呈现 Top-K 命中切片、向量与关键词三维分值柱条及注入模型 Prompt 的完整材料。'
                  : '在左侧发送工单排障需求后，系统将在此实时呈现排障官方文档切片、置信度分值与二线人工流转建议。' }}
              </p>
              <div class="standby-features-list">
                <div class="standby-feature-item">
                  <Sparkles :size="14" class="feature-bullet" aria-hidden="true" />
                  <span>实时三维分值透视（向量 + 关键词 + 综合权重）</span>
                </div>
                <div class="standby-feature-item">
                  <FileText :size="14" class="feature-bullet" aria-hidden="true" />
                  <span>Prompt 注入透明化预览（支持一键复制完整上下文）</span>
                </div>
                <div class="standby-feature-item">
                  <ShieldCheck :size="14" class="feature-bullet" aria-hidden="true" />
                  <span>置信度定性分级与工单采纳 / 转人工智能联动</span>
                </div>
              </div>
            </div>
            <div v-else-if="props.context.errorMessage" class="rag-drawer-empty">
              <p class="empty-text error-text">引用证据获取失败：{{ props.context.errorMessage }}</p>
            </div>
            <div v-else-if="props.context.mode === 'off'" class="rag-drawer-empty">
              <p class="empty-text">{{ isGeneral ? '本次对话已关闭知识库检索' : '本次工单已关闭知识库检索' }}</p>
            </div>
            <div v-else-if="!props.context.enabled || displayResults.length === 0" class="rag-drawer-empty">
              <p class="empty-text">
                {{ isGeneral ? '已检索知识库，但未找到达到相关度阈值的依据。' : '未检索到达到阈值的相关依据，已由模型基于通用知识排障。' }}
              </p>
            </div>

            <!-- 切片卡片列表 -->
            <div v-else class="rag-chunks-list">
              <article
                v-for="(item, idx) in displayResults"
                :key="`${item.fileId}-${item.chunkIndex}`"
                class="rag-chunk-card"
              >
                <!-- 卡片顶栏 -->
                <header class="chunk-card-head">
                  <div class="chunk-ident">
                    <span class="chunk-num-badge font-mono">#{{ formatIndex(idx + 1) }}</span>
                    <span class="chunk-file-name font-mono truncate" :title="item.filename">
                      {{ item.filename }}
                    </span>
                  </div>
                  <span class="chunk-score-pill font-mono">
                    Score: {{ formatScore(item.score) }}
                  </span>
                </header>

                <!-- 三维分值柱条 -->
                <div class="chunk-scores-bars font-mono">
                  <div class="score-bar-row">
                    <span class="score-bar-title">综合 Score</span>
                    <div class="score-track">
                      <div
                        class="score-fill fill-total"
                        :style="{ width: `${toPercent(item.score)}%` }"
                      />
                    </div>
                    <span class="score-bar-num num-total">{{ formatScore(item.score) }}</span>
                  </div>

                  <div class="score-bar-row">
                    <span class="score-bar-title">向量 Vector</span>
                    <div class="score-track">
                      <div
                        class="score-fill fill-vector"
                        :style="{ width: `${toPercent(item.vectorScore)}%` }"
                      />
                    </div>
                    <span class="score-bar-num num-vector">{{ formatScore(item.vectorScore) }}</span>
                  </div>

                  <div class="score-bar-row">
                    <span class="score-bar-title">关键词 Keyword</span>
                    <div class="score-track">
                      <div
                        class="score-fill fill-keyword"
                        :style="{ width: `${toPercent(item.keywordScore)}%` }"
                      />
                    </div>
                    <span class="score-bar-num num-keyword">{{ formatScore(item.keywordScore) }}</span>
                  </div>
                </div>

                <!-- 切片摘录正文 -->
                <div class="chunk-text-box">
                  <p class="chunk-text">{{ item.text.trim() }}</p>
                </div>
              </article>
            </div>
          </div>

          <!-- ── TAB 2: 注入 Prompt 预览 ── -->
          <div v-else class="rag-tab-content prompt-view">
            <div class="prompt-hint-box">
              <Sparkles :size="15" class="prompt-hint-icon" aria-hidden="true" />
              <p class="prompt-hint-text">
                展示 Fastify 后端将命中切片拼装后的<strong>完整上下文提示词 (Context Injection)</strong>，用于清晰透视模型已知事实边界。
              </p>
            </div>

            <div v-if="!props.context || !displayResults.length" class="rag-drawer-empty">
              <p class="empty-text">当前暂无注入模型的知识库上下文。当检索命中切片后，将在此展示注入模型的 &lt;context&gt; 提示词与用户提问预览。</p>
            </div>

            <!-- 代码块容器 (高对比度极客风格) -->
            <div v-else class="prompt-terminal-card font-mono">
              <div class="terminal-header">
                <span class="terminal-tag">SYSTEM PROMPT INJECTION</span>
                <button
                  type="button"
                  class="terminal-copy-btn"
                  @click="handleCopyPrompt"
                >
                  {{ copiedPrompt ? '已复制' : '复制全文' }}
                </button>
              </div>

              <div class="terminal-content">
                <div class="terminal-meta-line text-accent"># SYSTEM PROMPT INJECTION CONTEXT</div>
                <div class="terminal-instruction">
                  {{ isGeneral
                    ? '你是一个基于知识库的智能助手，请依据以下材料解答用户问题：'
                    : '你是一个技术支持排障决策专家，请依据以下资料输出内部分析与客户草稿：'
                  }}
                </div>

                <div class="terminal-block-tag text-emerald">&lt;context&gt;</div>
                <div class="terminal-context-body">
                  <div
                    v-for="(item, idx) in displayResults"
                    :key="`ctx-${item.fileId}-${item.chunkIndex}`"
                    class="terminal-chunk-snippet"
                  >
                    <span class="snippet-doc-head text-accent">
                      [Doc {{ idx + 1 }}: {{ item.filename }} #{{ item.chunkIndex }} | score={{ formatScore(item.score) }}]
                    </span>
                    <p class="snippet-doc-text">{{ item.text.trim() }}</p>
                  </div>
                </div>
                <div class="terminal-block-tag text-emerald">&lt;/context&gt;</div>

                <template v-if="props.userQuestion">
                  <div class="terminal-meta-line text-sky" style="margin-top: 14px;"># USER QUESTION</div>
                  <div class="terminal-user-query">{{ props.userQuestion }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import {
  AlertTriangle,
  FileText,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-vue-next'
import type { RagContextInfo } from '../types/chat'
import type { ChatScenario } from '../types/model'

const props = withDefaults(
  defineProps<{
    context?: RagContextInfo | null
    open: boolean
    scenario?: ChatScenario
    userQuestion?: string
  }>(),
  {
    context: null,
    scenario: 'ticket',
    userQuestion: '',
  }
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const activeTab = ref<'chunks' | 'prompt'>('chunks')
const copiedPrompt = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

function handleClose() {
  emit('update:open', false)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    handleClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (copyTimer) clearTimeout(copyTimer)
})

const isGeneral = computed(() => props.scenario === 'general')

const displayResults = computed(() => {
  if (!props.context || !props.context.enabled || !props.context.results) {
    return []
  }
  return props.context.results.filter(item => item.text && item.text.trim().length > 0)
})

const maxScore = computed(() => {
  if (!displayResults.value.length) return 0
  const scores = displayResults.value.map(item => Number(item.score)).filter(Number.isFinite)
  return scores.length ? Math.max(...scores) : 0
})

const maxVectorScore = computed(() => {
  if (!displayResults.value.length) return 0
  const scores = displayResults.value.map(item => Number(item.vectorScore)).filter(Number.isFinite)
  return scores.length ? Math.max(...scores) : 0
})

const maxKeywordScore = computed(() => {
  if (!displayResults.value.length) return 0
  const scores = displayResults.value.map(item => Number(item.keywordScore)).filter(Number.isFinite)
  return scores.length ? Math.max(...scores) : 0
})

const drawerTitle = computed(() => {
  if (isGeneral.value) {
    return '知识库参考材料与链路透视'
  }
  return 'RAG 检索链路与引用解释'
})

interface EvidenceBadge {
  level: 'sufficient' | 'low' | 'insufficient'
  text: string
  action: string
  detail: string
  icon: Component
}

const evidenceBadge = computed<EvidenceBadge | null>(() => {
  if (!props.context) return null
  if (props.context.mode === 'off') return null
  const general = isGeneral.value

  if (!props.context.enabled || displayResults.value.length === 0) {
    return {
      level: 'insufficient',
      text: general ? '未找到直接相关依据' : '证据不足，需补充信息',
      action: general ? '建议调整关键词提问' : '建议追问客户 / 人工介入',
      detail: general
        ? '知识库中未检索到与问题直接吻合的切片，模型基于已有知识直接推理。'
        : '未检索到高匹配排障依据，当前回复仅供参考，请勿直接作为确诊根因发送。',
      icon: ShieldAlert,
    }
  }

  const score = maxScore.value
  if (score >= 0.65) {
    return {
      level: 'sufficient',
      text: general ? `已匹配到高置信参考材料 (${score.toFixed(2)})` : `已找到充分证据 (${score.toFixed(2)})`,
      action: general ? '参考资料匹配度高' : '可采纳草稿',
      detail: general
        ? '检索到的知识库文档内容与当前提问高度相关，回答主要基于材料生成。'
        : '检索结果与知识库官方文档高度匹配，可核对后采纳回复草稿。',
      icon: ShieldCheck,
    }
  } else if (score >= 0.45) {
    return {
      level: 'low',
      text: general
        ? `参考资料相关度中等 (${score.toFixed(2)})`
        : `证据分数较低 (${score.toFixed(2)})，建议人工介入`,
      action: general ? '建议核对材料细节' : '建议核对版本 / 追问客户',
      detail: general
        ? '检索到的资料部分吻合提问，但可能存在场景差异，建议核对下方切片。'
        : '检索到的技术文档相关度不高，可能存在版本差异或关键日志缺失。',
      icon: AlertTriangle,
    }
  } else {
    return {
      level: 'insufficient',
      text: general
        ? `参考资料匹配度较低 (${score.toFixed(2)})`
        : `证据相关度不足 (${score.toFixed(2)})，建议转二线`,
      action: general ? '仅供参考' : '禁止直接发送',
      detail: general
        ? '知识库检索相关度偏低，未命中确切依据，请注意甄别模型回答。'
        : '知识库得分严重偏低，未能确认故障因果链，建议升级二线研发团队。',
      icon: ShieldAlert,
    }
  }
})

function formatScore(val: number): string {
  if (!Number.isFinite(val)) return '0.00'
  return val.toFixed(2)
}

function formatIndex(index: number): string {
  return index < 10 ? `0${index}` : String(index)
}

function toPercent(val: number): number {
  if (!Number.isFinite(val)) return 0
  return Math.min(100, Math.max(0, Math.round(val * 100)))
}

function handleCopyPrompt() {
  const snippets = displayResults.value.map((item, idx) => {
    return `[Doc ${idx + 1}: ${item.filename} #${item.chunkIndex} | score=${formatScore(item.score)}]\n${item.text.trim()}`
  }).join('\n\n')

  const full = `<context>\n${snippets}\n</context>\n\n# USER QUESTION\n${props.userQuestion || ''}`
  navigator.clipboard.writeText(full).then(() => {
    copiedPrompt.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedPrompt.value = false
    }, 2000)
  })
}
</script>

<style scoped>
/* ── 移动端磨砂背景遮罩 ── */
.rag-drawer-backdrop {
  display: none;
}

@media (max-width: 1023px) {
  .rag-drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-overlay, 100) - 1);
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
}

/* ── 抽屉整体容器 ── */
.rag-drawer-pane {
  width: 500px;
  height: 100%;
  background: var(--bg-surface, #ffffff);
  border-left: 1px solid var(--border, #e2e8f0);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.04);
}

@media (max-width: 1023px) {
  .rag-drawer-pane {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(100vw, 500px);
    z-index: var(--z-overlay, 100);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.16);
  }
}

/* ── 抽屉头部 ── */
.rag-drawer-header {
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-subtle, #f1f5f9);
  background: var(--bg-surface, #ffffff);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.rag-drawer-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #4f46e5);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  flex-shrink: 0;
}

.rag-drawer-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  margin: 0;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.topk-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--bg-surface-2, #f1f5f9);
  color: var(--text-secondary, #475569);
}

.drawer-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.drawer-close-btn:hover {
  background: var(--bg-surface-2, #f1f5f9);
  color: var(--text-primary, #0f172a);
}

/* ── 双 Tab 按钮组 ── */
.rag-drawer-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--bg-surface-2, #f1f5f9);
  padding: 3px;
  border-radius: 8px;
  gap: 3px;
}

.rag-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;
}

.rag-tab-btn:hover {
  color: var(--text-primary, #0f172a);
}

.rag-tab-btn.active {
  background: var(--bg-surface, #ffffff);
  color: var(--accent, #4f46e5);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* ── 抽屉滚动主体 ── */
.rag-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 24px;
}

.rag-tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── 顶部三宫格分值卡片 ── */
.rag-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  background: var(--bg-surface-2, #f8fafc);
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 10px;
  padding: 10px 8px;
  text-align: center;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-card:not(:last-child) {
  border-right: 1px solid var(--border-subtle, #e2e8f0);
}

.metric-label {
  font-size: 10.5px;
  color: var(--text-muted, #64748b);
  white-space: nowrap;
}

.metric-value {
  font-size: 15px;
  font-weight: 700;
}

.metric-total .metric-value {
  color: var(--accent, #4f46e5);
}

.metric-vector .metric-value {
  color: var(--cyan-600, #0284c7);
}

.metric-keyword .metric-value {
  color: var(--emerald-600, #059669);
}

/* ── 决策状态条 ── */
.rag-summary-badge-banner {
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--border-subtle, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.banner-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.banner-icon {
  flex-shrink: 0;
}

.banner-title {
  font-weight: 600;
  color: var(--text-primary, #0f172a);
}

.banner-action-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
}

.banner-detail {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-secondary, #475569);
  margin: 0;
}

.rag-summary-badge-banner.sufficient {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.28);
}
.rag-summary-badge-banner.sufficient .banner-icon { color: var(--emerald-600, #059669); }
.rag-summary-badge-banner.sufficient .banner-action-tag {
  background: rgba(16, 185, 129, 0.15);
  color: var(--emerald-600, #059669);
}

.rag-summary-badge-banner.low {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.28);
}
.rag-summary-badge-banner.low .banner-icon { color: var(--amber-600, #d97706); }
.rag-summary-badge-banner.low .banner-action-tag {
  background: rgba(245, 158, 11, 0.15);
  color: var(--amber-600, #d97706);
}

.rag-summary-badge-banner.insufficient {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.28);
}
.rag-summary-badge-banner.insufficient .banner-icon { color: var(--rose-600, #dc2626); }
.rag-summary-badge-banner.insufficient .banner-action-tag {
  background: rgba(239, 68, 68, 0.15);
  color: var(--rose-600, #dc2626);
}

/* ── 空状态 ── */
.rag-drawer-empty {
  padding: 30px 16px;
  text-align: center;
  border: 1px dashed var(--border, #cbd5e1);
  border-radius: 10px;
  background: var(--bg-surface-2, #f8fafc);
}

.rag-drawer-standby {
  padding: 32px 18px 24px;
  border-style: solid;
  border-color: var(--border-subtle, #e2e8f0);
  background: var(--bg-surface-2, #f8fafc);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.standby-icon-badge {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--accent-bg, rgba(99, 102, 241, 0.1));
  border: 1px solid var(--accent-border, rgba(99, 102, 241, 0.25));
  color: var(--accent, #4f46e5);
}

.standby-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.standby-features-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
  text-align: left;
}

.standby-feature-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  background: var(--bg-surface);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
}

.standby-feature-item .feature-bullet {
  color: var(--accent);
  flex-shrink: 0;
  margin-top: 2px;
}

.empty-text {
  font-size: 13px;
  color: var(--text-muted, #64748b);
  margin: 0;
  line-height: 1.5;
}

.empty-text.error-text {
  color: var(--danger, #dc2626);
}

/* ── 命中切片卡片 ── */
.rag-chunks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rag-chunk-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-surface, #ffffff);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.15s ease;
}

.rag-chunk-card:hover {
  border-color: var(--accent-border, rgba(99, 102, 241, 0.4));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
}

.chunk-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chunk-ident {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.chunk-num-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--accent, #4f46e5);
  color: #ffffff;
  flex-shrink: 0;
}

.chunk-file-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
}

.chunk-score-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--accent-bg, rgba(99, 102, 241, 0.1));
  color: var(--accent, #4f46e5);
  flex-shrink: 0;
}

/* ── 三维分数柱条 ── */
.chunk-scores-bars {
  background: var(--bg-surface-2, #f8fafc);
  border: 1px solid var(--border-subtle, #f1f5f9);
  border-radius: 7px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
}

.score-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.score-bar-title {
  width: 80px;
  color: var(--text-muted, #64748b);
  font-size: 10.5px;
  flex-shrink: 0;
}

.score-track {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  background: var(--border-subtle, #e2e8f0);
  overflow: hidden;
}

.score-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.fill-total { background: var(--accent, #4f46e5); }
.fill-vector { background: var(--cyan-600, #0284c7); }
.fill-keyword { background: var(--emerald-600, #059669); }

.score-bar-num {
  width: 32px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.num-total { color: var(--accent, #4f46e5); }
.num-vector { color: var(--cyan-600, #0284c7); }
.num-keyword { color: var(--emerald-600, #059669); }

/* ── 切片正文 ── */
.chunk-text-box {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, #f1f5f9);
  border-radius: 7px;
  padding: 9px 10px;
}

.chunk-text {
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary, #334155);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── TAB 2: Prompt 注入预览 ── */
.prompt-hint-box {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--amber-700, #b45309);
}

.prompt-hint-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.prompt-hint-text {
  margin: 0;
}

.prompt-terminal-card {
  border-radius: 10px;
  border: 1px solid #1e293b;
  background: #0f172a;
  color: #f1f5f9;
  overflow: hidden;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.4);
}

.terminal-header {
  padding: 8px 12px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.terminal-tag {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.04em;
}

.terminal-copy-btn {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid #475569;
  background: #334155;
  color: #f1f5f9;
  cursor: pointer;
  transition: all 0.15s ease;
}

.terminal-copy-btn:hover {
  background: #475569;
}

.terminal-content {
  padding: 12px 14px;
  font-size: 11.5px;
  line-height: 1.6;
  max-height: 480px;
  overflow-y: auto;
}

.terminal-meta-line {
  font-weight: 700;
  margin-bottom: 4px;
}

.terminal-instruction {
  color: #94a3b8;
  margin-bottom: 10px;
}

.terminal-block-tag {
  font-weight: 700;
  margin: 6px 0;
}

.terminal-context-body {
  border-left: 2px solid #059669;
  padding-left: 10px;
  margin-left: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.snippet-doc-head {
  display: block;
  font-weight: 600;
  font-size: 11px;
}

.snippet-doc-text {
  color: #cbd5e1;
  margin: 2px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.terminal-user-query {
  color: #38bdf8;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(14, 165, 233, 0.08);
}

.text-accent { color: #818cf8; }
.text-emerald { color: #34d399; }
.text-sky { color: #38bdf8; }

/* ── 动画定义 ── */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
  opacity: 0.8;
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
</style>
