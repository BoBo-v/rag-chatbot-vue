<template>
  <article class="comparison-run-card" :class="`status-${run.status}`">
    <header class="run-card-header">
      <div class="run-title">
        <span class="provider-badge">{{ run.config.provider }}</span>
        <strong>{{ modelName }}</strong>
      </div>
      <span class="status-pill">{{ statusText }}</span>
    </header>

    <div class="run-meta">
      <span v-if="latencyLabel">{{ latencyLabel }}</span>
      <span v-if="runStats.characterCount > 0">{{ runStats.characterCount }} 字符</span>
      <span v-if="runStats.wordCount > 0">{{ runStats.wordCount }} 词</span>
      <span v-if="codeStats.count > 0">{{ codeStats.count }} 段代码 · {{ codeStats.primaryLanguage }}</span>
      <span v-if="run.errorMessage" class="run-error">{{ run.errorMessage }}</span>
    </div>

    <div class="run-content">
      <div v-if="run.content" class="run-text">{{ run.content }}</div>
      <div v-else class="run-empty">{{ emptyText }}</div>
    </div>

    <footer class="run-actions">
      <button
        v-if="showStop"
        type="button"
        class="run-action"
        :disabled="!canStop"
        @click="$emit('stop', run.id)"
      >
        停止
      </button>
      <button
        v-if="showRetry"
        type="button"
        class="run-action primary"
        :disabled="!canRetry"
        @click="$emit('retry', run.id)"
      >
        重试
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getCodeBlockStats } from '../services/comparisonCode'
import { formatLatency, getRunStats } from '../services/comparisonStats'
import type { ComparisonRun } from '../types/model'

const props = defineProps<{
  run: ComparisonRun
  showStop?: boolean
  showRetry?: boolean
}>()

defineEmits<{
  stop: [runId: string]
  retry: [runId: string]
}>()

const modelName = computed(() => props.run.config.model || props.run.config.label)

const statusText = computed(() => {
  switch (props.run.status) {
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
      return props.run.status
  }
})

const emptyText = computed(() =>
  props.run.status === 'loading' || props.run.status === 'streaming'
    ? '等待模型输出...'
    : '暂无输出'
)

const latencyLabel = computed(() => {
  if (!props.run.latencyMs) return ''
  return formatLatency(props.run.latencyMs)
})
const runStats = computed(() => getRunStats(props.run))
const codeStats = computed(() => getCodeBlockStats(props.run))

const canStop = computed(() => props.run.status === 'loading' || props.run.status === 'streaming')
const canRetry = computed(() => props.run.status === 'done' || props.run.status === 'error' || props.run.status === 'aborted')
const showStop = computed(() => props.showStop ?? true)
const showRetry = computed(() => props.showRetry ?? true)
</script>

<style scoped>
.comparison-run-card {
  --run-line: var(--border);
  --run-line-strong: var(--border-subtle);
  --run-panel: var(--bg-elevated);
  --run-soft: var(--bg-surface-2);
  --run-text: var(--text-primary);
  --run-muted: var(--text-secondary);
  --run-primary: var(--accent-text);
  --run-primary-soft: var(--accent-bg);
  --run-scroll-track: var(--bg-surface-2);
  --run-scroll-thumb: var(--scrollbar-thumb);
  --run-success-text: #34d399;
  --run-success-bg: rgba(45, 157, 120, 0.16);
  --run-success-border: rgba(52, 211, 153, 0.28);
  --run-error-text: #fb7185;
  --run-error-bg: rgba(244, 63, 94, 0.14);
  --run-error-border: rgba(251, 113, 133, 0.32);
  --run-warning-text: #fbbf24;
  --run-warning-bg: rgba(245, 158, 11, 0.14);
  --run-warning-border: rgba(251, 191, 36, 0.30);
  display: flex;
  flex-direction: column;
  min-height: 360px;
  border: 1px solid var(--run-line);
  border-radius: 8px;
  background: var(--run-panel);
  overflow: hidden;
}

:global([data-theme="light"]) .comparison-run-card {
  --run-line: #d8d4eb;
  --run-line-strong: #c5bfe0;
  --run-panel: #fbfaff;
  --run-soft: #f6f4ff;
  --run-text: #17162a;
  --run-muted: #76718f;
  --run-primary: #6f3fd9;
  --run-primary-soft: #ede6ff;
  --run-scroll-track: #f4f1ff;
  --run-scroll-thumb: #b9addf;
  --run-success-text: #1f8a67;
  --run-success-bg: rgba(45, 157, 120, 0.12);
  --run-success-border: rgba(45, 157, 120, 0.28);
  --run-error-text: #dc4d62;
  --run-error-bg: #fff5f7;
  --run-error-border: #f1bdc6;
  --run-warning-text: #a1711b;
  --run-warning-bg: rgba(182, 133, 37, 0.10);
  --run-warning-border: rgba(182, 133, 37, 0.30);
}

.comparison-run-card,
.comparison-run-card * {
  scrollbar-width: thin;
  scrollbar-color: var(--run-scroll-thumb) var(--run-scroll-track);
}

.comparison-run-card::-webkit-scrollbar,
.comparison-run-card *::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}

.comparison-run-card::-webkit-scrollbar-track,
.comparison-run-card *::-webkit-scrollbar-track {
  background: var(--run-scroll-track);
  border-radius: 999px;
}

.comparison-run-card::-webkit-scrollbar-thumb,
.comparison-run-card *::-webkit-scrollbar-thumb {
  border: 2px solid var(--run-scroll-track);
  border-radius: 999px;
  background: var(--run-scroll-thumb);
}

.comparison-run-card::-webkit-scrollbar-thumb:hover,
.comparison-run-card *::-webkit-scrollbar-thumb:hover {
  background: var(--run-primary);
}

.run-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--run-line);
}

.run-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: var(--run-text);
}

.run-title strong {
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.provider-badge,
.status-pill {
  width: fit-content;
  border: 1px solid var(--run-line);
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--run-muted);
  background: var(--run-soft);
}

.status-pill {
  flex-shrink: 0;
}

.status-streaming .status-pill,
.status-loading .status-pill {
  border-color: var(--run-success-border);
  background: var(--run-success-bg);
  color: var(--run-success-text);
}

.status-done .status-pill {
  border-color: var(--accent-border);
  background: var(--run-primary-soft);
  color: var(--run-primary);
}

.status-error .status-pill {
  border-color: var(--run-error-border);
  background: var(--run-error-bg);
  color: var(--run-error-text);
}

.status-aborted .status-pill {
  border-color: var(--run-warning-border);
  background: var(--run-warning-bg);
  color: var(--run-warning-text);
}

.run-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 28px;
  padding: 8px 14px;
  color: var(--run-muted);
  font-size: 12px;
  border-bottom: 1px solid var(--run-line);
}

.run-error {
  color: var(--run-error-text);
  overflow-wrap: anywhere;
}

.run-content {
  flex: 1;
  min-height: 0;
  padding: 14px;
  overflow: auto;
}

.run-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--run-text);
  font-size: 14px;
  line-height: 1.65;
  text-align: left;
}

.run-empty {
  color: var(--run-muted);
  font-size: 13px;
}

.run-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--run-line);
}

.run-action {
  height: 32px;
  border: 1px solid var(--run-line-strong);
  border-radius: 8px;
  padding: 0 12px;
  background: var(--run-soft);
  color: var(--run-muted);
  cursor: pointer;
}

.run-action.primary {
  border-color: var(--accent-border);
  color: var(--run-primary);
  background: var(--run-primary-soft);
}

.run-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Shared violet console tokens */
.comparison-run-card,
:global([data-theme="light"]) .comparison-run-card {
  --run-line: var(--border-subtle);
  --run-line-strong: var(--border);
  --run-panel: var(--bg-elevated);
  --run-soft: var(--bg-surface-2);
  --run-text: var(--text-primary);
  --run-muted: var(--text-secondary);
  --run-primary: var(--accent-text);
  --run-primary-soft: var(--accent-bg);
  --run-scroll-track: transparent;
  --run-scroll-thumb: var(--scrollbar-thumb);
  --run-success-text: var(--success);
  --run-success-bg: var(--success-bg);
  --run-success-border: var(--success-border);
  --run-error-text: var(--danger);
  --run-error-bg: var(--danger-bg);
  --run-error-border: var(--danger-border);
  --run-warning-text: var(--warning);
  --run-warning-bg: var(--warning-bg);
  --run-warning-border: var(--warning-border);
  min-height: 340px;
  border-color: var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}

.run-card-header { padding: 13px 14px; }

.provider-badge,
.status-pill {
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
}

.run-meta {
  font-family: var(--font-mono);
  font-size: 10px;
}

.run-action {
  min-height: 36px;
  border-radius: var(--radius-sm);
}

.run-action.primary {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

@media (max-width: 820px) {
  .comparison-run-card { min-height: 300px; }
  .run-action { min-height: 44px; }
}
</style>
