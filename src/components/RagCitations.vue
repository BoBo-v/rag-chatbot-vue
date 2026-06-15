<template>
  <details class="rag-citations">
    <summary class="rag-citations-summary">
      <span class="rag-citations-title">{{ summaryTitle }}</span>
      <span class="rag-citations-state">{{ stateLabel }}</span>
    </summary>

    <div class="rag-citations-body">
      <p v-if="context.errorMessage" class="rag-citations-empty">
        引用资料获取失败：{{ context.errorMessage }}
      </p>
      <p v-else-if="context.mode === 'off'" class="rag-citations-empty">
        本次已关闭知识库
      </p>
      <p v-else-if="!context.enabled" class="rag-citations-empty">
        本次未启用知识库。未命中足够相关资料，已直接推理回答。
      </p>
      <p v-else-if="context.results.length === 0" class="rag-citations-empty">
        已尝试检索知识库，但没有命中可用资料。
      </p>

      <ol v-else class="rag-citations-list">
        <li v-for="item in context.results" :key="`${item.fileId}-${item.chunkIndex}`" class="rag-citation-item">
          <header class="rag-citation-head">
            <strong>{{ item.filename }}</strong>
            <span>chunk {{ item.chunkIndex }}</span>
          </header>
          <div class="rag-score-row">
            <span>score {{ formatScore(item.score) }}</span>
            <span>vector {{ formatScore(item.vectorScore) }}</span>
            <span>keyword {{ formatScore(item.keywordScore) }}</span>
          </div>
          <p class="rag-citation-text">{{ previewText(item.text) }}</p>
        </li>
      </ol>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RagContextInfo } from '../types/chat'

const props = defineProps<{
  context: RagContextInfo
}>()

const summaryTitle = computed(() => {
  if (props.context.errorMessage) return '引用资料获取失败'
  if (props.context.results.length > 0) return `引用资料 ${props.context.results.length} 条`
  return '引用资料'
})

const stateLabel = computed(() => {
  if (props.context.mode === 'off') return '知识库已关闭'
  if (props.context.mode === 'force') return props.context.results.length > 0 ? '强制使用知识库' : '强制检索无命中'
  if (!props.context.enabled) return '未启用 RAG'
  return props.context.results.length > 0 ? 'RAG 已启用' : '无命中'
})

function formatScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '-'
}

function previewText(text: string): string {
  // 引用片段只做可解释预览，避免长 chunk 把聊天气泡撑得过高。
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 200 ? normalized.slice(0, 200) + '...' : normalized
}
</script>
