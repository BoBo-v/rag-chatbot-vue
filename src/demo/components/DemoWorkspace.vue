<template>
  <div class="demo-workspace">
    <!-- 顶部控制栏（案例选择、状态指示、跳过动画、重新播放、退出） -->
    <DemoControls
      :current-scenario-id="currentScenarioId"
      :all-scenarios="allScenarios"
      :stage="stage"
      @switch-scenario="(id) => switchScenario(id, true)"
      @skip="skipToFinish"
      @replay="replay"
      @exit="$emit('exit')"
    />

    <!-- 主聊天消息视口 -->
    <div ref="chatFeedRef" class="demo-chat-feed">
      <div class="messages-container">
        <!-- 空状态引导（当用户清空或尚未发送时） -->
        <div v-if="messages.length === 0" class="demo-empty-card">
          <div class="empty-icon-box">
            <Sparkles :size="24" aria-hidden="true" />
          </div>
          <h2 class="empty-title">工单决策推演沙盒</h2>
          <p class="empty-desc">
            当前处于<strong>零模型依赖的离线推演环境</strong>。下方输入框已为您预置了报障日志，
            点击底部的<strong>【模拟发送工单】</strong>按钮，即可实时观察 AI 知识库检索与决策草稿生成！
          </p>
          <div class="empty-preset-row">
            <span class="preset-label">点击快速载入用例：</span>
            <button
              v-for="item in allScenarios"
              :key="item.id"
              type="button"
              class="empty-preset-chip"
              :class="{ active: currentScenarioId === item.id }"
              @click="switchScenario(item.id, false)"
            >
              {{ item.title }}
            </button>
          </div>
          <button
            type="button"
            class="btn-start-now"
            @click="startPlayback(inputPrompt)"
          >
            <Send :size="15" aria-hidden="true" />
            <span>立即模拟发送并观察生成</span>
          </button>
        </div>

        <!-- 消息列表 -->
        <template v-else>
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
                <div v-if="msg.status === 'loading'" class="loading-state-row">
                  <div class="loading-spinner"></div>
                  <span>AI 正在分析工单并检索技术知识库...</span>
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
                  :disabled="stage === 'streaming_analysis' || stage === 'simulating_rag'"
                  title="仅提取并复制客户回复草稿，不泄露内部排障依据与检索打分"
                  @click="adoptAndCopy"
                >
                  <Check v-if="copiedField === 'draft'" :size="14" :stroke-width="2" aria-hidden="true" />
                  <Copy v-else :size="14" :stroke-width="1.75" aria-hidden="true" />
                  <span>{{ copiedField === 'draft' ? '已采纳并复制草稿' : '采纳草稿并复制' }}</span>
                </button>

                <!-- 查看/展开知识库依据 -->
                <button
                  type="button"
                  class="demo-action-btn"
                  title="展开下方官方文档知识库依据卡片"
                  @click="toggleEvidence"
                >
                  <Database :size="14" aria-hidden="true" />
                  <span>{{ isEvidenceExpanded ? '收起知识库依据' : '查看知识库依据' }}</span>
                </button>

                <!-- 标记转二线研发 -->
                <button
                  type="button"
                  class="demo-action-btn"
                  :class="{ active: isEscalated }"
                  title="证据不足或需热修复时，标记升级二线研发"
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
        </template>
      </div>
    </div>

    <!-- 底部工单输入与发送操作台 -->
    <footer class="demo-input-bar">
      <div class="input-bar-inner">
        <!-- 案例快捷切换标签 -->
        <div class="preset-chips-strip">
          <span class="chips-label">切换用例：</span>
          <button
            v-for="item in allScenarios"
            :key="item.id"
            type="button"
            class="scenario-chip"
            :class="{ active: currentScenarioId === item.id }"
            @click="switchScenario(item.id, true)"
          >
            {{ item.title }}
          </button>
        </div>

        <!-- 文本框与模拟发送按钮 -->
        <div class="input-box-row">
          <textarea
            v-model="inputPrompt"
            class="demo-textarea"
            rows="3"
            placeholder="您可在此修改或查看报障内容，点击右侧按钮模拟发送..."
            :disabled="isGenerating"
            @keydown.ctrl.enter="handleSend"
          ></textarea>

          <button
            type="button"
            class="demo-send-btn"
            :class="{ 'is-busy': isGenerating }"
            :disabled="isGenerating || !inputPrompt.trim()"
            title="模拟发送当前工单，触发 AI 检索与流式回答"
            @click="handleSend"
          >
            <div v-if="isGenerating" class="send-spinner"></div>
            <Send v-else :size="16" aria-hidden="true" />
            <span>{{ isGenerating ? '推演生成中...' : '模拟发送工单' }}</span>
          </button>
        </div>
      </div>
    </footer>

    <!-- 剪贴板受阻降级弹窗 -->
    <DemoCopyModal :text="copyFailedDraft" @close="copyFailedDraft = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  Check,
  CheckCheck,
  Copy,
  Database,
  Headphones,
  Send,
  Sparkles,
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
const chatFeedRef = ref<HTMLElement | null>(null)

const {
  currentScenarioId,
  allScenarios,
  inputPrompt,
  stage,
  messages,
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

const isGenerating = computed(() => {
  return stage.value === 'presenting_ticket' ||
    stage.value === 'simulating_rag' ||
    stage.value === 'streaming_analysis'
})

function handleSend() {
  if (isGenerating.value) return
  void startPlayback(inputPrompt.value)
}

onMounted(() => {
  // 进入沙盒时自动发送首个演示工单，让用户立即可视化体验
  void startPlayback()
})

// 滚动跟随与展开卡片处理
watch(
  () => messages.value[1]?.content,
  () => {
    nextTick(() => {
      if (chatFeedRef.value) {
        chatFeedRef.value.scrollTop = chatFeedRef.value.scrollHeight
      }
    })
  }
)

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
  background: var(--bg-canvas, #f7f5fb);
  color: var(--text-primary, #1e192b);
  overflow: hidden;
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
  gap: 20px;
}

/* 空状态卡片 */
.demo-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 24px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-sm, 0 4px 16px rgba(0, 0, 0, 0.05));
  gap: 14px;
  margin: 40px auto;
  max-width: 640px;
}

.empty-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--accent-bg, rgba(139, 92, 246, 0.15));
  color: var(--accent, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary, #1e192b);
}

.empty-desc {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-secondary, #574e69);
  margin: 0;
}

.empty-preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 6px;
}

.preset-label {
  font-size: 12px;
  color: var(--text-muted, #7d7291);
}

.empty-preset-chip {
  padding: 4px 10px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-surface-2, #f0ecf7);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  color: var(--text-secondary, #574e69);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.empty-preset-chip.active,
.empty-preset-chip:hover {
  background: var(--accent-bg, rgba(139, 92, 246, 0.15));
  border-color: var(--accent-border, rgba(167, 139, 250, 0.4));
  color: var(--accent-text, #7c3aed);
}

.btn-start-now {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  border-radius: var(--radius-sm, 6px);
  background: var(--accent, #7c3aed);
  color: #ffffff;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm, 0 4px 12px rgba(124, 58, 237, 0.25));
  margin-top: 8px;
  transition: all var(--motion-fast, 140ms) ease;
}

.btn-start-now:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

/* 消息流布局 */
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
  background: var(--accent-bg, rgba(139, 92, 246, 0.15));
  border: 1px solid var(--accent-border, rgba(167, 139, 250, 0.3));
}

.ai-avatar img {
  width: 22px;
  height: 22px;
}

.user-avatar {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: #ffffff;
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
  border-radius: var(--radius-md, 8px);
  padding: 14px 18px;
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
  position: relative;
}

.msg-bubble.user {
  background: color-mix(in srgb, var(--accent-bg) 72%, var(--bg-surface-2));
  border: 1px solid var(--accent-border, rgba(167, 139, 250, 0.35));
  color: var(--text-primary, #1e192b);
  white-space: pre-wrap;
  border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-md);
}

.msg-bubble.assistant {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border, rgba(124, 58, 237, 0.18));
  color: var(--text-primary, #1e192b);
  box-shadow: var(--shadow-sm, 0 2px 10px rgba(0, 0, 0, 0.05));
  border-radius: var(--radius-md) var(--radius-md) var(--radius-md) var(--radius-xs);
}

.loading-state-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  color: var(--text-secondary, #574e69);
  font-size: 13.5px;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-subtle, rgba(124, 58, 237, 0.2));
  border-top-color: var(--accent, #7c3aed);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.demo-citations-wrapper {
  margin-top: 4px;
}

/* 操作栏 */
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
  padding: 5px 12px;
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-surface-2, #f0ecf7);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  color: var(--text-primary, #1e192b);
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.demo-action-btn:hover:not(:disabled) {
  background: var(--bg-surface-3, #e8e2f2);
  border-color: var(--border, rgba(124, 58, 237, 0.3));
}

.demo-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-adopt-draft {
  background: var(--success-bg, rgba(5, 150, 105, 0.12));
  border-color: var(--success-border, rgba(5, 150, 105, 0.3));
  color: var(--success, #059669);
}

.btn-adopt-draft:hover:not(:disabled) {
  filter: brightness(1.08);
}

.btn-adopt-draft.copied {
  background: var(--success, #059669);
  color: #ffffff;
}

.demo-action-btn.active {
  background: var(--accent-bg, rgba(124, 58, 237, 0.16));
  border-color: var(--accent, #7c3aed);
  color: var(--accent-text, #7c3aed);
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
  background: var(--danger-bg, rgba(220, 38, 38, 0.12));
  color: var(--danger, #dc2626);
  border: 1px solid var(--danger-border, rgba(220, 38, 38, 0.28));
}

.badge-confirmed {
  background: var(--success-bg, rgba(5, 150, 105, 0.12));
  color: var(--success, #059669);
  border: 1px solid var(--success-border, rgba(5, 150, 105, 0.28));
}

/* 底部交互输入台 */
.demo-input-bar {
  background: var(--bg-surface, #ffffff);
  border-top: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  padding: 12px 20px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.05);
}

.input-bar-inner {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preset-chips-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chips-label {
  font-size: 12px;
  color: var(--text-muted, #7d7291);
}

.scenario-chip {
  padding: 3px 9px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-surface-2, #f0ecf7);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  color: var(--text-secondary, #574e69);
  font-size: 11.5px;
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.scenario-chip.active,
.scenario-chip:hover {
  background: var(--accent-bg, rgba(124, 58, 237, 0.15));
  border-color: var(--accent-border, rgba(124, 58, 237, 0.35));
  color: var(--accent-text, #7c3aed);
}

.input-box-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.demo-textarea {
  flex: 1;
  background: var(--bg-input, #ffffff);
  border: 1px solid var(--border, rgba(124, 58, 237, 0.2));
  border-radius: var(--radius-md, 8px);
  color: var(--text-primary, #1e192b);
  padding: 10px 14px;
  font-size: 13.5px;
  line-height: 1.55;
  resize: vertical;
  box-sizing: border-box;
  font-family: var(--font-sans);
}

.demo-textarea:focus {
  outline: none;
  border-color: var(--accent, #7c3aed);
  box-shadow: var(--focus-ring, 0 0 0 3px rgba(124, 58, 237, 0.2));
}

.demo-textarea:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.demo-send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  height: 44px;
  border-radius: var(--radius-sm, 6px);
  background: var(--accent, #7c3aed);
  color: #ffffff;
  border: none;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--motion-fast, 140ms) ease;
}

.demo-send-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.demo-send-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.send-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
