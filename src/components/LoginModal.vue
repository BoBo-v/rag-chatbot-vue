<template>
  <Teleport to="body">
    <div v-if="isAuthModalVisible" class="auth-overlay">
      <div class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="auth-header">
          <div class="auth-icon-wrap">
            <Lock :size="24" aria-hidden="true" />
          </div>
          <h2 id="auth-title" class="auth-title">会话已失效 / 请登录</h2>
          <p class="auth-subtitle">当前操作需要管理员权限，请输入凭据以继续访问系统服务。</p>
        </div>

        <form class="auth-form" @submit.prevent="handleSubmit">
          <div v-if="errorMessage" class="auth-error-banner" role="alert">
            <AlertCircle :size="16" aria-hidden="true" />
            <span>{{ errorMessage }}</span>
          </div>

          <div class="auth-field">
            <label for="auth-username" class="auth-label">用户名</label>
            <input
              id="auth-username"
              v-model="username"
              type="text"
              class="auth-input"
              placeholder="请输入管理员用户名"
              required
              autocomplete="username"
              :disabled="loading"
            />
          </div>

          <div class="auth-field">
            <label for="auth-password" class="auth-label">密码</label>
            <input
              id="auth-password"
              v-model="password"
              type="password"
              class="auth-input"
              placeholder="请输入管理员密码"
              required
              autocomplete="current-password"
              :disabled="loading"
            />
          </div>

          <div class="auth-actions">
            <button
              type="submit"
              class="auth-submit-btn"
              :disabled="loading"
            >
              <LoaderCircle v-if="loading" class="spinning" :size="16" aria-hidden="true" />
              <span>{{ loading ? '正在验证凭证...' : '立即登录' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Lock, AlertCircle, LoaderCircle } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const { isAuthModalVisible } = authStore

const username = ref('admin')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function handleSubmit() {
  if (!username.value || !password.value) return
  loading.value = true
  errorMessage.value = ''

  const result = await authStore.login(username.value, password.value)
  loading.value = false

  if (result.ok) {
    password.value = ''
    errorMessage.value = ''
  } else {
    errorMessage.value = result.error || '登录失败，请核对账号密码。'
  }
}
</script>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background-color: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.2s ease-out;
}

.auth-dialog {
  background: var(--bg-surface, #1e1c29);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  padding: 28px 24px 24px;
}

.auth-header {
  text-align: center;
  margin-bottom: 24px;
}

.auth-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.auth-title {
  font-size: 19px;
  font-weight: 600;
  color: var(--text-primary, #ffffff);
  margin: 0 0 8px;
}

.auth-subtitle {
  font-size: 13px;
  color: var(--text-secondary, #94a3b8);
  margin: 0;
  line-height: 1.5;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #cbd5e1);
}

.auth-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text-primary, #ffffff);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.auth-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}

.auth-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-actions {
  margin-top: 8px;
}

.auth-submit-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #6366f1;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.05s;
}

.auth-submit-btn:hover:not(:disabled) {
  background: #4f46e5;
}

.auth-submit-btn:active:not(:disabled) {
  transform: scale(0.99);
}

.auth-submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
</style>
