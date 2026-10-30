<template>
  <div class="demo-workspace">
    <!-- 顶部控制栏（案例选择、状态指示、跳过动画、重新播放、退出） -->
    <DemoControls
      :current-scenario-id="currentScenarioId"
      :all-scenarios="allScenarios"
      :stage="stage"
      :is-rag-drawer-open="isRagDrawerOpen"
      @switch-scenario="(id) => handleSwitch(id, true)"
      @skip="skipToFinish"
      @replay="handleReplay"
      @exit="$emit('exit')"
      @toggle-rag-drawer="isRagDrawerOpen = !isRagDrawerOpen"
    />

    <!-- 主展示舞台：消息区与右侧 RAG 详情面板并列 -->
    <div class="demo-main-stage">
      <div class="demo-conversation-pane">
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
                <!-- 前置 RAG 检索状态条 (当且仅当助手消息命中知识库) -->
                <div
                  v-if="msg.role === 'assistant' && msg.ragContext?.enabled"
                  class="demo-rag-preface-bar"
                  role="button"
                  tabindex="0"
                  title="点击在右侧展开知识库检索链路与切片解释"
                  @click="isRagDrawerOpen = true"
                >
                  <div class="rag-bar-left">
                    <span class="rag-mode-chip font-mono">
                      {{ msg.ragContext.results?.length ? 'RAG: 离线推演 (已命中)' : 'RAG: 离线推演中' }}
                    </span>
                    <span class="rag-hit-text">
                      已检索知识库 · 命中 <strong class="font-mono">{{ msg.ragContext.results?.length || 0 }}</strong> 处切片
                    </span>
                  </div>
                  <button
                    type="button"
                    class="rag-view-link-btn font-mono"
                    title="在右侧展开知识库检索链路与切片解释"
                    @click.stop="isRagDrawerOpen = true"
                  >
                    <span>链路详情</span>
                    <ChevronRight :size="13" aria-hidden="true" />
                  </button>
                </div>

                <!-- 用户自定义报障标记 -->
                <div
                  v-if="msg.role === 'user' && msg.content.trim() !== currentScenario.ticketMarkdown.trim()"
                  class="demo-custom-input-tag"
                >
                  自定义输入 · 仅展示
                </div>

                <!-- 演示推演声明横幅 -->
                <div
                  v-if="msg.role === 'assistant' && msg.status !== 'loading'"
                  class="demo-replay-banner"
                >
                  <Sparkles :size="12" aria-hidden="true" />
                  <span>离线沙盒推演 · 回放【{{ currentScenario.title }}】标准依据与草稿</span>
                </div>

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
                  :class="{ active: isRagDrawerOpen }"
                  title="在右侧展开知识库检索依据与三维分值面板"
                  @click="handleToggleEvidence"
                >
                  <Database :size="14" aria-hidden="true" />
                  <span>{{ isRagDrawerOpen ? '收起知识库依据' : '查看知识库依据' }}</span>
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
      <!-- 自定义报障输入提示栏 -->
      <div v-if="isCustomPrompt" class="custom-prompt-alert">
        <span class="custom-prompt-text">
          ⚠️ 当前已修改报障文本：离线沙盒仅回放【{{ currentScenario.title }}】预置依据与标准草稿，不随输入内容改变判定。
        </span>
        <button
          type="button"
          class="custom-prompt-reset-btn"
          title="恢复当前案例的标准报障内容"
          @click="resetToPresetPrompt"
        >
          恢复用例预设
        </button>
      </div>

      <div class="demo-input-box">
        <textarea
          ref="textareaRef"
          v-model="inputPrompt"
          class="demo-input-field"
          rows="2"
          :placeholder="isGenerating ? '正在模拟检索排障与推演草稿中，可点击右侧停止...' : '描述客户报障现象、报错日志、复现步骤或贴入工单 (按 Enter 发送，Shift+Enter 换行)...'"
          :disabled="isGenerating"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
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
    </div><!-- /demo-conversation-pane -->

    <!-- 右侧知识库参考材料与链路透视抽屉 (500px, 默认桌面端展开) -->
    <RagDrawerPanel
      v-model:open="isRagDrawerOpen"
      :context="currentAssistantMsg?.ragContext ?? null"
      scenario="ticket"
      :user-question="currentUserQuestion"
    />
  </div><!-- /demo-main-stage -->

  <!-- 剪贴板受阻降级弹窗 -->
  <DemoCopyModal :text="copyFailedDraft" @close="copyFailedDraft = null" />
</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Database,
  Headphones,
  Send,
  Sparkles,
  Square,
} from 'lucide-vue-next'
import DemoControls from './DemoControls.vue'
import DemoCopyModal from './DemoCopyModal.vue'
import RagDrawerPanel from '../../components/RagDrawerPanel.vue'
import { useDemoSession } from '../useDemoSession'
import { useMessageRenderer } from '../../composables/useMessageRenderer'

defineEmits<{
  (e: 'exit'): void
}>()

const chatFeedRef = ref<HTMLElement | null>(null)
let userAtBottom = true
const isComposing = ref(false)

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd() {
  setTimeout(() => {
    isComposing.value = false
  }, 30)
}

const {
  renderContent,
  handleCodeBlockAction,
  clearSnapshots,
} = useMessageRenderer()

const {
  currentScenarioId,
  currentScenario,
  allScenarios,
  inputPrompt,
  stage,
  messages,
  isEvidenceExpanded,
  isEscalated,
  isConfirmed,
  isCustomPrompt,
  resetToPresetPrompt,
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

const isRagDrawerOpen = ref(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true)

const currentAssistantMsg = computed(() => {
  return messages.value.find(m => m.role === 'assistant') || null
})

const currentUserQuestion = computed(() => {
  const userMsg = messages.value.find(m => m.role === 'user')
  return userMsg ? userMsg.content : inputPrompt.value
})

function handleToggleEvidence() {
  toggleEvidence()
  isRagDrawerOpen.value = isEvidenceExpanded.value
}

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
    if (e.isComposing || isComposing.value || e.keyCode === 229) {
      return
    }
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

.demo-main-stage {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.demo-conversation-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.demo-chat-feed {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px;
  display: flex;
  justify-content: center;
}

.messages-container {
  width: 100%;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 32px 0 28px;
  margin: 0 auto;
  box-sizing: border-box;
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
  gap: 6px;
  min-width: 0;
}

.msg-row.user .msg-col {
  max-width: min(760px, 85%);
  align-items: flex-end;
}

.msg-row.assistant .msg-col {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  width: 100%;
}

.msg-bubble {
  width: 100%;
  box-sizing: border-box;
  border-radius: var(--radius-md, 12px);
  padding: 14px 18px;
  word-break: break-word;
  position: relative;
  transition: border-color var(--motion-fast, 140ms) ease, box-shadow var(--motion-fast, 140ms) ease;
}

.msg-bubble.user {
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md) var(--radius-md) var(--radius-xs) var(--radius-md);
  color: #ffffff;
  background: var(--accent, #4f46e5);
  box-shadow: 0 2px 10px rgba(79, 70, 229, 0.18);
}

.msg-bubble.user .msg-content {
  color: #ffffff;
}

.msg-bubble.assistant {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md) var(--radius-md) var(--radius-md) var(--radius-xs);
  color: var(--text-primary);
  background: var(--bg-surface, #ffffff);
  backdrop-filter: none;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.04);
}

.msg-content {
  font-family: var(--font-sans);
  font-size: 16.5px;
  line-height: 1.75;
  letter-spacing: -0.005em;
  word-break: break-word;
}

/* 标题高亮指示胶囊 (对标 ai_rag.html 风格) */
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.markdown-body h2::before),
:deep(.markdown-body h3::before) {
  content: '';
  display: inline-block;
  width: 5px;
  height: 18px;
  border-radius: 999px;
  background: var(--accent, #4f46e5);
  flex-shrink: 0;
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

/* ── AI 消息气泡内前置轻量 RAG 状态条 ── */
.demo-rag-preface-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  margin-bottom: 14px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.22);
  color: #1e1b4b;
}

.demo-rag-preface-bar:hover {
  background: rgba(99, 102, 241, 0.14);
  border-color: rgba(99, 102, 241, 0.38);
}

.rag-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.rag-mode-chip {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  background: var(--accent, #4f46e5);
  color: #ffffff;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.rag-hit-text {
  font-size: 12px;
  font-weight: 500;
}

.rag-view-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid var(--accent-border, rgba(99, 102, 241, 0.35));
  background: var(--bg-surface, #ffffff);
  color: var(--accent, #4f46e5);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.rag-view-link-btn:hover {
  background: var(--accent, #4f46e5);
  color: #ffffff;
  border-color: var(--accent, #4f46e5);
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

.demo-replay-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--accent-text, #7c3aed);
  background: var(--accent-bg, rgba(124, 58, 237, 0.08));
  border: 1px solid var(--accent-border, rgba(124, 58, 237, 0.2));
  border-radius: var(--radius-sm, 6px);
  padding: 4px 10px;
  margin-bottom: 10px;
  font-weight: 500;
}

.demo-custom-input-tag {
  display: inline-block;
  font-size: 11px;
  color: #d97706;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 4px;
  padding: 2px 6px;
  margin-bottom: 6px;
  font-weight: 500;
}

.custom-prompt-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  margin: 0 auto 10px;
  max-width: 960px;
  width: 100%;
  box-sizing: border-box;
  border-radius: var(--radius-md, 8px);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.28);
  font-size: 12px;
  color: var(--text-primary);
  animation: fadeIn 0.2s ease;
}

.custom-prompt-text {
  color: #b45309;
  font-weight: 500;
  line-height: 1.4;
}

[data-theme='dark'] .custom-prompt-text {
  color: #fbbf24;
}

.custom-prompt-reset-btn {
  border: 1px solid rgba(245, 158, 11, 0.4);
  background: var(--bg-surface-1, #ffffff);
  color: #b45309;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

[data-theme='dark'] .custom-prompt-reset-btn {
  background: var(--bg-surface-2, #2d2640);
  color: #fde68a;
  border-color: rgba(245, 158, 11, 0.5);
}

.custom-prompt-reset-btn:hover {
  background: rgba(245, 158, 11, 0.2);
  border-color: #d97706;
}

/* ─── 底部工单工作台输入区（对齐真实工单工作台风格） ─── */
.demo-input-area {
  padding: 12px 24px 14px;
  background: var(--bg-topbar, var(--bg-surface));
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.demo-input-box {
  display: flex;
  flex-direction: column;
  background: var(--bg-input, var(--bg-surface));
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md, 12px);
  padding: 13px 14px 9px;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
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

/* ─── 深色主题适配 ─── */
[data-theme='dark'] .demo-rag-preface-bar {
  background: rgba(99, 102, 241, 0.14);
  border-color: rgba(99, 102, 241, 0.35);
  color: #e0e7ff;
}

[data-theme='dark'] .demo-rag-preface-bar:hover {
  background: rgba(99, 102, 241, 0.22);
  border-color: rgba(99, 102, 241, 0.5);
}

[data-theme='dark'] .rag-view-link-btn {
  background: rgba(15, 23, 42, 0.7);
  color: #c7d2fe;
}

[data-theme='dark'] .msg-bubble.user {
  background: #3730a3;
  border-color: #4f46e5;
}

[data-theme='dark'] .msg-bubble.assistant {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--text-primary);
}

/* ─── 小屏幕与移动端响应式适配 ─── */
@media (max-width: 768px) {
  .demo-chat-feed {
    padding: 0 10px;
  }

  .messages-container {
    gap: 14px;
    padding: 16px 0 14px;
    max-width: 100%;
  }

  .msg-row {
    gap: 8px;
  }

  .msg-avatar {
    width: 30px;
    height: 30px;
    font-size: 11px;
  }

  .ai-avatar img {
    width: 18px;
    height: 18px;
  }

  .msg-col {
    max-width: calc(100% - 38px);
  }

  .msg-row.assistant .msg-col {
    max-width: calc(100% - 38px);
    width: 100%;
  }

  .msg-bubble {
    padding: 11px 14px;
    font-size: 15px;
    line-height: 1.65;
  }

  .msg-content {
    font-size: 15px;
    line-height: 1.65;
  }

  .msg-actions-bar {
    gap: 6px;
    margin-top: 6px;
  }

  .demo-action-btn {
    padding: 4px 9px;
    font-size: 11.5px;
    gap: 4px;
  }

  .ticket-status-badge {
    padding: 2px 7px;
    font-size: 11px;
  }

  .custom-prompt-alert {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 8px 10px;
    font-size: 11.5px;
    margin: 0 auto 8px;
  }

  .custom-prompt-reset-btn {
    align-self: flex-end;
  }

  .demo-input-area {
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
  }

  .demo-input-box {
    max-width: 100%;
    padding: 10px 10px 7px;
    border-radius: 10px;
  }

  .demo-input-field {
    min-height: 38px;
    font-size: 14px;
  }

  .demo-input-toolbar {
    margin-top: 2px;
    padding-top: 6px;
    gap: 6px;
  }

  .preset-tag-label {
    display: none;
  }

  .preset-pills-row {
    flex-wrap: wrap;
    gap: 4px;
  }

  .preset-pill-btn {
    padding: 2px 8px;
    font-size: 11px;
  }

  .demo-send-btn,
  .demo-stop-btn {
    width: 34px;
    height: 34px;
  }

  .demo-input-hint {
    font-size: 10.5px;
    margin-top: 5px;
  }

  .demo-empty-card {
    padding: 20px 14px;
  }

  .empty-title {
    font-size: 16px;
  }

  .empty-desc {
    font-size: 12px;
  }

  .empty-preset-chip {
    font-size: 11.5px;
    padding: 3px 8px;
  }
}

@media (max-width: 480px) {
  .demo-chat-feed {
    padding: 10px 6px;
  }

  .msg-row {
    gap: 6px;
  }

  .msg-avatar {
    width: 26px;
    height: 26px;
    font-size: 10px;
  }

  .ai-avatar img {
    width: 16px;
    height: 16px;
  }

  .msg-col {
    width: calc(100% - 32px);
  }

  .msg-bubble {
    padding: 10px 11px;
    font-size: 13px;
    border-radius: var(--radius-sm, 6px);
  }

  .demo-replay-banner {
    font-size: 10.5px;
    padding: 3px 6px;
    margin-bottom: 6px;
  }

  .demo-custom-input-tag {
    font-size: 10px;
    padding: 1px 4px;
    margin-bottom: 4px;
  }

  .demo-action-btn {
    padding: 4px 6px;
    font-size: 11px;
  }

  .preset-pill-btn {
    padding: 2px 6px;
    font-size: 10.5px;
  }
}
</style>
