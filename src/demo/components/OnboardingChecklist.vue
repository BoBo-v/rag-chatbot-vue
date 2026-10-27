<template>
  <div v-if="!isDismissed" class="onboarding-checklist-card">
    <div class="checklist-header">
      <div class="checklist-title-row">
        <Sparkles :size="16" class="checklist-spark-icon" aria-hidden="true" />
        <span class="checklist-title">新手起步向导</span>
        <span class="checklist-tag">3 步快速上手</span>
      </div>

      <div class="checklist-header-actions">
        <button
          type="button"
          class="checklist-text-btn"
          title="重新体验交互式引导导览"
          @click="startFeatureTour(true)"
        >
          <Compass :size="13" aria-hidden="true" />
          <span>功能导览</span>
        </button>
        <button
          type="button"
          class="checklist-icon-btn"
          :title="isCollapsed ? '展开清单' : '收起清单'"
          :aria-label="isCollapsed ? '展开清单' : '收起清单'"
          @click="isCollapsed = !isCollapsed"
        >
          <ChevronUp v-if="!isCollapsed" :size="14" aria-hidden="true" />
          <ChevronDown v-else :size="14" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="checklist-icon-btn close"
          title="不再显示向导"
          aria-label="不再显示新手起步向导"
          @click="dismiss"
        >
          <X :size="13" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-show="!isCollapsed" class="checklist-body">
      <div class="checklist-item" @click="$emit('open-demo')">
        <div class="item-icon-box">
          <Play :size="13" />
        </div>
        <div class="item-text">
          <strong>1. 体验演示沙盒</strong>
          <p>零配置体验真实的知识库检索、两段式分析与草稿采纳</p>
        </div>
        <span class="item-action-tag">免配置体验 ›</span>
      </div>

      <div class="checklist-item" @click="$emit('open-settings')">
        <div class="item-icon-box">
          <Settings2 :size="13" />
        </div>
        <div class="item-text">
          <strong>2. 检查模型与连接配置</strong>
          <p>配置本地 Ollama 或填写在线 OpenAI / Claude 兼容 Key</p>
        </div>
        <span class="item-action-tag">打开设置 ›</span>
      </div>

      <div class="checklist-item" @click="$emit('switch-mode', 'knowledge')">
        <div class="item-icon-box">
          <Database :size="13" />
        </div>
        <div class="item-text">
          <strong>3. 浏览本地知识库与评测</strong>
          <p>上传常见排障文档、PDF 或图片手册，构建专属向量知识库</p>
        </div>
        <span class="item-action-tag">前往知识库 ›</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Sparkles,
  Compass,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Settings2,
  Database,
} from 'lucide-vue-next'
import { startFeatureTour } from '../tour'

defineEmits<{
  (e: 'open-demo'): void
  (e: 'open-settings'): void
  (e: 'switch-mode', mode: string): void
}>()

const STORAGE_KEY = 'ai_chat_checklist_dismissed'

const isDismissed = ref(false)
const isCollapsed = ref(false)

try {
  isDismissed.value = localStorage.getItem(STORAGE_KEY) === 'true'
} catch {
  isDismissed.value = false
}

function dismiss() {
  isDismissed.value = true
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // Ignore storage errors
  }
}
</script>

<style scoped>
.onboarding-checklist-card {
  max-width: 680px;
  width: 100%;
  margin: 0 0 16px 0;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  background: var(--color-bg-surface, #141322);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  box-sizing: border-box;
}

.checklist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(99, 102, 241, 0.08);
  border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
}

.checklist-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checklist-spark-icon {
  color: #818cf8;
}

.checklist-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #f0eef8);
}

.checklist-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
}

.checklist-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.checklist-text-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: #a5b4fc;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}

.checklist-text-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  color: #c7d2fe;
}

.checklist-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: none;
  border: none;
  color: var(--color-text-subtle, #a09cb4);
  cursor: pointer;
}

.checklist-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text, #f0eef8);
}

.checklist-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.checklist-item:hover {
  background: rgba(99, 102, 241, 0.09);
  border-color: rgba(99, 102, 241, 0.25);
}

.item-icon-box {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-text strong {
  font-size: 12.5px;
  color: var(--color-text, #f0eef8);
}

.item-text p {
  margin: 0;
  font-size: 11.5px;
  color: var(--color-text-subtle, #a09cb4);
}

.item-action-tag {
  font-size: 11.5px;
  color: #818cf8;
  font-weight: 500;
  flex-shrink: 0;
}
</style>
