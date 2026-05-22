<template>
  <div class="app-shell">

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
        <button class="new-chat-btn" title="新对话" @click="handleNewConversation">＋</button>
      </div>
      <div class="sidebar-body">
        <button class="new-chat-big-btn" @click="handleNewConversation">
          <span class="new-chat-icon">✎</span>
          新建对话
        </button>
        <div class="sidebar-search">
          <span class="sidebar-search-icon">⌕</span>
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
            ×
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
          <div v-if="searchError" class="conv-empty search-empty">{{ searchError }}</div>
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
              <button class="conv-del" title="删除" @click.stop="handleDeleteConversation(conv.id)">×</button>
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
          <button class="menu-btn" @click="sidebarOpen = !sidebarOpen">☰</button>
          <div class="topbar-logo">
            <span class="logo-dot"></span>
            <span class="logo-text">AI Chat</span>
            <span v-if="currentSettings.showModelInTopbar" class="topbar-model">{{ currentModelName }}</span>
          </div>
        </div>
        <div class="topbar-right">
          <div class="topbar-status" :class="{ active: isStreaming }">
            <span class="status-dot"></span>
            <span>{{ isStreaming ? 'Thinking...' : 'Ready' }}</span>
          </div>
          <button class="settings-btn" title="设置" @click="settingsOpen = true">⚙</button>
        </div>
      </header>

      <!-- ── 消息区 ── -->
      <div ref="containerRef" class="chat" @click="handleChatClick">
        <div class="messages-inner">

          <!-- 空状态 -->
          <div v-if="messages.length === 0" class="empty-state">
            <div class="empty-icon">✦</div>
            <p>发送消息开始对话</p>
          </div>

          <!-- 消息列表 -->
          <div
              v-for="msg in messages"
              :key="msg.id"
              class="msg-row"
              :class="msg.role"
          >
            <div v-if="msg.role === 'assistant'" :style="msg.status === 'aborted' || msg.status === 'error' ? 'margin-bottom:40px' : ''" class="msg-avatar ai-avatar">A</div>
            <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">U</div>
            <div class="msg-col">
              <div
class="msg-bubble"
                   :style="msg.status === 'aborted' || msg.status === 'error' ? 'border:1px solid #f87171' : ''"
                   :class="[msg.role, {
                     'is-loading':   msg.status === 'loading',
                     'is-streaming': msg.status === 'streaming',
                     'is-error':     msg.status === 'error',
                   }]"
              >
                <div v-if="msg.files?.length" class="msg-files">
                  <div v-for="(file, idx) in msg.files" :key="idx" class="msg-file-chip">
                    <span class="file-icon">📄</span>
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
              <div v-if="msg.status === 'aborted'" class="abort-badge-row">
                <div class="badge-aborted">
                  <div class="abort-dot"></div>
                  已停止
                </div>
                <button class="btn-continue" @click="handleContinue(msg.id)">
                  ↻ 继续生成
                </button>
              </div>
              <div v-if="msg.status === 'error'" class="error-badge-row">
                <div class="badge-error">
                  <div class="error-dot"></div>
                  发送失败
                </div>
                <button class="btn-retry" @click="handleRetry(msg.id)">
                  ↻ 重试
                </button>
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
            <span class="file-icon">📄</span>
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">{{ formatFileSize(file.size) }}</span>
            <button class="file-remove-btn" @click="removeFile(idx)">×</button>
          </div>
        </div>
        <!-- 图片预览 -->
        <div v-if="pendingImages.length > 0" class="image-preview-bar">
          <div v-for="(img, idx) in pendingImages" :key="idx" class="image-preview-item">
            <img :src="`data:${img.mediaType};base64,${img.base64}`" :alt="img.name" />
            <button class="image-remove-btn" @click="removeImage(idx)">×</button>
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
          <textarea
              ref="textareaRef"
              v-model="inputValue"
              class="input-field"
              placeholder="输入消息..."
              :disabled="isStreaming"
              rows="1"
              @keydown.enter.exact.prevent="handleSend"
              @input="autoResize"
              @paste="handlePaste"
          ></textarea>
          <div class="input-toolbar">
            <div class="toolbar-left">
              <button class="tool-btn" :disabled="isStreaming" title="上传图片" @click="imageInputRef?.click()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <button class="tool-btn" :disabled="isStreaming" title="上传文件" @click="fileInputRef?.click()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </button>
              <button
v-if="speechSupported"
                      class="tool-btn voice-btn"
                      :class="{ 'is-listening': isListening }"
                      :disabled="isStreaming"
                      :title="isListening ? '停止语音输入' : '语音输入'"
                      @click="toggleVoice">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            </div>
            <div class="toolbar-right">
              <button v-if="isStreaming" class="stop-btn" @click="handleStop">■</button>
              <button
                  v-else
                  class="send-btn"
                  :class="{ ready: inputValue.trim() || pendingImages.length > 0 || pendingFiles.length > 0 }"
                  :disabled="!inputValue.trim() && pendingImages.length === 0 && pendingFiles.length === 0"
                  @click="handleSend"
              >↑</button>
            </div>
          </div>
        </div>
        <div class="input-hint">
          <template v-if="isStreaming">AI 正在回复中...</template>
          <template v-else>
            <span class="hint-key">Enter</span> 发送 · <span class="hint-key">Shift</span> + <span class="hint-key">Enter</span> 换行 · 支持粘贴/拖拽图片 · 上传文件
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
          @click="toast.dismiss(t.id)"
      >
        <span class="toast-icon">{{ t.type === 'error' ? '✕' : t.type === 'warning' ? '!' : '✓' }}</span>
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
import { ref, computed, watch } from 'vue'
import { useChatView } from '../composables/useChatView'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { renderMarkdown } from '../utils/markdown'
import { settings as currentSettings } from '../stores/settings'
import { searchService } from '../search/SearchService'
import SettingsPanel from '../components/SettingsPanel.vue'
import type {Message} from "../types/chat.ts";
import type {Conversation} from "../types/chat.ts";
import type {SearchResult} from "../search/types.ts";

const conversationSearchDraft = ref('')
const isSearchLoading = ref(false)
const searchError = ref('')
const searchResults = ref<SearchResult[]>([])
const isSearchMode = computed(() => conversationSearchDraft.value.trim().length > 0)
let searchRequestSeq = 0

const currentModelName = computed(() => {
  const p = currentSettings.provider
  if (p === 'ollama') return currentSettings.ollama.model
  if (p === 'openai') return currentSettings.openai.model
  return currentSettings.claude.model
})

function renderContent(msg: Message) {
  // loading：还没收到任何内容，显示"思考中"跳动点
  if (msg.status === 'loading') {
    return '<div class="thinking-dots"><span></span><span></span><span></span></div>'
  }
  // error 且无内容时不渲染空气泡
  if (msg.status === 'error' && !msg.content) {
    return ''
  }
  // 已有预渲染内容（done 状态）
  if (msg.formattedContent) {
    return msg.formattedContent
  }
  // 流式输出中：渲染当前内容 + 闪烁光标（插入到最后一个闭合标签之前，确保光标紧跟文字）
  const rendered = renderMarkdown(msg.content)
  if (msg.status === 'streaming') {
    const cursor = '<span class="cursor-blink">▋</span>'
    const lastClose = rendered.lastIndexOf('</')
    if (lastClose === -1) return rendered + cursor
    return rendered.slice(0, lastClose) + cursor + rendered.slice(lastClose)
  }
  return rendered
}

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

// ── 对话日期分组 ──────────────────────────────────
function getDateLabel(timestamp: number): string {
  const now = new Date()
  const date = new Date(timestamp)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000)

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays <= 7) return `${diffDays}天前`
  if (diffDays <= 14) return '上周'
  if (diffDays <= 30) return '上月'
  return `${date.getFullYear()}/${date.getMonth() + 1}`
}

const groupedConversations = computed(() => {
  const groups: { label: string; items: Conversation[] }[] = []
  let currentLabel = ''
  for (const conv of conversations.value) {
    const label = getDateLabel(conv.updatedAt)
    if (label !== currentLabel) {
      currentLabel = label
      groups.push({ label, items: [] })
    }
    groups[groups.length - 1].items.push(conv)
  }
  return groups
})

watch(conversationSearchDraft, (value) => {
  const query = value.trim()
  const requestSeq = ++searchRequestSeq
  searchError.value = ''

  if (!query) {
    isSearchLoading.value = false
    searchResults.value = []
    return
  }

  isSearchLoading.value = true
  window.setTimeout(async () => {
    if (requestSeq !== searchRequestSeq) return
    try {
      const results = await searchService.search({ query, limit: 20 })
      if (requestSeq !== searchRequestSeq) return
      searchResults.value = results
    } catch (err: unknown) {
      if (requestSeq !== searchRequestSeq) return
      searchResults.value = []
      searchError.value = err instanceof Error ? err.message : '搜索失败'
    } finally {
      if (requestSeq === searchRequestSeq) {
        isSearchLoading.value = false
      }
    }
  }, 250)
})

function handleSearchResultClick(conversationId: number) {
  if (isStreaming.value) return
  handleSelectConversation(conversationId)
}

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

function openImagePreview(src: string) {
  previewImageSrc.value = src
}

// ── 上传相关 ──────────────────────────────────────
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleImageSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addImages(Array.from(input.files))
    input.value = ''
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addFiles(Array.from(input.files))
    input.value = ''
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handlePaste(e: ClipboardEvent) {
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
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length) addImages(imageFiles)
}

// ── Textarea 自动高度 ─────────────────────────────
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
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

// ── 代码块复制按钮（事件委托） ────────────────────
function handleChatClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.code-copy-btn') as HTMLElement | null
  if (!btn) return
  const code = btn.closest('.code-block-wrapper')?.querySelector('code')?.textContent ?? ''
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '已复制 ✓'
    btn.classList.add('copied')
    setTimeout(() => {
      btn.textContent = '复制'
      btn.classList.remove('copied')
    }, 2000)
  })
}
</script>

<style src="../styles/chat.css" />
