<template>
  <div class="compare-shell">
    <header class="compare-header">
      <div class="compare-title">
        <span class="logo-dot"></span>
        <div>
          <h1>多模型对比</h1>
          <p>{{ isRunning ? '模型正在并发生成' : '内存版，不保存对比记录' }}</p>
        </div>
      </div>
      <button
        type="button"
        class="compare-secondary"
        :disabled="!isRunning"
        @click="stopAll"
      >
        停止全部
      </button>
    </header>

    <main class="compare-main">
      <section class="compare-setup">
        <div class="prompt-panel">
          <label class="field-label" for="comparison-prompt">问题</label>
          <textarea
            id="comparison-prompt"
            v-model="prompt"
            class="prompt-input"
            :disabled="isRunning"
            placeholder="输入要让多个模型同时回答的问题"
          ></textarea>
        </div>

        <div class="runtime-grid">
          <div v-for="(runtime, index) in runtimeDrafts" :key="index" class="runtime-editor">
            <div class="runtime-editor-header">
              <span>模型 {{ index + 1 }}</span>
              <button type="button" class="small-btn" :disabled="isRunning" @click="resetRuntime(index)">
                同步当前设置
              </button>
            </div>

            <label class="field-label">Provider</label>
            <select v-model="runtime.provider" class="field-input" :disabled="isRunning" @change="normalizeRuntime(runtime)">
              <option value="ollama">Ollama</option>
              <option value="openai">OpenAI 兼容</option>
              <option value="claude">Claude</option>
            </select>

            <label class="field-label">Model</label>
            <input v-model="runtime.model" class="field-input" :disabled="isRunning" spellcheck="false" />

            <label class="field-label">Base URL</label>
            <input
              v-model="runtime.baseUrl"
              class="field-input"
              :disabled="isRunning || runtime.provider === 'claude'"
              spellcheck="false"
              placeholder="Claude 不使用此字段"
            />

            <label class="field-label">API Key</label>
            <input
              v-model="runtime.apiKey"
              class="field-input"
              :disabled="isRunning || runtime.provider === 'ollama'"
              type="password"
              spellcheck="false"
              placeholder="本地 Ollama 可留空"
            />
          </div>
        </div>

        <div class="compare-actions">
          <button
            type="button"
            class="compare-primary"
            :disabled="!canStart"
            @click="start"
          >
            开始对比
          </button>
          <button type="button" class="compare-secondary" :disabled="isRunning" @click="resetAllRuntimes">
            重置模型
          </button>
        </div>
      </section>

      <section class="run-grid" :class="{ empty: runs.length === 0 }">
        <div v-if="runs.length === 0" class="compare-empty">
          输入问题并确认两个模型后开始对比。
        </div>
        <ComparisonRunCard
          v-for="run in runs"
          :key="run.id"
          :run="run"
          @stop="stopRun"
          @retry="retryRun"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import ComparisonRunCard from '../components/ComparisonRunCard.vue'
import { useModelComparison } from '../composables/useModelComparison'
import { createRuntimeFromSettings } from '../services/runtime'
import { settings } from '../stores/settings'
import type { ModelRuntimeConfig } from '../types/model'

const prompt = ref('')
const comparison = useModelComparison()
const { runs, isRunning, startComparison, stopRun, stopAll } = comparison

const runtimeDrafts = reactive<ModelRuntimeConfig[]>([
  createRuntimeFromSettings(settings),
  createRuntimeFromSettings(settings),
])

const canStart = computed(() =>
  !isRunning.value &&
  prompt.value.trim().length > 0 &&
  runtimeDrafts.length >= 2 &&
  runtimeDrafts.every(runtime => runtime.model.trim())
)

function cloneRuntime(runtime: ModelRuntimeConfig): ModelRuntimeConfig {
  return {
    provider: runtime.provider,
    label: runtime.label,
    model: runtime.model,
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
    systemPrompt: runtime.systemPrompt,
    maxContextTokens: runtime.maxContextTokens,
  }
}

function normalizeRuntime(runtime: ModelRuntimeConfig): void {
  if (runtime.provider === 'ollama') {
    runtime.baseUrl = runtime.baseUrl || settings.ollama.url
    runtime.apiKey = undefined
    runtime.model = runtime.model || settings.ollama.model
  } else if (runtime.provider === 'openai') {
    runtime.baseUrl = runtime.baseUrl || settings.openai.baseUrl
    runtime.apiKey = runtime.apiKey ?? settings.openai.apiKey
    runtime.model = runtime.model || settings.openai.model
  } else {
    runtime.baseUrl = undefined
    runtime.apiKey = runtime.apiKey ?? settings.claude.apiKey
    runtime.model = runtime.model || settings.claude.model
  }
  runtime.systemPrompt = settings.systemPrompt
  runtime.maxContextTokens = settings.maxContextTokens
  runtime.label = `${runtime.provider} - ${runtime.model}`
}

function resetRuntime(index: number): void {
  runtimeDrafts[index] = createRuntimeFromSettings(settings)
}

function resetAllRuntimes(): void {
  resetRuntime(0)
  resetRuntime(1)
}

async function start(): Promise<void> {
  if (!canStart.value) return
  const runtimes = runtimeDrafts.map(runtime => {
    normalizeRuntime(runtime)
    return cloneRuntime(runtime)
  })
  await startComparison({ prompt: prompt.value.trim(), runtimes })
}

async function retryRun(runId: string): Promise<void> {
  await comparison.retryRun(runId)
}
</script>

<style scoped>
.compare-shell {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.compare-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
  backdrop-filter: blur(24px);
}

.compare-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.compare-title h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: 17px;
  line-height: 1.3;
  letter-spacing: 0;
}

.compare-title p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 12px;
}

.logo-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 14px var(--accent);
  flex-shrink: 0;
}

.compare-main {
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.compare-setup {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
}

.prompt-panel {
  max-width: 1180px;
  margin: 0 auto 14px;
}

.field-label {
  display: block;
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}

.prompt-input,
.field-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--settings-input-bg);
  color: var(--text-primary);
  outline: none;
  font: inherit;
  font-size: 13px;
}

.field-input {
  color-scheme: inherit;
}

select.field-input {
  appearance: none;
  cursor: pointer;
  background-color: var(--settings-input-bg);
  background-image: linear-gradient(45deg, transparent 50%, var(--text-muted) 50%),
    linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);
  background-position: calc(100% - 17px) 14px, calc(100% - 11px) 14px;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-right: 34px;
}

select.field-input option {
  background: var(--settings-select-bg);
  color: var(--text-primary);
}

.prompt-input {
  min-height: 92px;
  resize: vertical;
  padding: 12px;
  line-height: 1.55;
}

.field-input {
  height: 34px;
  padding: 0 10px;
  margin-bottom: 10px;
}

.prompt-input:focus,
.field-input:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.runtime-grid {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.runtime-editor {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-surface-2);
}

.runtime-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.compare-actions {
  max-width: 1180px;
  margin: 14px auto 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.compare-primary,
.compare-secondary,
.small-btn {
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
}

.compare-primary {
  height: 38px;
  padding: 0 18px;
  border-color: var(--accent-border);
  color: #fff;
  background: linear-gradient(135deg, var(--accent-deep), var(--accent-deeper));
}

.compare-secondary,
.small-btn {
  height: 34px;
  padding: 0 12px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
}

.small-btn {
  height: 28px;
  font-size: 12px;
}

button:disabled,
input:disabled,
select:disabled,
textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.run-grid {
  min-height: 0;
  overflow: auto;
  padding: 18px 24px 24px;
  display: grid;
  grid-template-columns: repeat(2, minmax(280px, 1fr));
  gap: 14px;
}

.run-grid.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.compare-empty {
  color: var(--text-faint);
  font-size: 14px;
}

@media (max-width: 860px) {
  .compare-header {
    height: auto;
    min-height: 58px;
    padding: 10px 14px;
  }

  .compare-setup {
    padding: 14px;
  }

  .runtime-grid,
  .run-grid {
    grid-template-columns: 1fr;
  }

  .run-grid {
    padding: 14px;
  }

  .compare-actions {
    justify-content: stretch;
  }

  .compare-primary,
  .compare-secondary {
    flex: 1;
  }
}
</style>
