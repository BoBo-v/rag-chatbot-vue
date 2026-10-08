<template>
  <div class="rag-citations-container">
    <!-- 工单决策状态横幅（充分证据 / 低分介入 / 转二线） -->
    <div v-if="evidenceBadge" class="rag-decision-banner" :class="evidenceBadge.level">
      <div class="decision-head">
        <component :is="evidenceBadge.icon" :size="15" class="decision-icon" aria-hidden="true" />
        <strong class="decision-title">{{ evidenceBadge.text }}</strong>
        <span class="decision-action-tag">{{ evidenceBadge.action }}</span>
      </div>
      <p class="decision-detail">{{ evidenceBadge.detail }}</p>
    </div>

    <details class="rag-citations">
      <summary class="rag-citations-summary">
        <ChevronRight class="rag-citations-chevron" :size="15" aria-hidden="true" />
        <Database :size="15" aria-hidden="true" />
        <span class="rag-citations-title">{{ summaryTitle }}</span>
        <span class="rag-citations-state" :class="stateBadgeClass">{{ stateLabel }}</span>
      </summary>

      <div class="rag-citations-body">
        <p v-if="context.errorMessage" class="rag-citations-empty">
          引用证据获取失败：{{ context.errorMessage }}
        </p>
        <p v-else-if="context.mode === 'off'" class="rag-citations-empty">
          本次工单已关闭知识库检索
        </p>
        <p v-else-if="!context.enabled" class="rag-citations-empty">
          未检索到达到阈值的相关依据，已直接推理排障。建议核对客户环境信息或人工介入。
        </p>
        <p v-else-if="displayResults.length === 0" class="rag-citations-empty">
          已检索知识库，但未命中相关技术排障条目。
        </p>

        <ol v-else class="rag-citations-list">
          <li v-for="item in displayResults" :key="`${item.fileId}-${item.chunkIndex}`" class="rag-citation-item">
            <header class="rag-citation-head">
              <strong class="citation-doc" :title="item.filename">{{ item.filename }}</strong>
              <span class="citation-chunk">chunk #{{ item.chunkIndex }}</span>
            </header>
            <div class="rag-score-row">
              <span class="score-chip total-score">综合证据分 {{ formatScore(item.score) }}</span>
              <span class="score-chip">向量相似度 {{ formatScore(item.vectorScore) }}</span>
              <span class="score-chip">关键词命中 {{ formatScore(item.keywordScore) }}</span>
            </div>
            <p class="rag-citation-text">{{ previewText(item.text) }}</p>
          </li>
        </ol>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { AlertTriangle, ChevronRight, Database, ShieldAlert, ShieldCheck } from 'lucide-vue-next'
import type { RagContextInfo } from '../types/chat'

const props = defineProps<{
  context: RagContextInfo
}>()

const displayResults = computed(() =>
  props.context.enabled
    ? props.context.results.filter(item => item.text.trim().length > 0)
    : []
)

const maxScore = computed(() => {
  if (!props.context.enabled || displayResults.value.length === 0) return 0
  const scores = displayResults.value.map(item => Number(item.score)).filter(Number.isFinite)
  return scores.length > 0 ? Math.max(...scores) : 0
})

interface EvidenceBadge {
  level: 'sufficient' | 'low' | 'insufficient'
  text: string
  action: string
  detail: string
  icon: Component
}

const evidenceBadge = computed<EvidenceBadge | null>(() => {
  if (props.context.mode === 'off') return null
  if (!props.context.enabled || displayResults.value.length === 0) {
    return {
      level: 'insufficient',
      text: '证据不足，需补充信息',
      action: '建议追问客户 / 人工介入',
      detail: '未检索到高匹配知识库排障依据，当前回复仅供参考，请勿直接作为确诊根因发送。',
      icon: ShieldAlert,
    }
  }

  const score = maxScore.value
  if (score >= 0.65) {
    return {
      level: 'sufficient',
      text: `已找到充分证据（${score.toFixed(2)}）`,
      action: '可采纳草稿',
      detail: '检索结果与知识库官方文档高度匹配，可核对后采纳回复草稿。',
      icon: ShieldCheck,
    }
  } else if (score >= 0.45) {
    return {
      level: 'low',
      text: `知识库证据分数较低（${score.toFixed(2)}），建议人工介入`,
      action: '建议核对版本 / 追问客户',
      detail: '检索到的技术文档相关度不高，可能存在版本差异或关键日志缺失，请人工复核。',
      icon: AlertTriangle,
    }
  } else {
    return {
      level: 'insufficient',
      text: `证据相关度不足（${score.toFixed(2)}），建议转二线研发`,
      action: '禁止直接发送',
      detail: '知识库证据得分严重偏低，未能确认故障因果链，建议升级二线研发团队进一步跟进。',
      icon: ShieldAlert,
    }
  }
})

const summaryTitle = computed(() => {
  if (props.context.errorMessage) return '引用证据获取失败'
  if (displayResults.value.length > 0) return `知识库证据溯源 (${displayResults.value.length} 条)`
  return '知识库证据溯源'
})

const stateLabel = computed(() => {
  if (props.context.mode === 'off') return '知识库已关闭'
  if (props.context.mode === 'force') return displayResults.value.length > 0 ? '强制使用知识库' : '强制检索无命中'
  if (!props.context.enabled) return '未启用 RAG'
  if (displayResults.value.length === 0) return '无命中'
  if (maxScore.value >= 0.65) return `充分证据 · ${maxScore.value.toFixed(2)}`
  if (maxScore.value >= 0.45) return `证据偏弱 · ${maxScore.value.toFixed(2)}`
  return `低分 · ${maxScore.value.toFixed(2)}`
})

const stateBadgeClass = computed(() => {
  if (!props.context.enabled || displayResults.value.length === 0) return 'state-muted'
  if (maxScore.value >= 0.65) return 'state-success'
  if (maxScore.value >= 0.45) return 'state-warning'
  return 'state-danger'
})

function formatScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '-'
}

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 220 ? normalized.slice(0, 220) + '...' : normalized
}
</script>

<style scoped>
.rag-citations-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
}

.rag-decision-banner {
  border-radius: var(--radius-sm, 8px);
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.45;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-2);
}

.rag-decision-banner.sufficient {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.3);
  color: var(--text-primary);
}

.rag-decision-banner.low {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.35);
  color: var(--text-primary);
}

.rag-decision-banner.insufficient {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.35);
  color: var(--text-primary);
}

.decision-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

.decision-icon {
  flex-shrink: 0;
}

.rag-decision-banner.sufficient .decision-icon {
  color: #10b981;
}

.rag-decision-banner.low .decision-icon {
  color: #f59e0b;
}

.rag-decision-banner.insufficient .decision-icon {
  color: #ef4444;
}

.decision-title {
  font-size: 12.5px;
  font-weight: 600;
}

.decision-action-tag {
  margin-left: auto;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  font-weight: 500;
  white-space: nowrap;
}

.rag-decision-banner.sufficient .decision-action-tag {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.rag-decision-banner.low .decision-action-tag {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.rag-decision-banner.insufficient .decision-action-tag {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.decision-detail {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.rag-citations-state.state-success {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
}

.rag-citations-state.state-warning {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.35);
}

.rag-citations-state.state-danger {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.35);
}

.rag-citations-state.state-muted {
  background: var(--bg-surface-3);
  color: var(--text-muted);
  border-color: var(--border-subtle);
}

.score-chip.total-score {
  font-weight: 600;
  color: var(--accent-text);
  background: var(--accent-bg);
}
</style>
