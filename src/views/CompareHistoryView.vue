<template>
  <section class="compare-history-view">
    <div class="history-header">
      <div>
        <h2>历史对比</h2>
        <p>{{ historySummaryText }}</p>
      </div>
      <div class="history-actions">
        <button
          type="button"
          class="history-primary"
          :disabled="createDisabled"
          @click="$emit('newComparison')"
        >
          新对比
        </button>
        <button v-if="showBack" type="button" class="history-secondary" @click="$emit('back')">
          返回对比
        </button>
        <button type="button" class="history-secondary" @click="$emit('refresh')">
          刷新
        </button>
      </div>
    </div>

    <div class="history-filters">
      <input
        v-model="historySearch"
        class="history-search"
        type="search"
        placeholder="搜索问题或状态"
      />
      <div class="history-filter-tabs" role="tablist" aria-label="历史筛选">
        <button
          v-for="filter in historyFilters"
          :key="filter.value"
          type="button"
          class="history-filter-tab"
          :class="{ active: historyFilter === filter.value }"
          role="tab"
          :aria-selected="historyFilter === filter.value"
          @click="historyFilter = filter.value"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <div v-if="filteredHistory.length" class="history-list">
      <article
        v-for="item in filteredHistory"
        :key="item.id"
        class="history-item"
        :class="{ active: activeSessionId === item.id }"
      >
        <button type="button" class="history-open" @click="$emit('open', item.id)">
          <span class="history-prompt">{{ item.prompt || '未命名对比' }}</span>
          <span class="history-meta">
            {{ formatDate(item.updatedAt) }} · 模型 {{ item.runCount }} · 成功 {{ item.stats.done }} · 失败 {{ item.stats.error }} · 停止 {{ item.stats.aborted }}
          </span>
        </button>
        <button type="button" class="history-danger" @click="$emit('delete', item.id)">
          删除
        </button>
      </article>
    </div>

    <div v-else class="history-empty">
      没有匹配的对比记录
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ComparisonSessionListItem } from '../services/comparisonPersistence'

type HistoryFilter = 'all' | 'success' | 'failed' | 'with-summary'

const props = defineProps<{
  history: ComparisonSessionListItem[]
  activeSessionId?: string
  showBack?: boolean
  createDisabled?: boolean
}>()

defineEmits<{
  back: []
  newComparison: []
  refresh: []
  open: [sessionId: string]
  delete: [sessionId: string]
}>()

const historySearch = ref('')
const historyFilter = ref<HistoryFilter>('all')
const historyFilters: { label: string; value: HistoryFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '含汇总', value: 'with-summary' },
]

const filteredHistory = computed(() => {
  const query = historySearch.value.trim().toLowerCase()

  return props.history.filter(item => {
    const matchesFilter =
      historyFilter.value === 'all' ||
      (historyFilter.value === 'success' && item.stats.done > 0) ||
      (historyFilter.value === 'failed' && item.stats.error + item.stats.aborted > 0) ||
      (historyFilter.value === 'with-summary' && Boolean(item.summaryRunId))

    if (!matchesFilter) return false
    if (!query) return true

    const searchable = [
      item.prompt,
      item.stats.done ? '成功' : '',
      item.stats.error ? '失败' : '',
      item.stats.aborted ? '停止' : '',
      item.summaryRunId ? '汇总' : '',
    ].join(' ').toLowerCase()
    return searchable.includes(query)
  })
})

const historySummaryText = computed(() => {
  if (props.history.length === 0) return '暂无已保存记录'
  if (filteredHistory.value.length === props.history.length) {
    return `共 ${props.history.length} 条本地记录`
  }
  return `匹配 ${filteredHistory.value.length} / ${props.history.length} 条本地记录`
})

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
</script>

<style scoped>
.compare-history-view {
  --history-line: var(--border);
  --history-line-strong: var(--border-subtle);
  --history-text: var(--text-primary);
  --history-muted: var(--text-secondary);
  --history-soft: var(--bg-surface-2);
  --history-panel: var(--bg-elevated);
  --history-input: var(--bg-input);
  --history-primary: var(--accent-text);
  --history-primary-deep: var(--accent-deep);
  --history-primary-soft: var(--accent-bg);
  --history-scroll-track: var(--bg-surface-2);
  --history-scroll-thumb: var(--scrollbar-thumb);
  --history-danger-text: #fb7185;
  --history-danger-bg: rgba(244, 63, 94, 0.14);
  --history-danger-border: rgba(251, 113, 133, 0.32);
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: auto;
  border: 1px solid var(--history-line);
  border-radius: 8px;
  background: var(--history-panel);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.18);
}

:global([data-theme="light"]) .compare-history-view {
  --history-line: #d8d4eb;
  --history-line-strong: #c5bfe0;
  --history-text: #17162a;
  --history-muted: #76718f;
  --history-soft: #f3f0fb;
  --history-panel: rgba(248, 247, 255, 0.86);
  --history-input: #f5f3ff;
  --history-primary: #6f3fd9;
  --history-primary-deep: #8357e8;
  --history-primary-soft: #ede6ff;
  --history-scroll-track: #f4f1ff;
  --history-scroll-thumb: #b9addf;
  --history-danger-text: #ef6b7b;
  --history-danger-bg: #fff5f7;
  --history-danger-border: #f1bdc6;
  box-shadow: 0 18px 46px rgba(84, 69, 141, 0.14);
}

.compare-history-view,
.compare-history-view * {
  scrollbar-width: thin;
  scrollbar-color: var(--history-scroll-thumb) var(--history-scroll-track);
}

.compare-history-view::-webkit-scrollbar,
.compare-history-view *::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}

.compare-history-view::-webkit-scrollbar-track,
.compare-history-view *::-webkit-scrollbar-track {
  background: var(--history-scroll-track);
  border-radius: 999px;
}

.compare-history-view::-webkit-scrollbar-thumb,
.compare-history-view *::-webkit-scrollbar-thumb {
  border: 2px solid var(--history-scroll-track);
  border-radius: 999px;
  background: var(--history-scroll-thumb);
}

.compare-history-view::-webkit-scrollbar-thumb:hover,
.compare-history-view *::-webkit-scrollbar-thumb:hover {
  background: var(--history-primary);
}

.history-header,
.history-filters,
.history-list,
.history-empty {
  min-width: 0;
}

.history-header {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--history-line);
}

.history-header h2 {
  margin: 0;
  color: var(--history-text);
  font-size: 18px;
  line-height: 1.35;
  letter-spacing: 0;
}

.history-header p {
  margin: 4px 0 0;
  color: var(--history-muted);
  font-size: 13px;
}

.history-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}

.history-primary,
.history-secondary,
.history-danger {
  height: 32px;
  border: 1px solid var(--history-line-strong);
  border-radius: 8px;
  padding: 0 12px;
  background: var(--history-soft);
  color: var(--history-muted);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.history-primary {
  min-width: 104px;
  border-color: transparent;
  background: linear-gradient(135deg, var(--history-primary-deep), var(--accent));
  color: #fff;
  font-weight: 750;
  box-shadow: 0 12px 22px rgba(111, 63, 217, 0.24);
}

.history-primary:hover {
  color: #fff;
}

.history-secondary:hover,
.history-danger:hover {
  border-color: var(--accent-border);
  color: var(--history-primary);
}

.history-primary:disabled,
.history-secondary:disabled,
.history-danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.history-danger {
  color: var(--history-danger-text);
  border-color: var(--history-danger-border);
  background: var(--history-danger-bg);
}

.history-filters {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  align-items: center;
  padding: 14px 14px 10px;
}

.history-search {
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  border: 1px solid var(--history-line-strong);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--history-input);
  color: var(--history-text);
  outline: none;
  font: inherit;
  font-size: 13px;
}

.history-search:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--history-primary-soft);
}

.history-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
}

.history-filter-tab {
  height: 32px;
  border: 1px solid var(--history-line);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--history-soft);
  color: var(--history-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.history-filter-tab.active {
  border-color: var(--accent-border);
  background: var(--history-primary-soft);
  color: var(--history-primary);
}

.history-list {
  min-height: 0;
  overflow: auto;
  padding: 0 14px 14px;
  display: grid;
  align-content: start;
  gap: 10px;
}

.history-item {
  display: grid;
  gap: 10px;
  border: 1px solid var(--history-line);
  border-radius: 8px;
  padding: 12px;
  background: var(--history-soft);
}

.history-item.active {
  border-color: var(--accent-border);
  background: var(--history-primary-soft);
}

.history-open {
  min-width: 0;
  border: 0;
  padding: 0;
  text-align: left;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.history-prompt,
.history-meta {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-prompt {
  color: var(--history-text);
  font-size: 14px;
  line-height: 1.45;
}

.history-meta {
  margin-top: 4px;
  color: var(--history-muted);
  font-size: 12px;
}

.history-empty {
  padding: 36px 16px;
  color: var(--history-muted);
  font-size: 14px;
  text-align: center;
}

@media (max-width: 860px) {
  .compare-history-view {
    min-height: 320px;
  }

  .history-filters,
  .history-item {
    grid-template-columns: 1fr;
  }

  .history-actions,
  .history-filter-tabs {
    justify-content: flex-start;
  }
}

/* Shared violet console tokens */
.compare-history-view,
:global([data-theme="light"]) .compare-history-view {
  --history-line: var(--border-subtle);
  --history-line-strong: var(--border);
  --history-text: var(--text-primary);
  --history-muted: var(--text-secondary);
  --history-soft: var(--bg-surface-2);
  --history-panel: var(--bg-elevated);
  --history-input: var(--bg-input);
  --history-primary: var(--accent-text);
  --history-primary-deep: var(--accent-deep);
  --history-primary-soft: var(--accent-bg);
  --history-scroll-track: transparent;
  --history-scroll-thumb: var(--scrollbar-thumb);
  --history-danger-text: var(--danger);
  --history-danger-bg: var(--danger-bg);
  --history-danger-border: var(--danger-border);
  border-color: var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-sm);
}

.history-header { padding: 14px; }

.history-header h2 {
  font-size: 15px;
  font-weight: 650;
}

.history-header p,
.history-meta {
  font-family: var(--font-mono);
  font-size: 10px;
}

.history-primary,
.history-secondary,
.history-danger,
.history-filter-tab {
  min-height: 36px;
  border-radius: var(--radius-sm);
}

.history-primary {
  border-color: var(--accent-border);
  color: #ffffff;
  background: var(--accent-deep);
  box-shadow: none;
}

.history-search {
  height: 40px;
  border-color: var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
}

.history-search:focus { box-shadow: var(--focus-ring); }

.history-item {
  border-color: var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
}

.history-item.active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

@media (max-width: 820px) {
  .history-primary,
  .history-secondary,
  .history-danger,
  .history-filter-tab {
    min-height: 44px;
  }
}
</style>
