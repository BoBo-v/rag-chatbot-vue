<template>
  <div class="demo-workspace">
    <!-- 顶部沙盒状态与控制栏 -->
    <DemoControls
      :current-scenario-id="currentScenarioId"
      :all-scenarios="allScenarios"
      :stage="stage"
      @switch-scenario="switchScenario"
      @skip="skipToFinish"
      @replay="replay"
      @exit="$emit('exit')"
    />

    <!-- 演示主视口 -->
    <div class="demo-main-stage">
      <div class="demo-chat-feed">
        <div class="messages-container">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="msg-row"
            :class="msg.role"
          >
            <!-- 头像 -->
            <div v-if="msg.role === 'assistant'" class="msg-avatar ai-avatar">
              <img src="/favicon.svg" alt="AI" />
            </div>
            <div v-else class="msg-avatar user-avatar">
              <span>U</span>
            </div>

            <!-- 消息气泡 -->
            <div class="msg-col">
              <div
                class="msg-bubble"
                :class="[
                  msg.role,
                  {
                    'is-loading': msg.status === 'loading',
                    'is-streaming': msg.status === 'streaming',
                  },
                ]"
              >
                <!-- 加载中指示器 -->
                <div v-if="msg.status === 'loading'" class="loading-dots">
                  <span></span><span></span><span></span>
                </div>

                <!-- Markdown 内容 -->
                <div
                  v-else
                  class="msg-content markdown-body"
                  v-html="renderMarkdown(msg.content)"
                ></div>
              </div>

              <!-- RAG 引用文档展示组件 -->
              <div
                v-if="msg.role === 'assistant' && msg.ragContext"
                ref="citationsWrapperRef"
                class="demo-citations-wrapper"
                :class="{ 'force-open': isEvidenceExpanded }"
              >
                <RagCitations :context="msg.ragContext" />
              </div>

              <!-- 消息快捷操作栏（模拟完整工单闭环动作） -->
              <div
                v-if="msg.role === 'assistant' && msg.status !== 'loading'"
                class="msg-actions-bar"
              >
                <!-- 状态徽章 -->
                <span v-if="isEscalated" class="ticket-status-badge badge-escalated">
                  <Headphones :size="12" aria-hidden="true" /> 已转二线人工
                </span>
                <span v-if="isConfirmed" class="ticket-status-badge badge-confirmed">
                  <CheckCheck :size="12" aria-hidden="true" /> 方案已确认闭环
                </span>

                <!-- 采纳草稿并复制 -->
                <button
                  type="button"
                  class="demo-action-btn btn-adopt-draft"
                  :class="{ copied: copiedField === 'draft' }"
                  :disabled="stage !== 'completed'"
                  title="仅提取并复制客户回复草稿，不泄露内部依据与检索分"
                  @click="adoptAndCopy"
                >
                  <Check v-if="copiedField === 'draft'" :size="14" :stroke-width="2" aria-hidden="true" />
                  <Copy v-else :size="14" :stroke-width="1.75" aria-hidden="true" />
                  <span>{{ copiedField === 'draft' ? '已采纳并复制' : '采纳草稿并复制' }}</span>
                </button>

                <!-- 查看/展开知识库依据 -->
                <button
                  type="button"
                  class="demo-action-btn"
                  title="展开或定位知识库切片依据"
                  @click="toggleEvidence"
                >
                  <Database :size="14" aria-hidden="true" />
                  <span>{{ isEvidenceExpanded ? '收起依据' : '查看知识库依据' }}</span>
                </button>

                <!-- 标记转二线研发 -->
                <button
                  type="button"
                  class="demo-action-btn"
                  :class="{ active: isEscalated }"
                  title="当信息不足或官方未收录时，标记升级转二线技术研发"
                  @click="toggleEscalate"
                >
                  <Headphones :size="14" aria-hidden="true" />
                  <span>{{ isEscalated ? '取消转二线' : '升级二线研发' }}</span>
                </button>

                <!-- 标记方案闭环 -->
                <button
                  type="button"
                  class="demo-action-btn"
                  :class="{ active: isConfirmed }"
                  title="工单解决后标记确认闭环"
                  @click="toggleConfirm"
                >
                  <CheckCheck :size="14" aria-hidden="true" />
                  <span>{{ isConfirmed ? '已闭环' : '方案确认闭环' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部微调预览区（展示草稿可微调，直观呈现对客输出隔离） -->
      <footer v-if="stage === 'completed'" class="demo-draft-tray">
        <div class="tray-inner">
          <div class="tray-head">
            <span class="tray-title">
              <FileCheck :size="15" class="tray-icon" aria-hidden="true" />
              已提取可回复给客户的纯净草稿（已剔除内部分析与检索打分）：
            </span>
            <button
              type="button"
              class="tray-copy-btn"
              :class="{ copied: copiedField === 'draft' }"
              @click="adoptAndCopy"
            >
              <Check v-if="copiedField === 'draft'" :size="13" />
              <Copy v-else :size="13" />
              <span>{{ copiedField === 'draft' ? '已复制' : '一键采纳复制' }}</span>
            </button>
          </div>
          <textarea
            v-model="editedDraft"
            class="tray-textarea"
            rows="3"
            placeholder="您可在此处直接微调修改对客回复文本..."
          ></textarea>
        </div>
      </footer>
    </div>

    <!-- 剪贴板受阻降级弹窗 -->
    <DemoCopyModal :text="copyFailedDraft" @close="copyFailedDraft = null" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  Check,
  CheckCheck,
  Copy,
  Database,
  FileCheck,
  Headphones,
} from 'lucide-vue-next'
import DemoControls from './DemoControls.vue'
import DemoCopyModal from './DemoCopyModal.vue'
import RagCitations from '../../components/RagCitations.vue'
import { useDemoSession } from '../useDemoSession'
import { renderMarkdown } from '../../utils/markdown'

defineEmits<{
  (e: 'exit'): void
}>()

const citationsWrapperRef = ref<HTMLElement | null>(null)

const {
  currentScenarioId,
  allScenarios,
  stage,
  messages,
  editedDraft,
  isEvidenceExpanded,
  isEscalated,
  isConfirmed,
  copiedField,
  copyFailedDraft,
  startPlayback,
  skipToFinish,
  replay,
  switchScenario,
  adoptAndCopy,
  toggleEvidence,
  toggleEscalate,
  toggleConfirm,
} = useDemoSession()

onMounted(() => {
  void startPlayback()
})

// 响应“查看证据”展开卡片
watch(isEvidenceExpanded, (expanded) => {
  if (expanded && citationsWrapperRef.value) {
    const details = citationsWrapperRef.value.querySelector('details')
    if (details) {
      details.open = true
    }
  }
})
</script>

<style scoped>
.demo-workspace {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--color-bg-base, #0c0b14);
  color: var(--color-text, #f0eef8);
  overflow: hidden;
}

.demo-main-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.demo-chat-feed {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
  display: flex;
  justify-content: center;
}

.messages-container {
  width: 100%;
  max-width: 860px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.msg-row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.msg-row.user {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
}

.ai-avatar {
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.ai-avatar img {
  width: 22px;
  height: 22px;
}

.user-avatar {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: #fff;
}

.msg-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100% - 46px);
}

.msg-row.user .msg-col {
  align-items: flex-end;
}

.msg-bubble {
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
  position: relative;
}

.msg-bubble.user {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25));
  border: 1px solid rgba(168, 85, 247, 0.35);
  color: var(--color-text, #f0eef8);
  white-space: pre-wrap;
}

.msg-bubble.assistant {
  background: var(--color-bg-card, #161522);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
}

.loading-dots {
  display: flex;
  gap: 6px;
  padding: 8px 4px;
}

.loading-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #818cf8;
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.loading-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.demo-citations-wrapper {
  margin-top: 4px;
}

.msg-actions-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.demo-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: var(--color-bg-surface, #1e1c2e);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  color: var(--color-text, #e2e0ed);
  cursor: pointer;
  transition: all 0.15s ease;
}

.demo-action-btn:hover:not(:disabled) {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--color-border-hover, rgba(255, 255, 255, 0.22));
}

.demo-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-adopt-draft {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.35);
  color: #6ee7b7;
}

.btn-adopt-draft:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.25);
  border-color: rgba(16, 185, 129, 0.55);
}

.btn-adopt-draft.copied {
  background: rgba(16, 185, 129, 0.3);
  border-color: #10b981;
  color: #a7f3d0;
}

.demo-action-btn.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: #6366f1;
  color: #c7d2fe;
}

.ticket-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.badge-escalated {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.badge-confirmed {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.demo-draft-tray {
  background: var(--color-bg-card, #141320);
  border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  padding: 12px 20px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
}

.tray-inner {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tray-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tray-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-subtle, #a09cb4);
}

.tray-icon {
  color: #10b981;
}

.tray-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 5px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #6ee7b7;
  cursor: pointer;
}

.tray-copy-btn:hover {
  background: rgba(16, 185, 129, 0.25);
}

.tray-textarea {
  width: 100%;
  background: var(--color-bg-surface, #0d0c16);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  color: var(--color-text, #f0eef8);
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}

.tray-textarea:focus {
  outline: none;
  border-color: var(--color-primary, #6366f1);
}
</style>
