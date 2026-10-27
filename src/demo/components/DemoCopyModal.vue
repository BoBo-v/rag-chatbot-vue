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
  background: var(--bg-overlay, rgba(0, 0, 0, 0.65));
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.demo-copy-modal {
  width: 100%;
  max-width: 520px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border, rgba(124, 58, 237, 0.2));
  border-radius: var(--radius-lg, 12px);
  padding: 20px;
  box-shadow: var(--shadow-lg, 0 16px 36px rgba(0, 0, 0, 0.3));
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
  color: var(--text-primary, #1e192b);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted, #7d7291);
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary, #1e192b);
}

.demo-copy-tip {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #574e69);
}

.demo-copy-tip code {
  background: var(--bg-surface-2, #f0ecf7);
  color: var(--accent-text, #7c3aed);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.demo-copy-textarea {
  width: 100%;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-subtle, rgba(124, 58, 237, 0.15));
  background: var(--bg-input, #ffffff);
  color: var(--text-primary, #1e192b);
  padding: 12px;
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  box-sizing: border-box;
  font-family: var(--font-sans);
}

.demo-copy-textarea:focus {
  outline: none;
  border-color: var(--accent, #7c3aed);
}

.demo-copy-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn-primary {
  padding: 8px 18px;
  background: var(--accent, #7c3aed);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--motion-fast, 140ms) ease;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

/* ─── 小屏幕与移动端响应式适配 ─── */
@media (max-width: 480px) {
  .demo-copy-modal-overlay {
    padding: 10px;
  }

  .demo-copy-modal {
    padding: 14px;
    gap: 10px;
    border-radius: var(--radius-md, 10px);
  }

  .demo-copy-header h3 {
    font-size: 15px;
  }

  .demo-copy-tip {
    font-size: 12px;
  }

  .demo-copy-textarea {
    padding: 10px;
    font-size: 12.5px;
  }

  .btn-primary {
    width: 100%;
    text-align: center;
    padding: 9px;
  }
}
</style>
