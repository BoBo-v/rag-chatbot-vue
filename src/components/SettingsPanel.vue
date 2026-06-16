<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="$emit('close')">
      <div class="settings-panel">

        <!-- 标题栏 -->
        <div class="settings-header">
          <span class="settings-title">设置</span>
          <button class="settings-close" @click="$emit('close')">✕</button>
        </div>

        <div class="settings-body">

          <!-- ── 外观主题 ── -->
          <div class="settings-group">
            <label class="settings-label">外观</label>
            <div class="theme-switcher">
              <button
                v-for="t in themes"
                :key="t.value"
                class="theme-btn"
                :class="{ active: settings.theme === t.value }"
                @click="settings.theme = t.value"
              >
                {{ t.icon }} {{ t.label }}
              </button>
            </div>
            <span class="settings-hint">更改立即生效，无需保存</span>
          </div>

          <div class="settings-divider"></div>

          <div class="settings-group">
            <label class="settings-label">连接方式</label>
            <div class="rag-mode-tabs">
              <button
                v-for="mode in connectionModes"
                :key="mode.value"
                class="rag-mode-btn"
                :class="{ active: draft.transport === mode.value }"
                type="button"
                @click="draft.transport = mode.value"
              >
                {{ mode.label }}
              </button>
            </div>
            <span class="settings-hint">{{ activeConnectionModeHint }}</span>
          </div>

          <div v-if="draft.transport === 'backend'" class="settings-group">
            <div class="settings-label-row">
              <label class="settings-label">后端代理模型</label>
              <button class="btn-refresh" :class="{ loading: loadingBackendProviders }" @click="loadBackendProviders">
                {{ loadingBackendProviders ? '获取中...' : '刷新厂商' }}
              </button>
            </div>
            <select v-model="draft.backend.provider" class="settings-input settings-select" @change="applyBackendDefaultModel">
              <option
                v-for="provider in backendProviders"
                :key="provider.id"
                :value="provider.id"
              >
                {{ provider.name }}
              </option>
            </select>
            <input
              v-model="draft.backend.model"
              class="settings-input"
              placeholder="使用厂商默认模型或手动输入"
              spellcheck="false"
              autocomplete="off"
            />
            <span v-if="backendProviderError" class="settings-hint error">{{ backendProviderError }}</span>
            <span v-else class="settings-hint">后端代理会统一请求 /api/chat，API Key 和厂商路由由后端管理。</span>
          </div>

          <div class="settings-group">
            <div class="settings-label-row">
              <label class="settings-label">知识库 RAG</label>
            </div>
            <div class="rag-mode-tabs" :class="{ disabled: draft.transport !== 'backend' }">
              <button
                v-for="mode in ragModes"
                :key="mode.value"
                class="rag-mode-btn"
                :class="{ active: draft.ragMode === mode.value }"
                :disabled="draft.transport !== 'backend'"
                type="button"
                @click="draft.ragMode = mode.value"
              >
                {{ mode.label }}
              </button>
            </div>
            <span class="settings-hint">
              {{ draft.transport === 'backend' ? activeRagModeHint : 'RAG 依赖后端知识库检索，只在后端代理模式下可用。' }}
            </span>
          </div>

          <div class="settings-divider"></div>

          <!-- Provider 选择标签 -->
          <div class="provider-tabs">
            <button
              v-for="p in providers"
              :key="p.value"
              class="provider-tab"
              :class="{ active: draft.provider === p.value }"
              @click="draft.provider = p.value"
            >
              <span class="tab-icon">{{ p.icon }}</span>
              {{ p.label }}
            </button>
          </div>

          <!-- ── Ollama ── -->
          <template v-if="draft.provider === 'ollama'">
            <div class="settings-group">
              <label class="settings-label">服务地址</label>
              <input
v-model="draft.ollama.url" class="settings-input"
                placeholder="http://localhost:11434" spellcheck="false" />
            </div>
            <div class="settings-group">
              <div class="settings-label-row">
                <label class="settings-label">模型</label>
                <button class="btn-refresh" :class="{ loading: loadingModels }" @click="loadModels">
                  {{ loadingModels ? '获取中...' : '刷新列表' }}
                </button>
              </div>
              <input
v-model="draft.ollama.model" class="settings-input"
                list="ollama-models" placeholder="例如：qwen2.5:7b" spellcheck="false" autocomplete="off" />
              <datalist id="ollama-models">
                <option v-for="m in modelList" :key="m" :value="m" />
              </datalist>
              <span v-if="modelError" class="settings-hint error">{{ modelError }}</span>
              <span v-else class="settings-hint">支持下拉选择或手动输入模型名称</span>
            </div>
          </template>

          <!-- ── OpenAI 兼容 ── -->
          <template v-else-if="draft.provider === 'openai'">
            <div class="settings-group">
              <label class="settings-label">API Key</label>
              <input
v-model="draft.openai.apiKey" class="settings-input"
                type="password" placeholder="sk-..." spellcheck="false" />
            </div>
            <div class="settings-group">
              <label class="settings-label">Base URL</label>
              <input
v-model="draft.openai.baseUrl" class="settings-input"
                placeholder="https://api.openai.com" spellcheck="false" />
              <span class="settings-hint">DeepSeek: https://api.deepseek.com &nbsp;|&nbsp; Kimi: https://api.moonshot.cn &nbsp;|&nbsp; 通义: https://dashscope.aliyuncs.com/compatible-mode</span>
            </div>
            <div class="settings-group">
              <div class="settings-label-row">
                <label class="settings-label">模型</label>
                <button class="btn-refresh" :class="{ loading: loadingModels }" @click="loadModels">
                  {{ loadingModels ? '获取中...' : '刷新列表' }}
                </button>
              </div>
              <input
v-model="draft.openai.model" class="settings-input"
                list="openai-models" placeholder="gpt-4o / deepseek-chat / moonshot-v1-8k ..." spellcheck="false" autocomplete="off" />
              <datalist id="openai-models">
                <option v-for="m in modelList" :key="m" :value="m" />
              </datalist>
              <span v-if="modelError" class="settings-hint error">{{ modelError }}</span>
            </div>
          </template>

          <!-- ── Claude ── -->
          <template v-else-if="draft.provider === 'claude'">
            <div class="settings-group">
              <label class="settings-label">API Key</label>
              <input
v-model="draft.claude.apiKey" class="settings-input"
                type="password" placeholder="sk-ant-..." spellcheck="false" />
              <span class="settings-hint">
                ⚠ 浏览器直接调用 Claude API 需后端代理或允许跨域，否则请求会被拦截
              </span>
            </div>
            <div class="settings-group">
              <label class="settings-label">模型</label>
              <input
v-model="draft.claude.model" class="settings-input"
                list="claude-models" placeholder="claude-sonnet-4-6" spellcheck="false" autocomplete="off" />
              <datalist id="claude-models">
                <option v-for="m in claudeModels" :key="m" :value="m" />
              </datalist>
            </div>
          </template>

          <!-- ── 通用设置（所有 provider 共享） ── -->
          <div class="settings-divider"></div>

          <div class="settings-group">
            <div class="settings-label-row">
              <label class="settings-label">顶栏显示模型</label>
              <label class="settings-toggle">
                <input v-model="draft.showModelInTopbar" type="checkbox" />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>
            <span class="settings-hint">在标题旁显示当前使用的模型名称</span>
          </div>

          <div class="settings-group">
            <div class="settings-label-row">
              <label class="settings-label">首个响应超时</label>
              <span class="settings-token-val">{{ draft.responseTimeoutSeconds }} 秒</span>
            </div>
            <input
v-model.number="draft.responseTimeoutSeconds"
              class="settings-input" type="number" min="5" max="300" step="5" />
            <span class="settings-hint">等待模型返回第一段内容的最长时间，收到首个片段后流式阶段不限时</span>
          </div>

          <div class="settings-group">
            <label class="settings-label">系统提示词</label>
            <textarea
v-model="draft.systemPrompt"
              class="settings-input settings-textarea" rows="4"
              placeholder="输入系统提示词..."></textarea>
          </div>

          <div class="settings-group">
            <div class="settings-label-row">
              <label class="settings-label">上下文长度（Token 估算上限）</label>
              <span class="settings-token-val">{{ contextTokenLabel }}</span>
            </div>
            <div class="context-presets">
              <button
v-for="(tier, idx) in contextTiers" :key="tier.label"
                class="context-preset-btn"
                :class="{ active: activeTierIndex === idx }"
                @click="selectTier(idx)"
              >{{ tier.label }}</button>
            </div>
            <input
v-if="activeTier.max !== UNLIMITED"
              v-model.number="draft.maxContextTokens" class="settings-slider"
              type="range" :min="activeTier.min" :max="activeTier.max"
              :step="activeTier.step" />
            <div v-if="activeTier.max !== UNLIMITED" class="settings-slider-labels">
              <span>{{ activeTier.min >= 1000 ? (activeTier.min / 1000) + 'K' : activeTier.min }}</span>
              <span>{{ activeTier.max >= 1000000 ? (activeTier.max / 1000000) + 'M' : (activeTier.max / 1000) + 'K' }}</span>
            </div>
          </div>

        </div>

        <div class="settings-footer">
          <button class="btn-cancel" @click="$emit('close')">取消</button>
          <button class="btn-save" @click="save">保存</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch, computed } from 'vue'
import { settings } from '../stores/settings'
import { fetchModels } from '../services/stream'
import { getClaudeModels } from '../services/providers/claude'
import { fetchBackendChatProviders, type BackendChatProvider } from '../services/knowledge'
import type { BackendRagMode, ProviderType, ThemeType, TransportMode } from '../stores/settings'

const emit = defineEmits<{ close: [] }>()

// SettingsPanel edits a local draft first.
// The global settings object is updated only when the user clicks Save.

const UNLIMITED = 1100000

// Context presets shown as buttons in the settings panel.
// UNLIMITED is a sentinel value meaning "do not actively trim context".
const contextTiers = [
  { label: '8K',    max: 8000,    min: 500,    step: 500 },
  { label: '32K',   max: 32000,   min: 1000,   step: 1000 },
  { label: '128K',  max: 128000,  min: 2000,   step: 2000 },
  { label: '256K',  max: 256000,  min: 4000,   step: 4000 },
  { label: '1M',    max: 1000000, min: 10000,  step: 10000 },
  { label: '无限制', max: UNLIMITED, min: UNLIMITED, step: 1 },
]

function findTierIndex(value: number): number {
  // Convert a numeric maxContextTokens value back into the active preset index.
  if (value >= UNLIMITED) return contextTiers.length - 1
  for (let i = contextTiers.length - 2; i >= 0; i--) {
    if (value <= contextTiers[i].max) return i
  }
  return 0
}

const themes: { value: ThemeType; label: string; icon: string }[] = [
  { value: 'dark',   label: '暗色', icon: '🌙' },
  { value: 'light',  label: '亮色', icon: '☀️' },
  { value: 'system', label: '跟随系统', icon: '💻' },
]

const providers: { value: ProviderType; label: string; icon: string }[] = [
  { value: 'ollama',  label: 'Ollama',       icon: '🦙' },
  { value: 'openai',  label: 'OpenAI 兼容',   icon: '⚡' },
  { value: 'claude',  label: 'Claude',        icon: '✦' },
]

const connectionModes: { value: TransportMode; label: string; hint: string }[] = [
  { value: 'direct', label: '浏览器直连', hint: '前端直接请求当前模型厂商；配置保存在本地，RAG 不可用。' },
  { value: 'backend', label: '后端代理', hint: '前端统一请求 /api/chat；后端管理厂商路由、鉴权和知识库 RAG。' },
]

const ragModes: { value: BackendRagMode; label: string; hint: string }[] = [
  { value: 'auto', label: '自动', hint: '发送 rag:auto，由后端按问题和命中分数自动判断是否检索。' },
  { value: 'off', label: '关闭', hint: '发送 rag:false，后端直接推理，不检索知识库。' },
  { value: 'force', label: '强制', hint: '发送 rag:true，后端强制检索，命中后注入资料。' },
]

const claudeModels = getClaudeModels()

// 编辑草稿，保存前不改动 settings
const draft = reactive({
  ...settings,
  backend: { ...settings.backend },
  ollama:  { ...settings.ollama },
  openai:  { ...settings.openai },
  claude:  { ...settings.claude },
})

const activeTierIndex = ref(findTierIndex(draft.maxContextTokens))
const activeTier = computed(() => contextTiers[activeTierIndex.value])
const activeRagModeHint = computed(() =>
  ragModes.find(mode => mode.value === draft.ragMode)?.hint ?? ragModes[0].hint
)
const activeConnectionModeHint = computed(() =>
  connectionModes.find(mode => mode.value === draft.transport)?.hint ?? connectionModes[0].hint
)

function selectTier(index: number) {
  // Clicking a preset updates both the active preset and the actual numeric setting.
  activeTierIndex.value = index
  const tier = contextTiers[index]
  if (tier.max === UNLIMITED) {
    draft.maxContextTokens = UNLIMITED
  } else {
    draft.maxContextTokens = Math.min(Math.max(draft.maxContextTokens, tier.min), tier.max)
  }
}

const contextTokenLabel = computed(() => {
  const v = draft.maxContextTokens
  if (v >= UNLIMITED) return '无限制'
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return Math.round(v / 1000) + 'K'
  return String(v)
})

const modelList    = ref<string[]>([])
const loadingModels = ref(false)
const modelError   = ref('')
const backendProviders = ref<BackendChatProvider[]>([])
const loadingBackendProviders = ref(false)
const backendProviderError = ref('')

async function loadModels() {
  // fetchModels reads from global settings, so this function temporarily applies the draft provider config,
  // fetches the list, and then restores the previous global settings.
  loadingModels.value = true
  modelError.value = ''
  modelList.value = []

  // 用草稿里的配置临时覆盖 settings 来 fetch，fetch 完再恢复
  const prevProvider = settings.provider
  const prevTransport = settings.transport
  const prevConfig   = { ...settings[draft.provider as 'ollama' | 'openai'] }

  Object.assign(settings, { provider: draft.provider, transport: 'direct' })
  Object.assign(settings[draft.provider as 'ollama' | 'openai'], draft[draft.provider as 'ollama' | 'openai'])

  const list = await fetchModels()

  Object.assign(settings, { provider: prevProvider, transport: prevTransport })
  Object.assign(settings[draft.provider as 'ollama' | 'openai'], prevConfig)

  if (list.length === 0) {
    modelError.value = '未能获取模型列表，请检查地址或 Key 是否正确'
  } else {
    modelList.value = list
    const currentModel = draft.provider === 'openai' ? draft.openai.model : draft.ollama.model
    if (!list.includes(currentModel)) {
      if (draft.provider === 'openai') draft.openai.model = list[0]
      else draft.ollama.model = list[0]
    }
  }
  loadingModels.value = false
}

// 切换 provider 时重置并自动拉取模型列表
watch(() => draft.provider, () => {
  modelList.value = []
  modelError.value = ''
  if (draft.provider !== 'claude') loadModels()
})

// 打开面板时自动拉取
if (draft.provider !== 'claude') loadModels()
loadBackendProviders()

async function loadBackendProviders() {
  loadingBackendProviders.value = true
  backendProviderError.value = ''
  try {
    backendProviders.value = await fetchBackendChatProviders()
    if (backendProviders.value.length === 0) {
      backendProviderError.value = '后端没有可用厂商，请检查 /api/providers 配置'
      return
    }
    if (!backendProviders.value.some(provider => provider.id === draft.backend.provider)) {
      draft.backend.provider = backendProviders.value[0].id
      draft.backend.model = backendProviders.value[0].defaultModel
    } else if (!draft.backend.model) {
      applyBackendDefaultModel()
    }
  } catch (error) {
    backendProviderError.value = error instanceof Error ? error.message : '后端厂商列表获取失败'
  } finally {
    loadingBackendProviders.value = false
  }
}

function applyBackendDefaultModel() {
  const provider = backendProviders.value.find(item => item.id === draft.backend.provider)
  if (provider) {
    draft.backend.model = provider.defaultModel
  }
}

function save() {
  draft.responseTimeoutSeconds = normalizeTimeout(draft.responseTimeoutSeconds)
  if (!draft.backend.model) {
    const provider = backendProviders.value.find(item => item.id === draft.backend.provider)
    draft.backend.model = provider?.defaultModel ?? draft.ollama.model
  }
  // Copy draft values back to global settings. The settings store persists them to localStorage.
  Object.assign(settings, {
    transport:         draft.transport,
    provider:          draft.provider,
    ragMode:           draft.ragMode,
    systemPrompt:      draft.systemPrompt,
    maxContextTokens:  draft.maxContextTokens,
    responseTimeoutSeconds: draft.responseTimeoutSeconds,
    showModelInTopbar: draft.showModelInTopbar,
  })
  Object.assign(settings.backend, draft.backend)
  Object.assign(settings.ollama,  draft.ollama)
  Object.assign(settings.openai,  draft.openai)
  Object.assign(settings.claude,  draft.claude)
  emit('close')
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value)) return 30
  return Math.min(300, Math.max(5, Math.round(value)))
}
</script>
