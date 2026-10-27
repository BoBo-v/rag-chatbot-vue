<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { Bot, Columns2, Database, MessageSquare, Settings2, LogOut, User } from 'lucide-vue-next'
import StyleChat from './views/StyleChat.vue'
import CompareChat from './views/CompareChat.vue'
import KnowledgeBase from './views/KnowledgeBase.vue'
import AgentWorkspace from './views/AgentWorkspace.vue'
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

type AppMode = 'chat' | 'agent' | 'compare' | 'knowledge'

const mode = ref<AppMode>('chat')
const isDemoActive = ref(false)
const settingsOpen = ref(false)
const authStore = useAuthStore()
const { isAuthenticated, user } = authStore
const { generatingConvIds } = useConversations()
const toast = useToast()

function handleOpenDemo() {
  if (generatingConvIds.value.size > 0) {
    toast.show('当前工单正在生成中，请先等待完成或停止生成，再进入演示沙盒', 'warning')
    return
  }
  isDemoActive.value = true
}

function handleExitDemo() {
  isDemoActive.value = false
}

function handleSwitchMode(targetMode: string) {
  if (['chat', 'agent', 'compare', 'knowledge'].includes(targetMode)) {
    mode.value = targetMode as AppMode
    isDemoActive.value = false
  }
}
const modes: { value: AppMode; label: string; icon: Component }[] = [
  { value: 'chat', label: '工单决策', icon: MessageSquare },
  { value: 'agent', label: '排障 Agent', icon: Bot },
  { value: 'compare', label: '模型对比', icon: Columns2 },
  { value: 'knowledge', label: '知识库 & 评测', icon: Database },
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
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', handleThemeMediaChange)
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
  <div class="app-shell">
    <aside class="app-rail" aria-label="主导航">
      <div class="brand-mark" title="技术支持工单辅助决策台">
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
      <section v-show="!isDemoActive && mode === 'knowledge'" class="mode-page" aria-label="知识库与评测工作区">
        <KnowledgeBase />
      </section>
    </main>

    <nav class="mobile-navigation" aria-label="移动端主导航">
      <button
        v-for="item in modes"
        :key="item.value"
        type="button"
        :class="{ active: !isDemoActive && mode === item.value }"
        :aria-current="!isDemoActive && mode === item.value ? 'page' : undefined"
        @click="mode = item.value; isDemoActive = false"
      >
        <component :is="item.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </button>
      <button type="button" aria-label="打开设置" @click="settingsOpen = true">
        <Settings2 :size="20" :stroke-width="1.8" aria-hidden="true" />
        <span>设置</span>
      </button>
    </nav>

    <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
    <ConfirmDialog />
    <LoginModal />
    <ChangePasswordModal />
    <WebPreviewModal />
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
    grid-template-columns: repeat(5, minmax(0, 1fr));
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
