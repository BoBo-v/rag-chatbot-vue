<template>
  <div class="knowledge-shell">
    <div class="knowledge-bg">
      <div class="knowledge-noise"></div>
    </div>

    <header class="knowledge-header">
      <div class="knowledge-title">
        <span class="knowledge-mark">K</span>
        <div>
          <h1>知识库</h1>
          <p>{{ files.length }} 个文件 · {{ totalChunks }} 个片段 · {{ formatNumber(totalChars) }} 字</p>
        </div>
      </div>
      <div class="knowledge-actions">
        <button type="button" class="kb-secondary" :disabled="loadingFiles" @click="loadFiles">
          刷新
        </button>
        <button type="button" class="kb-primary" :disabled="uploading" @click="fileInputRef?.click()">
          {{ uploading ? '上传中...' : '上传文档' }}
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".txt,.md,.pdf"
          multiple
          hidden
          @change="handleUpload"
        />
      </div>
    </header>

    <main class="knowledge-layout">
      <aside class="kb-panel kb-files-panel">
        <div class="kb-panel-header">
          <div>
            <span class="kb-eyebrow">资料</span>
            <strong>文件列表</strong>
          </div>
          <span v-if="loadingFiles" class="kb-status">加载中</span>
        </div>

        <div class="kb-filter">
          <span>⌕</span>
          <input v-model="fileFilter" type="search" placeholder="搜索文件..." />
        </div>

        <div class="kb-file-list">
          <button
            v-for="file in filteredFiles"
            :key="file.id"
            type="button"
            class="kb-file-item"
            :class="{ active: selectedFileId === file.id }"
            @click="selectFile(file.id)"
          >
            <span class="kb-file-main">
              <span class="kb-file-name">{{ file.filename }}</span>
              <span class="kb-file-meta">
                {{ file.chunkCount }} chunks · {{ formatFileSize(file.size) }}
              </span>
            </span>
            <span class="kb-file-date">{{ formatDate(file.createdAt) }}</span>
          </button>

          <div v-if="!loadingFiles && filteredFiles.length === 0" class="kb-empty">
            没有匹配的文件
          </div>
        </div>
      </aside>

      <section class="kb-panel kb-detail-panel">
        <div class="kb-panel-header">
          <div>
            <span class="kb-eyebrow">详情</span>
            <strong>{{ selectedFile?.filename || '选择一个文件' }}</strong>
          </div>
          <button
            v-if="selectedFile"
            type="button"
            class="kb-danger"
            :disabled="deleting"
            @click="deleteSelectedFile"
          >
            删除
          </button>
        </div>

        <template v-if="selectedFile">
          <div class="kb-stats-grid">
            <div>
              <span>字符数</span>
              <strong>{{ formatNumber(selectedFile.charCount) }}</strong>
            </div>
            <div>
              <span>片段</span>
              <strong>{{ selectedFile.chunkCount }}</strong>
            </div>
            <div>
              <span>大小</span>
              <strong>{{ formatFileSize(selectedFile.size) }}</strong>
            </div>
            <div>
              <span>类型</span>
              <strong>{{ selectedFile.mimeType || '-' }}</strong>
            </div>
          </div>

          <div class="kb-chunk-toolbar">
            <span>{{ fileDetail?.chunks.length ?? 0 }} 个片段</span>
            <span v-if="loadingDetail">读取中...</span>
          </div>

          <div class="kb-chunk-list">
            <article v-for="chunk in fileDetail?.chunks ?? []" :key="chunk.id" class="kb-chunk">
              <header>
                <span>#{{ chunk.chunkIndex }}</span>
                <span v-if="chunk.pageNumber">第 {{ chunk.pageNumber }} 页</span>
                <span v-if="chunk.embeddingSize">{{ chunk.embeddingSize }} 维</span>
              </header>
              <p>{{ chunk.text }}</p>
            </article>
            <div v-if="!loadingDetail && fileDetail && fileDetail.chunks.length === 0" class="kb-empty">
              这个文件没有片段
            </div>
          </div>
        </template>

        <div v-else class="kb-empty kb-detail-empty">
          选择左侧文件查看元信息和切块内容
        </div>
      </section>

      <section class="kb-panel kb-search-panel">
        <div class="kb-panel-header">
          <div>
            <span class="kb-eyebrow">RAG</span>
            <strong>检索调试</strong>
          </div>
          <button type="button" class="kb-secondary" :disabled="searching || !query.trim()" @click="runSearch">
            查询
          </button>
        </div>

        <div class="kb-search-form">
          <textarea
            v-model="query"
            rows="4"
            placeholder="输入要检索的问题或关键词..."
            @keydown.enter.ctrl.prevent="runSearch"
          ></textarea>
          <div class="kb-controls">
            <label>
              <span>Top K</span>
              <input v-model.number="topK" type="number" min="1" max="20" />
            </label>
            <label>
              <span>Min Score</span>
              <input v-model.number="minScore" type="number" min="0" max="1" step="0.05" />
            </label>
            <label class="kb-checkbox">
              <input v-model="limitToSelectedFile" type="checkbox" :disabled="!selectedFile" />
              <span>限定当前文件</span>
            </label>
          </div>
        </div>

        <div class="kb-results">
          <article v-for="result in searchResults" :key="result.id" class="kb-result">
            <header>
              <strong>{{ result.filename }}</strong>
              <span>{{ formatScore(result.score) }}</span>
            </header>
            <div class="kb-score-row">
              <span>vector {{ formatScore(result.vectorScore) }}</span>
              <span>keyword {{ formatScore(result.keywordScore) }}</span>
              <span>#{{ result.chunkIndex }}</span>
            </div>
            <p>{{ result.text }}</p>
          </article>
          <div v-if="searchError" class="kb-error">{{ searchError }}</div>
          <div v-else-if="!searching && hasSearched && searchResults.length === 0" class="kb-empty">
            没有命中片段
          </div>
        </div>
      </section>
    </main>

    <transition-group name="toast-slide" tag="div" class="toast-container">
      <div
        v-for="t in toast.toasts.value"
        :key="t.id"
        class="toast-item"
        :class="t.type"
        @click="toast.dismiss(t.id)"
      >
        <span class="toast-icon">{{ t.type === 'error' ? '✕' : t.type === 'warning' ? '!' : '✓' }}</span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from '../composables/useToast'
import {
  deleteKnowledgeFile,
  getKnowledgeFile,
  listKnowledgeFiles,
  searchKnowledge,
  uploadKnowledgeFile,
  type KnowledgeFileDetail,
  type KnowledgeSearchResult,
  type StoredKnowledgeFile,
} from '../services/knowledge'

const toast = useToast()

const files = ref<StoredKnowledgeFile[]>([])
const fileDetail = ref<KnowledgeFileDetail | null>(null)
const selectedFileId = ref<string>('')
const fileFilter = ref('')
const loadingFiles = ref(false)
const loadingDetail = ref(false)
const uploading = ref(false)
const deleting = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const query = ref('')
const topK = ref(5)
const minScore = ref(0.35)
const limitToSelectedFile = ref(false)
const searching = ref(false)
const hasSearched = ref(false)
const searchError = ref('')
const searchResults = ref<KnowledgeSearchResult[]>([])

const totalChunks = computed(() => files.value.reduce((sum, file) => sum + file.chunkCount, 0))
const totalChars = computed(() => files.value.reduce((sum, file) => sum + file.charCount, 0))
const selectedFile = computed(() => files.value.find(file => file.id === selectedFileId.value))
const filteredFiles = computed(() => {
  const keyword = fileFilter.value.trim().toLowerCase()
  if (!keyword) return files.value
  return files.value.filter(file => file.filename.toLowerCase().includes(keyword))
})

async function loadFiles() {
  loadingFiles.value = true
  try {
    files.value = await listKnowledgeFiles()
    if (!selectedFileId.value && files.value.length > 0) {
      await selectFile(files.value[0].id)
    } else if (selectedFileId.value && !files.value.some(file => file.id === selectedFileId.value)) {
      selectedFileId.value = ''
      fileDetail.value = null
    }
  } catch (error) {
    toast.show(error instanceof Error ? error.message : '文件列表加载失败', 'error')
  } finally {
    loadingFiles.value = false
  }
}

async function selectFile(id: string) {
  selectedFileId.value = id
  loadingDetail.value = true
  try {
    fileDetail.value = await getKnowledgeFile(id)
  } catch (error) {
    fileDetail.value = null
    toast.show(error instanceof Error ? error.message : '文件详情加载失败', 'error')
  } finally {
    loadingDetail.value = false
  }
}

async function handleUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const uploadFiles = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!uploadFiles.length) return

  uploading.value = true
  let successCount = 0
  try {
    for (const file of uploadFiles) {
      const result = await uploadKnowledgeFile(file)
      if (result.ok) {
        successCount++
      } else {
        toast.show(`${result.fileName}: ${result.message || '上传失败'}`, 'error', 7000)
      }
    }
    if (successCount > 0) {
      toast.show(`已上传 ${successCount} 个文件`, 'success')
      await loadFiles()
    }
  } finally {
    uploading.value = false
  }
}

async function deleteSelectedFile() {
  if (!selectedFile.value) return
  const deletingName = selectedFile.value.filename
  deleting.value = true
  try {
    await deleteKnowledgeFile(selectedFile.value.id)
    toast.show(`已删除 ${deletingName}`, 'success')
    selectedFileId.value = ''
    fileDetail.value = null
    await loadFiles()
  } catch (error) {
    toast.show(error instanceof Error ? error.message : '删除失败', 'error')
  } finally {
    deleting.value = false
  }
}

async function runSearch() {
  const q = query.value.trim()
  if (!q) return
  searching.value = true
  hasSearched.value = true
  searchError.value = ''
  try {
    searchResults.value = await searchKnowledge({
      q,
      topK: clampNumber(topK.value, 1, 20),
      minScore: clampNumber(minScore.value, 0, 1),
      fileId: limitToSelectedFile.value ? selectedFileId.value : undefined,
    })
  } catch (error) {
    searchResults.value = []
    searchError.value = error instanceof Error ? error.message : '检索失败'
  } finally {
    searching.value = false
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatScore(value: number): string {
  return value.toFixed(3)
}

onMounted(loadFiles)
</script>

<style scoped>
.knowledge-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-canvas);
}

.knowledge-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(14, 165, 233, 0.11), transparent 36%),
    linear-gradient(240deg, rgba(52, 211, 153, 0.10), transparent 34%),
    var(--bg-canvas);
}

.knowledge-noise {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E");
  opacity: var(--noise-opacity);
}

.knowledge-header {
  position: relative;
  z-index: 1;
  height: 74px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(20px);
}

.knowledge-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.knowledge-mark {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ecfeff;
  background: linear-gradient(135deg, #0891b2, #059669);
  font-size: 14px;
  font-weight: 800;
}

.knowledge-title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0;
}

.knowledge-title p {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted);
}

.knowledge-actions,
.kb-panel-header,
.kb-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kb-primary,
.kb-secondary,
.kb-danger {
  height: 34px;
  border-radius: 8px;
  padding: 0 14px;
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  cursor: pointer;
}

.kb-primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #0891b2, #059669);
}

.kb-danger {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(239, 68, 68, 0.10);
}

.kb-primary:disabled,
.kb-secondary:disabled,
.kb-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.knowledge-layout {
  position: relative;
  z-index: 1;
  height: calc(100% - 74px);
  min-height: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 380px;
  gap: 1px;
  background: var(--border-subtle);
}

.kb-panel {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: rgba(7, 7, 15, 0.42);
  backdrop-filter: blur(18px);
}

[data-theme="light"] .kb-panel {
  background: rgba(255, 255, 255, 0.78);
}

.kb-panel-header {
  min-height: 62px;
  padding: 0 18px;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-panel-header strong {
  display: block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.kb-eyebrow,
.kb-status {
  display: block;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.kb-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface-2);
}

.kb-filter span {
  color: var(--text-muted);
}

.kb-filter input,
.kb-search-form textarea,
.kb-controls input {
  width: 100%;
  border: none;
  outline: none;
  color: var(--text-primary);
  background: transparent;
}

.kb-file-list,
.kb-chunk-list,
.kb-results {
  min-height: 0;
  overflow-y: auto;
  padding: 0 14px 14px;
}

.kb-file-item {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 10px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.kb-file-item:hover {
  background: var(--bg-surface-2);
}

.kb-file-item.active {
  border-color: rgba(20, 184, 166, 0.32);
  background: rgba(20, 184, 166, 0.12);
}

.kb-file-main {
  min-width: 0;
}

.kb-file-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
}

.kb-file-meta,
.kb-file-date {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-file-date {
  flex-shrink: 0;
  margin-top: 0;
}

.kb-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}

.kb-stats-grid div {
  padding: 13px 16px;
  background: var(--bg-surface-3);
}

.kb-stats-grid span {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-stats-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 14px;
}

.kb-chunk-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  color: var(--text-muted);
  font-size: 12px;
}

.kb-chunk,
.kb-result {
  padding: 14px;
  margin-bottom: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface-2);
}

.kb-chunk header,
.kb-result header,
.kb-score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-result header {
  justify-content: space-between;
}

.kb-result header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 13px;
}

.kb-score-row {
  margin-top: 6px;
}

.kb-chunk p,
.kb-result p {
  margin-top: 9px;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.kb-search-form {
  padding: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-search-form textarea {
  min-height: 94px;
  resize: vertical;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface-2);
  font-size: 13px;
  line-height: 1.55;
}

.kb-controls {
  margin-top: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.kb-controls label {
  flex: 1;
  min-width: 92px;
}

.kb-controls label span {
  display: block;
  margin-bottom: 5px;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-controls input[type="number"] {
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface-2);
}

.kb-checkbox {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1 1 100%;
  color: var(--text-secondary);
  font-size: 12px;
}

.kb-checkbox input {
  width: auto;
}

.kb-checkbox span {
  margin: 0;
}

.kb-empty,
.kb-error {
  padding: 24px 12px;
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}

.kb-error {
  color: #f87171;
}

.kb-detail-empty {
  margin: auto;
}

@media (max-width: 1180px) {
  .knowledge-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .kb-search-panel {
    grid-column: 1 / -1;
    min-height: 280px;
  }
}

@media (max-width: 760px) {
  .knowledge-header {
    height: auto;
    min-height: 92px;
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
  }

  .knowledge-actions {
    width: 100%;
  }

  .kb-primary,
  .kb-secondary {
    flex: 1;
  }

  .knowledge-layout {
    height: calc(100% - 116px);
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .kb-panel {
    min-height: 360px;
  }

  .kb-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
