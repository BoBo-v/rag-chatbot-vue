<script setup lang="ts">
import StyleChat from "./views/StyleChat.vue"
import { watch, onMounted } from 'vue'
import { settings } from './stores/settings'

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
  <StyleChat />
</template>
