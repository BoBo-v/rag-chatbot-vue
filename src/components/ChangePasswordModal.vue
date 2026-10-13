<template>
  <Teleport to="body">
    <div
      v-if="isChangePasswordModalVisible"
      class="auth-overlay"
      tabindex="-1"
      @click.self="handleBackdropClick"
      @keydown.esc="handleEsc"
    >
      <div
        class="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <!-- 头部 -->
        <header class="auth-header">
          <div class="auth-heading">
            <span class="auth-eyebrow">PASSWORD SECURITY</span>
            <h2 id="change-password-title" class="auth-title">
              {{ mustChangePassword ? '首次登录修改密码' : '修改管理员密码' }}
            </h2>
            <p class="auth-subtitle">
              {{
                mustChangePassword
                  ? '系统检测到您使用的是初始弱密码。为保障系统安全，首次登录必须修改密码后方可继续使用。'
                  : '请输入当前密码以及符合安全规范的新密码。修改成功后其他设备的会话将自动撤销。'
              }}
            </p>
          </div>
          <!-- 仅在非强制改密模式下展示右上角关闭按钮 -->
          <button
            v-if="!mustChangePassword"
            type="button"
            class="auth-close-btn"
            aria-label="关闭窗口"
            title="关闭 (Esc)"
            @click="handleClose"
          >
            <X :size="18" aria-hidden="true" />
          </button>
        </header>

        <!-- 表单 -->
        <form class="auth-form" @submit.prevent="handleSubmit">
          <!-- 错误提示 Banner -->
          <div v-if="errorMessage" class="auth-error-banner" role="alert" aria-live="assertive">
            <AlertCircle class="error-icon" :size="15" aria-hidden="true" />
            <span class="error-text">{{ errorMessage }}</span>
          </div>

          <!-- 原密码 -->
          <div class="auth-field">
            <label for="change-old-password" class="auth-label">原密码</label>
            <div class="auth-input-wrapper">
              <KeyRound class="field-icon" :size="16" aria-hidden="true" />
              <input
                id="change-old-password"
                ref="oldPasswordRef"
                v-model="oldPassword"
                :type="showOld ? 'text' : 'password'"
                class="auth-input has-toggle"
                placeholder="请输入当前使用的原密码"
                required
                autocomplete="current-password"
                :disabled="loading"
              />
              <button
                type="button"
                class="password-toggle-btn"
                :title="showOld ? '隐藏密码' : '显示密码'"
                aria-label="切换原密码明文显示"
                @click="showOld = !showOld"
              >
                <EyeOff v-if="showOld" :size="15" aria-hidden="true" />
                <Eye v-else :size="15" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- 新密码 -->
          <div class="auth-field">
            <div class="auth-label-row">
              <label for="change-new-password" class="auth-label">新密码</label>
              <span class="auth-requirement-hint">8~200位，不能与原密码相同</span>
            </div>
            <div class="auth-input-wrapper">
              <Lock class="field-icon" :size="16" aria-hidden="true" />
              <input
                id="change-new-password"
                v-model="newPassword"
                :type="showNew ? 'text' : 'password'"
                class="auth-input has-toggle"
                placeholder="请输入新密码（至少 8 位）"
                required
                autocomplete="new-password"
                :disabled="loading"
              />
              <button
                type="button"
                class="password-toggle-btn"
                :title="showNew ? '隐藏密码' : '显示密码'"
                aria-label="切换新密码明文显示"
                @click="showNew = !showNew"
              >
                <EyeOff v-if="showNew" :size="15" aria-hidden="true" />
                <Eye v-else :size="15" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- 确认新密码 -->
          <div class="auth-field">
            <label for="change-confirm-password" class="auth-label">确认新密码</label>
            <div class="auth-input-wrapper">
              <Lock class="field-icon" :size="16" aria-hidden="true" />
              <input
                id="change-confirm-password"
                v-model="confirmPassword"
                :type="showConfirm ? 'text' : 'password'"
                class="auth-input has-toggle"
                placeholder="请再次输入新密码"
                required
                autocomplete="new-password"
                :disabled="loading"
              />
              <button
                type="button"
                class="password-toggle-btn"
                :title="showConfirm ? '隐藏密码' : '显示密码'"
                aria-label="切换确认密码明文显示"
                @click="showConfirm = !showConfirm"
              >
                <EyeOff v-if="showConfirm" :size="15" aria-hidden="true" />
                <Eye v-else :size="15" aria-hidden="true" />
              </button>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="auth-actions">
            <!-- 强制改密模式下，提供退出登录作为唯一离开途径 -->
            <button
              v-if="mustChangePassword"
              type="button"
              class="auth-cancel-btn logout-variant"
              :disabled="loading"
              @click="handleLogout"
            >
              <LogOut :size="15" aria-hidden="true" />
              <span>退出登录</span>
            </button>
            <button
              v-else
              type="button"
              class="auth-cancel-btn"
              :disabled="loading"
              @click="handleClose"
            >
              取消
            </button>

            <button
              type="submit"
              class="auth-submit-btn"
              :disabled="loading"
            >
              <LoaderCircle v-if="loading" class="spinning" :size="16" aria-hidden="true" />
              <ShieldCheck v-else :size="16" aria-hidden="true" />
              <span>{{ loading ? '正在提交...' : '确认修改' }}</span>
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
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  LoaderCircle,
  ShieldCheck,
  LogOut,
  X,
} from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const { isChangePasswordModalVisible, mustChangePassword } = authStore

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showOld = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const oldPasswordRef = ref<HTMLInputElement | null>(null)

function handleBackdropClick() {
  if (mustChangePassword.value || loading.value) return
  handleClose()
}

function handleEsc() {
  if (mustChangePassword.value || loading.value) return
  handleClose()
}

function handleClose() {
  if (loading.value) return
  errorMessage.value = ''
  authStore.closeChangePasswordModal()
}

async function handleLogout() {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await authStore.logout()
    if (!result.ok) {
      errorMessage.value = result.error || '退出登录失败，请重试。'
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '网络异常，退出登录失败。'
    errorMessage.value = message
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  errorMessage.value = ''

  if (!oldPassword.value) {
    errorMessage.value = '请输入原密码。'
    return
  }

  if (newPassword.value.length < 8 || newPassword.value.length > 200) {
    errorMessage.value = '新密码长度必须在 8 到 200 个字符之间。'
    return
  }

  if (newPassword.value.trim().length === 0) {
    errorMessage.value = '新密码不能全为空白字符。'
    return
  }

  if (newPassword.value === 'Admin@123456') {
    errorMessage.value = '禁止使用系统默认初始弱密码 Admin@123456。'
    return
  }

  if (newPassword.value === oldPassword.value) {
    errorMessage.value = '新密码不能与原密码相同。'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的新密码不一致，请仔细核对。'
    return
  }

  loading.value = true
  try {
    const result = await authStore.changePassword(oldPassword.value, newPassword.value)
    if (result.ok) {
      oldPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      errorMessage.value = ''
    } else {
      errorMessage.value = result.error || '修改密码失败，请核对原密码并重试。'
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '网络异常，修改密码请求未送达后端。'
    errorMessage.value = message
  } finally {
    loading.value = false
  }
}

watch(isChangePasswordModalVisible, async (visible) => {
  if (visible) {
    errorMessage.value = ''
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    await nextTick()
    oldPasswordRef.value?.focus()
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
  max-width: 440px;
  box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(196, 181, 253, 0.08);
  overflow: hidden;
  animation: auth-zoom-in var(--motion-normal, 200ms) var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
}

.auth-header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 24px 18px 24px;
  border-bottom: 1px solid var(--border-subtle, rgba(196, 181, 253, 0.08));
}

.auth-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 12px;
}

.auth-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-light, #c084fc);
}

.auth-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-bright, #f8fafc);
  letter-spacing: -0.01em;
}

.auth-subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted, #94a3b8);
}

.auth-close-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.auth-close-btn:hover {
  background: var(--bg-hover, rgba(196, 181, 253, 0.08));
  color: var(--text-bright, #f8fafc);
  border-color: var(--border-subtle, rgba(196, 181, 253, 0.1));
}

.auth-form {
  padding: 20px 24px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md, 8px);
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  font-size: 12px;
  line-height: 1.4;
}

.error-icon {
  flex-shrink: 0;
  color: #ef4444;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.auth-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-normal, #cbd5e1);
}

.auth-requirement-hint {
  font-size: 11px;
  color: var(--text-faint, #64748b);
}

.auth-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 12px;
  color: var(--text-faint, #64748b);
  pointer-events: none;
}

.auth-input {
  width: 100%;
  height: 40px;
  padding: 0 14px 0 38px;
  font-size: 13px;
  color: var(--text-bright, #f8fafc);
  background: var(--bg-input, rgba(15, 23, 42, 0.6));
  border: 1px solid var(--border, rgba(196, 181, 253, 0.2));
  border-radius: var(--radius-md, 8px);
  outline: none;
  transition: border-color var(--motion-fast, 140ms) ease, box-shadow var(--motion-fast, 140ms) ease;
}

.auth-input.has-toggle {
  padding-right: 38px;
}

.auth-input:focus {
  border-color: var(--accent-light, #c084fc);
  box-shadow: 0 0 0 3px rgba(192, 132, 252, 0.15);
}

.auth-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.password-toggle-btn {
  position: absolute;
  right: 10px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-faint, #64748b);
  border-radius: 4px;
  cursor: pointer;
  transition: color var(--motion-fast, 140ms) ease;
}

.password-toggle-btn:hover {
  color: var(--text-bright, #f8fafc);
}

.auth-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.auth-cancel-btn {
  height: 38px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-subtle, rgba(196, 181, 253, 0.15));
  background: var(--bg-hover, rgba(196, 181, 253, 0.05));
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all var(--motion-fast, 140ms) ease;
}

.auth-cancel-btn:hover:not(:disabled) {
  background: var(--bg-hover, rgba(196, 181, 253, 0.12));
  color: var(--text-bright, #f8fafc);
}

.auth-cancel-btn.logout-variant {
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.auth-cancel-btn.logout-variant:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.auth-submit-btn {
  height: 38px;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--radius-md, 8px);
  border: none;
  background: linear-gradient(135deg, var(--accent, #a855f7), var(--accent-dark, #7e22ce));
  color: #ffffff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 14px rgba(168, 85, 247, 0.35);
  transition: all var(--motion-fast, 140ms) ease;
}

.auth-submit-btn:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(168, 85, 247, 0.45);
}

.auth-submit-btn:disabled,
.auth-cancel-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes auth-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes auth-zoom-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
