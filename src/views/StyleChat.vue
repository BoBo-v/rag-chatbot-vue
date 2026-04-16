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
        <div class="topbar-status" :class="{ active: isStreaming }">
          <span class="status-dot"></span>
          <span>{{ isStreaming ? 'Thinking...' : 'Ready' }}</span>
        </div>
      </header>

      <!-- ── 消息区 ── -->
      <div class="chat" ref="containerRef">
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
            <div v-if="msg.role === 'assistant'" :style="msg.status === 'aborted'?'margin-bottom:40px':''" class="msg-avatar ai-avatar">A</div>
            <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">U</div>
            <div class="msg-col">
              <div class="msg-bubble" :style="msg.status === 'aborted'?'border:1px solid #f87171':''" :class="msg.role">
                <div class="msg-content markdown-body" v-html="renderContent(msg)"></div>
                <template v-if="msg.status === 'aborted'">
                  <div class="abort-divider"></div>
                  <div class="abort-truncate-row">
                    <div class="abort-truncate-dash"></div>
                    生成中断
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
        <div class="input-box" :class="{ disabled: isStreaming }">
          <input
              class="input-field"
              type="text"
              v-model="inputValue"
              placeholder="输入消息，按 Enter 发送..."
              :disabled="isStreaming"
              @keydown.enter="handleSend"
          />
          <button v-if="isStreaming" class="stop-btn" @click="handleStop">■</button>
          <button
              v-else
              class="send-btn"
              :class="{ ready: inputValue.trim() }"
              :disabled="!inputValue.trim()"
              @click="handleSend"
          >↑</button>
        </div>
        <div class="input-hint">
          {{ isStreaming ? 'AI 正在回复中...' : 'Enter 发送' }}
        </div>
      </div>

    </div><!-- /main-content -->

  </div>
</template>

<script setup lang="ts">
import { useChatView } from '../composables/useChatView'
import { renderMarkdown } from '../utils/markdown'

function renderContent(msg: any) {
  let content = msg.formattedContent || msg.content
  if (msg.status === 'loading' || msg.status === 'streaming') {
    content += ' ▋'
  }
  if (msg.formattedContent) {
    return msg.formattedContent
  }
  return renderMarkdown(content)
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
  handleStop,
  handleSend,
  handleContinue,
  scrollToBottom,
  handleSelectConversation,
  handleNewConversation,
  handleDeleteConversation,
} = useChatView()
</script>

<style src="../styles/chat.css" />
