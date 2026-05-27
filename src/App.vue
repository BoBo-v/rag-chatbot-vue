<script setup lang="ts">
import StyleChat from "./views/StyleChat.vue"
import CompareChat from './views/CompareChat.vue'
import { watch, onMounted, ref } from 'vue'
import { settings } from './stores/settings'

type AppMode = 'chat' | 'compare'

const mode = ref<AppMode>('chat')

function applyTheme(theme: string) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme
  document.documentElement.setAttribute('data-theme', resolved)
}

onMounted(() => applyTheme(settings.theme))
watch(() => settings.theme, applyTheme)

// 跟随系统时，监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (settings.theme === 'system') applyTheme('system')
  })
</script>

<template>
  <div class="mode-shell">
    <div class="mode-switch" role="tablist" aria-label="应用模式">
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'chat' }"
        role="tab"
        :aria-selected="mode === 'chat'"
        @click="mode = 'chat'"
      >
        普通聊天
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'compare' }"
        role="tab"
        :aria-selected="mode === 'compare'"
        @click="mode = 'compare'"
      >
        多模型对比
      </button>
    </div>
    <div v-show="mode === 'chat'" class="mode-page">
      <StyleChat />
    </div>
    <div v-show="mode === 'compare'" class="mode-page">
      <CompareChat />
    </div>
  </div>
</template>

<style scoped>
.mode-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.mode-page {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.mode-switch {
  position: fixed;
  top: 68px;
  right: 18px;
  z-index: 200;
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.mode-tab {
  height: 28px;
  border: none;
  border-radius: 6px;
  padding: 0 12px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.mode-tab.active {
  background: var(--accent-bg);
  color: var(--accent-text);
}

@media (max-width: 640px) {
  .mode-switch {
    top: 58px;
    right: 10px;
    left: 10px;
    justify-content: center;
  }

  .mode-tab {
    flex: 1;
  }
}
</style>
