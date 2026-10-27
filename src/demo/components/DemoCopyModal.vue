<template>
  <div v-if="text" class="demo-copy-modal-overlay" @click.self="$emit('close')">
    <div class="demo-copy-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="demo-copy-header">
        <h3 id="modal-title">复制客户回复草稿</h3>
        <button type="button" class="close-btn" aria-label="关闭" @click="$emit('close')">×</button>
      </div>
      <p class="demo-copy-tip">浏览器剪贴板权限受限，请在下方全选后按 <code>Ctrl + C</code> 手动复制：</p>
      <textarea
        ref="textareaRef"
        class="demo-copy-textarea"
        readonly
        :value="text"
        rows="8"
        @focus="selectText"
      ></textarea>
      <div class="demo-copy-actions">
        <button type="button" class="btn-primary" @click="$emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  text: string | null
}>()

defineEmits<{
  (e: 'close'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

function selectText() {
  textareaRef.value?.select()
}

watch(
  () => props.text,
  (val) => {
    if (val) {
      nextTick(() => {
        selectText()
      })
    }
  }
)
</script>

<style scoped>
.demo-copy-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.demo-copy-modal {
  width: 100%;
  max-width: 520px;
  background: var(--color-bg-card, #171622);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.demo-copy-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.demo-copy-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #f0eef8);
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-subtle, #a09cb4);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.demo-copy-tip {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-subtle, #a09cb4);
}

.demo-copy-tip code {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.08));
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.demo-copy-textarea {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  background: var(--color-bg-surface, #0f0e17);
  color: var(--color-text, #f0eef8);
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}

.demo-copy-textarea:focus {
  outline: none;
  border-color: var(--color-primary, #6366f1);
}

.demo-copy-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn-primary {
  padding: 8px 18px;
  background: var(--color-primary, #6366f1);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover {
  filter: brightness(1.1);
}
</style>
