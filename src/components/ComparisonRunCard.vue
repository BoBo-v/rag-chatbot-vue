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
      <span v-if="run.errorMessage" class="run-error">{{ run.errorMessage }}</span>
    </div>

    <div class="run-content">
      <div v-if="run.content" class="run-text">{{ run.content }}</div>
      <div v-else class="run-empty">{{ emptyText }}</div>
    </div>

    <footer class="run-actions">
      <button
        type="button"
        class="run-action"
        :disabled="!canStop"
        @click="$emit('stop', run.id)"
      >
        停止
      </button>
      <button
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
import type { ComparisonRun } from '../types/model'

const props = defineProps<{
  run: ComparisonRun
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
  if (props.run.latencyMs < 1000) return `${props.run.latencyMs} ms`
  return `${(props.run.latencyMs / 1000).toFixed(1)} s`
})

const canStop = computed(() => props.run.status === 'loading' || props.run.status === 'streaming')
const canRetry = computed(() => props.run.status === 'done' || props.run.status === 'error' || props.run.status === 'aborted')
</script>

<style scoped>
.comparison-run-card {
  display: flex;
  flex-direction: column;
  min-height: 360px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated);
  overflow: hidden;
}

.run-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--border-faint);
}

.run-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: var(--text-primary);
}

.run-title strong {
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.provider-badge,
.status-pill {
  width: fit-content;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
  background: var(--bg-surface-3);
}

.status-pill {
  flex-shrink: 0;
}

.status-streaming .status-pill,
.status-loading .status-pill {
  color: #86efac;
  border-color: rgba(134, 239, 172, 0.32);
  background: rgba(34, 197, 94, 0.12);
}

.status-error .status-pill {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.12);
}

.status-aborted .status-pill {
  color: #facc15;
  border-color: rgba(250, 204, 21, 0.35);
  background: rgba(250, 204, 21, 0.10);
}

.run-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 28px;
  padding: 8px 14px;
  color: var(--text-muted);
  font-size: 12px;
  border-bottom: 1px solid var(--border-faint);
}

.run-error {
  color: #fca5a5;
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
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.65;
  text-align: left;
}

.run-empty {
  color: var(--text-faint);
  font-size: 13px;
}

.run-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--border-faint);
}

.run-action {
  height: 32px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0 12px;
  background: var(--bg-surface-3);
  color: var(--text-secondary);
  cursor: pointer;
}

.run-action.primary {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.run-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
