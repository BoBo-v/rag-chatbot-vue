<template>
  <div class="knowledge-shell">
    <div class="knowledge-bg">
      <div class="knowledge-noise"></div>
    </div>

    <header class="knowledge-header">
      <div class="knowledge-title">
        <span class="knowledge-mark"><img src="/favicon.svg" alt="AI Chat" /></span>
        <div>
          <h1>知识库</h1>
          <p>{{ files.length }} 个文件 · {{ totalChunks }} 个片段 · {{ formatNumber(totalChars) }} 字</p>
        </div>
      </div>
      <div class="knowledge-actions">
        <button type="button" class="kb-secondary" :disabled="loadingFiles || loadingVectorStatus" @click="loadKnowledgeOverview">
          <RefreshCw :size="15" aria-hidden="true" />
          刷新
        </button>
        <button type="button" class="kb-primary" :disabled="uploading" @click="fileInputRef?.click()">
          <Upload :size="15" aria-hidden="true" />
          {{ uploading ? '上传中...' : '上传资料' }}
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
          multiple
          hidden
          @change="handleUpload"
        />
      </div>
    </header>

    <section class="kb-vector-status" :class="{ warning: vectorStatus?.needsReindex, error: vectorStatusError }">
      <span class="kb-vector-status-label">向量库</span>
      <strong>{{ vectorStatusTitle }}</strong>
      <div class="kb-vector-status-meta">
        <span>模型 {{ vectorStatus?.currentEmbeddingModel || '-' }}</span>
        <span>维度 {{ vectorEmbeddingDimension ?? '-' }}</span>
        <span>{{ formatOptionalNumber(vectorStatus?.chunkCount ?? totalChunks) }} chunks</span>
        <span>不兼容 {{ formatOptionalNumber(incompatibleChunkCount) }}</span>
      </div>
      <button type="button" class="kb-vector-refresh" :disabled="loadingVectorStatus" @click="loadVectorStatus">
        {{ loadingVectorStatus ? '检查中' : '检查状态' }}
      </button>
    </section>

    <nav class="kb-subnav" aria-label="知识库子页面">
      <button
        v-for="item in knowledgeTabs"
        :key="item.value"
        type="button"
        :class="{ active: activeTab === item.value }"
        @click="activeTab = item.value"
      >
        {{ item.label }}
      </button>
    </nav>

    <section v-if="activeTab === 'manage' && uploadItems.length > 0" class="kb-upload-panel" :class="{ collapsed: uploadPanelCollapsed }">
      <div class="kb-upload-panel-header">
        <div>
          <span class="kb-eyebrow">上传队列</span>
          <strong>{{ uploadQueueSummary }}</strong>
        </div>
        <div class="kb-upload-panel-actions">
          <button type="button" class="kb-secondary" @click="uploadPanelCollapsed = !uploadPanelCollapsed">
            {{ uploadPanelCollapsed ? '展开' : '收起' }}
          </button>
          <button type="button" class="kb-secondary" :disabled="hasActiveUploads" @click="clearFinishedUploads">
            清空
          </button>
        </div>
      </div>

      <div v-show="!uploadPanelCollapsed" class="kb-upload-strip">
        <article
          v-for="item in uploadItems"
          :key="item.id"
          class="kb-upload-item"
          :class="{ done: item.status === 'done', failed: item.status === 'failed' }"
        >
          <div class="kb-upload-info">
            <strong>{{ item.name }}</strong>
            <span>{{ item.message }}</span>
          </div>
          <div v-if="item.isImage && item.status === 'uploading'" class="kb-upload-note">
            图片正在转成知识库文本，识别阶段可能较慢
          </div>
          <div class="kb-upload-progress">
            <span>{{ Math.round(item.percent) }}%</span>
            <div class="kb-upload-track">
              <div class="kb-upload-bar" :style="{ width: item.percent + '%' }"></div>
            </div>
          </div>
          <div v-if="item.previewChunks.length > 0" class="kb-upload-preview">
            <button
              type="button"
              class="kb-upload-preview-trigger"
              @click="openUploadPreview(item)"
            >
              <span>预览 {{ item.previewChunks.length }} 个片段</span>
              <em>{{ previewChunkSummary(item.previewChunks[0]?.text ?? '') }}</em>
              <strong>查看</strong>
            </button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="uploadPreviewDialog" class="kb-preview-modal-backdrop" @click.self="closeUploadPreview">
      <section class="kb-preview-modal" role="dialog" aria-modal="true" aria-labelledby="kb-preview-title">
        <header>
          <div>
            <span class="kb-eyebrow">上传预览</span>
            <strong id="kb-preview-title">{{ uploadPreviewDialog.fileName }}</strong>
          </div>
          <button type="button" class="kb-preview-close" aria-label="关闭预览" @click="closeUploadPreview">
            <X :size="16" aria-hidden="true" />
          </button>
        </header>

        <div class="kb-preview-tabs">
          <button
            v-for="(chunk, index) in uploadPreviewDialog.chunks"
            :key="chunk.chunkIndex"
            type="button"
            :class="{ active: uploadPreviewDialog.index === index }"
            @click="selectUploadPreviewChunk(index)"
          >
            #{{ chunk.chunkIndex }}
          </button>
        </div>

        <div class="kb-preview-body">
          <pre>{{ activeUploadPreviewChunk?.text }}</pre>
        </div>

        <footer>
          <button type="button" class="kb-secondary" @click="copyUploadPreviewChunk">
            复制
          </button>
          <div>
            <button type="button" class="kb-secondary" :disabled="uploadPreviewDialog.index === 0" @click="stepUploadPreview(-1)">
              上一段
            </button>
            <button
              type="button"
              class="kb-secondary"
              :disabled="uploadPreviewDialog.index >= uploadPreviewDialog.chunks.length - 1"
              @click="stepUploadPreview(1)"
            >
              下一段
            </button>
          </div>
        </footer>
      </section>
    </div>

    <main v-show="activeTab === 'manage'" class="knowledge-layout">
      <aside class="kb-panel kb-files-panel">
        <div class="kb-panel-header">
          <div>
            <span class="kb-eyebrow">资料</span>
            <strong>文件列表</strong>
          </div>
          <span v-if="loadingFiles" class="kb-status">加载中</span>
        </div>

        <div class="kb-filter">
          <Search :size="16" aria-hidden="true" />
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

    <RagEvalPanel v-if="activeTab === 'eval'" />

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
import { RefreshCw, Search, Upload, X } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import RagEvalPanel from './RagEvalPanel.vue'
import {
  deleteKnowledgeFile,
  getKnowledgeFile,
  getVectorStoreStatus,
  listKnowledgeFiles,
  searchKnowledge,
  uploadKnowledgeFile,
  type UploadProgress,
  type KnowledgeFileDetail,
  type KnowledgeSearchResult,
  type StoredKnowledgeFile,
  type VectorStoreStatus,
} from '../services/knowledge'

const toast = useToast()
const { confirm } = useConfirm()

const files = ref<StoredKnowledgeFile[]>([])
const fileDetail = ref<KnowledgeFileDetail | null>(null)
const selectedFileId = ref<string>('')
const fileFilter = ref('')
const loadingFiles = ref(false)
const loadingDetail = ref(false)
const loadingVectorStatus = ref(false)
const uploading = ref(false)
const deleting = ref(false)
const uploadPanelCollapsed = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
type KnowledgeTab = 'manage' | 'eval'
const knowledgeTabs: { value: KnowledgeTab; label: string }[] = [
  { value: 'manage', label: '资料管理' },
  { value: 'eval', label: 'RAG 评测' },
]
const activeTab = ref<KnowledgeTab>('manage')
type UploadItemStatus = 'uploading' | 'done' | 'failed'
type UploadPreviewChunk = { text: string; chunkIndex: number }
interface UploadItem {
  id: string
  name: string
  percent: number
  message: string
  status: UploadItemStatus
  isImage: boolean
  previewChunks: UploadPreviewChunk[]
}
const uploadItems = ref<UploadItem[]>([])
const uploadPreviewDialog = ref<{
  fileName: string
  chunks: UploadPreviewChunk[]
  index: number
} | null>(null)

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const PREVIEW_CHUNK_LIMIT = 3
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])

const query = ref('')
const topK = ref(5)
const minScore = ref(0.55)
const limitToSelectedFile = ref(false)
const searching = ref(false)
const hasSearched = ref(false)
const searchError = ref('')
const searchResults = ref<KnowledgeSearchResult[]>([])
const vectorStatus = ref<VectorStoreStatus | null>(null)
const vectorStatusError = ref('')

const totalChunks = computed(() => files.value.reduce((sum, file) => sum + file.chunkCount, 0))
const totalChars = computed(() => files.value.reduce((sum, file) => sum + file.charCount, 0))
const selectedFile = computed(() => files.value.find(file => file.id === selectedFileId.value))
const vectorEmbeddingDimension = computed(() => {
  const status = vectorStatus.value
  if (!status?.embeddingDistributions?.length) return undefined
  const current = status.embeddingDistributions.find(item =>
    item.embeddingModel === status.currentEmbeddingModel && item.embeddingDim !== null
  )
  return current?.embeddingDim ?? status.embeddingDistributions.find(item => item.embeddingDim !== null)?.embeddingDim
})
const incompatibleChunkCount = computed(() =>
  vectorStatus.value?.incompatibleChunkCount
)
const vectorStatusTitle = computed(() => {
  if (vectorStatusError.value) return vectorStatusError.value
  if (loadingVectorStatus.value && !vectorStatus.value) return '正在检查向量库'
  if (vectorStatus.value?.needsReindex) return '存在旧模型或旧维度 chunk，建议重建索引'
  return '索引兼容'
})
const hasActiveUploads = computed(() => uploadItems.value.some(item => item.status === 'uploading'))
const uploadQueueSummary = computed(() => {
  const total = uploadItems.value.length
  const active = uploadItems.value.filter(item => item.status === 'uploading').length
  const failed = uploadItems.value.filter(item => item.status === 'failed').length
  if (active > 0) return `${active} 个上传中 · 共 ${total} 个`
  if (failed > 0) return `${failed} 个失败 · 共 ${total} 个`
  return `${total} 个已完成`
})
const filteredFiles = computed(() => {
  const keyword = fileFilter.value.trim().toLowerCase()
  if (!keyword) return files.value
  return files.value.filter(file => file.filename.toLowerCase().includes(keyword))
})
const activeUploadPreviewChunk = computed(() => {
  const dialog = uploadPreviewDialog.value
  return dialog?.chunks[dialog.index]
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

async function loadKnowledgeOverview() {
  await Promise.all([loadFiles(), loadVectorStatus()])
}

async function loadVectorStatus() {
  loadingVectorStatus.value = true
  vectorStatusError.value = ''
  try {
    vectorStatus.value = await getVectorStoreStatus()
  } catch (error) {
    vectorStatusError.value = error instanceof Error ? error.message : '向量库状态读取失败'
  } finally {
    loadingVectorStatus.value = false
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
      const item: UploadItem = {
        id: crypto.randomUUID(),
        name: file.name,
        percent: 0,
        message: '准备上传',
        status: 'uploading',
        isImage: isImageFile(file),
        previewChunks: [],
      }
      uploadItems.value.unshift(item)
      if (file.size > MAX_UPLOAD_BYTES) {
        item.percent = 100
        item.status = 'failed'
        item.message = `文件超过 ${formatFileSize(MAX_UPLOAD_BYTES)} 限制`
        toast.show(`${file.name}: 文件超过 ${formatFileSize(MAX_UPLOAD_BYTES)} 限制`, 'error', 7000)
        continue
      }

      if (item.isImage) {
        item.message = '准备上传图片，后端会识别为 Markdown 后入库'
      }

      const result = await uploadKnowledgeFile(file, {
        onProgress: progress => updateUploadItem(item.id, progress),
      })
      if (result.ok) {
        successCount++
        item.percent = 100
        item.status = 'done'
        item.previewChunks = (result.chunks ?? []).slice(0, PREVIEW_CHUNK_LIMIT)
        item.message = result.deduplicated
            ? '已存在相同内容，复用已有记录'
            : result.overwritten
              ? '已覆盖并写入知识库'
              : item.isImage
                ? '图片识别完成，已写入知识库'
                : '上传完成'
      } else {
        item.percent = 100
        item.status = 'failed'
        item.message = result.message || '上传失败'
        toast.show(`${result.fileName}: ${result.message || '上传失败'}`, 'error', 7000)
      }
    }
    if (successCount > 0) {
      toast.show(`已上传 ${successCount} 个文件`, 'success')
      await loadKnowledgeOverview()
    }
  } finally {
    uploading.value = false
  }
}

function updateUploadItem(id: string, progress: UploadProgress) {
  const item = uploadItems.value.find(entry => entry.id === id)
  if (!item) return
  item.percent = progress.percent
  item.message = item.isImage && progress.phase === 'parsing'
      ? progress.message || '正在识别图片内容'
      : progress.message
  if (progress.done) {
    item.status = progress.error ? 'failed' : 'done'
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase()
  return Boolean(ext && IMAGE_EXTENSIONS.has(ext))
}

function clearFinishedUploads() {
  uploadItems.value = uploadItems.value.filter(item => item.status === 'uploading')
  if (uploadPreviewDialog.value) closeUploadPreview()
}

function openUploadPreview(item: UploadItem, index = 0) {
  if (item.previewChunks.length === 0) return
  uploadPreviewDialog.value = {
    fileName: item.name,
    chunks: item.previewChunks,
    index: clampNumber(index, 0, item.previewChunks.length - 1),
  }
}

function closeUploadPreview() {
  uploadPreviewDialog.value = null
}

function selectUploadPreviewChunk(index: number) {
  const dialog = uploadPreviewDialog.value
  if (!dialog) return
  dialog.index = clampNumber(index, 0, dialog.chunks.length - 1)
}

function stepUploadPreview(step: number) {
  const dialog = uploadPreviewDialog.value
  if (!dialog) return
  selectUploadPreviewChunk(dialog.index + step)
}

function previewChunkSummary(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return '空片段'
  return normalized.length > 80 ? normalized.slice(0, 80) + '...' : normalized
}

async function copyUploadPreviewChunk() {
  const chunk = activeUploadPreviewChunk.value
  if (!chunk) return
  try {
    await navigator.clipboard.writeText(chunk.text)
    toast.show('已复制片段文本', 'success')
  } catch {
    toast.show('复制失败', 'error')
  }
}

async function deleteSelectedFile() {
  if (!selectedFile.value) return
  const deletingName = selectedFile.value.filename
  const confirmed = await confirm({
    title: '删除知识库文件',
    message: `确定删除「${deletingName}」吗？删除后无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!confirmed) return

  deleting.value = true
  try {
    await deleteKnowledgeFile(selectedFile.value.id)
    toast.show(`已删除 ${deletingName}`, 'success')
    selectedFileId.value = ''
    fileDetail.value = null
    await loadKnowledgeOverview()
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

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? '-' : formatNumber(value)
}

function formatScore(value: number): string {
  return value.toFixed(3)
}

onMounted(loadKnowledgeOverview)
</script>

<style scoped>
.knowledge-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

.kb-vector-status {
  position: relative;
  z-index: 1;
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 28px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(7, 7, 15, 0.36);
  backdrop-filter: blur(18px);
  color: var(--text-secondary);
  font-size: 12px;
}

[data-theme="light"] .kb-vector-status {
  background: rgba(255, 255, 255, 0.72);
}

.kb-vector-status.warning {
  border-bottom-color: rgba(245, 158, 11, 0.34);
  background: rgba(245, 158, 11, 0.08);
}

.kb-vector-status.error {
  border-bottom-color: rgba(248, 113, 113, 0.34);
  background: rgba(239, 68, 68, 0.08);
}

.kb-vector-status-label {
  flex-shrink: 0;
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 999px;
  padding: 2px 8px;
  color: #67e8f9;
  background: rgba(20, 184, 166, 0.10);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
}

.kb-vector-status strong {
  min-width: 120px;
  max-width: 360px;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-vector-status-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.kb-vector-status-meta span {
  flex-shrink: 0;
  color: var(--text-muted);
  white-space: nowrap;
}

.kb-vector-refresh {
  flex-shrink: 0;
  border: none;
  padding: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.kb-vector-refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.kb-subnav {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 28px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(7, 7, 15, 0.48);
  backdrop-filter: blur(18px);
}

[data-theme="light"] .kb-subnav {
  background: rgba(255, 255, 255, 0.78);
}

.kb-subnav button {
  height: 30px;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 0 12px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}

.kb-subnav button:hover {
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.kb-subnav button.active {
  border-color: rgba(20, 184, 166, 0.28);
  color: var(--text-primary);
  background: rgba(20, 184, 166, 0.12);
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
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 380px;
  gap: 1px;
  background: var(--border-subtle);
}

.kb-upload-panel {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(7, 7, 15, 0.66);
  backdrop-filter: blur(18px);
}

[data-theme="light"] .kb-upload-panel {
  background: rgba(255, 255, 255, 0.84);
}

.kb-upload-panel-header {
  min-height: 50px;
  padding: 10px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.kb-upload-panel-header strong {
  display: block;
  font-size: 13px;
}

.kb-upload-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.kb-upload-strip {
  display: flex;
  gap: 8px;
  max-height: 178px;
  padding: 0 28px 18px;
  overflow-x: auto;
  overflow-y: hidden;
}

.kb-upload-item {
  flex: 0 0 280px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface-2);
}

.kb-upload-item.done {
  border-color: rgba(34, 197, 94, 0.28);
}

.kb-upload-item.failed {
  border-color: rgba(248, 113, 113, 0.34);
}

.kb-upload-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.kb-upload-info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.kb-upload-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-upload-note {
  margin-top: 7px;
  padding: 6px 8px;
  border-radius: 6px;
  color: #67e8f9;
  background: rgba(8, 145, 178, 0.12);
  font-size: 11px;
  line-height: 1.45;
}

.kb-upload-progress {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-upload-track {
  height: 5px;
  overflow: hidden;
  border-radius: 5px;
  background: var(--border-subtle);
}

.kb-upload-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #0891b2, #10b981);
  transition: width 0.2s ease;
}

.kb-upload-preview {
  margin-top: 9px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 8px;
}

.kb-upload-preview-trigger {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 6px 7px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  text-align: left;
  font-size: 11px;
  line-height: 1.35;
}

.kb-upload-preview-trigger:hover {
  background: var(--bg-surface-3);
}

.kb-upload-preview-trigger:hover em,
.kb-upload-preview-trigger:hover strong {
  color: var(--text-secondary);
}

.kb-upload-preview-trigger span {
  flex-shrink: 0;
  color: var(--accent);
  font-weight: 700;
  white-space: nowrap;
}

.kb-upload-preview-trigger em {
  min-width: 0;
  overflow: hidden;
  display: block;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-upload-preview-trigger strong {
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.kb-preview-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(6px);
}

.kb-preview-modal {
  width: min(860px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  min-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
}

.kb-preview-modal header,
.kb-preview-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-preview-modal header strong {
  display: block;
  max-width: min(620px, 70vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.kb-preview-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.kb-preview-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
}

.kb-preview-tabs button {
  flex-shrink: 0;
  height: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  padding: 0 10px;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  cursor: pointer;
}

.kb-preview-tabs button.active {
  border-color: rgba(20, 184, 166, 0.34);
  color: var(--text-primary);
  background: rgba(20, 184, 166, 0.12);
}

.kb-preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.kb-preview-body pre {
  margin: 0;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.kb-preview-modal footer {
  border-top: 1px solid var(--border-subtle);
  border-bottom: none;
}

.kb-preview-modal footer > div {
  display: flex;
  gap: 8px;
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
  .kb-vector-status {
    flex-wrap: wrap;
  }

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

  .kb-vector-status {
    align-items: flex-start;
    gap: 8px;
    padding: 8px 14px;
  }

  .kb-vector-status strong {
    max-width: calc(100vw - 120px);
  }

  .kb-vector-status-meta {
    flex-basis: 100%;
    flex-wrap: wrap;
    gap: 6px 10px;
  }

  .kb-subnav {
    padding: 7px 14px;
  }

  .kb-primary,
  .kb-secondary {
    flex: 1;
  }

  .knowledge-layout {
    flex: 1;
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .kb-upload-panel-header {
    padding: 10px 14px;
  }

  .kb-upload-strip {
    padding: 0 14px 16px;
  }

  .kb-panel {
    min-height: 360px;
  }

  .kb-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Violet console visual layer */
.knowledge-shell {
  overflow: hidden;
  background-color: var(--bg-canvas);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 32px 32px;
  font-family: var(--font-sans);
}

.knowledge-bg,
.knowledge-noise { display: none; }

.knowledge-header {
  height: 64px;
  min-height: 64px;
  padding: 0 18px;
  border-bottom-color: var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(14px);
}

.knowledge-title { gap: 10px; }

.knowledge-mark {
  width: 32px;
  height: 32px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  padding: 2px;
  color: inherit;
  background: var(--accent-bg);
  box-shadow: var(--shadow-accent);
}

.knowledge-mark img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.knowledge-title h1 {
  font-size: 16px;
  font-weight: 650;
}

.knowledge-title p {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.knowledge-actions { gap: 6px; }

.kb-primary,
.kb-secondary,
.kb-danger {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-sm);
}

.kb-primary {
  border: 1px solid var(--accent-border);
  color: #ffffff;
  background: var(--accent-deep);
  box-shadow: 0 0 16px var(--accent-glow);
}

.kb-primary:hover:not(:disabled) { background: var(--accent-deeper); }

.kb-secondary {
  border-color: var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.kb-secondary:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.kb-danger {
  border-color: var(--danger-border);
  color: var(--danger);
  background: var(--danger-bg);
}

.kb-vector-status {
  min-height: 38px;
  padding: 5px 18px;
  border-bottom-color: var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-surface);
  backdrop-filter: none;
  font-family: var(--font-mono);
}

[data-theme="light"] .kb-vector-status { background: var(--bg-surface); }

.kb-vector-status-label {
  border-color: var(--data-accent-border);
  border-radius: var(--radius-pill);
  color: var(--data-accent);
  background: var(--data-accent-bg);
}

.kb-vector-refresh { color: var(--data-accent); }

.kb-subnav {
  min-height: 42px;
  padding: 5px 18px;
  border-bottom-color: var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(10px);
}

[data-theme="light"] .kb-subnav { background: var(--bg-topbar); }

.kb-subnav button {
  min-height: 32px;
  border-radius: var(--radius-sm);
}

.kb-subnav button.active {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.kb-upload-panel,
[data-theme="light"] .kb-upload-panel {
  border-bottom-color: var(--border-subtle);
  background: var(--bg-elevated);
  backdrop-filter: none;
}

.kb-upload-item {
  border-color: var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
}

.kb-upload-bar { background: var(--data-accent); }

.knowledge-layout {
  grid-template-columns: 280px minmax(0, 1fr) 360px;
  gap: 1px;
  background: var(--border-subtle);
}

.kb-panel,
[data-theme="light"] .kb-panel {
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: var(--bg-elevated);
  box-shadow: none;
}

.kb-panel-header {
  min-height: 54px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-eyebrow,
.kb-status,
.kb-file-meta,
.kb-file-date,
.kb-score-row {
  font-family: var(--font-mono);
  letter-spacing: 0;
}

.kb-filter {
  min-height: 40px;
  border-color: var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--bg-input);
}

.kb-filter:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.kb-file-item {
  min-height: 54px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.kb-file-item:hover { background: var(--bg-surface-2); }

.kb-file-item.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.kb-stats-grid > div,
.kb-chunk,
.kb-result {
  border-color: var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
}

.kb-search-form textarea,
.kb-controls input,
.kb-preview-body {
  border-color: var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: var(--bg-input);
}

.kb-search-form textarea:focus,
.kb-controls input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.kb-result header > span,
.kb-score-row { color: var(--data-accent); }

.kb-preview-modal {
  border-color: var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

@media (max-width: 1180px) {
  .knowledge-layout {
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .kb-search-panel {
    grid-column: 1 / -1;
    min-height: 300px;
  }
}

@media (max-width: 760px) {
  .knowledge-header {
    height: auto;
    min-height: 104px;
    gap: 10px;
    padding: 10px 12px;
  }

  .knowledge-title { width: 100%; }

  .knowledge-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kb-primary,
  .kb-secondary,
  .kb-danger {
    min-height: 44px;
  }

  .kb-vector-status {
    max-height: 94px;
    gap: 6px;
    padding: 7px 12px;
    overflow-y: auto;
  }

  .kb-vector-status strong {
    max-width: calc(100% - 100px);
  }

  .kb-vector-status-meta {
    flex-basis: 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
  }

  .kb-subnav {
    padding: 5px 10px;
    overflow-x: auto;
  }

  .kb-subnav button {
    min-height: 40px;
    flex: 0 0 auto;
  }

  .knowledge-layout {
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }

  .kb-panel {
    width: 100%;
    min-height: 340px;
    max-width: 100%;
  }

  .kb-search-panel { grid-column: auto; }

  .kb-upload-panel-header,
  .kb-upload-strip {
    padding-right: 12px;
    padding-left: 12px;
  }

  .kb-controls {
    align-items: stretch;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kb-checkbox { grid-column: 1 / -1; }
}
</style>
