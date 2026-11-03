<template>
  <div class="knowledge-shell">
    <div class="knowledge-bg">
      <div class="knowledge-noise"></div>
    </div>

    <!-- 顶部总标题与全局操作 -->
    <header class="knowledge-header">
      <div class="knowledge-title">
        <span class="knowledge-mark"><img src="/favicon.svg" alt="AI Chat" /></span>
        <div>
          <h1>技术知识库与评测</h1>
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

    <!-- 向量库健康度与状态条 -->
    <section class="kb-vector-status" :class="{ warning: vectorStatus?.needsReindex, error: vectorStatusError }">
      <div class="kb-vector-status-left">
        <span class="kb-vector-status-label">向量库状态</span>
        <strong :title="vectorStatusTitle">{{ vectorStatusTitle }}</strong>
        <div class="kb-vector-status-meta">
          <span>模型: <strong>{{ vectorStatus?.currentEmbeddingModel || '-' }}</strong></span>
          <span>维度: <strong>{{ targetEmbeddingDimension ? targetEmbeddingDimension + ' 维' : '待确认' }}</strong></span>
          <span>{{ formatOptionalNumber(vectorStatus?.chunkCount ?? totalChunks) }} chunks</span>
          <span v-if="incompatibleChunkCount && incompatibleChunkCount > 0" class="incompatible-badge">
            不兼容: <strong>{{ formatOptionalNumber(incompatibleChunkCount) }}</strong>
          </span>
        </div>
      </div>
      <div class="kb-vector-status-actions">
        <button type="button" class="kb-secondary" :disabled="reindexing || loadingVectorStatus" @click="handleReindex">
          <RefreshCw :size="13" :class="{ spinning: reindexing }" aria-hidden="true" />
          {{ reindexing ? '同步中...' : '🔄 同步已有向量索引' }}
        </button>
        <button type="button" class="kb-primary" :disabled="uploading" @click="fileInputRef?.click()">
          <Upload :size="13" aria-hidden="true" />
          + 上传资料
        </button>
      </div>
    </section>

    <!-- SSE 6阶段实时上传与视觉解析流水线 (来自原型 ai_rag.html) -->
    <div v-if="activeUploadItem" class="kb-sse-pipeline">
      <div class="kb-sse-pipeline-left">
        <span class="kb-sse-pill">SSE 实时入库流</span>
        <span class="kb-sse-filename font-mono">{{ getFileIcon(activeUploadItem.name) }} {{ activeUploadItem.name }} ({{ formatFileSize(activeUploadItem.size || 0) }})</span>
      </div>

      <!-- 6 阶段进度节点 -->
      <div class="kb-sse-stages font-mono">
        <span :class="{ 'is-done': isPhasePassed(activeUploadItem.phase, 'receiving'), 'is-current': activeUploadItem.phase === 'receiving' }">
          {{ isPhasePassed(activeUploadItem.phase, 'receiving') ? '✓ ' : '' }}1.receiving
        </span>
        <span class="kb-sse-arrow">➔</span>
        <span :class="{ 'is-done': isPhasePassed(activeUploadItem.phase, 'parsing'), 'is-current': activeUploadItem.phase === 'parsing', 'is-pulse': activeUploadItem.phase === 'parsing' }">
          <template v-if="activeUploadItem.phase === 'parsing'">
            ⚡ 2.parsing ({{ activeUploadItem.isImage ? '视觉模型转 Markdown...' : '文档解析中...' }} {{ Math.round(activeUploadItem.percent) }}%)
          </template>
          <template v-else>
            {{ isPhasePassed(activeUploadItem.phase, 'parsing') ? '✓ ' : '' }}2.parsing
          </template>
        </span>
        <span class="kb-sse-arrow">➔</span>
        <span :class="{ 'is-done': isPhasePassed(activeUploadItem.phase, 'chunking'), 'is-current': activeUploadItem.phase === 'chunking' }">
          {{ isPhasePassed(activeUploadItem.phase, 'chunking') ? '✓ ' : '' }}3.chunking
        </span>
        <span class="kb-sse-arrow">➔</span>
        <span :class="{ 'is-done': isPhasePassed(activeUploadItem.phase, 'embedding'), 'is-current': activeUploadItem.phase === 'embedding' }">
          {{ isPhasePassed(activeUploadItem.phase, 'embedding') ? '✓ ' : '' }}4.embedding
        </span>
        <span class="kb-sse-arrow">➔</span>
        <span :class="{ 'is-done': isPhasePassed(activeUploadItem.phase, 'storing'), 'is-current': activeUploadItem.phase === 'storing' }">
          {{ isPhasePassed(activeUploadItem.phase, 'storing') ? '✓ ' : '' }}5.storing
        </span>
        <span class="kb-sse-arrow">➔</span>
        <span :class="{ 'is-done': activeUploadItem.phase === 'completed', 'is-current': activeUploadItem.phase === 'completed' }">
          {{ activeUploadItem.phase === 'completed' ? '✓ ' : '' }}6.completed
        </span>
      </div>
    </div>

    <!-- 子导航标签 -->
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

    <!-- 上传队列折叠面板 -->
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
            图片正在转成知识库文本，视觉模型识别可能需要数秒
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

    <!-- 上传切片预览弹窗 -->
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

    <!-- 资料管理三栏主体布局 -->
    <main v-show="activeTab === 'manage'" class="knowledge-layout">
      <!-- 左栏：文件列表 (含格式图标、维度标签、视觉解析提示) -->
      <aside class="kb-panel kb-files-panel">
        <div class="kb-panel-header">
          <div>
            <span class="kb-eyebrow">资料库</span>
            <strong>文件列表</strong>
          </div>
          <span v-if="loadingFiles" class="kb-status">加载中</span>
        </div>

        <div class="kb-filter">
          <Search :size="15" aria-hidden="true" />
          <input v-model="fileFilter" type="search" placeholder="搜索文件名或标签..." />
        </div>

        <div class="kb-file-list">
          <button
            v-for="file in filteredFiles"
            :key="file.id"
            class="kb-file-item"
            :class="{
              active: selectedFileId === file.id,
              'is-incompatible': getFileCompatibility(file).isIncompatible
            }"
            @click="selectFile(file.id)"
          >
            <div class="kb-file-top">
              <span class="kb-file-name" :title="file.filename">
                <span class="kb-file-icon">{{ getFileIcon(file.filename) }}</span>
                {{ file.filename }}
              </span>
              <span v-if="isImageFilename(file.filename)" class="kb-pill-tag tag-vision">视觉解析</span>
              <span v-else-if="getFileCompatibility(file).badgeText" class="kb-pill-tag" :class="getFileCompatibility(file).badgeClass">
                {{ getFileCompatibility(file).badgeText }}
              </span>
            </div>
            <div class="kb-file-meta-row font-mono">
              <span>{{ file.chunkCount }} chunks · {{ formatFileSize(file.size) }}</span>
              <span class="kb-dim-tag" :class="{ 'dim-incompatible': getFileCompatibility(file).isIncompatible }">
                {{ getFileCompatibility(file).dimText }}{{ getFileCompatibility(file).isIncompatible ? ' (旧)' : '' }} · {{ formatDate(file.createdAt) }}
              </span>
            </div>
          </button>

          <div v-if="!loadingFiles && filteredFiles.length === 0" class="kb-empty">
            没有匹配的文件
          </div>
        </div>
      </aside>

      <!-- 中栏：文件详情与双列高密度 Chunks / 多模态视觉对照视图 -->
      <section class="kb-panel kb-detail-panel">
        <div class="kb-detail-topbar">
          <div class="kb-detail-meta-group">
            <div class="kb-detail-title-row">
              <h2 class="kb-detail-filename font-mono">{{ selectedFile?.filename || '选择一个文件' }}</h2>
              <span v-if="selectedFile" class="kb-badge-verified">
                ✓ SHA256 去重校验通过
              </span>
            </div>
            <div v-if="selectedFile" class="kb-detail-stats font-mono">
              <span>字符数: <strong>{{ formatNumber(selectedFile.charCount) }}</strong></span>
              <span>切片数: <strong>{{ selectedFile.chunkCount }} Chunks</strong></span>
              <span>大小: <strong>{{ formatFileSize(selectedFile.size) }}</strong></span>
              <span>类型: <strong>{{ selectedFile.mimeType || 'text/markdown' }}</strong></span>
            </div>
          </div>

          <div v-if="selectedFile" class="kb-detail-actions">
            <!-- 视图切换按钮：双列切片 vs 图片视觉解析对照 -->
            <div v-if="isStoredImageFile(selectedFile)" class="kb-view-toggle">
              <button
                type="button"
                class="kb-toggle-btn"
                :class="{ active: kbView === 'doc' }"
                @click="kbView = 'doc'"
              >
                📑 双列切片视图
              </button>
              <button
                type="button"
                class="kb-toggle-btn"
                :class="{ active: kbView === 'vision' }"
                @click="kbView = 'vision'"
              >
                🖼️ 图片视觉解析对照
              </button>
            </div>
            <button
              type="button"
              class="kb-danger-btn"
              :disabled="deleting"
              @click="deleteSelectedFile"
            >
              删除文件
            </button>
          </div>
        </div>

        <template v-if="selectedFile">
          <!-- 子视图 A：双列高密度 Chunk 网格 (解决原本单列过长右侧空余问题) -->
          <div v-if="kbView === 'doc'" class="kb-chunks-scroll-area">
            <div v-if="fileDetail?.chunks && fileDetail.chunks.length > 0" class="kb-chunk-grid">
              <article
                v-for="chunk in fileDetail.chunks"
                :id="'kb-chunk-' + (chunk.id || chunk.chunkIndex)"
                :key="chunk.id"
                class="kb-chunk-card"
                :class="{ 'is-highlighted': isChunkHighlighted(chunk) }"
              >
                <header class="kb-chunk-header font-mono">
                  <div class="kb-chunk-header-left">
                    <span class="kb-chunk-index">#{{ chunk.chunkIndex }}</span>
                    <span class="kb-chunk-dim">{{ chunk.embeddingSize ? chunk.embeddingSize + ' 维' : '未知' }}</span>
                    <span class="kb-chunk-chars">| {{ chunk.text.length }} chars</span>
                    <span v-if="chunk.pageNumber" class="kb-chunk-page">第 {{ chunk.pageNumber }} 页</span>
                  </div>
                  <div class="kb-chunk-header-right">
                    <span v-if="isChunkHighlighted(chunk)" class="kb-hit-badge">
                      {{ getChunkHitBadgeText(chunk) }}
                    </span>
                    <button type="button" class="kb-chunk-copy-btn" @click="copyText(chunk.text)">
                      复制切片
                    </button>
                  </div>
                </header>
                <div class="kb-chunk-body">
                  <pre class="kb-chunk-pre">{{ chunk.text }}</pre>
                </div>
              </article>
            </div>
            <div v-else-if="!loadingDetail" class="kb-empty">
              这个文件没有切片
            </div>
            <div v-else class="kb-loading">
              切片读取中...
            </div>
          </div>

          <!-- 子视图 B：多模态图片入库「左原图 vs 右 Ollama 视觉模型生成 Markdown」分屏对照 -->
          <div v-else-if="kbView === 'vision'" class="kb-vision-scroll-area">
            <div class="kb-vision-container">
              <!-- 左：原始入库图片真实预览 -->
              <div class="kb-vision-card">
                <div class="kb-vision-header">
                  <span class="kb-vision-title">🖼️ 原始入库图片 ({{ selectedFile.filename }})</span>
                  <span class="kb-vision-meta font-mono">{{ formatFileSize(selectedFile.size) }} · {{ selectedFile.mimeType || 'Image' }}</span>
                </div>
                <div class="kb-vision-preview">
                  <div v-if="rawImageLoading" class="kb-vision-state">
                    <RefreshCw :size="20" class="spinning" aria-hidden="true" />
                    <span>原图加载中...</span>
                  </div>
                  <div v-else-if="rawImageError" class="kb-vision-state kb-vision-error">
                    <span>⚠️ {{ rawImageError }}</span>
                  </div>
                  <img
                    v-else-if="rawImageUrl"
                    :src="rawImageUrl"
                    :alt="selectedFile.filename"
                    class="kb-vision-img"
                  />
                  <div v-else class="kb-vision-state">
                    <span>源图不可用</span>
                  </div>
                </div>
              </div>

              <!-- 右：视觉模型转换后的真实 Markdown -->
              <div class="kb-vision-card">
                <div class="kb-vision-header">
                  <span class="kb-vision-title text-indigo">
                    ✨ 视觉模型 ({{ fileDetail?.visionInfo?.model || '未知模型' }}) 识别结果
                  </span>
                  <span class="kb-pill-tag tag-success font-mono">已切分为 {{ selectedFile.chunkCount }} Chunks</span>
                </div>
                <div class="kb-vision-markdown font-mono">
                  <div v-if="fileDetail?.visionInfo?.markdown" class="kb-vision-markdown-body">
                    <pre class="kb-chunk-pre">{{ fileDetail.visionInfo.markdown }}</pre>
                  </div>
                  <div v-else-if="fileDetail?.visionInfo?.error" class="kb-vision-state kb-vision-error">
                    <span>{{ fileDetail.visionInfo.error }}</span>
                  </div>
                  <div v-else-if="loadingDetail" class="kb-vision-state">
                    <span>识别结果加载中...</span>
                  </div>
                  <div v-else class="kb-vision-state">
                    <span>缺少视觉模型识别结果</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="kb-empty kb-detail-empty">
          选择左侧文件查看元信息和切块内容
        </div>
      </section>

      <!-- 右栏：检索调试器 (填满下半部分，直观展示 3 维分数与关键词高亮) -->
      <aside class="kb-panel kb-search-panel">
        <div class="kb-panel-header kb-debugger-header">
          <div class="kb-debugger-title">
            <strong>🔍 检索链路调试 (Retrieval Test)</strong>
            <span class="kb-pill-tag tag-hybrid font-mono">Hybrid Search</span>
          </div>
        </div>

        <div class="kb-search-form">
          <textarea
            v-model="query"
            rows="3"
            placeholder="输入要检索的问题或关键词..."
            @keydown.enter.ctrl.prevent="runSearch"
          ></textarea>

          <div class="kb-debugger-params">
            <div class="kb-param-box font-mono">
              <span>Top K:</span>
              <input v-model.number="topK" type="number" min="1" max="20" class="kb-param-input" />
            </div>
            <div class="kb-param-box font-mono">
              <span>Min Score:</span>
              <input v-model.number="minScore" type="number" min="0" max="1" step="0.05" class="kb-param-input" />
            </div>
          </div>

          <div class="kb-debugger-actions">
            <label class="kb-checkbox">
              <input v-model="limitToSelectedFile" type="checkbox" :disabled="!selectedFile" />
              <span>限定当前选中文件</span>
            </label>
            <button
              type="button"
              class="kb-primary kb-search-btn"
              :disabled="searching || !query.trim()"
              @click="runSearch"
            >
              {{ searching ? '检索中...' : '执行检索测试' }}
            </button>
          </div>
        </div>

        <!-- 检索结果列表：彻底填满右栏下半部，点击联动中间 Chunk 闪烁高亮 -->
        <div class="kb-results-header font-mono">
          <span>命中结果: {{ searchResults.length }} Chunks (耗时 {{ searchDuration }}ms)</span>
          <span>点击卡片定位左侧切片</span>
        </div>

        <div class="kb-results-list">
          <article
            v-for="(result, index) in searchResults"
            :key="result.id"
            class="kb-result-card"
            :class="{ 'is-selected': isSearchResultSelected(result) }"
            @click="highlightSearchResult(result, index + 1)"
          >
            <header class="kb-result-card-header font-mono">
              <span class="kb-result-rank" :class="{ 'rank-top': index === 0 }">
                {{ index === 0 ? '🏆 #1' : ('#' + (index + 1)) }} {{ result.filename }}
              </span>
              <span class="kb-score-badge font-bold" :class="{ 'score-high': result.score >= 0.85 }">
                {{ formatScore(result.score) }}
              </span>
            </header>

            <!-- 3 维分数 (Score, Vec, FTS5) -->
            <div class="kb-3d-scores font-mono">
              <div class="kb-3d-score-item score-total">Score: <strong>{{ formatScore(result.score) }}</strong></div>
              <div class="kb-3d-score-item score-vec">Vec: <strong>{{ formatScore(result.vectorScore) }}</strong></div>
              <div class="kb-3d-score-item score-fts">FTS5: <strong>{{ formatScore(result.keywordScore) }}</strong></div>
            </div>

            <!-- 关键词高亮文本 -->
            <p class="kb-result-snippet" v-html="renderHighlightedText(result.text, query)"></p>
          </article>

          <div v-if="searchError" class="kb-error">{{ searchError }}</div>
          <div v-else-if="!searching && hasSearched && searchResults.length === 0" class="kb-empty">
            没有命中片段
          </div>
        </div>
      </aside>
    </main>

    <!-- RAG 评测模块子页面 -->
    <RagEvalPanel v-if="activeTab === 'eval'" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { apiFetch } from '../services/api'
import { RefreshCw, Search, Upload, X } from 'lucide-vue-next'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import RagEvalPanel from './RagEvalPanel.vue'
import {
  deleteKnowledgeFile,
  getKnowledgeFile,
  getVectorStoreStatus,
  listKnowledgeFiles,
  reindexVectorStore,
  searchKnowledge,
  uploadKnowledgeFile,
  type UploadProgress,
  type KnowledgeChunk,
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
const reindexing = ref(false)
const uploadPanelCollapsed = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

type KnowledgeTab = 'manage' | 'eval'
const knowledgeTabs: { value: KnowledgeTab; label: string }[] = [
  { value: 'manage', label: '资料管理' },
  { value: 'eval', label: 'RAG 评测' },
]
const activeTab = ref<KnowledgeTab>('manage')

// 视图切换：doc (双列切片) vs vision (多模态图片视觉解析对照)
const kbView = ref<'doc' | 'vision'>('doc')
interface HighlightedChunkTarget {
  fileId?: string
  chunkId?: string
  chunkIndex: number
  rank: number
}
const highlightedTarget = ref<HighlightedChunkTarget | null>(null)
const rawImageUrl = ref<string>('')
const rawImageLoading = ref<boolean>(false)
const rawImageError = ref<string>('')

function revokeRawImageUrl(): void {
  if (rawImageUrl.value && rawImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(rawImageUrl.value)
    rawImageUrl.value = ''
  }
}

async function loadRawImage(fileId: string): Promise<void> {
  revokeRawImageUrl()
  rawImageLoading.value = true
  rawImageError.value = ''
  try {
    const res = await apiFetch(`/api/files/${fileId}/raw`)
    if (!res.ok) {
      if (res.status === 404) throw new Error('源图片文件不存在或已损坏')
      throw new Error(`加载原图失败 (${res.status})`)
    }
    const blob = await res.blob()
    rawImageUrl.value = URL.createObjectURL(blob)
  } catch (err) {
    rawImageError.value = err instanceof Error ? err.message : '原图加载失败'
  } finally {
    rawImageLoading.value = false
  }
}

function isStoredImageFile(file: StoredKnowledgeFile | null | undefined): boolean {
  if (!file) return false
  if (file.mimeType && ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType)) return true
  return isImageFilename(file.filename)
}

function isChunkHighlighted(chunk: KnowledgeChunk): boolean {
  if (!highlightedTarget.value) return false
  if (highlightedTarget.value.chunkId && chunk.id) {
    return highlightedTarget.value.chunkId === chunk.id
  }
  return highlightedTarget.value.chunkIndex === chunk.chunkIndex
}

function getChunkHitBadgeText(chunk: KnowledgeChunk): string {
  if (!isChunkHighlighted(chunk) || !highlightedTarget.value) return ''
  return `右侧调试命中 Top-${highlightedTarget.value.rank}`
}

function isSearchResultSelected(result: KnowledgeSearchResult): boolean {
  if (!highlightedTarget.value) return false
  if (highlightedTarget.value.chunkId && result.id) {
    return highlightedTarget.value.chunkId === result.id
  }
  return highlightedTarget.value.chunkIndex === result.chunkIndex
}

onUnmounted(() => {
  revokeRawImageUrl()
})
const searchDuration = ref<number>(18)

type UploadItemStatus = 'uploading' | 'done' | 'failed'
type UploadPreviewChunk = { text: string; chunkIndex: number }
interface UploadItem {
  id: string
  name: string
  percent: number
  message: string
  status: UploadItemStatus
  isImage: boolean
  size?: number
  phase?: string
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
const PHASES_ORDER = ['receiving', 'parsing', 'chunking', 'embedding', 'storing', 'completed']

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

const targetEmbeddingDimension = computed<number | null>(() => {
  const status = vectorStatus.value
  if (!status) return null
  if (status.currentEmbeddingDim !== undefined && status.currentEmbeddingDim !== null) {
    return status.currentEmbeddingDim
  }
  const current = status.embeddingDistributions?.find(item =>
    item.embeddingModel === status.currentEmbeddingModel && item.embeddingDim !== null
  )
  return current?.embeddingDim ?? null
})

const incompatibleChunkCount = computed(() => vectorStatus.value?.incompatibleChunkCount)

const vectorStatusTitle = computed(() => {
  if (vectorStatusError.value) return vectorStatusError.value
  if (loadingVectorStatus.value && !vectorStatus.value) return '正在检查向量库'
  if (vectorStatus.value?.needsReindex) return '存在旧模型或旧维度切片，需要使用当前 embedding 模型重新入库'
  return '索引兼容'
})

const activeUploadItem = computed(() => {
  return uploadItems.value.find(item => item.status === 'uploading') ||
    uploadItems.value.find(item => item.status === 'done') || null
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

function isPhasePassed(currentPhase?: string, checkPhase?: string): boolean {
  if (!currentPhase || !checkPhase) return false
  const currIdx = PHASES_ORDER.indexOf(currentPhase)
  const checkIdx = PHASES_ORDER.indexOf(checkPhase)
  if (currIdx === -1 || checkIdx === -1) return false
  return currIdx >= checkIdx
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['md', 'markdown'].includes(ext)) return '📘'
  if (IMAGE_EXTENSIONS.has(ext)) return '🖼️'
  if (ext === 'pdf') return '📕'
  return '📄'
}

function isImageFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.has(ext)
}

function getFileCompatibility(file: StoredKnowledgeFile) {
  const status = vectorStatus.value
  const targetDim = targetEmbeddingDimension.value
  const currentModel = status?.currentEmbeddingModel

  // 1. 缺少元信息：显示“未知”
  const hasNoMeta = (!file.embeddingModel || file.embeddingModel === 'unknown') && (!file.embeddingDim || file.embeddingDimText === '未知')
  if (hasNoMeta) {
    return {
      isIncompatible: true,
      badgeText: '未知',
      badgeClass: 'tag-unknown',
      dimText: '未知',
    }
  }

  // 2. 存在多种模型或维度：显示“混合”
  const isMixed = file.embeddingModel === 'mixed' || file.embeddingDimText === '混合'
  if (isMixed) {
    return {
      isIncompatible: true,
      badgeText: '混合',
      badgeClass: 'tag-incompatible',
      dimText: '混合',
    }
  }

  const dimText = file.embeddingDimText || (file.embeddingDim ? `${file.embeddingDim}维` : '未知')

  // 3. 当前目标维度未经确认：显示“待确认”
  if (!currentModel || targetDim === null) {
    return {
      isIncompatible: false,
      badgeText: '待确认',
      badgeClass: 'tag-pending',
      dimText,
    }
  }

  // 4. 目标模型与维度均已确认，对比真实值
  const modelMatch = file.embeddingModel === currentModel
  const dimMatch = file.embeddingDim !== null && file.embeddingDim === targetDim

  if (!modelMatch || !dimMatch) {
    return {
      isIncompatible: true,
      badgeText: !modelMatch ? '模型不兼容' : '维度不兼容',
      badgeClass: 'tag-incompatible',
      dimText,
    }
  }

  return {
    isIncompatible: false,
    badgeText: '',
    badgeClass: '',
    dimText,
  }
}

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
  revokeRawImageUrl()
  if (highlightedTarget.value && highlightedTarget.value.fileId !== id) {
    highlightedTarget.value = null
  }
  loadingDetail.value = true
  try {
    fileDetail.value = await getKnowledgeFile(id)
  } catch (error) {
    fileDetail.value = null
    toast.show(error instanceof Error ? error.message : '文件详情加载失败', 'error')
  } finally {
    loadingDetail.value = false
  }

  const file = files.value.find(f => f.id === id)
  if (isStoredImageFile(file)) {
    await loadRawImage(id)
  } else {
    kbView.value = 'doc'
  }
}

async function handleReindex() {
  const confirmed = await confirm({
    title: '同步已有向量索引',
    message: '确定要同步全库已有向量索引吗？此操作仅将本地已计算的切片向量同步至当前向量存储后端，不会重新调用模型计算 embedding。',
    confirmText: '开始同步',
  })
  if (!confirmed) return

  reindexing.value = true
  try {
    const res = await reindexVectorStore()
    if (res.skipped) {
      toast.show('当前后端无需执行索引同步', 'warning')
    } else {
      toast.show(`向量索引同步完成：已处理 ${res.filesIndexed} 个文件，${res.chunksIndexed} 个切片`, 'success')
    }
    await loadKnowledgeOverview()
  } catch (err) {
    toast.show(err instanceof Error ? err.message : '同步向量索引失败', 'error')
  } finally {
    reindexing.value = false
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
        size: file.size,
        phase: 'receiving',
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
        item.message = '准备上传图片，后端视觉模型会识别为 Markdown 后入库'
      }

      const result = await uploadKnowledgeFile(file, {
        onProgress: progress => updateUploadItem(item.id, progress),
      })
      if (result.ok) {
        successCount++
        item.percent = 100
        item.status = 'done'
        item.phase = 'completed'
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
        item.phase = 'failed'
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
  item.phase = progress.phase
  item.message = item.isImage && progress.phase === 'parsing'
    ? progress.message || '正在使用视觉模型解析图片内容'
    : progress.message
  if (progress.done) {
    item.status = progress.error ? 'failed' : 'done'
    if (progress.error) {
      item.phase = 'failed'
    }
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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.show('已复制切片文本', 'success')
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
  const start = performance.now()
  try {
    searchResults.value = await searchKnowledge({
      q,
      topK: clampNumber(topK.value, 1, 20),
      minScore: clampNumber(minScore.value, 0, 1),
      fileId: limitToSelectedFile.value ? selectedFileId.value : undefined,
    })
    searchDuration.value = Math.max(1, Math.round(performance.now() - start))
  } catch (error) {
    searchResults.value = []
    searchError.value = error instanceof Error ? error.message : '检索失败'
  } finally {
    searching.value = false
  }
}

let flashTimer: number | null = null
async function highlightSearchResult(result: KnowledgeSearchResult, rank: number) {
  if (kbView.value === 'vision') {
    kbView.value = 'doc'
  }
  if (result.fileId && selectedFile.value?.id !== result.fileId) {
    await selectFile(result.fileId)
  } else if (result.filename && selectedFile.value?.filename !== result.filename) {
    const match = files.value.find(f => f.filename === result.filename)
    if (match) await selectFile(match.id)
  }

  highlightedTarget.value = {
    fileId: result.fileId || selectedFile.value?.id,
    chunkId: result.id,
    chunkIndex: result.chunkIndex,
    rank,
  }

  await nextTick()
  const targetId = result.id ? `kb-chunk-${result.id}` : `kb-chunk-${result.chunkIndex}`
  const chunkEl = document.getElementById(targetId) || document.getElementById(`kb-chunk-${result.chunkIndex}`)
  if (chunkEl) {
    chunkEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    chunkEl.classList.remove('chunk-flash')
    void chunkEl.offsetWidth
    chunkEl.classList.add('chunk-flash')
    if (flashTimer) window.clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => {
      chunkEl.classList.remove('chunk-flash')
    }, 2400)
  }
}

function renderHighlightedText(text: string, q: string): string {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
  const terms = q.trim().split(/\s+/).filter(t => t.length > 1)
  if (!terms.length) return escaped
  const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const regex = new RegExp(`(${pattern})`, 'gi')
  return escaped.replace(regex, '<mark class="kb-mark">$1</mark>')
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
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 32px 32px;
  font-family: var(--font-sans);
}

.knowledge-bg,
.knowledge-noise {
  display: none;
}

.knowledge-header {
  position: relative;
  z-index: 2;
  height: 60px;
  min-height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(14px);
}

.knowledge-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

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
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0;
}

.knowledge-title p {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.knowledge-actions,
.kb-vector-status-actions,
.kb-detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-primary,
.kb-secondary,
.kb-danger-btn {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.kb-primary {
  border: 1px solid var(--accent-border);
  color: #ffffff;
  background: var(--accent-deep);
  box-shadow: 0 0 14px var(--accent-glow);
}

.kb-primary:hover:not(:disabled) {
  background: var(--accent-deeper);
}

.kb-secondary {
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.kb-secondary:hover:not(:disabled) {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.kb-danger-btn {
  border: 1px solid var(--danger-border);
  color: var(--danger);
  background: var(--danger-bg);
}

.kb-danger-btn:hover:not(:disabled) {
  background: var(--danger-surface);
}

.kb-primary:disabled,
.kb-secondary:disabled,
.kb-danger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 顶部向量库状态横幅 */
.kb-vector-status {
  position: relative;
  z-index: 1;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
}

.kb-vector-status.warning {
  border-bottom-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.08);
}

.kb-vector-status.error {
  border-bottom-color: rgba(248, 113, 113, 0.35);
  background: rgba(239, 68, 68, 0.08);
}

.kb-vector-status-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.kb-vector-status-label {
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  font-size: 11px;
  font-weight: 600;
}

.kb-vector-status strong {
  color: var(--text-primary);
  font-size: 12px;
}

.kb-vector-status-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.kb-vector-status-meta strong {
  color: var(--text-primary);
}

.incompatible-badge {
  color: #f43f5e;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* SSE 6阶段实时上传流水线 (完全对齐 ai_rag.html 原型) */
.kb-sse-pipeline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: #090d16;
  color: #e2e8f0;
  font-size: 11px;
  z-index: 1;
}

.kb-sse-pipeline-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-sse-pill {
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.25);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.45);
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 10px;
}

.kb-sse-filename {
  color: #fbbf24;
  font-weight: 600;
}

.kb-sse-stages {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: #94a3b8;
  font-size: 11px;
}

.kb-sse-arrow {
  color: #475569;
}

.kb-sse-stages .is-done {
  color: #34d399;
}

.kb-sse-stages .is-current {
  color: #ffffff;
  font-weight: 700;
}

.kb-sse-stages .is-pulse {
  background: #f59e0b;
  color: #090d16;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 800;
  animation: pulseGlow 1.5s infinite;
}

@keyframes pulseGlow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 子导航 */
.kb-subnav {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(10px);
}

.kb-subnav button {
  height: 30px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0 12px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.kb-subnav button:hover {
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.kb-subnav button.active {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
  font-weight: 600;
}

/* 上传条 */
.kb-upload-panel {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}

.kb-upload-panel-header {
  min-height: 46px;
  padding: 8px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.kb-upload-panel-header strong {
  display: block;
  font-size: 12px;
}

.kb-upload-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-upload-strip {
  display: flex;
  gap: 8px;
  max-height: 160px;
  padding: 0 20px 14px;
  overflow-x: auto;
}

.kb-upload-item {
  flex: 0 0 260px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
}

.kb-upload-item.done {
  border-color: rgba(34, 197, 94, 0.3);
}

.kb-upload-item.failed {
  border-color: rgba(248, 113, 113, 0.3);
}

.kb-upload-info strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.kb-upload-info span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-upload-note {
  margin-top: 5px;
  padding: 4px 6px;
  border-radius: 4px;
  color: #67e8f9;
  background: rgba(8, 145, 178, 0.12);
  font-size: 10px;
}

.kb-upload-progress {
  display: grid;
  grid-template-columns: 36px 1fr;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 10px;
}

.kb-upload-track {
  height: 4px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--border-subtle);
}

.kb-upload-bar {
  height: 100%;
  border-radius: inherit;
  background: var(--data-accent);
  transition: width 0.2s ease;
}

.kb-upload-preview {
  margin-top: 6px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 6px;
}

.kb-upload-preview-trigger {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 4px 6px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 10px;
}

.kb-upload-preview-trigger em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
}

.kb-upload-preview-trigger strong {
  color: var(--accent);
}

/* 预览弹窗 */
.kb-preview-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.kb-preview-modal {
  width: min(840px, 100%);
  max-height: min(700px, calc(100vh - 40px));
  min-height: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.kb-preview-modal header,
.kb-preview-modal footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-preview-modal header strong {
  font-size: 13px;
}

.kb-preview-close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-preview-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
}

.kb-preview-tabs button {
  height: 26px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 0 8px;
  color: var(--text-muted);
  background: var(--bg-surface-2);
  cursor: pointer;
  font-size: 11px;
}

.kb-preview-tabs button.active {
  border-color: var(--accent-border);
  color: var(--accent-text);
  background: var(--accent-bg);
}

.kb-preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  background: var(--bg-input);
}

.kb-preview-body pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.kb-preview-modal footer {
  border-top: 1px solid var(--border-subtle);
  border-bottom: none;
}

.kb-preview-modal footer > div {
  display: flex;
  gap: 6px;
}

/* 三栏主体网格 */
.knowledge-layout {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 380px;
  gap: 1px;
  background: var(--border-subtle);
}

.kb-panel {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
}

.kb-panel-header {
  min-height: 50px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-eyebrow,
.kb-status {
  display: block;
  color: var(--text-muted);
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 600;
  text-transform: uppercase;
}

.kb-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 14px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
}

.kb-filter input {
  width: 100%;
  border: none;
  outline: none;
  color: var(--text-primary);
  background: transparent;
  font-size: 12px;
}

/* 左侧文件列表项 */
.kb-file-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb-file-item {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.kb-file-item:hover {
  background: var(--bg-surface-2);
}

.kb-file-item.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.kb-file-item.is-incompatible {
  background: rgba(244, 63, 94, 0.05);
}

.kb-file-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.kb-file-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.kb-file-icon {
  flex-shrink: 0;
}

.kb-pill-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.tag-vision {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.tag-incompatible {
  background: rgba(244, 63, 94, 0.15);
  color: #f43f5e;
}

.tag-success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.tag-hybrid {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.kb-file-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-dim-tag {
  color: #10b981;
}

.kb-dim-tag.dim-incompatible {
  color: #f43f5e;
}

/* 中栏顶部元数据条与操作 */
.kb-detail-topbar {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  flex-shrink: 0;
}

.kb-detail-meta-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb-detail-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.kb-detail-filename {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.kb-badge-verified {
  padding: 1px 7px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 600;
}

.kb-detail-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 11px;
}

.kb-detail-stats strong {
  color: var(--text-secondary);
}

/* 视图切换按钮组合 */
.kb-view-toggle {
  display: flex;
  padding: 2px;
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  gap: 2px;
}

.kb-toggle-btn {
  border: none;
  background: transparent;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.kb-toggle-btn:hover {
  color: var(--text-primary);
}

.kb-toggle-btn.active {
  background: var(--bg-surface-2);
  color: var(--accent-text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

/* 中栏：双列切片视图 (对齐 ai_rag.html grid-cols-1 xl:grid-cols-2) */
.kb-chunks-scroll-area,
.kb-vision-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.kb-chunk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
}

.kb-chunk-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.2s ease;
}

.kb-chunk-card:hover {
  border-color: var(--border-hover, var(--accent-border));
}

.kb-chunk-card.is-highlighted {
  border-color: #6366f1;
}

/* 联动高亮动画：2.4s 发光呼吸 */
@keyframes chunkFlash {
  0% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7);
    border-color: #6366f1;
  }
  30% {
    box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.4);
    border-color: #6366f1;
  }
  70% {
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
    border-color: #6366f1;
  }
  100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
    border-color: var(--border-subtle);
  }
}

.chunk-flash {
  animation: chunkFlash 2.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
  border-color: #6366f1 !important;
}

.kb-chunk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 11px;
}

.kb-chunk-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kb-chunk-index {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-deep);
  color: #ffffff;
  font-weight: 700;
}

.kb-chunk-dim {
  color: var(--text-muted);
}

.kb-chunk-chars,
.kb-chunk-page {
  color: var(--text-muted);
}

.kb-chunk-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-hit-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  font-weight: 600;
  font-size: 10px;
}

.kb-chunk-copy-btn {
  border: none;
  background: transparent;
  color: var(--accent-text);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  padding: 0;
}

.kb-chunk-copy-btn:hover {
  text-decoration: underline;
}

.kb-chunk-body {
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  padding: 10px 12px;
}

.kb-chunk-pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
}

/* 中栏：多模态分屏对照 (左原图 vs 右 Ollama 视觉转 Markdown) */
.kb-vision-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: 100%;
}

.kb-vision-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 380px;
}

.kb-vision-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-vision-title {
  font-size: 12px;
  font-weight: 700;
}

.kb-vision-title.text-indigo {
  color: #818cf8;
}

.kb-vision-meta {
  color: var(--text-muted);
  font-size: 11px;
}

.kb-vision-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: #0f172a;
  padding: 20px;
}


.kb-vision-img {
  max-width: 100%;
  max-height: 480px;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.kb-vision-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
  padding: 40px 20px;
  text-align: center;
}

.kb-vision-state.kb-vision-error {
  color: #f43f5e;
}

.kb-vision-markdown-body {
  white-space: pre-wrap;
  word-break: break-word;
}

.kb-arch-svg {
  width: 100%;
  max-width: 420px;
  height: auto;
}

.kb-vision-markdown {
  flex: 1;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  padding: 14px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.kb-vision-md-header {
  font-weight: 700;
  color: #818cf8;
  margin-bottom: 8px;
}

.kb-vision-chunk-texts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-vision-chunk-p {
  margin: 0;
  white-space: pre-wrap;
}

/* 右栏：检索调试器 */
.kb-debugger-header {
  padding: 10px 16px;
}

.kb-debugger-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.kb-debugger-title strong {
  font-size: 13px;
  color: var(--text-primary);
}

.kb-search-form {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb-search-form textarea {
  width: 100%;
  min-height: 72px;
  padding: 8px 10px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.kb-search-form textarea:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
  outline: none;
}

.kb-debugger-params {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.kb-param-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  font-size: 11px;
  color: var(--text-muted);
}

.kb-param-input {
  width: 50px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  text-align: right;
  font-weight: 700;
  font-family: inherit;
}

.kb-debugger-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.kb-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.kb-search-btn {
  padding: 0 14px;
}

/* 检索结果展示 (彻底填满下半截) */
.kb-results-header {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 11px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.kb-results-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb-result-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-result-card:hover {
  border-color: #6366f1;
  background: var(--bg-surface-2);
}

.kb-result-card.is-selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1;
}

.kb-result-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.kb-result-rank {
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-result-rank.rank-top {
  color: #6366f1;
}

.kb-score-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-surface-3);
  color: var(--text-secondary);
  font-size: 11px;
}

.kb-score-badge.score-high {
  background: #6366f1;
  color: #ffffff;
}

/* 3 维分数芯片行 (Score, Vec, FTS5) */
.kb-3d-scores {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  font-size: 10px;
  text-align: center;
}

.kb-3d-score-item.score-total strong { color: #6366f1; }
.kb-3d-score-item.score-vec strong { color: #0284c7; }
.kb-3d-score-item.score-fts strong { color: #059669; }

.kb-result-snippet {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 关键词高亮 (琥珀黄底色) */
:deep(.kb-mark) {
  background-color: rgba(245, 158, 11, 0.25);
  color: inherit;
  padding: 1px 3px;
  border-radius: 3px;
  font-weight: 600;
}

.kb-empty,
.kb-error,
.kb-loading {
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

/* 响应式适配 */
@media (max-width: 1180px) {
  .knowledge-layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .kb-search-panel {
    grid-column: 1 / -1;
    min-height: 280px;
  }

  .kb-vision-container {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .knowledge-header {
    height: auto;
    min-height: 96px;
    padding: 10px 12px;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .knowledge-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .kb-vector-status {
    flex-direction: column;
    align-items: flex-start;
    padding: 8px 12px;
    gap: 6px;
  }

  .kb-vector-status-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .knowledge-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .kb-panel {
    min-height: 320px;
  }

  .kb-search-panel {
    grid-column: auto;
  }

  .kb-chunk-grid {
    grid-template-columns: 1fr;
  }
}
</style>
