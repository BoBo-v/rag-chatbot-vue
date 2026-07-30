<script setup lang="ts">
import StyleChat from "./views/StyleChat.vue"
import CompareChat from './views/CompareChat.vue'
import KnowledgeBase from './views/KnowledgeBase.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type StyleValue } from 'vue'
import { settings } from './stores/settings'

type AppMode = 'chat' | 'compare' | 'knowledge'
type SwitchPosition = { x: number; y: number }
type DragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}

const mode = ref<AppMode>('chat')
const modes: { value: AppMode; label: string }[] = [
  { value: 'chat', label: '普通聊天' },
  { value: 'compare', label: '多模型对比' },
  { value: 'knowledge', label: '知识库' },
]

const SWITCH_MARGIN = 8
const SWITCH_STORAGE_KEY = 'ai-chat-mode-switch-position'
const APP_MODE_LABEL = '应用模式'
const DRAG_HANDLE_LABEL = '拖动切换按钮，双击重置位置'
const switchRef = ref<HTMLElement | null>(null)
const switchPosition = ref<SwitchPosition>({ x: 18, y: 68 })
const isSwitchDragging = ref(false)
const isSwitchReady = ref(false)
let dragState: DragState | null = null
let mediaQuery: MediaQueryList | null = null

const switchStyle = computed<StyleValue>(() => ({
  left: `${switchPosition.value.x}px`,
  top: `${switchPosition.value.y}px`,
  visibility: isSwitchReady.value ? 'visible' : 'hidden',
}))

function applyTheme(theme: string) {
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.setAttribute('data-theme-preference', theme)
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#09080f' : '#f7f5fb')
}

function getDefaultSwitchPosition(): SwitchPosition {
  const width = switchRef.value?.offsetWidth ?? 260
  const rightOffset = window.innerWidth <= 640 ? 10 : 18
  return {
    x: window.innerWidth - width - rightOffset,
    y: window.innerWidth <= 640 ? 64 : 84,
  }
}

function clampSwitchPosition(position: SwitchPosition): SwitchPosition {
  const width = switchRef.value?.offsetWidth ?? 260
  const height = switchRef.value?.offsetHeight ?? 40
  const maxX = Math.max(SWITCH_MARGIN, window.innerWidth - width - SWITCH_MARGIN)
  const maxY = Math.max(SWITCH_MARGIN, window.innerHeight - height - SWITCH_MARGIN)
  return {
    x: Math.min(Math.max(position.x, SWITCH_MARGIN), maxX),
    y: Math.min(Math.max(position.y, SWITCH_MARGIN), maxY),
  }
}

function readStoredSwitchPosition(): SwitchPosition | null {
  try {
    const raw = localStorage.getItem(SWITCH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SwitchPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    return parsed as SwitchPosition
  } catch {
    return null
  }
}

function saveSwitchPosition(position: SwitchPosition) {
  try {
    localStorage.setItem(SWITCH_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // Ignore storage failures so dragging still works in restricted browser contexts.
  }
}

function initializeSwitchPosition() {
  const stored = readStoredSwitchPosition()
  switchPosition.value = clampSwitchPosition(stored ?? getDefaultSwitchPosition())
  isSwitchReady.value = true
}

function resetSwitchPosition() {
  const nextPosition = clampSwitchPosition(getDefaultSwitchPosition())
  switchPosition.value = nextPosition
  saveSwitchPosition(nextPosition)
}

function handleSwitchPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: switchPosition.value.x,
    originY: switchPosition.value.y,
    moved: false,
  }
  isSwitchDragging.value = true
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
}

function handleSwitchPointerMove(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return
  const deltaX = event.clientX - dragState.startX
  const deltaY = event.clientY - dragState.startY
  if (!dragState.moved && Math.hypot(deltaX, deltaY) > 4) {
    dragState.moved = true
  }
  switchPosition.value = clampSwitchPosition({
    x: dragState.originX + deltaX,
    y: dragState.originY + deltaY,
  })
}

function handleSwitchPointerUp(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return
  if (
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.hasPointerCapture(event.pointerId)
  ) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  if (dragState.moved) {
    saveSwitchPosition(switchPosition.value)
  }
  dragState = null
  isSwitchDragging.value = false
}

function handleSwitchKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 48 : 12
  const deltaByKey: Partial<Record<string, SwitchPosition>> = {
    ArrowUp: { x: 0, y: -step },
    ArrowDown: { x: 0, y: step },
    ArrowLeft: { x: -step, y: 0 },
    ArrowRight: { x: step, y: 0 },
  }
  if (event.key === 'Home') {
    event.preventDefault()
    resetSwitchPosition()
    return
  }
  const delta = deltaByKey[event.key]
  if (!delta) return
  event.preventDefault()
  const nextPosition = clampSwitchPosition({
    x: switchPosition.value.x + (delta.x ?? 0),
    y: switchPosition.value.y + (delta.y ?? 0),
  })
  switchPosition.value = nextPosition
  saveSwitchPosition(nextPosition)
}

function handleResize() {
  switchPosition.value = clampSwitchPosition(switchPosition.value)
}

function handleThemeMediaChange() {
  if (settings.theme === 'system') applyTheme('system')
}

onMounted(() => {
  applyTheme(settings.theme)
  nextTick(initializeSwitchPosition)
  window.addEventListener('resize', handleResize)
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleThemeMediaChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  mediaQuery?.removeEventListener('change', handleThemeMediaChange)
})
watch(() => settings.theme, applyTheme)
</script>

<template>
  <div class="mode-shell">
    <div
      ref="switchRef"
      class="mode-switch"
      :class="{ dragging: isSwitchDragging }"
      :style="switchStyle"
    >
      <button
        class="mode-drag-handle"
        type="button"
        :aria-label="DRAG_HANDLE_LABEL"
        :title="DRAG_HANDLE_LABEL"
        @pointerdown="handleSwitchPointerDown"
        @pointermove="handleSwitchPointerMove"
        @pointerup="handleSwitchPointerUp"
        @pointercancel="handleSwitchPointerUp"
        @dblclick="resetSwitchPosition"
        @keydown="handleSwitchKeydown"
      >
        <span class="mode-drag-grip" aria-hidden="true"></span>
      </button>
      <div class="mode-tabs" role="tablist" :aria-label="APP_MODE_LABEL">
        <button
          v-for="item in modes"
          :key="item.value"
          type="button"
          class="mode-tab"
          :class="{ active: mode === item.value }"
          role="tab"
          :aria-selected="mode === item.value"
          @click="mode = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div v-show="mode === 'chat'" class="mode-page">
      <StyleChat />
    </div>
    <div v-show="mode === 'compare'" class="mode-page">
      <CompareChat />
    </div>
    <div v-show="mode === 'knowledge'" class="mode-page">
      <KnowledgeBase />
    </div>
    <ConfirmDialog />
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
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-topbar);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  max-width: calc(100vw - 36px);
  backdrop-filter: blur(16px);
  user-select: none;
}

.mode-drag-handle {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0;
  background: var(--bg-surface-2);
  color: var(--text-muted);
  cursor: grab;
  touch-action: none;
}

.mode-drag-grip {
  width: 10px;
  height: 14px;
  background-image: radial-gradient(currentColor 1.2px, transparent 1.2px);
  background-position: 0 0;
  background-size: 5px 5px;
  opacity: 0.9;
}

.mode-drag-handle:hover,
.mode-switch.dragging .mode-drag-handle {
  border-color: var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.mode-drag-handle:focus-visible,
.mode-tab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.mode-switch.dragging .mode-drag-handle {
  cursor: grabbing;
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.mode-tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--bg-surface-2);
  min-width: 0;
  flex: 1;
}

.mode-tab {
  height: 32px;
  border: none;
  border-radius: 5px;
  padding: 0 11px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.mode-tab:hover:not(.active) {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.mode-tab.active {
  background: var(--accent-bg);
  color: var(--accent-text);
  box-shadow: inset 0 0 0 1px var(--accent-border);
}

@media (max-width: 640px) {
  .mode-switch {
    gap: 4px;
    padding: 4px;
    width: calc(100vw - 20px);
    max-width: calc(100vw - 20px);
  }

  .mode-drag-handle {
    width: 36px;
    height: 34px;
  }

  .mode-tab {
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 0 4px;
    font-size: 11px;
  }
}
</style>
