<template>
  <div id="app">
    <!-- 未登录：显示登录页 -->
    <AuthView
        v-if="!isLoggedIn"
        @login-success="handleLoginSuccess"
    />

    <!-- 已登录：显示聊天页 -->
    <div v-else class="main-app">
      <!-- 用户信息栏 -->
      <div class="user-bar">
        <div class="user-info">
          <div class="user-avatar">
            {{ currentUser?.username?.charAt(0).toUpperCase() }}
          </div>
          <span class="user-name">{{ currentUser?.username }}</span>
        </div>
        <button class="logout-btn" @click="handleLogout">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
          </svg>
          退出
        </button>
      </div>

      <!-- 聊天组件 -->
      <ChatView :user="currentUser" :token="token" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AuthView from './components/AuthView.vue';
import ChatView from './components/PYC.vue';

// ============ 状态 ============
const isLoggedIn = ref(false);
const currentUser = ref(null);
const token = ref('');

// ============ 方法 ============
function handleLoginSuccess(data) {
  token.value = data.access_token;
  currentUser.value = data.user;
  isLoggedIn.value = true;
}

function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token.value = '';
  currentUser.value = null;
  isLoggedIn.value = false;
}

// 检查本地存储的登录状态
function checkAuth() {
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');

  if (savedToken && savedUser) {
    token.value = savedToken;
    currentUser.value = JSON.parse(savedUser);
    isLoggedIn.value = true;
  }
}

// ============ 生命周期 ============
onMounted(() => {
  checkAuth();

  Function.prototype.myCall = function (context, ...args) {
    context = context || globalThis

    const fn = Symbol()

    context[fn] = this

    const result = context[fn](...args)

    delete context[fn]

    return result
  }

  Function.prototype.myApply = function (context, args) {
    context = context || globalThis

    const fn = Symbol()

    context[fn] = this

    const result = context[fn](...(args || []))

    delete context[fn]

    return result
  }

  Function.prototype.myBind = function (context, ...args) {
    const self = this

    function bound(...newArgs) {
      if (this instanceof bound) {
        return new self(...args, ...newArgs)
      }

      return self.apply(context, [...args, ...newArgs])
    }

    bound.prototype = Object.create(self.prototype)

    return bound
  }
  function myNew(fn, ...args) {
    const obj = Object.create(fn.prototype)

    const result = fn.apply(obj, args)

    return result instanceof Object ? result : obj
  }

  function say() {
    console.log(this.name)
  }

  const person = { name: "张三" }

  say.myCall(person)
  say.myApply(person)
  say.myBind(person)
});
</script>

<style>
/* 全局样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

#app {
  min-height: 100vh;
}

.main-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* 用户信息栏 */
.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #1f2937;
  color: #ffffff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.user-name {
  font-size: 14px;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: transparent;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.logout-btn svg {
  width: 16px;
  height: 16px;
}

/* 调整 ChatView 高度 */
/*.main-app :deep(.app-container) {
  height: calc(100vh - 48px);
}*/
</style>