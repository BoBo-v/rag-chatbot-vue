<template>
  <header class="demo-controls-bar">
    <div class="controls-left">
      <div class="demo-badge">
        <Sparkles :size="15" class="badge-icon" aria-hidden="true" />
        <span class="badge-title">演示沙盒</span>
        <span class="badge-sub">离线推演</span>
      </div>

      <div class="scenario-selector">
        <label for="scenario-select" class="sr-only">选择演示案例</label>
        <select
          id="scenario-select"
          :value="currentScenarioId"
          class="scenario-dropdown"
          @change="$emit('switch-scenario', ($event.target as HTMLSelectElement).value as DemoScenarioId)"
        >
          <option
            v-for="item in allScenarios"
            :key="item.id"
            :value="item.id"
          >
            {{ item.title }}
          </option>
        </select>
        <ChevronDown :size="14" class="select-chevron" aria-hidden="true" />
      </div>

      <div class="stage-indicator" :class="stageClass">
        <span class="indicator-dot"></span>
        <span class="indicator-text">{{ stageLabel }}</span>
      </div>
    </div>

    <div class="controls-right">
      <button
        v-if="stage === 'streaming_analysis' || stage === 'simulating_rag'"
        type="button"
        class="ctrl-btn btn-action"
        title="跳过逐字打字机动画，直接呈现完整结果"
        @click="$emit('skip')"
      >
        <FastForward :size="14" aria-hidden="true" />
        <span>立即出结果</span>
      </button>

      <button
        type="button"
        class="ctrl-btn btn-secondary"
        title="从头重新模拟播放当前案例"
        @click="$emit('replay')"
      >
        <RotateCcw :size="14" aria-hidden="true" />
        <span>重新播放</span>
      </button>

      <button
        type="button"
        class="ctrl-btn btn-exit"
        title="退出沙盒，返回真实工作区"
        @click="$emit('exit')"
      >
        <LogOut :size="14" aria-hidden="true" />
        <span>退出演示</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  Sparkles,
  ChevronDown,
  FastForward,
  RotateCcw,
  LogOut,
} from 'lucide-vue-next'
import type { DemoScenarioDefinition, DemoScenarioId, PlaybackStage } from '../types'

const props = defineProps<{
  currentScenarioId: DemoScenarioId
  allScenarios: DemoScenarioDefinition[]
  stage: PlaybackStage
}>()

defineEmits<{
  (e: 'switch-scenario', id: DemoScenarioId): void
  (e: 'skip'): void
  (e: 'replay'): void
  (e: 'exit'): void
}>()

const stageLabel = computed(() => {
  switch (props.stage) {
    case 'presenting_ticket':
      return '呈现报障工单...'
    case 'simulating_rag':
      return '正在检索知识库依据...'
    case 'streaming_analysis':
      return 'AI 正在推演内部分析与客户草稿...'
    case 'completed':
      return '推演完成 · 操作按钮已就绪'
    case 'paused':
      return '已暂停'
    default:
      return '待发送工单'
  }
})

const stageClass = computed(() => {
  if (props.stage === 'completed') return 'is-done'
  if (props.stage === 'idle') return 'is-idle'
  return 'is-active'
})
</script>

<style scoped>
.demo-controls-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: var(--bg-surface, #ffffff);
  border-bottom: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.06));
  gap: 12px;
  flex-wrap: wrap;
  z-index: 10;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.demo-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--accent-bg, rgba(139, 92, 246, 0.12));
  border: 1px solid var(--accent-border, rgba(167, 139, 250, 0.3));
  border-radius: var(--radius-pill, 999px);
  color: var(--accent-text, #7c3aed);
  font-size: 12px;
}

.badge-icon {
  color: var(--accent, #7c3aed);
}

.badge-title {
  font-weight: 600;
  color: var(--text-primary, #1e192b);
}

.badge-sub {
  color: var(--text-muted, #7d7291);
  font-size: 11px;
}

.scenario-selector {
  position: relative;
  display: flex;
  align-items: center;
}

.scenario-dropdown {
  appearance: none;
  background: var(--bg-input, #ffffff);
  border: 1px solid var(--border, rgba(124, 58, 237, 0.2));
  border-radius: var(--radius-sm, 6px);
  color: var(--text-primary, #1e192b);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 28px 6px 10px;
  cursor: pointer;
  outline: none;
  transition: border-color var(--motion-fast, 140ms) ease;
}

.scenario-dropdown:focus {
  border-color: var(--accent, #7c3aed);
  box-shadow: var(--focus-ring, 0 0 0 3px rgba(124, 58, 237, 0.2));
}

.select-chevron {
  position: absolute;
  right: 9px;
  pointer-events: none;
  color: var(--text-muted, #7d7291);
}

.stage-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary, #574e69);
  padding: 0 4px;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted, #81798f);
}

.stage-indicator.is-active .indicator-dot {
  background: var(--data-accent, #0891b2);
  box-shadow: 0 0 8px var(--data-accent, #0891b2);
  animation: pulse 1.6s infinite ease-in-out;
}

.stage-indicator.is-done .indicator-dot {
  background: var(--success, #059669);
  box-shadow: 0 0 6px var(--success, #059669);
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
  border: 1px solid transparent;
}

.btn-action {
  background: var(--accent-bg, rgba(124, 58, 237, 0.12));
  border-color: var(--accent-border, rgba(124, 58, 237, 0.3));
  color: var(--accent-text, #7c3aed);
}

.btn-action:hover {
  background: var(--accent, #7c3aed);
  color: #ffffff;
}

.btn-secondary {
  background: var(--bg-surface-2, #f0ecf7);
  border-color: var(--border-subtle, rgba(124, 58, 237, 0.12));
  color: var(--text-primary, #1e192b);
}

.btn-secondary:hover {
  background: var(--bg-surface-3, #e8e2f2);
  border-color: var(--border, rgba(124, 58, 237, 0.25));
}

.btn-exit {
  background: var(--danger-bg, rgba(220, 38, 38, 0.08));
  border-color: var(--danger-border, rgba(220, 38, 38, 0.25));
  color: var(--danger, #dc2626);
}

.btn-exit:hover {
  background: var(--danger, #dc2626);
  color: #ffffff;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
