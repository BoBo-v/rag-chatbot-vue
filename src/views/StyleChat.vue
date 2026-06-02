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
      <div ref="containerRef" class="chat" @click="handleCodeBlockCopy">
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
            <div
                v-if="msg.role === 'assistant'"
                class="msg-avatar ai-avatar"
                :class="{ 'has-followup': msg.status === 'aborted' || msg.status === 'error' }"
            >A</div>
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
                <button class="btn-continue" :disabled="isStreaming" @click="handleContinue(msg.id)">
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
          <input
              ref="knowledgeInputRef"
              type="file"
              accept=".txt,.pdf"
              multiple
              hidden
              @change="handleKnowledgeFileSelect"
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
                  class="tool-btn knowledge-upload-btn"
                  :class="{ uploading: isKnowledgeUploading }"
                  :disabled="isStreaming || isKnowledgeUploading"
                  :title="isKnowledgeUploading ? '知识库上传中' : '上传到知识库'"
                  @click="knowledgeInputRef?.click()"
              >
                <span v-if="isKnowledgeUploading" class="upload-spinner"></span>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  <path d="M12 13V7"/>
                  <path d="m9 10 3-3 3 3"/>
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
import { ref, watch } from 'vue'
import { useChatView } from '../composables/useChatView'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { useConversationSearch } from '../composables/useConversationSearch'
import { useMessageRenderer } from '../composables/useMessageRenderer'
import { useConversationGroups } from '../composables/useConversationGroups'
import { settings as currentSettings } from '../stores/settings'
import { uploadKnowledgeFile } from '../services/knowledge'
import SettingsPanel from '../components/SettingsPanel.vue'

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
  canSelect: () => !isStreaming.value,
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

// ── 上传相关 ──────────────────────────────────────
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const knowledgeInputRef = ref<HTMLInputElement | null>(null)
const isKnowledgeUploading = ref(false)

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
  let successCount = 0
  let totalChunks = 0
  let totalChars = 0
  const failures: string[] = []

  try {
    for (const file of files) {
      const result = await uploadKnowledgeFile(file)
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
