<template>
  <Teleport to="body">
    <div
      v-if="isAuthModalVisible"
      class="auth-overlay"
      tabindex="-1"
      @click.self="handleClose"
      @keydown.esc="handleClose"
    >
      <div
        class="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <!-- 顶部装饰与关闭按钮 -->
        <header class="auth-header">
          <div class="auth-heading">
            <span class="auth-eyebrow">SECURITY ACCESS</span>
            <h2 id="auth-title" class="auth-title">管理员登录</h2>
            <p class="auth-subtitle">验证管理员凭据后即可解锁工单决策、知识库管理与排障服务。</p>
          </div>
          <button
            type="button"
            class="auth-close-btn"
            aria-label="关闭登录窗口"
            title="关闭 (Esc)"
            @click="handleClose"
          >
            <X :size="18" aria-hidden="true" />
          </button>
        </header>

        <!-- 表单区域 -->
        <form class="auth-form" @submit.prevent="handleSubmit">
          <!-- 错误提示 Banner -->
          <div v-if="errorMessage" class="auth-error-banner" role="alert" aria-live="assertive">
            <AlertCircle class="error-icon" :size="15" aria-hidden="true" />
            <span class="error-text">{{ errorMessage }}</span>
          </div>

          <!-- 用户名输入 -->
          <div class="auth-field">
            <label for="auth-username" class="auth-label">管理员账号</label>
            <div class="auth-input-wrapper">
              <User class="field-icon" :size="16" aria-hidden="true" />
              <input
                id="auth-username"
                ref="usernameInputRef"
                v-model="username"
                type="text"
                class="auth-input"
                placeholder="请输入管理员用户名"
                required
                autocomplete="username"
                :disabled="loading"
              />
            </div>
          </div>

          <!-- 密码输入 -->
          <div class="auth-field">
            <div class="auth-label-row">
              <label for="auth-password" class="auth-label">登录密码</label>
            </div>
            <div class="auth-input-wrapper">
              <Lock class="field-icon" :size="16" aria-hidden="true" />
              <input
                id="auth-password"
                ref="passwordInputRef"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="auth-input has-toggle"
                placeholder="请输入管理员密码"
                required
                autocomplete="current-password"
                :disabled="loading"
              />
              <button
                type="button"
                class="password-toggle-btn"
                :title="showPassword ? '隐藏密码' : '显示密码'"
                aria-label="切换密码明文显示"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" :size="15" aria-hidden="true" />
                <Eye v-else :size="15" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- 底部动作栏 -->
          <div class="auth-actions">
            <button
              type="button"
              class="auth-cancel-btn"
              :disabled="loading"
              @click="handleClose"
            >
              暂不登录
            </button>
            <button
              type="submit"
              class="auth-submit-btn"
              :disabled="loading"
            >
              <LoaderCircle v-if="loading" class="spinning" :size="16" aria-hidden="true" />
              <ShieldCheck v-else :size="16" aria-hidden="true" />
              <span>{{ loading ? '正在验证...' : '验证并登录' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  LoaderCircle,
  ShieldCheck,
  X,
} from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const { isAuthModalVisible } = authStore

const isDev = import.meta.env.DEV
const username = ref(isDev ? 'admin' : '')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const usernameInputRef = ref<HTMLInputElement | null>(null)
const passwordInputRef = ref<HTMLInputElement | null>(null)

function handleClose() {
  if (loading.value) return
  errorMessage.value = ''
  authStore.closeLoginModal()
}

async function handleSubmit() {
  if (!username.value.trim() || !password.value) return
  loading.value = true
  errorMessage.value = ''

  const result = await authStore.login(username.value.trim(), password.value)
  loading.value = false

  if (result.ok) {
    password.value = ''
    errorMessage.value = ''
  } else {
    errorMessage.value = result.error || '登录失败，请核对账号密码。'
  }
}

watch(isAuthModalVisible, async (visible) => {
  if (visible) {
    errorMessage.value = ''
    await nextTick()
    if (!username.value) {
      usernameInputRef.value?.focus()
    } else {
      passwordInputRef.value?.focus()
    }
  }
})
</script>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 100);
  background-color: var(--bg-overlay, rgba(4, 3, 8, 0.72));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: auth-fade-in var(--motion-fast, 140ms) var(--ease-standard, ease-out);
}

.auth-dialog {
  background: var(--bg-elevated, #171220);
  border: 1px solid var(--border, rgba(196, 181, 253, 0.2));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-lg, 0 28px 80px rgba(0, 0, 0, 0.46));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: auth-scale-in var(--motion-base, 200ms) var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1));
}

@keyframes auth-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes auth-scale-in {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.auth-header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 24px 18px;
  border-bottom: 1px solid var(--border-subtle, rgba(196, 181, 253, 0.13));
  background: var(--bg-topbar, rgba(9, 8, 15, 0.88));
}

.auth-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-right: 12px;
}

.auth-eyebrow {
  color: var(--accent-text, #c4b5fd);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.auth-title {
  color: var(--text-primary, #f4f1fa);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.25;
  margin: 0;
}

.auth-subtitle {
  color: var(--text-muted, #81798f);
  font-size: 12px;
  line-height: 1.5;
  margin: 2px 0 0;
}

.auth-close-btn {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  color: var(--text-secondary, #b8b1c5);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all var(--motion-fast, 140ms);
}

.auth-close-btn:hover {
  color: var(--accent-text, #c4b5fd);
  background: var(--accent-bg, rgba(167, 139, 250, 0.12));
  border-color: var(--accent-border, rgba(167, 139, 250, 0.3));
}

.auth-form {
  padding: 22px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.auth-error-banner {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 14px;
  border-radius: var(--radius-sm, 6px);
  background: var(--danger-bg, rgba(220, 38, 38, 0.12));
  border: 1px solid var(--danger-border, rgba(220, 38, 38, 0.28));
  color: var(--danger, #fb7185);
  font-size: 12px;
  line-height: 1.5;
  animation: auth-fade-in var(--motion-fast, 140ms) ease;
}

.error-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

.error-text {
  min-width: 0;
  flex: 1;
  word-break: break-all;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.auth-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.auth-label {
  color: var(--text-secondary, #b8b1c5);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

.auth-default-hint {
  color: var(--text-faint, #5e5769);
  font-size: 11px;
}

.auth-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 12px;
  color: var(--text-placeholder, #6f677c);
  pointer-events: none;
  transition: color var(--motion-fast, 140ms);
}

.auth-input {
  width: 100%;
  min-height: 42px;
  padding: 9px 12px 9px 38px;
  color: var(--text-primary, #f4f1fa);
  background: var(--bg-input, #12101a);
  border: 1px solid var(--border-subtle, rgba(196, 181, 253, 0.13));
  border-radius: var(--radius-sm, 6px);
  outline: none;
  font-family: var(--font-sans, inherit);
  font-size: 13px;
  transition: border-color var(--motion-fast, 140ms), box-shadow var(--motion-fast, 140ms);
}

.auth-input.has-toggle {
  padding-right: 38px;
}

.auth-input::placeholder {
  color: var(--text-placeholder, #6f677c);
}

.auth-input::-ms-reveal,
.auth-input::-ms-clear {
  display: none;
}

.auth-input:hover:not(:disabled) {
  border-color: var(--border-strong, rgba(167, 139, 250, 0.38));
}

.auth-input:focus {
  border-color: var(--accent, #a78bfa);
  box-shadow: 0 0 0 2px var(--accent-soft, rgba(167, 139, 250, 0.18));
}

.auth-input:focus ~ .field-icon {
  color: var(--accent, #a78bfa);
}

.auth-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.password-toggle-btn {
  position: absolute;
  right: 6px;
  z-index: 2;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  color: var(--text-placeholder, #6f677c);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs, 4px);
  cursor: pointer;
  transition: color var(--motion-fast, 140ms);
}

.password-toggle-btn:hover {
  color: var(--text-primary, #f4f1fa);
}

.auth-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.auth-cancel-btn {
  min-height: 40px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #b8b1c5);
  background: var(--bg-surface-2, #171220);
  border: 1px solid var(--border-subtle, rgba(196, 181, 253, 0.13));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all var(--motion-fast, 140ms);
}

.auth-cancel-btn:hover:not(:disabled) {
  color: var(--text-primary, #f4f1fa);
  border-color: var(--border-strong, rgba(167, 139, 250, 0.38));
  background: var(--bg-surface-3, #1d1729);
}

.auth-cancel-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.auth-submit-btn {
  min-height: 40px;
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  background: var(--accent-deep, #7c3aed);
  border: 1px solid var(--accent-border, rgba(167, 139, 250, 0.3));
  border-radius: var(--radius-sm, 6px);
  box-shadow: 0 0 16px var(--accent-glow, rgba(139, 92, 246, 0.28));
  cursor: pointer;
  transition: background-color var(--motion-fast, 140ms), transform var(--motion-fast, 140ms);
}

.auth-submit-btn:hover:not(:disabled) {
  background: var(--accent-deeper, #6d28d9);
}

.auth-submit-btn:active:not(:disabled) {
  transform: scale(0.99);
}

.auth-submit-btn:disabled {
  color: var(--text-faint, #5e5769);
  background: var(--bg-surface-3, #1d1729);
  border-color: var(--border-faint, rgba(196, 181, 253, 0.08));
  box-shadow: none;
  cursor: not-allowed;
}

.spinning {
  animation: auth-spin 850ms linear infinite;
}

@keyframes auth-spin {
  to { transform: rotate(360deg); }
}
</style>
