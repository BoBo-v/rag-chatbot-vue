<template>
  <div class="chat-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">

    <!-- ── 动态背景 ── -->
    <div class="bg-canvas">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
      <div class="orb orb-4"></div>
      <div class="noise"></div>
    </div>

    <!-- ── 侧边栏 ── -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <span class="sidebar-title">对话列表</span>
        <button class="new-chat-btn" type="button" title="新对话" aria-label="新建对话" @click="handleNewConversation">
          <Plus :size="17" aria-hidden="true" />
        </button>
      </div>
      <div class="sidebar-body">
        <button class="new-chat-big-btn" @click="handleNewConversation">
          <MessageSquarePlus class="new-chat-icon" :size="17" aria-hidden="true" />
          新建对话
        </button>
        <div class="sidebar-search">
          <Search class="sidebar-search-icon" :size="16" aria-hidden="true" />
          <input
              v-model="conversationSearchDraft"
              class="sidebar-search-input"
              type="search"
              placeholder="搜索对话..."
              aria-label="搜索对话"
          />
          <button
              v-if="conversationSearchDraft"
              class="sidebar-search-clear"
              type="button"
              aria-label="清空搜索"
              @click="conversationSearchDraft = ''"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </div>

        <div v-if="isSearchMode" class="search-results">
          <div class="conv-group-label search-label">
            搜索结果
            <span v-if="isSearchLoading" class="search-status">搜索中...</span>
            <span v-else class="search-status">{{ searchResults.length }} 条</span>
          </div>
          <div
              v-for="result in searchResults"
              :key="`${result.conversationId}-${result.messageId}`"
              class="search-result-item"
              :class="{ active: result.conversationId === currentId }"
              @click="handleSearchResultClick(result.conversationId)"
          >
            <div class="search-result-title">{{ result.title }}</div>
            <div class="search-result-snippet">{{ result.snippet || '无内容预览' }}</div>
          </div>
          <div v-if="searchError" class="conv-empty search-empty">
            <div>{{ searchError }}</div>
            <button
                type="button"
                class="search-retry-btn"
                :disabled="isSearchLoading"
                @click="retrySearch"
            >
              重试
            </button>
          </div>
          <div v-else-if="!isSearchLoading && searchResults.length === 0" class="conv-empty search-empty">
            没有匹配的对话
          </div>
        </div>

        <template v-else>
          <template v-for="group in groupedConversations" :key="group.label">
            <div class="conv-group-label">{{ group.label }}</div>
            <div
                v-for="conv in group.items"
                :key="conv.id"
                class="conv-item"
                :class="{ active: conv.id === currentId }"
                @click="handleSelectConversation(conv.id)"
            >
              <span class="conv-title">{{ conv.title }}</span>
              <button class="conv-del" type="button" title="删除" aria-label="删除对话" @click.stop="handleDeleteConversation(conv.id)">
                <Trash2 :size="14" aria-hidden="true" />
              </button>
            </div>
          </template>
          <div v-if="conversations.length === 0" class="conv-empty">暂无对话记录</div>
        </template>
      </div>
    </aside>

    <!-- 移动端遮罩 -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <!-- ── 主内容区 ── -->
    <div class="main-content">

      <!-- ── 顶栏 ── -->
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="menu-btn"
            type="button"
            :aria-label="isSidebarCollapsed ? '展开会话列表' : '收起会话列表'"
            :title="isSidebarCollapsed ? '展开会话列表 (Ctrl+[)' : '收起会话列表 (Ctrl+[)'"
            @click="toggleSidebar"
          >
            <PanelLeftClose v-if="!isSidebarCollapsed" :size="18" aria-hidden="true" />
            <PanelLeft v-else :size="18" aria-hidden="true" />
          </button>
          <div class="topbar-logo">
            <img class="logo-mark" src="/favicon.svg" alt="" aria-hidden="true" />
            <span class="logo-text">AI Chat</span>
            <!-- 顶栏快速切换模型下拉 -->
            <div v-if="currentSettings.showModelInTopbar" class="topbar-model-wrapper">
              <button
                type="button"
                class="topbar-model-btn"
                :title="`当前模型：${currentModelName} · 点击快速切换`"
                @click.stop="modelDropdownOpen = !modelDropdownOpen"
              >
                <Bot :size="13" aria-hidden="true" />
                <span class="topbar-model-text">{{ currentModelName }}</span>
                <ChevronDown :size="12" class="topbar-model-chevron" :class="{ open: modelDropdownOpen }" aria-hidden="true" />
              </button>
              <div v-if="modelDropdownOpen" class="topbar-model-dropdown" role="menu">
                <div class="dropdown-header">
                  <span>{{ currentSettings.transport === 'backend' ? '后端代理厂商' : currentSettings.provider.toUpperCase() }} 模型</span>
                  <button type="button" class="dropdown-settings-link" @click="modelDropdownOpen = false; settingsOpen = true">详细设置</button>
                </div>
                <div class="dropdown-list">
                  <button
                    v-for="m in quickModels"
                    :key="m"
                    type="button"
                    class="dropdown-item"
                    :class="{ active: isCurrentModel(m) }"
                    @click="selectQuickModel(m)"
                  >
                    <Check v-if="isCurrentModel(m)" :size="13" />
                    <span v-else class="item-spacer"></span>
                    <span class="dropdown-item-name">{{ m }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="topbar-right">
          <div
              class="transport-status"
              :class="currentSettings.transport === 'backend' ? 'is-backend' : 'is-direct'"
              role="status"
              :aria-label="currentSettings.transport === 'backend'
                ? '后端代理模式，回答支持后台生成和恢复'
                : '直连模式，生成时切换会话会中断回答'"
              :title="currentSettings.transport === 'backend'
                ? '回答由后端任务持续生成，切换会话后可以回来恢复'
                : '模型由当前页面直接连接，生成时切换会话会中断回答'"
          >
            <Server v-if="currentSettings.transport === 'backend'" :size="14" aria-hidden="true" />
            <Cable v-else :size="14" aria-hidden="true" />
            <span class="transport-label">
              {{ currentSettings.transport === 'backend' ? '后端代理' : '直连模式' }}
            </span>
<!--            <span class="transport-detail">-->
<!--              {{ currentSettings.transport === 'backend' ? '可后台恢复' : (isStreaming ? '切换会中断' : '仅当前页面') }}-->
<!--            </span>-->
          </div>
          <div class="topbar-status" :class="{ active: isStreaming }">
            <span class="status-dot"></span>
            <span>{{ isStreaming ? 'Thinking...' : 'Ready' }}</span>
          </div>
          <button class="settings-btn" type="button" title="设置" aria-label="打开聊天设置" @click="settingsOpen = true">
            <Settings2 :size="17" aria-hidden="true" />
          </button>
        </div>
      </header>

      <!-- ── 消息区 ── -->
      <div ref="containerRef" class="chat" @click="handleCodeBlockCopy">
        <div class="messages-inner">

          <!-- 空状态 -->
          <div v-if="messages.length === 0" class="empty-state">
            <div class="empty-icon"><Sparkles :size="26" aria-hidden="true" /></div>
            <h2 class="empty-title">有什么我可以帮你的？</h2>
            <p class="empty-desc">选择下方推荐或在下方直接输入消息开始对话</p>
            <div class="empty-suggestions">
              <button
                v-for="s in suggestionPrompts"
                :key="s.title"
                type="button"
                class="suggestion-card"
                @click="applySuggestion(s.prompt)"
              >
                <div class="suggestion-header">
                  <component :is="s.icon" :size="15" class="suggestion-icon" aria-hidden="true" />
                  <span class="suggestion-title">{{ s.title }}</span>
                </div>
                <p class="suggestion-snippet">{{ s.desc }}</p>
              </button>
            </div>
          </div>

          <!-- 消息列表 -->
          <div
              v-for="msg in messages"
              :key="msg.id"
              class="msg-row"
              :class="[msg.role, { 'has-rag-context': msg.role === 'assistant' && msg.ragContext }]"
          >
            <div
                v-if="msg.role === 'assistant'"
                class="msg-avatar ai-avatar"
            ><img src="/favicon.svg" alt="AI" /></div>
            <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">U</div>
            <div class="msg-col">
              <div
class="msg-bubble"
                   :class="[msg.role, {
                     'is-loading':   msg.status === 'loading',
                     'is-streaming': msg.status === 'streaming',
                     'is-error':     msg.status === 'error',
                     'is-aborted':   msg.status === 'aborted',
                   }]"
              >
                <div v-if="msg.files?.length" class="msg-files">
                  <div v-for="(file, idx) in msg.files" :key="idx" class="msg-file-chip">
                    <FileText class="file-icon" :size="14" aria-hidden="true" />
                    <span class="file-name">{{ file.name }}</span>
                    <span class="file-size">{{ formatFileSize(file.size) }}</span>
                  </div>
                </div>
                <div v-if="msg.images?.length" class="msg-images">
                  <img
v-for="(img, idx) in msg.images" :key="idx"
                       :src="`data:${img.mediaType};base64,${img.base64}`"
                       :alt="img.name"
                       class="msg-image"
                       @click="openImagePreview(`data:${img.mediaType};base64,${img.base64}`)"
                  />
                </div>
                <div class="msg-content markdown-body" v-html="renderContent(msg)"></div>
                <template v-if="msg.status === 'aborted'">
                  <div class="abort-divider"></div>
                  <div class="abort-truncate-row">
                    <div class="abort-truncate-dash"></div>
                    生成中断
                  </div>
                </template>
                <template v-if="msg.status === 'error'">
                  <div class="error-divider"></div>
                  <div class="error-info-row">
                    <span class="error-icon">!</span>
                    <span class="error-text">{{ msg.errorMessage || '生成失败' }}</span>
                  </div>
                </template>
              </div>
              <!-- RAG 引用文档展示 -->
              <RagCitations
                v-if="msg.role === 'assistant' && msg.ragContext"
                :context="msg.ragContext"
              />
              <div v-if="msg.status === 'aborted'" class="abort-badge-row">
                <div class="badge-aborted">
                  <div class="abort-dot"></div>
                  已停止
                </div>
                <button v-if="msg.canContinue !== false" class="btn-continue" :disabled="isStreaming" @click="handleContinue(msg.id)">
                  ↻ 继续生成
                </button>
              </div>
              <div v-if="msg.status === 'error'" class="error-badge-row">
                <div class="badge-error">
                  <div class="error-dot"></div>
                  发送失败
                </div>
                <button class="btn-retry" :disabled="isStreaming" @click="handleRetry(msg.id)">
                  ↻ 重试
                </button>
              </div>
              <!-- 消息快捷操作栏（优雅轻量 Icon-only 设计） -->
              <div class="msg-actions-bar" :class="msg.role">
                <template v-if="msg.role === 'user'">
                  <button
                    type="button"
                    class="msg-action-btn"
                    data-tooltip="编辑提问"
                    aria-label="编辑提问"
                    @click="handleEditPrompt(msg.content)"
                  >
                    <Pencil :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="msg-action-btn"
                    :class="{ copied: copiedMsgId === msg.id }"
                    :data-tooltip="copiedMsgId === msg.id ? '已复制' : '复制提问'"
                    :aria-label="copiedMsgId === msg.id ? '已复制' : '复制提问'"
                    @click="handleCopyMessage(msg.id, msg.content)"
                  >
                    <Check v-if="copiedMsgId === msg.id" :size="14" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                </template>
                <template v-else-if="msg.role === 'assistant' && msg.status !== 'loading' && msg.status !== 'error'">
                  <button
                    type="button"
                    class="msg-action-btn"
                    :class="{ copied: copiedMsgId === msg.id }"
                    :data-tooltip="copiedMsgId === msg.id ? '已复制' : '复制全文'"
                    :aria-label="copiedMsgId === msg.id ? '已复制' : '复制全文'"
                    @click="handleCopyMessage(msg.id, msg.content)"
                  >
                    <Check v-if="copiedMsgId === msg.id" :size="14" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                  <button
                    v-if="msg.status === 'done'"
                    type="button"
                    class="msg-action-btn"
                    :disabled="isStreaming"
                    data-tooltip="重新生成"
                    aria-label="重新生成"
                    @click="handleRegenerate(msg.id)"
                  >
                    <RotateCcw :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                </template>
              </div>
            </div>
          </div>

        </div>

        <!-- 新消息提示 -->
        <transition name="fade-up">
          <div v-if="unreadCount > 0" class="unread-badge" @click="scrollToBottom">
            ↓ 有新消息
          </div>
        </transition>
      </div>

      <!-- ── 输入区 ── -->
      <div class="input-area">
        <!-- 文件预览 -->
        <div v-if="pendingFiles.length > 0" class="file-preview-bar">
          <div v-for="(file, idx) in pendingFiles" :key="idx" class="file-preview-item">
            <FileText class="file-icon" :size="14" aria-hidden="true" />
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">{{ formatFileSize(file.size) }}</span>
            <button class="file-remove-btn" type="button" aria-label="移除文件" @click="removeFile(idx)">
              <X :size="12" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div v-if="isKnowledgeUploading" class="knowledge-upload-progress">
          <div class="knowledge-upload-progress-row">
            <span>{{ knowledgeUploadLabel }}</span>
            <strong>{{ Math.round(knowledgeUploadPercent) }}%</strong>
          </div>
          <div class="knowledge-upload-progress-track">
            <div class="knowledge-upload-progress-bar" :style="{ width: knowledgeUploadPercent + '%' }"></div>
          </div>
        </div>
        <!-- 图片预览 -->
        <div v-if="pendingImages.length > 0" class="image-preview-bar">
          <div v-for="(img, idx) in pendingImages" :key="idx" class="image-preview-item">
            <img :src="`data:${img.mediaType};base64,${img.base64}`" :alt="img.name" />
            <button class="image-remove-btn" type="button" aria-label="移除图片" @click="removeImage(idx)">
              <X :size="12" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
class="input-box" :class="{ disabled: isStreaming }"
             @dragover.prevent="dragOver = true"
             @dragleave.prevent="dragOver = false"
             @drop.prevent="handleDrop">
          <input
              ref="imageInputRef"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              @change="handleImageSelect"
          />
          <input
              ref="fileInputRef"
              type="file"
              accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.toml,.js,.ts,.jsx,.tsx,.vue,.svelte,.py,.go,.rs,.java,.kt,.c,.cpp,.h,.hpp,.cs,.rb,.php,.swift,.sh,.bash,.zsh,.bat,.ps1,.html,.css,.scss,.less,.sass,.sql,.graphql,.proto,.env,.ini,.conf,.cfg,.log"
              multiple
              hidden
              @change="handleFileSelect"
          />
          <input
              ref="knowledgeInputRef"
              type="file"
              accept=".txt,.md,.pdf"
              multiple
              hidden
              @change="handleKnowledgeFileSelect"
          />
          <textarea
              ref="textareaRef"
              v-model="inputValue"
              class="input-field"
              placeholder="输入消息... (输入框为空时按 ↑ 可恢复上一条提问)"
              :disabled="isStreaming"
              rows="1"
              @keydown.enter.exact.prevent="handleKeyEnter"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @keydown.up="handleKeyUp"
              @input="autoResize"
              @paste="handlePaste"
          ></textarea>
          <div class="input-toolbar">
            <div class="toolbar-left">
              <button class="tool-btn" :disabled="isStreaming" title="上传图片" @click="imageInputRef?.click()">
                <ImageIcon :size="18" aria-hidden="true" />
              </button>
              <button class="tool-btn" :disabled="isStreaming" title="上传文件" @click="fileInputRef?.click()">
                <FileText :size="18" aria-hidden="true" />
              </button>
              <button
                  class="tool-btn knowledge-upload-btn"
                  :class="{ uploading: isKnowledgeUploading }"
                  :disabled="isStreaming || isKnowledgeUploading"
                  :title="isKnowledgeUploading ? '知识库上传中' : '上传到知识库'"
                  @click="knowledgeInputRef?.click()"
              >
                <span v-if="isKnowledgeUploading" class="upload-spinner"></span>
                <BookUp2 v-else :size="18" aria-hidden="true" />
              </button>
              <button
v-if="speechSupported"
                      class="tool-btn voice-btn"
                      :class="{ 'is-listening': isListening }"
                      :disabled="isStreaming"
                      :title="isListening ? '停止语音输入' : '语音输入'"
                      @click="toggleVoice">
                <Mic :size="18" aria-hidden="true" />
              </button>
            </div>
            <div class="toolbar-right">
              <button v-if="isStreaming" class="stop-btn" type="button" aria-label="停止生成" @click="handleStop">
                <Square :size="15" :fill="'currentColor'" aria-hidden="true" />
              </button>
              <button
                  v-else
                  class="send-btn"
                  :class="{ ready: inputValue.trim() || pendingImages.length > 0 || pendingFiles.length > 0 }"
                  :disabled="!inputValue.trim() && pendingImages.length === 0 && pendingFiles.length === 0"
                  @click="handleSend"
              ><Send :size="17" aria-hidden="true" /></button>
            </div>
          </div>
        </div>
        <div class="input-hint">
          <template v-if="isStreaming">AI 正在回复中...</template>
          <template v-else>
            <span class="hint-key">Enter</span> 发送 · <span class="hint-key">Shift</span> + <span class="hint-key">Enter</span> 换行 · 纸夹为本轮附件，书本上传到知识库
          </template>
        </div>
      </div>

    </div><!-- /main-content -->

    <!-- ── Toast 通知 ── -->
    <transition-group name="toast-slide" tag="div" class="toast-container">
      <div
          v-for="t in toast.toasts.value"
          :key="t.id"
          class="toast-item"
          :class="t.type"
          :role="t.type === 'error' ? 'alert' : 'status'"
          aria-live="polite"
          @click="toast.dismiss(t.id)"
      >
        <span class="toast-icon" aria-hidden="true">
          <CircleAlert v-if="t.type === 'error'" :size="16" />
          <TriangleAlert v-else-if="t.type === 'warning'" :size="16" />
          <CircleCheck v-else :size="16" />
        </span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </transition-group>

  </div>

  <!-- ── 图片大图预览 ── -->
  <teleport to="body">
    <div v-if="previewImageSrc" class="image-lightbox" @click="previewImageSrc = ''">
      <img :src="previewImageSrc" alt="preview" />
    </div>
  </teleport>

  <!-- ── 设置面板 ── -->
  <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BookUp2,
  Bot,
  Cable,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Code2,
  Copy,
  FileSearch,
  FileText,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-vue-next'
import { useChatView } from '../composables/useChatView'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { useConversationSearch } from '../composables/useConversationSearch'
import { useMessageRenderer } from '../composables/useMessageRenderer'
import { useConversationGroups } from '../composables/useConversationGroups'
import { persistSettings, settings as currentSettings } from '../stores/settings'
import { getClaudeModels } from '../services/providers/claude'
import { uploadKnowledgeFile } from '../services/knowledge'
import type { UploadProgress } from '../services/knowledge'
import SettingsPanel from '../components/SettingsPanel.vue'
import RagCitations from '../components/RagCitations.vue'

// StyleChat 是主聊天页面组件。
// 模板负责布局和绑定事件；具体业务逻辑尽量放在 composable 里，避免单文件过大。

const {
  messages,
  inputValue,
  isStreaming,
  unreadCount,
  containerRef,
  sidebarOpen,
  conversations,
  currentId,
  toast,
  pendingImages,
  pendingFiles,
  handleStop,
  handleSend,
  handleContinue,
  handleRetry,
  handleRegenerate: handleRegenerateMessage,
  scrollToBottom,
  handleSelectConversation,
  handleNewConversation,
  handleDeleteConversation,
  addImages,
  removeImage,
  addFiles,
  removeFile,
} = useChatView()
void containerRef

// 三个 composable 分别负责：消息 Markdown 渲染、侧边栏会话分组、侧边栏搜索。
const { renderContent, handleCodeBlockCopy } = useMessageRenderer()
const { groupedConversations, currentModelName } = useConversationGroups(conversations)
const {
  conversationSearchDraft,
  isSearchLoading,
  searchError,
  searchResults,
  isSearchMode,
  handleSearchResultClick,
  retrySearch,
} = useConversationSearch({
  onSelect: handleSelectConversation,
})

// ── 语音输入 ──────────────────────────────────────
const { isListening, isSupported: speechSupported, start: startSpeech, stop: stopSpeech } = useSpeechRecognition()

function toggleVoice() {
  if (isListening.value) {
    stopSpeech()
  } else {
    startSpeech(
        (text) => { inputValue.value = text },
        (err) => { toast.show(err, 'warning') }
    )
  }
}

// ── 设置面板 ──────────────────────────────────────
const settingsOpen = ref(false)
const previewImageSrc = ref('')
const dragOver = ref(false)

// 点击聊天里的图片时，把 data URL 存到 previewImageSrc，模板中的 lightbox 会显示大图。
function openImagePreview(src: string) {
  previewImageSrc.value = src
}

// ── 侧边栏折叠与快捷键 ────────────────────────────
const isSidebarCollapsed = ref(localStorage.getItem('ai_chat_sidebar_collapsed') === 'true')

function toggleSidebar() {
  if (window.innerWidth <= 768) {
    sidebarOpen.value = !sidebarOpen.value
  } else {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
    localStorage.setItem('ai_chat_sidebar_collapsed', String(isSidebarCollapsed.value))
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === '[') {
    e.preventDefault()
    toggleSidebar()
  }
}

// ── 顶栏模型快速切换 ──────────────────────────────
const modelDropdownOpen = ref(false)
const claudeModels = getClaudeModels()

const quickModels = computed(() => {
  if (currentSettings.transport === 'backend') {
    const list = [currentSettings.backend.model, currentSettings.ollama.model, 'qwen2.5:7b', 'deepseek-chat', 'claude-3-5-sonnet-20241022'].filter(Boolean)
    return Array.from(new Set(list))
  }
  if (currentSettings.provider === 'ollama') {
    const list = [currentSettings.ollama.model, 'qwen2.5:7b', 'llama3:8b', 'deepseek-r1:7b', 'mistral'].filter(Boolean)
    return Array.from(new Set(list))
  }
  if (currentSettings.provider === 'openai') {
    const list = [currentSettings.openai.model, 'gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'moonshot-v1-8k'].filter(Boolean)
    return Array.from(new Set(list))
  }
  const list = [currentSettings.claude.model, ...claudeModels].filter(Boolean)
  return Array.from(new Set(list))
})

function isCurrentModel(m: string): boolean {
  if (currentSettings.transport === 'backend') {
    return (currentSettings.backend.model || currentSettings.ollama.model) === m
  }
  return currentSettings[currentSettings.provider].model === m
}

function selectQuickModel(modelName: string) {
  if (currentSettings.transport === 'backend') {
    currentSettings.backend.model = modelName
  } else {
    currentSettings[currentSettings.provider].model = modelName
  }
  persistSettings(currentSettings)
  modelDropdownOpen.value = false
  toast.show(`已切换至模型：${modelName}`, 'success')
}

function handleClickOutside(e: MouseEvent) {
  if (modelDropdownOpen.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.topbar-model-wrapper')) {
      modelDropdownOpen.value = false
    }
  }
}

// ── 消息级操作与键盘快捷键 ────────────────────────
const copiedMsgId = ref<string | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null

function handleCopyMessage(id: string, content: string) {
  navigator.clipboard.writeText(content).then(() => {
    copiedMsgId.value = id
    toast.show('已复制内容到剪贴板', 'success')
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedMsgId.value = null
    }, 2000)
  })
}

function handleEditPrompt(content: string) {
  inputValue.value = content
  nextTick(() => {
    textareaRef.value?.focus()
    autoResize()
  })
  toast.show('已载入问题到输入框', 'success')
}

function handleRegenerate(id: string) {
  handleRegenerateMessage(id)
}

const isComposing = ref(false)

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd() {
  setTimeout(() => {
    isComposing.value = false
  }, 30)
}

function handleKeyEnter(e: KeyboardEvent) {
  if (e.isComposing || isComposing.value || e.keyCode === 229) {
    return
  }
  handleSend()
}

function handleKeyUp(e: KeyboardEvent) {
  if (inputValue.value.trim() === '') {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user' && messages.value[i].content) {
        e.preventDefault()
        inputValue.value = messages.value[i].content
        nextTick(() => {
          autoResize()
        })
        break
      }
    }
  }
}

// ── 空状态推荐卡片 ────────────────────────────────
const suggestionPrompts = [
  {
    title: '代码排错与重构',
    desc: '分析一段代码中的潜在 Bug，并提供现代化重构与性能优化建议。',
    prompt: '请帮我 review 这段代码，找出潜在的 Bug、性能瓶颈，并给出重构后的实现方案：\n\n```\n// 在这里粘贴你的代码\n```',
    icon: Code2,
  },
  {
    title: '解释核心逻辑',
    desc: '用通俗易懂的语言梳理复杂算法或设计模式的核心原理。',
    prompt: '请用通俗生动的比喻，配合简单的示例代码，帮我详细解释一下：',
    icon: FileSearch,
  },
  {
    title: '编写自动化脚本',
    desc: '生成高效实用的 Python / Shell 脚本以自动化处理日常任务。',
    prompt: '我想写一个脚本来自动处理以下任务，请提供 Python 和 Shell 的实现方案：\n任务需求：',
    icon: Zap,
  },
  {
    title: '架构与技术选型',
    desc: '对比主流技术方案的优劣势、适用场景与潜在陷阱。',
    prompt: '针对以下业务场景，有哪些主流的技术选型方案？请对比它们的优缺点及落地建议：\n场景描述：',
    icon: Sparkles,
  },
]

function applySuggestion(promptText: string) {
  inputValue.value = promptText
  nextTick(() => {
    textareaRef.value?.focus()
    autoResize()
  })
}

// ── 生命周期监听 ──────────────────────────────────
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('click', handleClickOutside)
  if (copyTimer) clearTimeout(copyTimer)
})

// ── 上传相关 ──────────────────────────────────────
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const knowledgeInputRef = ref<HTMLInputElement | null>(null)
const isKnowledgeUploading = ref(false)
const knowledgeUploadLabel = ref('')
const knowledgeUploadPercent = ref(0)

function handleImageSelect(e: Event) {
  // 文件 input 选中图片后，把 FileList 转成数组交给 useChatView 校验和读取。
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addImages(Array.from(input.files))
    input.value = ''
  }
}

function handleFileSelect(e: Event) {
  // 文本文件和代码文件走 addFiles，内容会被读取后随消息保存。
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addFiles(Array.from(input.files))
    input.value = ''
  }
}

async function handleKnowledgeFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!files.length) return

  isKnowledgeUploading.value = true
  knowledgeUploadLabel.value = '准备上传到知识库'
  knowledgeUploadPercent.value = 0
  let successCount = 0
  let totalChunks = 0
  let totalChars = 0
  const failures: string[] = []

  try {
    for (const file of files) {
      knowledgeUploadLabel.value = file.name
      knowledgeUploadPercent.value = 0
      const result = await uploadKnowledgeFile(file, {
        onProgress: progress => updateKnowledgeUploadProgress(file.name, progress),
      })
      if (result.ok) {
        successCount++
        totalChunks += result.chunkCount ?? 0
        totalChars += result.charCount ?? 0
      } else {
        failures.push(`${result.fileName}: ${result.message || '上传失败'}`)
      }
    }

    if (successCount > 0) {
      const details = totalChunks > 0
          ? `，生成 ${totalChunks} 个片段，${totalChars} 字`
          : ''
      toast.show(`已上传 ${successCount} 个文件到知识库${details}`, 'success')
    }
    if (failures.length > 0) {
      toast.show(failures[0], 'error', 7000)
    }
  } finally {
    isKnowledgeUploading.value = false
  }
}

function updateKnowledgeUploadProgress(fileName: string, progress: UploadProgress) {
  knowledgeUploadLabel.value = `${fileName} · ${progress.message}`
  knowledgeUploadPercent.value = progress.percent
}

function formatFileSize(bytes: number): string {
  // UI 展示用，把字节数转成 B/KB/MB。
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handlePaste(e: ClipboardEvent) {
  // 支持直接粘贴截图或图片文件。
  const items = e.clipboardData?.items
  if (!items) return
  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }
  if (imageFiles.length) {
    e.preventDefault()
    addImages(imageFiles)
  }
}

function handleDrop(e: DragEvent) {
  // 支持把图片和文本/代码文件拖到输入框区域上传。
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  const droppedFiles = Array.from(files)
  const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'))
  const textFiles = droppedFiles.filter(f => !f.type.startsWith('image/'))
  if (imageFiles.length) addImages(imageFiles)
  if (textFiles.length) addFiles(textFiles)
}

// ── Textarea 自动高度 ─────────────────────────────
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
  // textarea 根据内容自动增高，但最多 200px，避免输入框占满屏幕。
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// 发送后重置高度
watch(inputValue, (val) => {
  if (!val) {
    const el = textareaRef.value
    if (el) el.style.height = 'auto'
  }
})

</script>

<style src="../styles/chat.css" />
