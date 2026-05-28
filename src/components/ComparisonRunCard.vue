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
  display: flex;
  flex-direction: column;
  min-height: 360px;
  border: 1px solid #d8d4eb;
  border-radius: 8px;
  background: #fbfaff;
  overflow: hidden;
}

.comparison-run-card,
.comparison-run-card * {
  scrollbar-width: thin;
  scrollbar-color: #b9addf #f4f1ff;
}

.comparison-run-card::-webkit-scrollbar,
.comparison-run-card *::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}

.comparison-run-card::-webkit-scrollbar-track,
.comparison-run-card *::-webkit-scrollbar-track {
  background: #f4f1ff;
  border-radius: 999px;
}

.comparison-run-card::-webkit-scrollbar-thumb,
.comparison-run-card *::-webkit-scrollbar-thumb {
  border: 2px solid #f4f1ff;
  border-radius: 999px;
  background: #b9addf;
}

.comparison-run-card::-webkit-scrollbar-thumb:hover,
.comparison-run-card *::-webkit-scrollbar-thumb:hover {
  background: #9f8ed4;
}

.run-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #d8d4eb;
}

.run-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: #17162a;
}

.run-title strong {
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.provider-badge,
.status-pill {
  width: fit-content;
  border: 1px solid #d8d4eb;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 11px;
  line-height: 1.4;
  color: #76718f;
  background: #f6f4ff;
}

.status-pill {
  flex-shrink: 0;
}

.status-streaming .status-pill,
.status-loading .status-pill {
  border-color: rgba(45, 157, 120, 0.28);
  background: rgba(45, 157, 120, 0.12);
  color: #1f8a67;
}

.status-done .status-pill {
  border-color: #bdaaf2;
  background: #ede6ff;
  color: #6f3fd9;
}

.status-error .status-pill {
  border-color: #f1bdc6;
  background: #fff5f7;
  color: #dc4d62;
}

.status-aborted .status-pill {
  border-color: rgba(182, 133, 37, 0.30);
  background: rgba(182, 133, 37, 0.10);
  color: #a1711b;
}

.run-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 28px;
  padding: 8px 14px;
  color: #76718f;
  font-size: 12px;
  border-bottom: 1px solid #d8d4eb;
}

.run-error {
  color: #ef6b7b;
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
  color: #17162a;
  font-size: 14px;
  line-height: 1.65;
  text-align: left;
}

.run-empty {
  color: #76718f;
  font-size: 13px;
}

.run-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px 14px;
  border-top: 1px solid #d8d4eb;
}

.run-action {
  height: 32px;
  border: 1px solid #c5bfe0;
  border-radius: 8px;
  padding: 0 12px;
  background: #f8f6ff;
  color: #3b3752;
  cursor: pointer;
}

.run-action.primary {
  border-color: #bdaaf2;
  color: #6f3fd9;
  background: #ede6ff;
}

.run-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
