<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="cancelChanges">
      <div class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-header">
          <div class="settings-heading">
            <span class="settings-eyebrow">WORKSPACE</span>
            <span id="settings-title" class="settings-title">设置</span>
          </div>
          <button type="button" class="settings-close" aria-label="关闭设置" @click="cancelChanges">
            <X :size="19" aria-hidden="true" />
          </button>
        </header>

        <div class="settings-mobile-tabs" role="tablist" aria-label="设置分组">
          <button
            v-for="section in sections"
            :key="section.id"
            type="button"
            class="settings-mobile-tab"
            :class="{ active: activeSection === section.id }"
            role="tab"
            :aria-selected="activeSection === section.id"
            @click="activeSection = section.id"
          >
            <component :is="section.icon" :size="15" aria-hidden="true" />
            <span>{{ section.label }}</span>
          </button>
        </div>

        <div class="settings-layout">
          <aside class="settings-nav" aria-label="设置分组导航">
            <div class="settings-nav-title">设置中心</div>
            <button
              v-for="section in sections"
              :key="section.id"
              type="button"
              class="settings-nav-item"
              :class="{ active: activeSection === section.id }"
              :aria-current="activeSection === section.id ? 'page' : undefined"
              @click="activeSection = section.id"
            >
              <component :is="section.icon" :size="17" aria-hidden="true" />
              <span>{{ section.label }}</span>
              <ChevronRight v-if="activeSection === section.id" :size="15" aria-hidden="true" />
            </button>
            <div class="settings-nav-note"><span class="settings-nav-dot"></span><span>配置保存在此设备</span></div>
          </aside>

          <main ref="contentRef" class="settings-content" tabindex="-1">
            <section v-show="activeSection === 'general'" class="settings-section" aria-labelledby="section-general">
              <div class="section-heading">
                <div><span class="section-kicker">GENERAL</span><h2 id="section-general">常规</h2><p>管理工作区的基础连接方式。</p></div>
              </div>
              <div class="settings-field">
                <div class="field-copy"><label class="settings-label">连接方式</label><span class="settings-hint">选择浏览器直连或使用后端统一代理。</span></div>
                <div class="segmented-control two-up" role="group" aria-label="连接方式">
                  <button v-for="mode in connectionModes" :key="mode.value" type="button" class="segmented-option" :class="{ active: draft.transport === mode.value }" :aria-pressed="draft.transport === mode.value" @click="draft.transport = mode.value">{{ mode.label }}</button>
                </div>
                <span class="settings-hint">{{ activeConnectionModeHint }}</span>
              </div>
              <div class="settings-info-card"><Settings2 :size="17" aria-hidden="true" /><div><strong>当前服务</strong><span>{{ providerLabel }} · {{ currentModelLabel }}</span></div></div>
            </section>

            <section v-show="activeSection === 'ai'" class="settings-section" aria-labelledby="section-ai">
              <div class="section-heading">
                <div><span class="section-kicker">AI SERVICE</span><h2 id="section-ai">AI 服务</h2><p>选择服务类型并配置当前服务需要的连接信息。</p></div>
                <div class="connection-status" :class="`status-${connectionState}`" role="status" aria-live="polite">
                  <LoaderCircle v-if="connectionState === 'loading'" class="status-icon spinning" :size="15" aria-hidden="true" />
                  <CheckCircle2 v-else-if="connectionState === 'success'" class="status-icon" :size="15" aria-hidden="true" />
                  <AlertCircle v-else-if="connectionState === 'error'" class="status-icon" :size="15" aria-hidden="true" />
                  <span class="status-dot" aria-hidden="true"></span><span>{{ connectionStatusLabel }}</span>
                </div>
              </div>

              <div class="provider-tabs" role="tablist" aria-label="服务类型">
                <button v-for="provider in providers" :key="provider.value" type="button" class="provider-tab" :class="{ active: draft.provider === provider.value }" role="tab" :aria-selected="draft.provider === provider.value" @click="draft.provider = provider.value">
                  <Bot v-if="provider.value === 'ollama'" :size="17" aria-hidden="true" /><Waypoints v-else-if="provider.value === 'openai'" :size="17" aria-hidden="true" /><Sparkles v-else :size="17" aria-hidden="true" /><span>{{ provider.label }}</span>
                </button>
              </div>

              <div class="settings-field-grid">
                <div v-if="draft.provider === 'ollama'" class="settings-field">
                  <label for="ollama-url" class="settings-label">服务地址</label>
                  <input id="ollama-url" v-model="draft.ollama.url" class="settings-input" placeholder="http://localhost:11434" spellcheck="false" />
                  <span class="settings-hint">Ollama 的本地或局域网服务地址。</span>
                </div>
                <div v-else-if="draft.provider === 'openai'" class="settings-field">
                  <label for="openai-url" class="settings-label">服务地址</label>
                  <input id="openai-url" v-model="draft.openai.baseUrl" class="settings-input" placeholder="https://api.openai.com" spellcheck="false" />
                  <span class="settings-hint">支持 OpenAI 兼容接口，例如 DeepSeek、Kimi 和通义。</span>
                </div>
                <div v-else class="settings-field">
                  <label class="settings-label">服务地址</label>
                  <div class="settings-readonly">Anthropic API <span>由 Claude 服务管理</span></div>
                  <span class="settings-hint">浏览器直连需要服务端允许跨域；也可以通过后端代理访问。</span>
                </div>
                <div v-if="draft.provider === 'openai' || draft.provider === 'claude'" class="settings-field">
                  <label :for="`${draft.provider}-api-key`" class="settings-label">API Key</label>
                  <input :id="`${draft.provider}-api-key`" v-model="draft[draft.provider].apiKey" class="settings-input" type="password" :placeholder="draft.provider === 'openai' ? 'sk-...' : 'sk-ant-...'" spellcheck="false" autocomplete="off" />
                  <span class="settings-hint">仅保存在本地设置中。</span>
                </div>
              </div>

              <div class="settings-field model-field">
                <div class="field-label-row"><label :for="`${draft.provider}-model`" class="settings-label">默认模型</label><button type="button" class="btn-refresh" :disabled="loadingModels" :class="{ loading: loadingModels }" @click="loadModels()"><RefreshCw :size="14" :class="{ spinning: loadingModels }" aria-hidden="true" /><span>{{ loadingModels ? '加载中…' : '刷新模型列表' }}</span></button></div>
                <input v-if="draft.provider === 'ollama'" id="ollama-model" v-model="draft.ollama.model" class="settings-input" list="ollama-models" placeholder="例如：qwen2.5:7b" spellcheck="false" autocomplete="off" />
                <input v-else-if="draft.provider === 'openai'" id="openai-model" v-model="draft.openai.model" class="settings-input" list="openai-models" placeholder="gpt-4o / deepseek-chat / moonshot-v1-8k" spellcheck="false" autocomplete="off" />
                <input v-else id="claude-model" v-model="draft.claude.model" class="settings-input" list="claude-models" placeholder="claude-sonnet-4-6" spellcheck="false" autocomplete="off" />
                <datalist id="ollama-models"><option v-for="model in modelList" :key="model" :value="model" /></datalist>
                <datalist id="openai-models"><option v-for="model in modelList" :key="model" :value="model" /></datalist>
                <datalist id="claude-models"><option v-for="model in claudeModels" :key="model" :value="model" /></datalist>
                <div v-if="modelError" class="settings-error-card" role="alert"><AlertCircle :size="17" aria-hidden="true" /><span>{{ modelError }}</span><button type="button" class="error-retry" :disabled="loadingModels" @click="loadModels()">重试</button></div>
                <span v-else class="settings-hint">可从服务读取模型列表，也可以手动输入模型名称。</span>
              </div>
              <div class="action-row"><button type="button" class="secondary-action" :disabled="connectionState === 'loading'" @click="testConnection"><TestTube2 :size="15" aria-hidden="true" /><span>{{ connectionState === 'loading' ? '连接中…' : '测试连接' }}</span></button><span class="settings-hint action-hint">{{ connectionHint }}</span></div>
            </section>

            <section v-show="activeSection === 'model'" class="settings-section" aria-labelledby="section-model">
              <div class="section-heading"><div><span class="section-kicker">MODEL PARAMETERS</span><h2 id="section-model">模型参数</h2><p>控制当前模型的响应等待时间和上下文容量。</p></div><div class="model-chip"><Bot :size="15" aria-hidden="true" /><span>{{ currentModelLabel }}</span></div></div>
              <div class="settings-field-grid two-columns">
                <div class="settings-field"><div class="field-label-row"><label for="response-timeout" class="settings-label">单个响应超时</label><span class="settings-value">{{ draft.responseTimeoutSeconds }} 秒</span></div><input id="response-timeout" v-model.number="draft.responseTimeoutSeconds" class="settings-input" type="number" min="5" step="5" /><span class="settings-hint">等待模型返回首个片段的最长时间。</span></div>
                <div class="settings-field"><div class="field-label-row"><label class="settings-label">顶栏显示模型</label><label class="settings-toggle" aria-label="顶栏显示模型"><input v-model="draft.showModelInTopbar" type="checkbox" /><span class="toggle-track"><span class="toggle-thumb"></span></span></label></div><span class="settings-hint">在主界面标题旁显示当前模型名称。</span></div>
              </div>
              <div class="settings-field context-field"><div class="field-label-row"><div><label class="settings-label">上下文长度</label><span class="settings-hint field-subtitle">Token 估算上限</span></div><span class="settings-value">{{ contextTokenLabel }}</span></div><div class="context-presets"><button v-for="(tier, index) in contextTiers" :key="tier.label" type="button" class="context-preset-btn" :class="{ active: activeTierIndex === index }" :aria-pressed="activeTierIndex === index" @click="selectTier(index)">{{ tier.label }}</button></div><input v-if="activeTier.max !== UNLIMITED" :key="activeTierIndex" v-model.number="draft.maxContextTokens" class="settings-slider" type="range" :min="activeTier.min" :max="activeTier.max" :step="activeTier.step" aria-label="上下文长度" /><div v-if="activeTier.max !== UNLIMITED" class="settings-slider-labels"><span>{{ formatTokenLimit(activeTier.min) }}</span><span>{{ formatTokenLimit(activeTier.max) }}</span></div></div>
            </section>

            <section v-show="activeSection === 'prompt'" class="settings-section" aria-labelledby="section-prompt">
              <div class="section-heading"><div><span class="section-kicker">SYSTEM PROMPT</span><h2 id="section-prompt">系统提示词</h2><p>定义助手在新对话中的角色、语气与约束。</p></div><span class="prompt-badge">新对话生效</span></div>
              <div class="prompt-editor"><textarea v-model="draft.systemPrompt" class="settings-textarea" rows="8" placeholder="输入系统提示词…"></textarea><div class="prompt-editor-footer"><span>{{ promptStats.characters }} 字 · 约 {{ promptStats.tokens }} Token</span><div class="prompt-actions"><button type="button" class="text-action" @click="restorePrompt"><RotateCcw :size="14" aria-hidden="true" />恢复默认</button><button type="button" class="text-action danger-action" @click="draft.systemPrompt = ''"><Trash2 :size="14" aria-hidden="true" />清空</button></div></div></div>
              <div class="settings-info-card subtle"><MessageSquareText :size="17" aria-hidden="true" /><span>默认应用于新对话，已经开始的对话不会被重写。</span></div>
            </section>

            <section v-show="activeSection === 'knowledge'" class="settings-section" aria-labelledby="section-knowledge">
              <div class="section-heading"><div><span class="section-kicker">KNOWLEDGE BASE</span><h2 id="section-knowledge">知识库</h2><p>决定后端代理如何使用已上传的知识库内容。</p></div></div>
              <div class="settings-field"><label class="settings-label">RAG 模式</label><div class="segmented-control rag-control" :class="{ disabled: draft.transport !== 'backend' }" role="group" aria-label="RAG 模式"><button v-for="mode in ragModes" :key="mode.value" type="button" class="segmented-option" :class="{ active: draft.ragMode === mode.value }" :disabled="draft.transport !== 'backend'" :aria-pressed="draft.ragMode === mode.value" @click="draft.ragMode = mode.value">{{ mode.label }}</button></div><span class="settings-hint">{{ draft.transport === 'backend' ? activeRagModeHint : 'RAG 依赖后端知识库检索，仅在后端代理模式下可用。' }}</span></div>
              <div class="settings-info-card" :class="{ warning: draft.transport !== 'backend' }"><Database :size="17" aria-hidden="true" /><div><strong>{{ draft.transport === 'backend' ? '知识库检索已可用' : '需要后端代理' }}</strong><span>{{ draft.transport === 'backend' ? '发送消息时会按上面的模式请求知识库。' : '切换到后端代理后，可以使用自动或强制检索。' }}</span></div></div>
            </section>

            <section v-show="activeSection === 'behavior'" class="settings-section" aria-labelledby="section-behavior">
              <div class="section-heading"><div><span class="section-kicker">CONVERSATION</span><h2 id="section-behavior">对话行为</h2><p>聊天工作区保持现有的快速输入和流式体验。</p></div></div>
              <div class="behavior-list"><div class="behavior-row"><span class="behavior-icon"><Sparkles :size="16" aria-hidden="true" /></span><div><strong>流式输出</strong><span>收到模型片段后立即显示。</span></div><span class="behavior-state">已启用</span></div><div class="behavior-row"><span class="behavior-icon"><MessageSquareText :size="16" aria-hidden="true" /></span><div><strong>自动滚动</strong><span>停留在底部时跟随新消息，手动上滑后保留阅读位置。</span></div><span class="behavior-state">已启用</span></div><div class="behavior-row"><span class="behavior-icon"><CornerDownLeft :size="16" aria-hidden="true" /></span><div><strong>Enter 发送</strong><span>Enter 发送消息，Shift + Enter 换行。</span></div><span class="behavior-state">已启用</span></div></div>
              <div class="settings-info-card subtle"><Settings2 :size="17" aria-hidden="true" /><span>这些行为由聊天工作区统一管理，当前没有额外的持久化开关。</span></div>
            </section>

            <section v-show="activeSection === 'appearance'" class="settings-section" aria-labelledby="section-appearance">
              <div class="section-heading"><div><span class="section-kicker">APPEARANCE</span><h2 id="section-appearance">外观</h2><p>选择界面主题，变更会立即生效。</p></div></div>
              <div class="theme-switcher" role="group" aria-label="主题"><button v-for="theme in themes" :key="theme.value" type="button" class="theme-btn" :class="{ active: draft.theme === theme.value }" :aria-pressed="draft.theme === theme.value" @click="setTheme(theme.value)"><Moon v-if="theme.value === 'dark'" :size="17" aria-hidden="true" /><Sun v-else-if="theme.value === 'light'" :size="17" aria-hidden="true" /><Monitor v-else :size="17" aria-hidden="true" /><span>{{ theme.label }}</span></button></div>
              <span class="settings-hint">主题设置立即生效；点击取消会恢复打开面板前的主题。</span>
            </section>

            <section v-show="activeSection === 'advanced'" class="settings-section" aria-labelledby="section-advanced">
              <div class="section-heading"><div><span class="section-kicker">ADVANCED</span><h2 id="section-advanced">高级</h2><p>低频使用的后端代理配置集中放在这里。</p></div></div>
              <div v-if="draft.transport === 'backend'" class="settings-field"><div class="field-label-row"><label class="settings-label">后端代理厂商</label><button type="button" class="btn-refresh" :disabled="loadingBackendProviders" :class="{ loading: loadingBackendProviders }" @click="loadBackendProviders"><RefreshCw :size="14" :class="{ spinning: loadingBackendProviders }" aria-hidden="true" /><span>{{ loadingBackendProviders ? '加载中…' : '刷新厂商' }}</span></button></div><select v-model="draft.backend.provider" class="settings-input settings-select" @change="applyBackendDefaultModel"><option v-for="backendProvider in backendProviders" :key="backendProvider.id" :value="backendProvider.id">{{ backendProvider.name }}</option></select><input v-model="draft.backend.model" class="settings-input" placeholder="使用厂商默认模型或手动输入" spellcheck="false" autocomplete="off" /><div v-if="backendProviderError" class="settings-error-card" role="alert"><AlertCircle :size="17" aria-hidden="true" /><span>{{ backendProviderError }}</span><button type="button" class="error-retry" :disabled="loadingBackendProviders" @click="loadBackendProviders">重试</button></div><span v-else class="settings-hint">后端代理统一请求 /api/chat，API Key 和厂商路由由后端管理。</span></div>
              <div v-else class="settings-info-card subtle"><Server :size="17" aria-hidden="true" /><span>切换到后端代理后，可以在这里选择后端厂商和默认模型。</span></div>
              <div class="settings-info-card subtle"><Settings2 :size="17" aria-hidden="true" /><span>API Key、服务地址和提示词都会保存在当前设备的本地设置中。</span></div>
            </section>
          </main>
        </div>

        <footer class="settings-footer"><span class="modified-count" :class="{ active: hasUnsavedChanges }">已修改 · {{ changedSettingCount }} 项设置</span><div class="footer-actions"><button type="button" class="btn-cancel" @click="cancelChanges">取消</button><button type="button" class="btn-save" :disabled="!hasUnsavedChanges" @click="save"><Save :size="16" aria-hidden="true" /><span>保存更改</span></button></div></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, type Component } from 'vue'
import { AlertCircle, Bot, CheckCircle2, ChevronRight, CornerDownLeft, Database, LoaderCircle, MessageSquareText, Monitor, Moon, RefreshCw, RotateCcw, Save, Server, Settings2, SlidersHorizontal, Sparkles, Sun, TestTube2, Trash2, Waypoints, X } from 'lucide-vue-next'
import { settings } from '../stores/settings'
import { fetchModels } from '../services/stream'
import { createRuntimeFromSettings } from '../services/runtime'
import { getClaudeModels } from '../services/providers/claude'
import { fetchBackendChatProviders, type BackendChatProvider } from '../services/knowledge'
import type { BackendRagMode, ProviderType, ThemeType, TransportMode } from '../stores/settings'

const emit = defineEmits<{ close: [] }>()
const DEFAULT_SYSTEM_PROMPT = '你是一个专业的 AI 助手，回答要简洁清晰。'
const UNLIMITED = 1100000
type SectionId = 'general' | 'ai' | 'model' | 'prompt' | 'knowledge' | 'behavior' | 'appearance' | 'advanced'
type ConnectionState = 'idle' | 'loading' | 'success' | 'error'

const sections: { id: SectionId; label: string; icon: Component }[] = [
  { id: 'general', label: '常规', icon: Settings2 },
  { id: 'ai', label: 'AI 服务', icon: Sparkles },
  { id: 'model', label: '模型参数', icon: SlidersHorizontal },
  { id: 'prompt', label: '系统提示词', icon: MessageSquareText },
  { id: 'knowledge', label: '知识库', icon: Database },
  { id: 'behavior', label: '对话行为', icon: CornerDownLeft },
  { id: 'appearance', label: '外观', icon: Monitor },
  { id: 'advanced', label: '高级', icon: Server },
]
const themes: { value: ThemeType; label: string }[] = [{ value: 'dark', label: '暗色' }, { value: 'light', label: '浅色' }, { value: 'system', label: '跟随系统' }]
const providers: { value: ProviderType; label: string }[] = [{ value: 'ollama', label: 'Ollama' }, { value: 'openai', label: 'OpenAI 兼容' }, { value: 'claude', label: 'Claude' }]
const connectionModes: { value: TransportMode; label: string; hint: string }[] = [{ value: 'direct', label: '浏览器直连', hint: '前端直接请求当前模型厂商；配置保存在本地，RAG 不可用。' }, { value: 'backend', label: '后端代理', hint: '前端统一请求 /api/chat；后端管理厂商路由、鉴权和知识库 RAG。' }]
const ragModes: { value: BackendRagMode; label: string; hint: string }[] = [{ value: 'off', label: '关闭', hint: '发送 rag:false，后端直接推理，不检索知识库。' }, { value: 'auto', label: '自动', hint: '发送 rag:auto，由后端按问题和命中分数自动判断是否检索。' }, { value: 'force', label: '始终开启', hint: '发送 rag:true，后端强制检索，命中后注入资料。' }]
const contextTiers = [{ label: '8K', max: 8000, min: 500, step: 500 }, { label: '32K', max: 32000, min: 1000, step: 1000 }, { label: '128K', max: 128000, min: 2000, step: 2000 }, { label: '256K', max: 256000, min: 4000, step: 4000 }, { label: '1M', max: 1000000, min: 10000, step: 10000 }, { label: '无限制', max: UNLIMITED, min: UNLIMITED, step: 1 }]
const claudeModels = getClaudeModels()

const draft = reactive({ ...settings, backend: { ...settings.backend }, ollama: { ...settings.ollama }, openai: { ...settings.openai }, claude: { ...settings.claude } })
const initialDraft = JSON.parse(JSON.stringify(draft)) as typeof draft
const activeSection = ref<SectionId>('ai')
const contentRef = ref<HTMLElement | null>(null)
const activeTierIndex = ref(findTierIndex(draft.maxContextTokens))
const activeTier = computed(() => contextTiers[activeTierIndex.value])
const modelList = ref<string[]>([])
const loadingModels = ref(false)
const modelError = ref('')
const backendProviders = ref<BackendChatProvider[]>([])
const loadingBackendProviders = ref(false)
const backendProviderError = ref('')
const connectionState = ref<ConnectionState>('idle')
const connectionError = ref('')
const modelRequestId = ref(0)

const activeRagModeHint = computed(() => ragModes.find(mode => mode.value === draft.ragMode)?.hint ?? ragModes[0].hint)
const activeConnectionModeHint = computed(() => connectionModes.find(mode => mode.value === draft.transport)?.hint ?? connectionModes[0].hint)
const providerLabel = computed(() => providers.find(provider => provider.value === draft.provider)?.label ?? draft.provider)
const currentModelLabel = computed(() => draft.transport === 'backend' ? (draft.backend.model || '后端默认模型') : draft.provider === 'ollama' ? (draft.ollama.model || '未设置模型') : draft.provider === 'openai' ? (draft.openai.model || '未设置模型') : (draft.claude.model || '未设置模型'))
const connectionStatusLabel = computed(() => connectionState.value === 'loading' ? '连接中' : connectionState.value === 'success' ? '已连接' : connectionState.value === 'error' ? '连接失败' : '未测试')
const connectionHint = computed(() => connectionError.value || (connectionState.value === 'success' ? '当前服务响应正常。' : '保存前可以先测试当前服务。'))
const promptStats = computed(() => ({ characters: draft.systemPrompt.length, tokens: Math.max(0, Math.ceil(draft.systemPrompt.trim().length / 4)) }))
const changedSettingCount = computed(() => {
  const pairs: [unknown, unknown][] = [[draft.transport, initialDraft.transport], [draft.provider, initialDraft.provider], [draft.theme, initialDraft.theme], [draft.systemPrompt, initialDraft.systemPrompt], [draft.maxContextTokens, initialDraft.maxContextTokens], [draft.responseTimeoutSeconds, initialDraft.responseTimeoutSeconds], [draft.showModelInTopbar, initialDraft.showModelInTopbar], [draft.ragMode, initialDraft.ragMode], [draft.backend.provider, initialDraft.backend.provider], [draft.backend.model, initialDraft.backend.model], [draft.ollama.url, initialDraft.ollama.url], [draft.ollama.model, initialDraft.ollama.model], [draft.openai.apiKey, initialDraft.openai.apiKey], [draft.openai.baseUrl, initialDraft.openai.baseUrl], [draft.openai.model, initialDraft.openai.model], [draft.claude.apiKey, initialDraft.claude.apiKey], [draft.claude.model, initialDraft.claude.model]]
  return pairs.filter(([current, initial]) => current !== initial).length
})
const hasUnsavedChanges = computed(() => changedSettingCount.value > 0)
const contextTokenLabel = computed(() => formatTokenLimit(draft.maxContextTokens))

function findTierIndex(value: number): number { if (value >= UNLIMITED) return contextTiers.length - 1; const index = contextTiers.findIndex(tier => value <= tier.max); return index < 0 ? contextTiers.length - 2 : index }
function selectTier(index: number) { activeTierIndex.value = index; draft.maxContextTokens = contextTiers[index].max }
function formatTokenLimit(value: number): string { if (value >= UNLIMITED) return '无限制'; if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`; if (value >= 1000) return `${Math.round(value / 1000)}K`; return String(value) }
function setTheme(theme: ThemeType) { draft.theme = theme; settings.theme = theme }
function restorePrompt() { draft.systemPrompt = DEFAULT_SYSTEM_PROMPT }
function cancelChanges() { settings.theme = initialDraft.theme; emit('close') }

async function loadModels() {
  const requestId = ++modelRequestId.value
  loadingModels.value = true; modelError.value = ''; modelList.value = []; connectionState.value = 'loading'; connectionError.value = ''
  const providerKey = draft.provider
  const runtime = createRuntimeFromSettings({ ...draft, provider: providerKey, transport: 'direct' })
  try {
    const list = await fetchModels(runtime); if (requestId !== modelRequestId.value) return
    if (providerKey === 'claude') modelList.value = claudeModels
    else if (list.length === 0) { modelError.value = '未能获取模型列表，请检查服务地址或 API Key 是否正确。'; connectionState.value = 'error'; connectionError.value = modelError.value }
    else {
      modelList.value = list
      const currentModel = providerKey === 'openai' ? draft.openai.model : draft.ollama.model
      if (!currentModel.trim()) {
        if (providerKey === 'openai') draft.openai.model = list[0]
        else draft.ollama.model = list[0]
      }
    }
    if (connectionState.value !== 'error') connectionState.value = 'success'
    return list
  } catch (error) { if (requestId !== modelRequestId.value) return; modelError.value = error instanceof Error ? error.message : '模型列表加载失败。'; connectionState.value = 'error'; connectionError.value = modelError.value; return [] }
  finally { if (requestId === modelRequestId.value) loadingModels.value = false }
}

async function testConnection() {
  connectionState.value = 'loading'; connectionError.value = ''
  if (draft.transport === 'backend') { await loadBackendProviders(); if (backendProviderError.value) { connectionState.value = 'error'; connectionError.value = backendProviderError.value } else connectionState.value = 'success'; return }
  if (draft.provider === 'claude' && !draft.claude.apiKey.trim()) { connectionState.value = 'error'; connectionError.value = '请先填写 Claude API Key。'; return }
  await loadModels()
}

watch(() => draft.provider, () => {
  modelList.value = []
  modelError.value = ''
  if (draft.provider === 'claude') {
    modelRequestId.value += 1
    loadingModels.value = false
    connectionState.value = 'idle'
    connectionError.value = ''
  } else void loadModels()
})
watch(activeSection, async () => {
  await nextTick()
  if (contentRef.value) contentRef.value.scrollTop = 0
})
watch(() => draft.transport, (transport, previousTransport) => {
  if (transport === previousTransport) return
  modelError.value = ''
  connectionState.value = 'idle'
  connectionError.value = ''
  if (transport === 'backend' && !loadingBackendProviders.value) void loadBackendProviders()
  else if (draft.provider !== 'claude') void loadModels()
})

async function loadBackendProviders() {
  loadingBackendProviders.value = true; backendProviderError.value = ''
  try { backendProviders.value = await fetchBackendChatProviders(); if (backendProviders.value.length === 0) { backendProviderError.value = '后端没有可用厂商，请检查 /api/providers 配置。'; return } if (!backendProviders.value.some(provider => provider.id === draft.backend.provider)) { draft.backend.provider = backendProviders.value[0].id; draft.backend.model = backendProviders.value[0].defaultModel } else if (!draft.backend.model) applyBackendDefaultModel() }
  catch (error) { backendProviderError.value = error instanceof Error ? error.message : '后端厂商列表获取失败。' }
  finally { loadingBackendProviders.value = false }
}
function applyBackendDefaultModel() { const provider = backendProviders.value.find(item => item.id === draft.backend.provider); if (provider) draft.backend.model = provider.defaultModel }
function normalizeTimeout(value: number): number { if (!Number.isFinite(value)) return 30; return Math.max(5, Math.round(value)) }
function save() {
  draft.responseTimeoutSeconds = normalizeTimeout(draft.responseTimeoutSeconds)
  if (!draft.backend.model) { const provider = backendProviders.value.find(item => item.id === draft.backend.provider); draft.backend.model = provider?.defaultModel ?? draft.ollama.model }
  Object.assign(settings, { transport: draft.transport, provider: draft.provider, theme: draft.theme, systemPrompt: draft.systemPrompt, maxContextTokens: draft.maxContextTokens, responseTimeoutSeconds: draft.responseTimeoutSeconds, showModelInTopbar: draft.showModelInTopbar, ragMode: draft.ragMode })
  Object.assign(settings.backend, draft.backend); Object.assign(settings.ollama, draft.ollama); Object.assign(settings.openai, draft.openai); Object.assign(settings.claude, draft.claude); emit('close')
}

void loadModels()
void loadBackendProviders()
</script>

<style scoped>
.settings-overlay { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; justify-content: flex-end; background: var(--bg-overlay); }
.settings-panel { width: min(760px, 100vw); height: 100dvh; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--text-primary); background: var(--bg-elevated); border-left: 1px solid var(--border); box-shadow: var(--shadow-lg); animation: settings-drawer-in var(--motion-slow) var(--ease-standard); }
@keyframes settings-drawer-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
.settings-header { min-height: 72px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-topbar); }
.settings-heading { display: flex; align-items: baseline; gap: 10px; min-width: 0; }.settings-eyebrow { color: var(--text-faint); font-size: 10px; font-weight: 700; letter-spacing: .14em; }.settings-title { color: var(--text-primary); font-size: 18px; font-weight: 700; }
.settings-close, .btn-cancel, .btn-save, .btn-refresh, .secondary-action, .error-retry, .text-action, .theme-btn, .provider-tab, .segmented-option, .settings-nav-item, .settings-mobile-tab, .context-preset-btn { font: inherit; letter-spacing: 0; }
.settings-close { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 auto; color: var(--text-secondary); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; }.settings-close:hover { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }
.settings-layout { min-height: 0; flex: 1 1 auto; display: grid; grid-template-columns: 188px minmax(0, 1fr); }.settings-nav { min-height: 0; display: flex; flex-direction: column; gap: 4px; padding: 22px 12px; border-right: 1px solid var(--border-subtle); background: var(--bg-sidebar); }.settings-nav-title { padding: 0 10px 10px; color: var(--text-faint); font-size: 10px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }.settings-nav-item { min-height: 44px; display: grid; grid-template-columns: 20px minmax(0, 1fr) 15px; align-items: center; gap: 9px; padding: 0 10px; color: var(--text-secondary); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); text-align: left; cursor: pointer; }.settings-nav-item:hover { color: var(--text-primary); background: var(--bg-surface-2); }.settings-nav-item.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }.settings-nav-note { margin-top: auto; display: flex; align-items: center; gap: 7px; padding: 14px 10px 4px; color: var(--text-faint); font-size: 11px; }.settings-nav-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--success); box-shadow: 0 0 9px color-mix(in srgb, var(--success) 50%, transparent); }
.settings-mobile-tabs { display: none; }.settings-content { min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 28px 30px 120px; scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent; }.settings-section { max-width: 560px; margin: 0 auto; }.section-heading { min-width: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 26px; }.section-kicker { display: block; margin-bottom: 7px; color: var(--accent-text); font-size: 10px; font-weight: 700; letter-spacing: .14em; }.section-heading h2 { margin: 0 0 6px; color: var(--text-primary); font-size: 24px; line-height: 1.2; }.section-heading p { max-width: 420px; margin: 0; color: var(--text-muted); font-size: 13px; line-height: 1.55; }
.section-heading > div { min-width: 0; }.section-heading h2, .section-heading p { overflow-wrap: anywhere; }.settings-field, .settings-field-grid { min-width: 0; }.settings-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }.settings-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }.settings-field-grid.two-columns { gap: 20px; }.settings-label { color: var(--text-secondary); font-size: 13px; font-weight: 650; line-height: 1.35; }.settings-hint { min-width: 0; color: var(--text-muted); font-size: 11px; line-height: 1.55; overflow-wrap: anywhere; }.field-subtitle { display: block; margin-top: 3px; }.field-copy { display: flex; flex-direction: column; gap: 4px; }.field-label-row { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }.settings-input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; color: var(--text-primary); background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); outline: none; font-family: var(--font-sans); font-size: 13px; transition: border-color var(--motion-fast), box-shadow var(--motion-fast), background var(--motion-fast); }.settings-input:hover { border-color: var(--border-strong); }.settings-input:focus { border-color: var(--accent); box-shadow: var(--focus-ring); }.settings-input::placeholder { color: var(--text-placeholder); }.settings-select { appearance: auto; cursor: pointer; }.settings-readonly { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px; color: var(--text-primary); background: var(--bg-surface-2); border: 1px solid var(--border-faint); border-radius: var(--radius-sm); font-size: 13px; }.settings-readonly span { color: var(--text-muted); font-size: 11px; }
.segmented-control { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 4px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }.segmented-control.rag-control { grid-template-columns: repeat(3, minmax(0, 1fr)); }.segmented-control.disabled { opacity: .58; }.segmented-option { min-width: 0; min-height: 40px; padding: 7px 9px; color: var(--text-secondary); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; }.segmented-option:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-surface); }.segmented-option.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }.segmented-option:disabled { cursor: not-allowed; }
.settings-info-card, .settings-error-card { min-width: 0; display: flex; align-items: flex-start; gap: 10px; padding: 13px 14px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--bg-surface-2); color: var(--accent-text); }.settings-info-card { margin-top: 2px; }.settings-info-card > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }.settings-info-card strong { color: var(--text-primary); font-size: 12px; }.settings-info-card span { color: var(--text-muted); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }.settings-info-card.subtle { color: var(--text-secondary); background: transparent; border-color: var(--border-faint); }.settings-info-card.warning { color: var(--warning); background: var(--warning-bg); border-color: var(--warning-border); }
.provider-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 24px; }.provider-tab { min-width: 0; min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 8px; color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; }.provider-tab:hover { color: var(--text-primary); border-color: var(--border-strong); }.provider-tab.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }.btn-refresh, .secondary-action, .error-retry, .text-action { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: var(--radius-sm); cursor: pointer; }.btn-refresh { flex: 0 0 auto; padding: 6px 10px; color: var(--accent-text); background: var(--accent-bg); border: 1px solid var(--accent-border); font-size: 11px; }.btn-refresh:hover:not(:disabled), .secondary-action:hover:not(:disabled) { background: var(--accent-bg); border-color: var(--accent); }.btn-refresh:disabled, .secondary-action:disabled, .error-retry:disabled { opacity: .55; cursor: not-allowed; }.spinning { animation: settings-spin 850ms linear infinite; }@keyframes settings-spin { to { transform: rotate(360deg); } }.settings-error-card { align-items: center; color: var(--danger); background: var(--danger-bg); border-color: var(--danger-border); }.settings-error-card span { min-width: 0; flex: 1; color: var(--danger); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }.error-retry { flex: 0 0 auto; padding: 5px 9px; min-height: 32px; color: var(--danger); background: transparent; border: 1px solid var(--danger-border); font-size: 11px; }.error-retry:hover:not(:disabled) { background: var(--danger-bg); }.action-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }.secondary-action { padding: 7px 12px; color: var(--text-primary); background: var(--bg-surface-2); border: 1px solid var(--border); font-size: 12px; }.action-hint { min-width: 0; flex: 1; }.connection-status { min-height: 30px; display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; padding: 5px 9px; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); color: var(--text-muted); background: var(--bg-surface-2); font-size: 11px; white-space: nowrap; }.status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }.status-success { color: var(--success); background: var(--success-bg); border-color: var(--success-border); }.status-error { color: var(--danger); background: var(--danger-bg); border-color: var(--danger-border); }.status-loading { color: var(--accent-text); }.status-loading .status-dot { display: none; }.status-icon { flex: 0 0 auto; }
.model-chip, .prompt-badge { max-width: 45%; min-width: 0; display: inline-flex; align-items: center; gap: 6px; padding: 7px 9px; color: var(--accent-text); background: var(--accent-bg); border: 1px solid var(--accent-border); border-radius: var(--radius-pill); font-size: 11px; }.model-chip span { min-width: 0; overflow-wrap: anywhere; }.settings-value { color: var(--data-accent); font-family: var(--font-mono); font-size: 12px; font-weight: 600; white-space: nowrap; }.context-field { margin-top: 4px; }.context-presets { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-top: 4px; }.context-preset-btn { min-width: 0; min-height: 36px; padding: 5px 4px; color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); cursor: pointer; font-size: 11px; }.context-preset-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }.context-preset-btn.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }.settings-slider { appearance: none; width: 100%; height: 32px; margin: 4px 0 0; background: transparent; cursor: pointer; }.settings-slider::-webkit-slider-runnable-track { height: 5px; border-radius: var(--radius-pill); background: var(--border); }.settings-slider::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; margin-top: -5.5px; border: 0; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent-glow); }.settings-slider::-moz-range-track { height: 5px; border-radius: var(--radius-pill); background: var(--border); }.settings-slider::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent-glow); }.settings-slider-labels { display: flex; justify-content: space-between; color: var(--text-muted); font-size: 10px; }
.prompt-editor { overflow: hidden; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--bg-input); }.settings-textarea { width: 100%; min-height: 180px; display: block; resize: vertical; padding: 14px; color: var(--text-primary); background: transparent; border: 0; outline: 0; font: inherit; font-size: 13px; line-height: 1.65; }.settings-textarea:focus { box-shadow: inset 0 0 0 2px var(--accent-border); }.prompt-editor-footer { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--border-subtle); color: var(--text-muted); font-size: 11px; }.prompt-actions { display: flex; gap: 5px; }.text-action { padding: 5px 7px; min-height: 32px; color: var(--text-secondary); background: transparent; border: 1px solid transparent; font-size: 11px; }.text-action:hover { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }.text-action.danger-action:hover { color: var(--danger); background: var(--danger-bg); border-color: var(--danger-border); }
.behavior-list { display: flex; flex-direction: column; gap: 0; margin-bottom: 24px; border-top: 1px solid var(--border-subtle); }.behavior-row { min-width: 0; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 70px; border-bottom: 1px solid var(--border-subtle); }.behavior-icon { width: 30px; height: 30px; display: grid; place-items: center; color: var(--accent-text); background: var(--accent-bg); border-radius: var(--radius-sm); }.behavior-row div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }.behavior-row strong { color: var(--text-primary); font-size: 13px; }.behavior-row div span { color: var(--text-muted); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }.behavior-state { padding: 4px 7px; color: var(--success); background: var(--success-bg); border-radius: var(--radius-pill); font-size: 10px; white-space: nowrap; }.theme-switcher { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }.theme-btn { min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; }.theme-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }.theme-btn.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }
.settings-footer { min-height: 76px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 24px; border-top: 1px solid var(--border-subtle); background: var(--bg-topbar); }.modified-count { color: var(--text-muted); font-size: 12px; }.modified-count.active { color: var(--accent-text); }.footer-actions { display: flex; align-items: center; gap: 8px; }.btn-cancel, .btn-save { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; font-weight: 600; }.btn-cancel { color: var(--text-secondary); background: var(--bg-surface-2); border: 1px solid var(--border-subtle); }.btn-cancel:hover { color: var(--text-primary); border-color: var(--border-strong); }.btn-save { color: #fff; background: var(--accent-deep); border: 1px solid var(--accent-border); box-shadow: 0 0 16px var(--accent-glow); }.btn-save:hover:not(:disabled) { background: var(--accent-deeper); }.btn-save:disabled { color: var(--text-faint); background: var(--bg-surface-3); border-color: var(--border-faint); box-shadow: none; cursor: not-allowed; }
.settings-close:focus-visible, .settings-nav-item:focus-visible, .settings-mobile-tab:focus-visible, .provider-tab:focus-visible, .segmented-option:focus-visible, .btn-refresh:focus-visible, .secondary-action:focus-visible, .error-retry:focus-visible, .text-action:focus-visible, .theme-btn:focus-visible, .context-preset-btn:focus-visible, .btn-cancel:focus-visible, .btn-save:focus-visible, .settings-toggle input:focus-visible + .toggle-track, .settings-slider:focus-visible { outline: none; box-shadow: var(--focus-ring); }.settings-toggle { position: relative; display: inline-flex; min-width: 44px; min-height: 32px; align-items: center; justify-content: flex-end; cursor: pointer; }.settings-toggle input { position: absolute; opacity: 0; width: 1px; height: 1px; }.toggle-track { width: 38px; height: 22px; display: flex; align-items: center; padding: 3px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); }.toggle-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--text-muted); transition: transform var(--motion-fast), background var(--motion-fast); }.settings-toggle input:checked + .toggle-track { background: var(--accent-bg); border-color: var(--accent-border); }.settings-toggle input:checked + .toggle-track .toggle-thumb { transform: translateX(16px); background: var(--accent); }
@media (max-width: 767px) { .settings-panel { width: 100vw; border-left: 0; }.settings-header { min-height: 62px; padding: 0 14px 0 16px; }.settings-eyebrow { display: none; }.settings-title { font-size: 17px; }.settings-layout { display: flex; flex-direction: column; overflow: hidden; }.settings-nav { display: none; }.settings-mobile-tabs { min-width: 0; flex: 0 0 auto; display: flex; gap: 5px; overflow-x: auto; padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-topbar); scrollbar-width: none; }.settings-mobile-tabs::-webkit-scrollbar { display: none; }.settings-mobile-tab { min-width: max-content; min-height: 44px; display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; color: var(--text-secondary); background: transparent; border: 1px solid transparent; border-radius: var(--radius-pill); cursor: pointer; font-size: 12px; }.settings-mobile-tab.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }.settings-content { width: 100%; min-height: 0; flex: 1 1 auto; padding: 22px 16px calc(124px + env(safe-area-inset-bottom)); }.settings-section { max-width: none; }.section-heading { margin-bottom: 22px; flex-wrap: wrap; }.section-heading h2 { font-size: 22px; }.section-heading p { font-size: 12px; }.settings-input, .settings-textarea, .settings-slider, .provider-tab, .theme-btn, .segmented-option, .context-preset-btn, .btn-refresh, .secondary-action, .error-retry, .text-action, .btn-cancel, .btn-save, .settings-toggle { min-height: 44px; }.settings-field-grid, .settings-field-grid.two-columns { grid-template-columns: minmax(0, 1fr); gap: 0; }.provider-tab { padding: 8px 5px; flex-direction: column; gap: 4px; font-size: 11px; }.segmented-option { padding: 7px 5px; }.context-presets { grid-template-columns: repeat(3, minmax(0, 1fr)); }.settings-textarea { min-height: 140px; }.prompt-editor-footer { align-items: flex-start; flex-direction: column; }.prompt-actions { width: 100%; justify-content: flex-end; }.model-chip, .prompt-badge { max-width: 100%; }.connection-status { padding-inline: 7px; }.action-row { align-items: stretch; flex-direction: column; gap: 7px; }.secondary-action { width: 100%; }.settings-footer { min-height: 76px; align-items: center; padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); }.modified-count { min-width: 0; font-size: 11px; }.footer-actions { flex: 1 1 auto; justify-content: flex-end; }.btn-cancel, .btn-save { padding-inline: 13px; }.behavior-row { grid-template-columns: 32px minmax(0, 1fr); padding: 8px 0; }.behavior-state { grid-column: 2; justify-self: start; } }
@media (max-width: 374px) { .settings-content { padding-inline: 12px; }.settings-footer { gap: 8px; padding-inline: 10px; }.modified-count { font-size: 10px; }.btn-cancel, .btn-save { padding-inline: 10px; font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .settings-panel, .spinning { animation-duration: 1ms; animation-iteration-count: 1; } }
</style>
