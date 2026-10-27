<template>
  <header class="demo-controls-bar">
    <div class="controls-left">
      <div class="demo-badge">
        <Sparkles :size="15" class="badge-icon" aria-hidden="true" />
        <span class="badge-title">演示沙盒</span>
        <span class="badge-sub">离线仿真 · 零模型依赖</span>
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
        v-if="stage !== 'completed'"
        type="button"
        class="ctrl-btn btn-secondary"
        title="跳过打字机流式，直接查看完整推理结果"
        @click="$emit('skip')"
      >
        <FastForward :size="14" aria-hidden="true" />
        <span>立即显示结果</span>
      </button>

      <button
        type="button"
        class="ctrl-btn btn-secondary"
        title="从头重新模拟播放"
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
      return '检索知识库官方依据中...'
    case 'streaming_analysis':
      return '正在流式推演内部分析与客户草稿...'
    case 'completed':
      return '推演完成 · 操作按钮已就绪'
    case 'paused':
      return '已暂停'
    default:
      return '就绪'
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
  background: var(--color-bg-card, #141320);
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  gap: 14px;
  flex-wrap: wrap;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.demo-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.14);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 20px;
  color: #a5b4fc;
  font-size: 12px;
}

.badge-icon {
  color: #818cf8;
}

.badge-title {
  font-weight: 600;
  color: #c7d2fe;
}

.badge-sub {
  color: rgba(199, 210, 254, 0.7);
  font-size: 11px;
}

.scenario-selector {
  position: relative;
  display: flex;
  align-items: center;
}

.scenario-dropdown {
  appearance: none;
  background: var(--color-bg-surface, #1e1c2e);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.15));
  border-radius: 6px;
  color: var(--color-text, #f0eef8);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 28px 6px 10px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s ease;
}

.scenario-dropdown:focus {
  border-color: var(--color-primary, #6366f1);
}

.select-chevron {
  position: absolute;
  right: 9px;
  pointer-events: none;
  color: var(--color-text-subtle, #a09cb4);
}

.stage-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-subtle, #a09cb4);
}

.indicator-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
}

.stage-indicator.is-active .indicator-dot {
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
  animation: pulse 1.6s infinite ease-in-out;
}

.stage-indicator.is-done .indicator-dot {
  background: #34d399;
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
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.btn-secondary {
  background: var(--color-bg-surface, #1e1c2e);
  border-color: var(--color-border, rgba(255, 255, 255, 0.12));
  color: var(--color-text, #e2e0ed);
}

.btn-secondary:hover {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--color-border-hover, rgba(255, 255, 255, 0.22));
}

.btn-exit {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.btn-exit:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fee2e2;
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
