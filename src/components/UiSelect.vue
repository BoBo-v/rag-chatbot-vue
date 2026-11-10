<template>
  <div ref="rootRef" class="ui-select-root" :class="[rootClass, { 'is-open': isOpen, 'is-disabled': disabled }]">
    <button
      type="button"
      class="ui-select-trigger"
      :class="triggerClass"
      :disabled="disabled"
      :title="title || selectedLabel"
      @click.stop="toggle"
    >
      <slot name="trigger" :selected="selectedOption" :label="selectedLabel">
        <span class="ui-select-label">{{ selectedLabel }}</span>
      </slot>
      <ChevronDown :size="chevronSize" class="ui-select-chevron" :class="{ open: isOpen }" aria-hidden="true" />
    </button>

    <div v-if="isOpen" class="ui-select-dropdown" :class="dropdownClass" role="menu">
      <div v-if="headerText" class="ui-select-dropdown-header">
        <span>{{ headerText }}</span>
      </div>
      <div class="ui-select-dropdown-list">
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="ui-select-item"
          :class="{ active: opt.value === modelValue, disabled: opt.disabled }"
          :disabled="opt.disabled"
          @click.stop="select(opt.value)"
        >
          <span class="ui-select-item-label">{{ opt.label }}</span>
          <span v-if="opt.subtext" class="ui-select-item-subtext">{{ opt.subtext }}</span>
          <Check v-if="opt.value === modelValue" :size="13" class="ui-select-check" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'

export interface UiSelectOption {
  value: string | number
  label: string
  subtext?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue?: string | number
  options: UiSelectOption[]
  placeholder?: string
  headerText?: string
  title?: string
  disabled?: boolean
  chevronSize?: number
  rootClass?: string
  triggerClass?: string
  dropdownClass?: string
}>(), {
  modelValue: '',
  options: () => [],
  placeholder: '请选择',
  headerText: '',
  title: '',
  disabled: false,
  chevronSize: 11,
  rootClass: '',
  triggerClass: '',
  dropdownClass: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
  (e: 'change', value: string | number): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const selectedOption = computed(() => props.options.find(opt => opt.value === props.modelValue))
const selectedLabel = computed(() => selectedOption.value?.label ?? props.placeholder)

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function select(value: string | number) {
  emit('update:modelValue', value)
  emit('change', value)
  isOpen.value = false
}

function handleOutsideClick(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('click', handleOutsideClick)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleOutsideClick)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.ui-select-root {
  position: relative;
  display: inline-block;
}

.ui-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  white-space: nowrap;
  outline: none;
  box-sizing: border-box;
  transition: all var(--motion-fast, 0.15s) ease;
}

.ui-select-trigger:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.ui-select-root.is-open .ui-select-trigger {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.ui-select-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ui-select-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform var(--motion-fast, 0.15s) ease;
}

.ui-select-chevron.open {
  transform: rotate(180deg);
}

/* 核心：轻量柔和灰色阴影浮层 */
.ui-select-dropdown {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  z-index: 120;
  min-width: 100%;
  max-width: 380px;
  width: max-content;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 18px rgba(71, 85, 105, 0.20), 0 1px 4px rgba(71, 85, 105, 0.10);
  padding: 5px;
  animation: ui-select-in var(--motion-fast, 0.15s) var(--ease-standard);
  box-sizing: border-box;
}

@keyframes ui-select-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.ui-select-dropdown-header {
  padding: 4px 8px 6px;
  font-size: 10.5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 4px;
  font-family: var(--font-mono);
}

.ui-select-dropdown-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
}

.ui-select-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: var(--font-mono);
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: all var(--motion-fast, 0.15s) ease;
}

.ui-select-item:hover:not(:disabled) {
  background: var(--bg-surface-2);
  color: var(--text-primary);
}

.ui-select-item.active {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: var(--accent-border);
  font-weight: 600;
}

.ui-select-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-select-item-subtext {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
  padding-left: 6px;
}

.ui-select-check {
  color: var(--accent);
  flex-shrink: 0;
}

/* 浅色模式适配 */
:global([data-theme="light"]) .ui-select-trigger {
  background: #f3f4f6;
  border-color: rgba(0, 0, 0, 0.08);
  color: #4b5563;
}

:global([data-theme="light"]) .ui-select-trigger:hover:not(:disabled) {
  background: #e5e7eb;
  border-color: var(--accent-border);
  color: var(--accent-text);
}

:global([data-theme="light"]) .ui-select-dropdown {
  background: #ffffff;
  border-color: rgba(203, 213, 225, 0.85);
  box-shadow: 0 4px 16px rgba(100, 116, 139, 0.12), 0 1px 3px rgba(100, 116, 139, 0.06);
}

:global([data-theme="light"]) .ui-select-item:hover:not(:disabled) {
  background: #f3f4f6;
  color: var(--text-primary);
}
</style>
