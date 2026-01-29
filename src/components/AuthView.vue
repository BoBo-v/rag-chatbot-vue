<template>
  <div class="auth-container">
    <div class="auth-card">
      <!-- Logo -->
      <div class="auth-header">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </div>
        <h1>小智 AI</h1>
        <p>{{ isLogin ? '欢迎回来' : '创建账号开始对话' }}</p>
      </div>

      <!-- 切换标签 -->
      <div class="auth-tabs">
        <button
            :class="{ active: isLogin }"
            @click="isLogin = true"
        >
          登录
        </button>
        <button
            :class="{ active: !isLogin }"
            @click="isLogin = false"
        >
          注册
        </button>
      </div>

      <!-- 表单 -->
      <form @submit.prevent="handleSubmit" class="auth-form">
        <!-- 用户名 -->
        <div class="form-group">
          <label for="username">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </label>
          <input
              id="username"
              v-model="form.username"
              type="text"
              placeholder="用户名"
              :disabled="loading"
              required
              minlength="3"
              autocomplete="username"
          />
        </div>

        <!-- 邮箱（仅注册） -->
        <Transition name="slide">
          <div v-if="!isLogin" class="form-group">
            <label for="email">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
            </label>
            <input
                id="email"
                v-model="form.email"
                type="email"
                placeholder="邮箱（可选）"
                :disabled="loading"
                autocomplete="email"
            />
          </div>
        </Transition>

        <!-- 密码 -->
        <div class="form-group">
          <label for="password">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
          </label>
          <input
              id="password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="密码"
              :disabled="loading"
              required
              minlength="6"
              autocomplete="current-password"
          />
          <button
              type="button"
              class="toggle-password"
              @click="showPassword = !showPassword"
          >
            <svg v-if="showPassword" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
            </svg>
          </button>
        </div>

        <!-- 确认密码（仅注册） -->
        <Transition name="slide">
          <div v-if="!isLogin" class="form-group">
            <label for="confirmPassword">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </label>
            <input
                id="confirmPassword"
                v-model="form.confirmPassword"
                type="password"
                placeholder="确认密码"
                :disabled="loading"
                required
                autocomplete="new-password"
            />
          </div>
        </Transition>

        <!-- 错误提示 -->
        <Transition name="fade">
          <div v-if="error" class="error-message">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            {{ error }}
          </div>
        </Transition>

        <!-- 提交按钮 -->
        <button type="submit" class="submit-btn" :disabled="loading">
          <span v-if="!loading">{{ isLogin ? '登录' : '注册' }}</span>
          <div v-else class="btn-loading">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </form>

      <!-- 底部提示 -->
      <div class="auth-footer">
        <p v-if="isLogin">
          还没有账号？
          <a href="#" @click.prevent="isLogin = false">立即注册</a>
        </p>
        <p v-else>
          已有账号？
          <a href="#" @click.prevent="isLogin = true">立即登录</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';

// ============ 配置 ============
const API_URL = 'http://localhost:8000/api';

// ============ Props & Emits ============
const emit = defineEmits(['login-success']);

// ============ 状态 ============
const isLogin = ref(true);
const loading = ref(false);
const error = ref('');
const showPassword = ref(false);

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  email: ''
});

// 切换登录/注册时清空错误
watch(isLogin, () => {
  error.value = '';
  form.password = '';
  form.confirmPassword = '';
});

// ============ 方法 ============
async function handleSubmit() {
  error.value = '';

  // 表单验证
  if (form.username.length < 3) {
    error.value = '用户名至少3个字符';
    return;
  }
  if (form.password.length < 6) {
    error.value = '密码至少6个字符';
    return;
  }
  if (!isLogin.value && form.password !== form.confirmPassword) {
    error.value = '两次密码不一致';
    return;
  }

  loading.value = true;

  try {
    const endpoint = isLogin.value ? '/auth/login' : '/auth/register';
    const body = {
      username: form.username,
      password: form.password
    };

    if (!isLogin.value && form.email) {
      body.email = form.email;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || '操作失败');
    }

    // 保存 Token 和用户信息
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // 触发登录成功事件
    emit('login-success', data);

  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: #ffffff;
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* ========== Header ========== */
.auth-header {
  text-align: center;
  margin-bottom: 30px;
}

.logo {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.logo svg {
  width: 36px;
  height: 36px;
  color: #ffffff;
}

.auth-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
  color: #1f2937;
}

.auth-header p {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

/* ========== Tabs ========== */
.auth-tabs {
  display: flex;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 24px;
}

.auth-tabs button {
  flex: 1;
  padding: 12px;
  border: none;
  background: transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.3s;
}

.auth-tabs button.active {
  background: #ffffff;
  color: #667eea;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* ========== Form ========== */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  position: relative;
  display: flex;
  align-items: center;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  transition: all 0.3s;
}

.form-group:focus-within {
  border-color: #667eea;
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
}

.form-group label {
  padding: 0 12px;
  display: flex;
  align-items: center;
}

.form-group label svg {
  width: 20px;
  height: 20px;
  color: #9ca3af;
}

.form-group:focus-within label svg {
  color: #667eea;
}

.form-group input {
  flex: 1;
  padding: 14px 12px 14px 0;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #1f2937;
  outline: none;
}

.form-group input::placeholder {
  color: #9ca3af;
}

.toggle-password {
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.toggle-password svg {
  width: 20px;
  height: 20px;
  color: #9ca3af;
}

.toggle-password:hover svg {
  color: #667eea;
}

/* ========== Error ========== */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  color: #dc2626;
  font-size: 13px;
}

.error-message svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ========== Submit Button ========== */
.submit-btn {
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 8px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.btn-loading {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.btn-loading span {
  width: 8px;
  height: 8px;
  background: #ffffff;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out;
}

.btn-loading span:nth-child(1) { animation-delay: 0s; }
.btn-loading span:nth-child(2) { animation-delay: 0.2s; }
.btn-loading span:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* ========== Footer ========== */
.auth-footer {
  text-align: center;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
}

.auth-footer p {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.auth-footer a {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.auth-footer a:hover {
  text-decoration: underline;
}

/* ========== Animations ========== */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ========== Responsive ========== */
@media (max-width: 480px) {
  .auth-card {
    padding: 30px 24px;
  }
}
</style>