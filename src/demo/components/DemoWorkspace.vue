<template>
  <div class="demo-workspace">
    <!-- 顶部控制栏（案例选择、状态指示、跳过动画、重新播放、退出） -->
    <DemoControls
      :current-scenario-id="currentScenarioId"
      :all-scenarios="allScenarios"
      :stage="stage"
      @switch-scenario="(id) => handleSwitch(id, true)"
      @skip="skipToFinish"
      @replay="handleReplay"
      @exit="$emit('exit')"
    />

    <!-- 主聊天消息视口 -->
    <div
      ref="chatFeedRef"
      class="demo-chat-feed"
      @scroll="handleFeedScroll"
    >
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
              @click="handleSwitch(item.id, false)"
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
                <!-- 加载中指示器（跳动三点与阶段状态） -->
                <div v-if="msg.status === 'loading'" class="loading-state-row">
                  <div class="thinking-dots"><span></span><span></span><span></span></div>
                  <span class="loading-state-text">AI 正在分析工单并检索技术知识库...</span>
                </div>

                <!-- Markdown 内容（集成 useMessageRenderer，带真实打字机闪烁光标 ▋ 与代码块复制） -->
                <div
                  v-else
                  class="msg-content markdown-body"
                  @click="handleCodeBlockAction($event, msg.id)"
                  v-html="renderContent(msg)"
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

    <!-- 底部工单工作台输入区（对齐真实工单工作台交互与风格） -->
    <footer class="demo-input-area">
      <div class="demo-input-box">
        <textarea
          ref="textareaRef"
          v-model="inputPrompt"
          class="demo-input-field"
          rows="2"
          :placeholder="isGenerating ? '正在模拟检索排障与推演草稿中，可点击右侧停止...' : '描述客户报障现象、报错日志、复现步骤或贴入工单 (按 Enter 发送，Shift+Enter 换行)...'"
          :disabled="isGenerating"
          @keydown="handleKeyDown"
        ></textarea>

        <div class="demo-input-toolbar">
          <div class="demo-toolbar-left">
            <span class="preset-tag-label">切换用例：</span>
            <div class="preset-pills-row">
              <button
                v-for="item in allScenarios"
                :key="item.id"
                type="button"
                class="preset-pill-btn"
                :class="{ active: currentScenarioId === item.id }"
                :disabled="isGenerating"
                :title="item.summary"
                @click="handleSwitch(item.id, true)"
              >
                {{ item.title }}
              </button>
            </div>
          </div>

          <div class="demo-toolbar-right">
            <!-- 推演生成中：停止生成按钮（对齐真实环境 stop-btn） -->
            <button
              v-if="isGenerating"
              type="button"
              class="demo-stop-btn"
              title="停止当前推演（跳过并直接呈现结果）"
              aria-label="停止推演"
              @click="skipToFinish"
            >
              <Square :size="15" :fill="'currentColor'" aria-hidden="true" />
            </button>

            <!-- 待发送状态：圆形发送按钮（对齐真实环境 send-btn） -->
            <button
              v-else
              type="button"
              class="demo-send-btn"
              :class="{ ready: inputPrompt.trim().length > 0 }"
              :disabled="!inputPrompt.trim()"
              title="模拟发送当前工单 (Enter)"
              aria-label="模拟发送工单"
              @click="handleSend"
            >
              <Send :size="17" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div class="demo-input-hint">
        <template v-if="isGenerating">
          正在知识库切片检索与两段式排障推演 · 可点击右侧红色方块立即呈现完整结果
        </template>
        <template v-else>
          <span class="hint-key">Enter</span> 模拟发送工单 · <span class="hint-key">Shift</span> + <span class="hint-key">Enter</span> 换行 · 离线沙盒推演，不污染正式数据库
        </template>
      </div>
    </footer>

    <!-- 剪贴板受阻降级弹窗 -->
    <DemoCopyModal :text="copyFailedDraft" @close="copyFailedDraft = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Check,
  CheckCheck,
  Copy,
  Database,
  Headphones,
  Send,
  Sparkles,
  Square,
} from 'lucide-vue-next'
import DemoControls from './DemoControls.vue'
import DemoCopyModal from './DemoCopyModal.vue'
import RagCitations from '../../components/RagCitations.vue'
import { useDemoSession } from '../useDemoSession'
import { useMessageRenderer } from '../../composables/useMessageRenderer'

defineEmits<{
  (e: 'exit'): void
}>()

const citationsWrapperRef = ref<HTMLElement | null>(null)
const chatFeedRef = ref<HTMLElement | null>(null)
let userAtBottom = true

const {
  renderContent,
  handleCodeBlockAction,
  clearSnapshots,
} = useMessageRenderer()

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
  clearSnapshots()
  void startPlayback(inputPrompt.value)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // Shift + Enter 换行
      return
    }
    // Enter 或 Ctrl+Enter 提交模拟工单
    e.preventDefault()
    handleSend()
  }
}

function handleSwitch(id: any, autoSend: boolean) {
  clearSnapshots()
  switchScenario(id, autoSend)
}

function handleReplay() {
  clearSnapshots()
  replay()
}

function handleFeedScroll(): void {
  const el = chatFeedRef.value
  if (!el) return
  userAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80
}

function scrollToBottom(): void {
  const el = chatFeedRef.value
  if (!el || !userAtBottom) return
  el.scrollTop = el.scrollHeight
}

onMounted(() => {
  // 进入沙盒时自动发送首个演示工单，让用户立即可视化体验打字机流式效果
  void startPlayback()
})

onUnmounted(() => {
  clearSnapshots()
})

// 自动滚动跟随打字机输出
watch(
  () => [messages.value.length, messages.value[1]?.content, stage.value],
  () => {
    nextTick(() => {
      scrollToBottom()
    })
  },
  { deep: true }
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
  flex: 1;
  min-width: 0;
  width: calc(100% - 46px);
}

.msg-bubble {
  width: 100%;
  box-sizing: border-box;
  border-radius: var(--radius-md, 8px);
  padding: 14px 18px;
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
  position: relative;
  transition: border-color var(--motion-fast, 140ms) ease, box-shadow var(--motion-fast, 140ms) ease;
}

.msg-bubble.user {
  background: color-mix(in srgb, var(--accent-bg) 72%, var(--bg-surface-2));
  border: 1px solid var(--accent-border, rgba(167, 139, 250, 0.35));
  color: var(--text-primary, #1e192b);
  border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-md);
}

.msg-bubble.assistant {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border, rgba(124, 58, 237, 0.18));
  color: var(--text-primary, #1e192b);
  box-shadow: var(--shadow-sm, 0 2px 10px rgba(0, 0, 0, 0.05));
  border-radius: var(--radius-md) var(--radius-md) var(--radius-md) var(--radius-xs);
}

/* 流式回答呼吸光环（对齐真实环境） */
.msg-bubble.assistant.is-streaming {
  border-color: var(--accent-border, rgba(167, 139, 250, 0.5));
  animation: stream-glow 2s ease-in-out infinite;
}

@keyframes stream-glow {
  0%, 100% {
    box-shadow: var(--shadow-sm, 0 2px 10px rgba(0, 0, 0, 0.05));
    border-color: var(--accent-border, rgba(167, 139, 250, 0.25));
  }
  50% {
    box-shadow: 0 0 16px -2px var(--accent-bg, rgba(167, 139, 250, 0.35));
    border-color: var(--accent, #7c3aed);
  }
}

/* 流式打字机闪烁光标（对齐真实环境） */
:deep(.cursor-blink) {
  display: inline-block;
  color: var(--accent-text, #7c3aed);
  font-size: 0.9em;
  line-height: 1;
  margin-left: 2px;
  vertical-align: middle;
  animation: blink 0.75s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%     { opacity: 0; }
}

.loading-state-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  color: var(--text-secondary, #574e69);
  font-size: 13.5px;
}

.loading-state-text {
  font-size: 13.5px;
  color: var(--text-secondary, #574e69);
}

/* 跳动等待圆点（对齐真实环境） */
.thinking-dots,
:deep(.thinking-dots) {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 2px;
}

.thinking-dots span,
:deep(.thinking-dots span) {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent, #7c3aed);
  opacity: 0.75;
  animation: thinking-bounce 1.4s ease-in-out infinite;
}

.thinking-dots span:nth-child(2),
:deep(.thinking-dots span:nth-child(2)) {
  animation-delay: 0.18s;
}

.thinking-dots span:nth-child(3),
:deep(.thinking-dots span:nth-child(3)) {
  animation-delay: 0.36s;
}

@keyframes thinking-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
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

/* ─── 底部工单工作台输入区（对齐真实工单工作台风格） ─── */
.demo-input-area {
  padding: 12px 20px 16px;
  background: var(--bg-topbar, var(--bg-surface));
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  flex-shrink: 0;
}

.demo-input-box {
  display: flex;
  flex-direction: column;
  background: var(--bg-input, var(--bg-surface));
  border: 1px solid var(--accent-border, rgba(167, 139, 250, 0.35));
  border-radius: var(--radius-md, 12px);
  padding: 12px 16px 10px;
  max-width: 860px;
  margin: 0 auto;
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.04));
  transition: border-color var(--motion-fast, 140ms) ease, box-shadow var(--motion-fast, 140ms) ease;
}

.demo-input-box:focus-within {
  border-color: var(--accent, #7c3aed);
  box-shadow: var(--focus-ring, 0 0 0 3px rgba(124, 58, 237, 0.2)), var(--shadow-accent, 0 0 18px rgba(124, 58, 237, 0.1));
}

.demo-input-field {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary, #1e192b);
  font-size: 14px;
  font-family: var(--font-sans);
  padding: 0 0 8px;
  caret-color: var(--accent, #7c3aed);
  resize: none; /* 彻底去除多余浏览器拖拽角标手柄 */
  line-height: 1.6;
  min-height: 48px;
  max-height: 140px;
  overflow-y: auto;
  box-sizing: border-box;
}

.demo-input-field::placeholder {
  color: var(--text-placeholder, var(--text-muted));
  font-style: normal;
}

.demo-input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.08));
}

.demo-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-tag-label {
  font-size: 12px;
  color: var(--text-muted, #7d7291);
}

.preset-pills-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preset-pill-btn {
  padding: 3px 10px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-surface-2, #f0ecf7);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  color: var(--text-secondary, #574e69);
  font-size: 11.5px;
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.preset-pill-btn:hover:not(:disabled) {
  background: var(--accent-bg, rgba(124, 58, 237, 0.15));
  border-color: var(--accent-border, rgba(124, 58, 237, 0.35));
  color: var(--accent-text, #7c3aed);
}

.preset-pill-btn.active {
  background: var(--accent-bg, rgba(124, 58, 237, 0.18));
  border-color: var(--accent, #7c3aed);
  color: var(--accent-text, #7c3aed);
  font-weight: 600;
}

.preset-pill-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.demo-toolbar-right {
  display: flex;
  align-items: center;
  margin-left: auto;
}

/* 圆形模拟发送按钮（对齐真实环境 send-btn） */
.demo-send-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: var(--bg-surface-2, #f0ecf7);
  color: var(--text-muted, #7d7291);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--motion-fast, 140ms) ease;
}

.demo-send-btn.ready {
  background: linear-gradient(135deg, var(--accent-deep, #7c3aed), var(--accent-deeper, #6d28d9));
  color: #ffffff;
  box-shadow: 0 0 16px var(--accent-glow, rgba(124, 58, 237, 0.35));
}

.demo-send-btn.ready:hover {
  transform: scale(1.08);
  box-shadow: 0 0 24px var(--accent-glow, rgba(124, 58, 237, 0.5));
}

.demo-send-btn:disabled:not(.ready) {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 圆形停止生成按钮（对齐真实环境 stop-btn） */
.demo-stop-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger, #ef4444);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--motion-fast, 140ms) ease;
  animation: stop-btn-in 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.demo-stop-btn:hover {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(248, 113, 113, 0.7);
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.35);
  transform: scale(1.06);
}

@keyframes stop-btn-in {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}

.demo-input-hint {
  font-size: 11.5px;
  color: var(--text-muted, #7d7291);
  text-align: center;
  margin-top: 8px;
}

.hint-key {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-surface-2, #f0ecf7);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  font-size: 10.5px;
  font-family: var(--font-mono, monospace);
  color: var(--text-secondary, #574e69);
}
</style>
