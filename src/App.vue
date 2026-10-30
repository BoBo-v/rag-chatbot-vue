<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  Bot,
  CircleAlert,
  CircleCheck,
  Columns2,
  Database,
  LogOut,
  MessageSquare,
  Settings2,
  Sparkles,
  TriangleAlert,
  User,
} from 'lucide-vue-next'
import StyleChat from './views/StyleChat.vue'
import CompareChat from './views/CompareChat.vue'
import KnowledgeBase from './views/KnowledgeBase.vue'
import AgentWorkspace from './views/AgentWorkspace.vue'
import ShowcaseView from './views/ShowcaseView.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import LoginModal from './components/LoginModal.vue'
import ChangePasswordModal from './components/ChangePasswordModal.vue'
import WebPreviewModal from './components/WebPreviewModal.vue'
import DemoWorkspace from './demo/components/DemoWorkspace.vue'
import { settings, type ThemeType } from './stores/settings'
import { useAuthStore } from './stores/auth'
import { useConversations } from './stores/conversations'
import { useToast } from './composables/useToast'

type AppMode = 'chat' | 'agent' | 'compare' | 'knowledge' | 'showcase'

const mode = ref<AppMode>('chat')
const isDemoActive = ref(false)
const settingsOpen = ref(false)
const authStore = useAuthStore()
const { isAuthenticated, user } = authStore
const { generatingConvIds } = useConversations()
const toast = useToast()

function handleOpenShowcase() {
  mode.value = 'showcase'
  isDemoActive.value = false
  if (window.location.hash !== '#/intro' && window.location.hash !== '#intro') {
    window.location.hash = '#/intro'
  }
}

function handleEnterWorkspace(targetMode: 'chat' | 'agent' | 'compare' | 'knowledge' = 'chat') {
  mode.value = targetMode
  isDemoActive.value = false
  if (window.location.hash === '#/intro' || window.location.hash === '#intro' || window.location.hash === '#/showcase') {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}

function syncRouteFromHash() {
  const hash = (window.location.hash || '').toLowerCase()
  const search = new URLSearchParams(window.location.search)
  if (hash === '#/intro' || hash === '#intro' || hash === '#/showcase' || search.get('view') === 'intro') {
    mode.value = 'showcase'
    isDemoActive.value = false
  } else if (mode.value === 'showcase') {
    mode.value = 'chat'
  }
}

function handleOpenDemo() {
  if (generatingConvIds.value.size > 0) {
    toast.show('当前工单正在生成中，请先等待完成或停止生成，再进入演示沙盒', 'warning')
    return
  }
  authStore.closeLoginModal()
  isDemoActive.value = true
}

function handleExitDemo() {
  isDemoActive.value = false
}

// 演示沙盒模式下拦截登录弹窗打扰，退出后恢复
watch(
  isDemoActive,
  (active) => {
    authStore.setLoginModalSuppressed(active)
  },
  { immediate: true }
)

// ── 开发与调试辅助 ────────────────────────────────────
if (typeof window !== 'undefined') {
  ;(window as any).__demo = {
    ...((window as any).__demo || {}),
    openSandbox: () => handleOpenDemo(),
    exitSandbox: () => handleExitDemo(),
  }
}

function handleSwitchMode(targetMode: string) {
  if (['chat', 'agent', 'compare', 'knowledge', 'showcase'].includes(targetMode)) {
    mode.value = targetMode as AppMode
    isDemoActive.value = false
  }
}
const modes: { value: AppMode; label: string; mobileLabel?: string; icon: Component }[] = [
  { value: 'chat', label: '工单决策', mobileLabel: '工单', icon: MessageSquare },
  { value: 'agent', label: '排障 Agent', mobileLabel: 'Agent', icon: Bot },
  { value: 'compare', label: '模型对比', mobileLabel: '对比', icon: Columns2 },
  { value: 'knowledge', label: '知识库 & 评测', mobileLabel: '知识库', icon: Database },
]

let mediaQuery: MediaQueryList | null = null

function applyTheme(theme: ThemeType) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.setAttribute('data-theme-preference', theme)
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#09080f' : '#f7f5fb')
}

function handleThemeMediaChange() {
  if (settings.theme === 'system') applyTheme('system')
}

onMounted(() => {
  authStore.checkAuth()
  applyTheme(settings.theme)
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleThemeMediaChange)
  syncRouteFromHash()
  window.addEventListener('hashchange', syncRouteFromHash)
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', handleThemeMediaChange)
  window.removeEventListener('hashchange', syncRouteFromHash)
})

async function handleLogout() {
  const res = await authStore.logout()
  if (!res.ok) {
    alert(res.error || '退出登录失败，服务端未能成功撤销会话。')
  }
}

watch(() => settings.theme, applyTheme)
</script>

<template>
  <div class="app-shell" :class="{ 'is-showcase': mode === 'showcase' }">
    <aside class="app-rail" aria-label="主导航">
      <div class="brand-mark" title="技术支持工单辅助决策台 (点击查看产品介绍)" style="cursor: pointer;" @click="handleOpenShowcase">
        <img src="/favicon.svg" alt="技术支持工单辅助决策台" />
      </div>

      <nav class="rail-navigation" aria-label="工作区" data-tour="rail-nav">
        <button
          v-for="item in modes"
          :key="item.value"
          type="button"
          class="rail-button"
          :class="{ active: !isDemoActive && mode === item.value }"
          :aria-current="!isDemoActive && mode === item.value ? 'page' : undefined"
          @click="mode = item.value; isDemoActive = false"
        >
          <component :is="item.icon" :size="21" :stroke-width="1.7" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>

        <button
          type="button"
          class="rail-button showcase-rail-btn"
          :class="{ active: !isDemoActive && mode === 'showcase' }"
          title="产品宣传与特性介绍"
          aria-label="产品介绍"
          @click="handleOpenShowcase"
        >
          <Sparkles :size="21" :stroke-width="1.7" aria-hidden="true" />
          <span>产品介绍</span>
        </button>
      </nav>

      <div class="rail-footer">
        <span
          class="workspace-state"
          :class="{ 'is-demo': isDemoActive }"
          :title="isDemoActive ? '演示沙盒模式（离线仿真）' : '本地工作区已就绪'"
          :aria-label="isDemoActive ? '演示沙盒模式' : '本地工作区已就绪'"
        ></span>
        <button
          v-if="isAuthenticated"
          type="button"
          class="rail-button"
          :title="'已登录: ' + (user?.username || 'admin') + ' (点击退出登录)'"
          aria-label="退出登录"
          @click="handleLogout"
        >
          <LogOut :size="21" :stroke-width="1.7" aria-hidden="true" />
          <span>登出</span>
        </button>
        <button
          v-else
          type="button"
          class="rail-button"
          title="点击登录管理员账号"
          aria-label="管理员登录"
          @click="authStore.openLoginModal()"
        >
          <User :size="21" :stroke-width="1.7" aria-hidden="true" />
          <span>登录</span>
        </button>
        <button
          type="button"
          class="rail-button"
          aria-label="打开设置"
          @click="settingsOpen = true"
        >
          <Settings2 :size="21" :stroke-width="1.7" aria-hidden="true" />
          <span>设置</span>
        </button>
      </div>
    </aside>

    <main class="app-stage">
      <section v-if="isDemoActive" class="mode-page demo-stage" aria-label="工单演示沙盒工作区">
        <DemoWorkspace @exit="handleExitDemo" />
      </section>
      <section v-show="!isDemoActive && mode === 'chat'" class="mode-page" aria-label="工单决策工作区">
        <StyleChat @open-demo="handleOpenDemo" @switch-mode="handleSwitchMode" />
      </section>
      <section v-if="!isDemoActive && mode === 'agent'" class="mode-page" aria-label="排障 Agent 工作区">
        <AgentWorkspace />
      </section>
      <section v-show="!isDemoActive && mode === 'compare'" class="mode-page" aria-label="模型对比工作区">
        <CompareChat />
      </section>
      <section v-if="!isDemoActive && mode === 'knowledge'" class="mode-page" aria-label="知识库与评测工作区">
        <KnowledgeBase />
      </section>
      <section v-if="!isDemoActive && mode === 'showcase'" class="mode-page showcase-stage" aria-label="产品介绍与展示">
        <ShowcaseView @enter-workspace="handleEnterWorkspace" />
      </section>
    </main>

    <nav class="mobile-navigation" aria-label="移动端主导航" data-tour="mobile-nav">
      <button
        v-for="item in modes"
        :key="item.value"
        type="button"
        :class="{ active: !isDemoActive && mode === item.value }"
        :aria-current="!isDemoActive && mode === item.value ? 'page' : undefined"
        @click="mode = item.value; isDemoActive = false"
      >
        <component :is="item.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ item.mobileLabel || item.label }}</span>
      </button>
      <button
        type="button"
        :class="{ active: !isDemoActive && mode === 'showcase' }"
        aria-label="产品介绍"
        @click="handleOpenShowcase"
      >
        <Sparkles :size="20" :stroke-width="1.8" aria-hidden="true" />
        <span>介绍</span>
      </button>
      <button
        type="button"
        aria-label="打开设置"
        data-tour="mobile-settings"
        @click="settingsOpen = true"
      >
        <Settings2 :size="20" :stroke-width="1.8" aria-hidden="true" />
        <span>设置</span>
      </button>
    </nav>

    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
    <ConfirmDialog />
    <LoginModal />
    <ChangePasswordModal />
    <WebPreviewModal />

    <!-- 全局 Toast 容器：确保沙盒、工单、知识库等所有视图反馈均统一呈现 -->
    <transition-group name="toast-slide" tag="div" class="toast-container">
      <div
        v-for="t in toast.toasts.value"
        :key="t.id"
        class="toast-item"
        :class="t.type"
        :role="t.type === 'error' ? 'alert' : 'status'"
        aria-live="polite"
        @click="toast.dismiss(t.id)"
      >
        <span class="toast-icon" aria-hidden="true">
          <CircleAlert v-if="t.type === 'error'" :size="16" />
          <TriangleAlert v-else-if="t.type === 'warning'" :size="16" />
          <CircleCheck v-else :size="16" />
        </span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.app-shell {
  width: 100%;
  height: 100dvh;
  min-height: 0;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-canvas);
}

.app-rail {
  position: relative;
  z-index: var(--z-navigation);
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
  box-shadow: 8px 0 28px rgba(0, 0, 0, 0.08);
}

.brand-mark {
  width: 42px;
  height: 42px;
  margin: 18px auto 22px;
  display: grid;
  place-items: center;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  background: var(--accent-bg);
  box-shadow: var(--shadow-accent);
}

.brand-mark img {
  width: 32px;
  height: 32px;
  display: block;
  object-fit: contain;
}

.rail-navigation,
.rail-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 7px;
}

.rail-footer {
  margin-top: auto;
  padding-bottom: 14px;
}

.rail-button {
  position: relative;
  width: 100%;
  min-height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 6px 2px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    background var(--motion-fast) ease;
}

.rail-button span {
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.rail-button:hover {
  color: var(--text-primary);
  background: var(--bg-surface-2);
}

.rail-button.active {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
  box-shadow: inset 2px 0 0 var(--accent);
}

.rail-button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.workspace-state {
  width: 7px;
  height: 7px;
  margin: 0 auto 4px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 10px color-mix(in srgb, var(--success) 55%, transparent);
}

.workspace-state.is-demo {
  background: #a855f7;
  box-shadow: 0 0 10px rgba(168, 85, 247, 0.6);
}

.app-shell.is-showcase {
  grid-template-columns: minmax(0, 1fr) !important;
  grid-template-rows: 1fr !important;
}

.app-shell.is-showcase .app-rail,
.app-shell.is-showcase .mobile-navigation {
  display: none !important;
}

.showcase-stage {
  overflow-y: auto !important;
  height: 100vh !important;
  background: var(--bg-canvas) !important;
}

.showcase-rail-btn {
  color: #818cf8 !important;
  margin-top: 4px;
}

.showcase-rail-btn:hover {
  background: rgba(99, 102, 241, 0.12) !important;
  color: #a5b4fc !important;
}

.app-stage,
.mode-page {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.mobile-navigation {
  display: none;
}

@media (max-width: 767px) {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) calc(62px + env(safe-area-inset-bottom));
  }

  .app-rail {
    display: none;
  }

  .mobile-navigation {
    position: relative;
    z-index: var(--z-navigation);
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    padding: 5px 6px calc(5px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-sidebar);
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.12);
  }

  .mobile-navigation button {
    min-width: 0;
    min-height: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border: 0;
    border-radius: var(--radius-sm);
    padding: 4px;
    color: var(--text-muted);
    background: transparent;
  }

  .mobile-navigation button span {
    max-width: 100%;
    overflow: hidden;
    font-size: 10px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-navigation button.active {
    color: var(--accent-text);
    background: var(--accent-bg);
  }

  .mobile-navigation button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}
</style>
