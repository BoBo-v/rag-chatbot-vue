<template>
  <section class="compare-history-view">
    <div class="history-header">
      <div>
        <h2>历史对比</h2>
        <p>{{ historySummaryText }}</p>
      </div>
      <div class="history-actions">
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
}>()

defineEmits<{
  back: []
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
  --history-line: #d8d4eb;
  --history-line-strong: #c5bfe0;
  --history-text: #17162a;
  --history-muted: #76718f;
  --history-soft: #f3f0fb;
  --history-primary: #6f3fd9;
  --history-primary-soft: #ede6ff;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: auto;
  border: 1px solid var(--history-line);
  border-radius: 8px;
  background: rgba(248, 247, 255, 0.86);
  box-shadow: 0 18px 46px rgba(84, 69, 141, 0.14);
}

.compare-history-view,
.compare-history-view * {
  scrollbar-width: thin;
  scrollbar-color: #b9addf #f4f1ff;
}

.compare-history-view::-webkit-scrollbar,
.compare-history-view *::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}

.compare-history-view::-webkit-scrollbar-track,
.compare-history-view *::-webkit-scrollbar-track {
  background: #f4f1ff;
  border-radius: 999px;
}

.compare-history-view::-webkit-scrollbar-thumb,
.compare-history-view *::-webkit-scrollbar-thumb {
  border: 2px solid #f4f1ff;
  border-radius: 999px;
  background: #b9addf;
}

.compare-history-view::-webkit-scrollbar-thumb:hover,
.compare-history-view *::-webkit-scrollbar-thumb:hover {
  background: #9f8ed4;
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

.history-secondary,
.history-danger {
  height: 32px;
  border: 1px solid var(--history-line-strong);
  border-radius: 8px;
  padding: 0 12px;
  background: #f8f6ff;
  color: #3b3752;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.history-secondary:hover,
.history-danger:hover {
  border-color: var(--accent-border);
  color: var(--history-primary);
}

.history-danger {
  color: #ef6b7b;
  border-color: #f1bdc6;
  background: #fff5f7;
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
  background: #f5f3ff;
  color: var(--history-text);
  outline: none;
  font: inherit;
  font-size: 13px;
}

.history-search:focus {
  border-color: #a897df;
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
  background: #f6f4ff;
  color: var(--history-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.history-filter-tab.active {
  border-color: #bdaaf2;
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
  border-color: #bdaaf2;
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
</style>
