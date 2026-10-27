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
          <strong>1. 体验工单推演沙盒</strong>
          <p>零配置体验知识库切片检索、内部分析与客户草稿输出全流程</p>
        </div>
        <span class="item-action-tag">免配置试玩 ›</span>
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
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  background: var(--bg-surface, #ffffff);
  box-shadow: var(--shadow-sm, 0 4px 18px rgba(0, 0, 0, 0.05));
  overflow: hidden;
  box-sizing: border-box;
}

.checklist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--accent-bg, rgba(124, 58, 237, 0.08));
  border-bottom: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.12));
}

.checklist-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checklist-spark-icon {
  color: var(--accent, #7c3aed);
}

.checklist-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1e192b);
}

.checklist-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-pill, 999px);
  background: var(--accent-soft, rgba(167, 139, 250, 0.18));
  color: var(--accent-text, #7c3aed);
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
  color: var(--accent-text, #7c3aed);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 4px);
  transition: background var(--motion-fast, 140ms) ease;
}

.checklist-text-btn:hover {
  background: var(--accent-bg, rgba(124, 58, 237, 0.15));
}

.checklist-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs, 4px);
  background: none;
  border: none;
  color: var(--text-muted, #7d7291);
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.checklist-icon-btn:hover {
  background: var(--bg-surface-2, #f0ecf7);
  color: var(--text-primary, #1e192b);
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
  border-radius: var(--radius-sm, 6px);
  background: var(--bg-surface-2, #f0ecf7);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.checklist-item:hover {
  background: var(--accent-bg, rgba(124, 58, 237, 0.12));
  border-color: var(--accent-border, rgba(124, 58, 237, 0.28));
}

.item-icon-box {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs, 4px);
  background: var(--accent-bg, rgba(124, 58, 237, 0.18));
  color: var(--accent, #7c3aed);
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
  color: var(--text-primary, #1e192b);
}

.item-text p {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-secondary, #574e69);
}

.item-action-tag {
  font-size: 11.5px;
  color: var(--accent, #7c3aed);
  font-weight: 500;
  flex-shrink: 0;
}
</style>
