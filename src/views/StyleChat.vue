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

    <!-- ── 顶栏 ── -->
    <header class="topbar">
      <div class="topbar-logo">
        <span class="logo-dot"></span>
        <span class="logo-text">AI Chat</span>
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

        <!-- 消息列表：user 靠右 / assistant 靠左 -->
        <div
            v-for="msg in messages"
            :key="msg.id"
            class="msg-row"
            :class="msg.role"
        >
          <!-- AI 头像（左） -->
          <div v-if="msg.role === 'assistant'" :style="msg.status === 'aborted'?'margin-bottom:40px':''"  class="msg-avatar ai-avatar">A</div>
          <!-- 用户头像（右） -->
          <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">U</div>
          <div class="msg-col">
            <!-- 气泡 -->
            <div class="msg-bubble" :style="msg.status === 'aborted'?'border:1px solid #f87171':''"  :class="msg.role">
              <div class="msg-content">
                {{ msg.content }}
                <!-- 流式光标 -->
                <span
                    v-if="msg.status === 'loading' || msg.status === 'streaming'"
                    class="cursor-blink"
                >▋</span>
              </div>
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
          ↓  有新消息
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
        <button
            v-if="isStreaming"
            class="stop-btn"
            @click="handleStop"
        >■</button>

        <!-- 非 streaming 时：发送按钮 -->
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

  </div>
</template>

<script setup lang="ts">
// 唯一职责：引入逻辑层，把需要的状态和方法解构给模板
import { useChatView } from '../composables/useChatView'

const {
  messages,
  inputValue,
  isStreaming,
  unreadCount,
  containerRef,
  handleStop,
  handleSend,
  handleContinue,
  scrollToBottom,
} = useChatView()
</script>

<!-- 引入独立样式文件，不使用 scoped（背景 orb 是 fixed 定位，需要全局生效） -->
<style src="../styles/chat.css" />