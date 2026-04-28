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
        <button class="new-chat-btn" @click="handleNewConversation" title="新对话">＋</button>
      </div>
      <div class="sidebar-body">
        <div
            v-for="conv in conversations"
            :key="conv.id"
            class="conv-item"
            :class="{ active: conv.id === currentId }"
            @click="handleSelectConversation(conv.id)"
        >
          <span class="conv-title">{{ conv.title }}</span>
          <button class="conv-del" @click.stop="handleDeleteConversation(conv.id)" title="删除">×</button>
        </div>
        <div v-if="conversations.length === 0" class="conv-empty">暂无对话记录</div>
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
          </div>
        </div>
        <div class="topbar-right">
          <div class="topbar-status" :class="{ active: isStreaming }">
            <span class="status-dot"></span>
            <span>{{ isStreaming ? 'Thinking...' : 'Ready' }}</span>
          </div>
          <button class="settings-btn" @click="settingsOpen = true" title="设置">⚙</button>
        </div>
      </header>

      <!-- ── 消息区 ── -->
      <div class="chat" ref="containerRef" @click="handleChatClick">
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
              <div class="msg-bubble"
                   :style="msg.status === 'aborted' || msg.status === 'error' ? 'border:1px solid #f87171' : ''"
                   :class="[msg.role, {
                     'is-loading':   msg.status === 'loading',
                     'is-streaming': msg.status === 'streaming',
                     'is-error':     msg.status === 'error',
                   }]"
              >
                <div v-if="msg.images?.length" class="msg-images">
                  <img v-for="(img, idx) in msg.images" :key="idx"
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
        <!-- 图片预览 -->
        <div v-if="pendingImages.length > 0" class="image-preview-bar">
          <div v-for="(img, idx) in pendingImages" :key="idx" class="image-preview-item">
            <img :src="`data:${img.mediaType};base64,${img.base64}`" :alt="img.name" />
            <button class="image-remove-btn" @click="removeImage(idx)">×</button>
          </div>
        </div>
        <div class="input-box" :class="{ disabled: isStreaming }"
             @dragover.prevent="dragOver = true"
             @dragleave.prevent="dragOver = false"
             @drop.prevent="handleDrop">
          <input
              ref="fileInputRef"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              @change="handleFileSelect"
          />
          <button class="upload-btn"  :disabled="isStreaming" @click="fileInputRef?.click()" title="上传图片"
                  style="border: 1px solid var(--border);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <textarea
              ref="textareaRef"
              class="input-field"
              v-model="inputValue"
              placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
              :disabled="isStreaming"
              rows="1"
              @keydown.enter.exact.prevent="handleSend"
              @input="autoResize"
              @paste="handlePaste"
          ></textarea>
          <button v-if="isStreaming" class="stop-btn" @click="handleStop">■</button>
          <button
              v-else
              class="send-btn"
              :class="{ ready: inputValue.trim() || pendingImages.length > 0 }"
              :disabled="!inputValue.trim() && pendingImages.length === 0"
              @click="handleSend"
          >↑</button>
        </div>
        <div class="input-hint">
          {{ isStreaming ? 'AI 正在回复中...' : 'Enter 发送 · Shift+Enter 换行 · 可粘贴/拖拽图片' }}
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
import { renderMarkdown } from '../utils/markdown'
import SettingsPanel from '../components/SettingsPanel.vue'
import type {Message} from "../types/chat.ts";

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
} = useChatView()

// ── 设置面板 ──────────────────────────────────────
const settingsOpen = ref(false)
const previewImageSrc = ref('')
const dragOver = ref(false)

function openImagePreview(src: string) {
  previewImageSrc.value = src
}

// ── 图片上传相关 ──────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addImages(Array.from(input.files))
    input.value = ''
  }
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
