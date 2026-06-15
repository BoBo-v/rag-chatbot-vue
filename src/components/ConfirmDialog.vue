<template>
  <Modal
    v-model="confirmState.open"
    :title="confirmState.title"
    width="420px"
    :mask-closable="true"
    :closable="true"
    :show-footer="true"
    @close="resolveConfirm(false)"
    @cancel="resolveConfirm(false)"
  >
    <div class="confirm-content">
      <span class="confirm-icon" :class="{ danger: confirmState.danger }">!</span>
      <p class="confirm-message">{{ confirmState.message }}</p>
    </div>
    <template #footer>
      <div class="confirm-actions">
        <Button autofocus @click="resolveConfirm(false)">
          {{ confirmState.cancelText }}
        </Button>
        <Button :type="confirmState.danger ? 'danger' : 'primary'" @click="resolveConfirm(true)">
          {{ confirmState.confirmText }}
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { Button, Modal } from '@bobocn/element/vue'
import { useConfirm } from '../composables/useConfirm'

const { confirmState, resolveConfirm } = useConfirm()
</script>
