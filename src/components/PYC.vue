<template>
  <div class="app-container">
    <!-- 侧边栏 - 会话列表 -->
    <div class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <h3 v-if="!sidebarCollapsed">对话历史</h3>
        <button class="toggle-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path v-if="sidebarCollapsed" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            <path v-else d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
      </div>

      <div class="sidebar-content" v-if="!sidebarCollapsed">
        <!-- 新建会话按钮 -->
        <button class="new-chat-btn" @click="createNewSession">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          新建对话
        </button>

        <!-- 会话列表 -->
        <div class="sessions-list">
          <div
              v-for="session in sessions"
              :key="session.session_id"
              class="session-item"
              :class="{ active: currentSessionId === session.session_id }"
              @click="switchSession(session.session_id)"
          >
            <div class="session-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
              </svg>
            </div>
            <div class="session-info">
              <span class="session-title">对话 {{ session.session_id.slice(0, 8) }}</span>
              <span class="session-meta">{{ session.message_count || 0 }} 条消息</span>
            </div>
            <button class="delete-btn" @click.stop="deleteSession(session.session_id)">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <!-- 空状态 -->
          <div v-if="sessions.length === 0" class="empty-sessions">
            <p>暂无对话记录</p>
            <p>点击上方按钮开始新对话</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 主聊天区域 -->
    <div class="chat-container">
      <div class="chat-header">
        <div class="header-left">
          <div class="avatar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
          <div class="header-info">
            <span class="bot-name">小智 AI</span>
            <span class="status">
              <span class="status-dot" :class="{ active: loading, error: connectionError }"></span>
              {{ connectionError ? '连接失败' : (loading ? '正在输入...' : '在线') }}
            </span>
          </div>
        </div>
        <div class="header-right">
          <span class="session-id" v-if="currentSessionId">
            会话: {{ currentSessionId.slice(0, 8) }}...
          </span>
        </div>
      </div>

      <div class="messages" ref="messagesRef">
        <!-- 加载历史中 -->
        <div v-if="loadingHistory" class="loading-history">
          <div class="spinner"></div>
          <span>加载历史记录...</span>
        </div>

        <!-- 欢迎消息 -->
        <div v-else-if="messages.length === 0" class="welcome-message">
          <div class="welcome-icon">👋</div>
          <h3>你好！我是小智</h3>
          <p>有什么可以帮助你的吗？</p>
          <div class="quick-actions">
            <button @click="sendQuickMessage('你好，介绍一下你自己')">👋 打个招呼</button>
            <button @click="sendQuickMessage('你能做什么？')">🤔 了解功能</button>
          </div>
        </div>

        <TransitionGroup name="message">
          <template v-for="(msg, i) in messages" :key="msg.id || i">
            <div
                v-if="!(msg.role === 'assistant' && msg.content === '' && loading)"
                :class="['message-wrapper', msg.role]"
            >
              <!-- 机器人头像 -->
              <div class="msg-avatar" v-if="msg.role === 'assistant'">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                </svg>
              </div>

              <!-- 用户头像 -->
              <div class="msg-avatar user-avatar" v-if="msg.role === 'user'">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>

              <div :class="['message-bubble', msg.role]">
                <div class="message-content">
                  {{ msg.content }}
                  <span
                      v-if="msg.role === 'assistant' && loading && i === messages.length - 1 && msg.content !== ''"
                      class="typing-cursor"
                  ></span>
                </div>
                <div class="message-time">{{ msg.time }}</div>
              </div>
            </div>
          </template>
        </TransitionGroup>

        <!-- 思考中动画 -->
        <Transition name="fade">
          <div v-if="loading && messages.length > 0 && messages[messages.length - 1]?.content === ''" class="thinking-indicator">
            <div class="msg-avatar">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              </svg>
            </div>
            <div class="thinking-bubble">
              <div class="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <div class="input-area">
        <div class="input-wrapper">
          <textarea
              v-model="question"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
              ref="textareaRef"
              placeholder="输入你的问题..."
              :disabled="loading"
              rows="1"
          ></textarea>
          <button
              class="send-btn"
              @click="sendMessage"
              :disabled="loading || !question.trim()"
              :class="{ active: question.trim() && !loading }"
          >
            <svg v-if="!loading" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
            <div v-else class="btn-loading">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>
        </div>
        <div class="input-hint">按 Enter 发送，Shift + Enter 换行</div>
      </div>
    </div>

    <!-- 错误提示 -->
    <Transition name="toast">
      <div v-if="errorMessage" class="error-toast">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>{{ errorMessage }}</span>
        <button @click="errorMessage = ''">✕</button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, watch } from 'vue';

// ============ 配置 ============
const API_URL = 'http://localhost:8000/api';

// ============ 状态 ============
const question = ref('');
const messages = ref([]);
const loading = ref(false);
const loadingHistory = ref(false);
const connectionError = ref(false);
const errorMessage = ref('');
const messagesRef = ref(null);
const textareaRef = ref(null);

// 会话相关
const currentSessionId = ref(null);
const sessions = ref([]);
const sidebarCollapsed = ref(false);

// ============ 工具函数 ============
function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function autoResize() {
  const textarea = textareaRef.value;
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }
}

function scrollToBottom(smooth = true) {
  if (messagesRef.value) {
    messagesRef.value.scrollTo({
      top: messagesRef.value.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }
}

function showError(msg, duration = 3000) {
  errorMessage.value = msg;
  setTimeout(() => {
    errorMessage.value = '';
  }, duration);
}

// ============ API 调用 ============

// 创建新会话
async function createNewSession() {
  try {
    const response = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) throw new Error('创建会话失败');

    const data = await response.json();
    currentSessionId.value = data.session_id;
    messages.value = [];
    connectionError.value = false;

    // 刷新会话列表
    await fetchSessions();

    // 聚焦输入框
    textareaRef.value?.focus();

  } catch (error) {
    console.error('Create session error:', error);
    showError('创建会话失败，请检查服务是否运行');
    connectionError.value = true;
  }
}

// 获取会话列表
async function fetchSessions() {
  try {
    const response = await fetch(`${API_URL}/sessions`);
    if (!response.ok) throw new Error('获取会话列表失败');

    const data = await response.json();
    sessions.value = data.sessions || [];
    connectionError.value = false;

  } catch (error) {
    console.error('Fetch sessions error:', error);
    connectionError.value = true;
  }
}

// 切换会话
async function switchSession(sessionId) {
  if (sessionId === currentSessionId.value) return;

  currentSessionId.value = sessionId;
  await loadHistory(sessionId);
}

// 加载会话历史
async function loadHistory(sessionId) {
  loadingHistory.value = true;
  messages.value = [];

  try {
    const response = await fetch(`${API_URL}/sessions/${sessionId}/history`);
    if (!response.ok) throw new Error('加载历史失败');

    const data = await response.json();

    // 转换消息格式
    messages.value = (data.messages || []).map((msg, index) => ({
      id: generateMessageId(),
      role: msg.role === 'human' ? 'user' : 'assistant',
      content: msg.content,
      time: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      }) : ''
    }));

    await nextTick();
    scrollToBottom(false);

  } catch (error) {
    console.error('Load history error:', error);
    showError('加载历史记录失败');
  } finally {
    loadingHistory.value = false;
  }
}

// 删除会话（本地删除，后端暂不支持）
function deleteSession(sessionId) {
  if (!confirm('确定要删除这个对话吗？')) return;

  sessions.value = sessions.value.filter(s => s.session_id !== sessionId);

  if (currentSessionId.value === sessionId) {
    if (sessions.value.length > 0) {
      switchSession(sessions.value[0].session_id);
    } else {
      currentSessionId.value = null;
      messages.value = [];
    }
  }
}

// 发送快捷消息
function sendQuickMessage(text) {
  question.value = text;
  sendMessage();
}

// 发送消息（流式）
async function sendMessage() {
  if (!question.value.trim() || loading.value) return;

  // 如果没有会话，先创建一个
  if (!currentSessionId.value) {
    await createNewSession();
    if (!currentSessionId.value) return; // 创建失败则退出
  }

  const userQuestion = question.value.trim();
  const currentTime = getCurrentTime();

  // 添加用户消息
  messages.value.push({
    id: generateMessageId(),
    role: 'user',
    content: userQuestion,
    time: currentTime
  });

  question.value = '';
  loading.value = true;

  // 重置 textarea 高度
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }

  await nextTick();
  scrollToBottom();

  // 添加空的助手消息
  const assistantMsg = {
    id: generateMessageId(),
    role: 'assistant',
    content: '',
    time: currentTime
  };
  messages.value.push(assistantMsg);
  const assistantIndex = messages.value.length - 1;

  await nextTick();
  scrollToBottom();

  try {
    const response = await fetch(`${API_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: userQuestion,
        session_id: currentSessionId.value
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    connectionError.value = false;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);

          // 处理 [DONE] 信号
          if (dataStr === '[DONE]') continue;

          try {
            // 尝试解析 JSON 格式
            const data = JSON.parse(dataStr);

            if (data.type === 'session') {
              // 更新 session_id（如果服务端返回）
              if (data.session_id) {
                currentSessionId.value = data.session_id;
              }
            } else if (data.type === 'content') {
              // 处理内容，还原转义的换行符
              const text = data.text.replace(/\\n/g, '\n');
              messages.value[assistantIndex].content += text;
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (parseError) {
            // 如果不是 JSON，当作纯文本处理（兼容旧接口）
            if (!dataStr.startsWith('{')) {
              messages.value[assistantIndex].content += dataStr;
            }
          }

          await nextTick();
          scrollToBottom();
        }
      }
    }

    // 刷新会话列表（更新消息计数）
    await fetchSessions();

  } catch (error) {
    console.error('Stream error:', error);
    messages.value[assistantIndex].content = '抱歉，出错了：' + error.message;
    connectionError.value = true;
    showError('发送失败：' + error.message);
  } finally {
    loading.value = false;
    messages.value[assistantIndex].time = getCurrentTime();
  }
}

// ============ 生命周期 ============
onMounted(async () => {
  // 加载会话列表
  await fetchSessions();

  // 如果有会话，加载最近的一个
  if (sessions.value.length > 0) {
    await switchSession(sessions.value[0].session_id);
  }

  textareaRef.value?.focus();
});
</script>

<style scoped>
/* ============ 布局 ============ */
.app-container {
  display: flex;
  height: 100vh;
  background: #f0f2f5;
}

/* ============ 侧边栏 ============ */
.sidebar {
  width: 280px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
}

.sidebar.collapsed {
  width: 60px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}

.toggle-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: #e5e7eb;
}

.toggle-btn svg {
  width: 20px;
  height: 20px;
  color: #6b7280;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.new-chat-btn {
  width: 100%;
  padding: 12px 16px;
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  margin-bottom: 16px;
}

.new-chat-btn:hover {
  border-color: #667eea;
  color: #667eea;
  background: #f5f3ff;
}

.new-chat-btn svg {
  width: 20px;
  height: 20px;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.session-item:hover {
  background: #f3f4f6;
}

.session-item.active {
  background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
  border: 1px solid #667eea30;
}

.session-icon {
  width: 36px;
  height: 36px;
  background: #f3f4f6;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.session-item.active .session-icon {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.session-icon svg {
  width: 18px;
  height: 18px;
  color: #6b7280;
}

.session-item.active .session-icon svg {
  color: #ffffff;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}

.delete-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
}

.session-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #fee2e2;
}

.delete-btn svg {
  width: 16px;
  height: 16px;
  color: #ef4444;
}

.empty-sessions {
  text-align: center;
  padding: 40px 20px;
  color: #9ca3af;
}

.empty-sessions p {
  margin: 4px 0;
  font-size: 14px;
}

/* ============ 主聊天区域 ============ */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 900px;
  margin: 0 auto;
  background: #ffffff;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.05);
}

@media (max-width: 1200px) {
  .chat-container {
    max-width: none;
  }
}

/* ============ 头部样式 ============ */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-header .avatar {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-header .avatar svg {
  width: 24px;
  height: 24px;
}

.header-info {
  display: flex;
  flex-direction: column;
}

.bot-name {
  font-weight: 600;
  font-size: 16px;
}

.status {
  font-size: 12px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #4ade80;
  border-radius: 50%;
  transition: all 0.3s;
}

.status-dot.active {
  background: #fbbf24;
  animation: pulse 1.5s infinite;
}

.status-dot.error {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
}

.header-right {
  display: flex;
  align-items: center;
}

.session-id {
  font-size: 12px;
  opacity: 0.8;
  background: rgba(255, 255, 255, 0.15);
  padding: 4px 10px;
  border-radius: 12px;
}

/* ============ 消息区域 ============ */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f8fafc;
  scroll-behavior: smooth;
}

/* 加载历史 */
.loading-history {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #64748b;
  gap: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 欢迎消息 */
.welcome-message {
  text-align: center;
  padding: 40px 20px;
  color: #64748b;
}

.welcome-icon {
  font-size: 48px;
  margin-bottom: 16px;
  animation: wave 2s infinite;
}

@keyframes wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(20deg); }
  75% { transform: rotate(-20deg); }
}

.welcome-message h3 {
  margin: 0 0 8px;
  color: #334155;
  font-size: 20px;
}

.welcome-message p {
  margin: 0 0 24px;
  font-size: 14px;
}

.quick-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.quick-actions button {
  padding: 10px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #ffffff;
  color: #475569;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-actions button:hover {
  border-color: #667eea;
  color: #667eea;
  background: #f5f3ff;
}

/* 消息包装器 */
.message-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 16px;
}

.message-wrapper.user {
  flex-direction: row-reverse;
}

/* 头像 */
.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.msg-avatar svg {
  width: 20px;
  height: 20px;
  color: #fff;
}

.msg-avatar.user-avatar {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
}

/* 消息气泡 */
.message-bubble {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 16px;
  position: relative;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-bubble.assistant {
  background: #ffffff;
  color: #334155;
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.message-bubble.user {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.message-content {
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-time {
  font-size: 11px;
  opacity: 0.6;
  margin-top: 6px;
  text-align: right;
}

/* 打字光标 */
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 18px;
  background: #667eea;
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 思考中动画 */
.thinking-indicator {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 16px;
}

.thinking-bubble {
  background: #ffffff;
  padding: 16px 20px;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.thinking-dots {
  display: flex;
  gap: 6px;
}

.thinking-dots span {
  width: 8px;
  height: 8px;
  background: #667eea;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out;
}

.thinking-dots span:nth-child(1) { animation-delay: 0s; }
.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 消息过渡动画 */
.message-enter-active {
  animation: slideIn 0.3s ease-out;
}

.message-leave-active {
  animation: slideIn 0.3s ease-out reverse;
}

/* ============ 输入区域 ============ */
.input-area {
  padding: 16px 20px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  background: #f1f5f9;
  border-radius: 24px;
  padding: 8px 8px 8px 20px;
  transition: all 0.3s;
  border: 2px solid transparent;
}

.input-wrapper:focus-within {
  background: #ffffff;
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
}

.input-wrapper textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  padding: 8px 0;
  max-height: 120px;
  outline: none;
  font-family: inherit;
}

.input-wrapper textarea::placeholder {
  color: #94a3b8;
}

.send-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: #e2e8f0;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  flex-shrink: 0;
}

.send-btn svg {
  width: 20px;
  height: 20px;
}

.send-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
}

.send-btn.active:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.send-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 按钮加载动画 */
.btn-loading {
  display: flex;
  gap: 4px;
}

.btn-loading span {
  width: 6px;
  height: 6px;
  background: #667eea;
  border-radius: 50%;
  animation: btnBounce 1.4s infinite ease-in-out;
}

.btn-loading span:nth-child(1) { animation-delay: 0s; }
.btn-loading span:nth-child(2) { animation-delay: 0.2s; }
.btn-loading span:nth-child(3) { animation-delay: 0.4s; }

@keyframes btnBounce {
  0%, 80%, 100% { transform: scale(0.8); }
  40% { transform: scale(1.2); }
}

.input-hint {
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  margin-top: 8px;
}

/* ============ 错误提示 ============ */
.error-toast {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 12px 20px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.error-toast svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.error-toast button {
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  padding: 0;
  font-size: 16px;
  opacity: 0.6;
}

.error-toast button:hover {
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* ============ 滚动条样式 ============ */
.messages::-webkit-scrollbar,
.sidebar-content::-webkit-scrollbar {
  width: 6px;
}

.messages::-webkit-scrollbar-track,
.sidebar-content::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb,
.sidebar-content::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.messages::-webkit-scrollbar-thumb:hover,
.sidebar-content::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* ============ 响应式 ============ */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar:not(.collapsed) {
    transform: translateX(0);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.1);
  }

  .sidebar.collapsed {
    width: 0;
    transform: translateX(-100%);
  }
}
</style>