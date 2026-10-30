<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="requestClose">
      <div class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-header">
          <div class="settings-heading">
            <span class="settings-eyebrow">WORKSPACE</span>
            <span id="settings-title" class="settings-title">设置</span>
          </div>
          <div class="settings-header-actions">
            <div class="settings-header-status" :class="{ dirty: hasUnsavedChanges, error: saveError }" role="status" aria-live="polite">
              <AlertCircle v-if="saveError || hasUnsavedChanges" :size="14" aria-hidden="true" />
              <CheckCircle2 v-else :size="14" aria-hidden="true" />
              <span>{{ saveError ? '保存失败' : hasUnsavedChanges ? `未保存 · ${changedSettingCount} 项` : '已保存' }}</span>
            </div>
            <button type="button" class="settings-close" aria-label="关闭设置" @click="requestClose">
              <X :size="19" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div v-if="hasUnsavedChanges" class="settings-dirty-banner" role="status" aria-live="polite">
          <AlertCircle :size="17" aria-hidden="true" />
          <div><strong>有 {{ changedSettingCount }} 项修改尚未保存</strong><span>点击底部“保存更改”后生效。</span></div>
        </div>

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
            <span class="settings-tab-label">
              <span>{{ section.label }}</span>
              <span v-if="sectionHasChanges(section.id)" class="settings-dirty-dot" aria-hidden="true"></span>
            </span>
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
              <span class="settings-nav-label">
                <span>{{ section.label }}</span>
                <span v-if="sectionHasChanges(section.id)" class="settings-dirty-dot" aria-hidden="true"></span>
              </span>
              <ChevronRight v-if="activeSection === section.id" :size="15" aria-hidden="true" />
            </button>
            <div class="settings-nav-note">
              <span class="settings-nav-dot"></span>
              <span>配置保存在此设备</span>
            </div>
          </aside>

          <main ref="contentRef" class="settings-content" tabindex="-1">
            <!-- 1. 模型连接专区 (统一整合调用方式、服务与模型连接) -->
            <section v-show="activeSection === 'connection'" class="settings-section" aria-labelledby="section-connection">
              <div class="section-heading">
                <div>
                  <span class="section-kicker">MODEL CONNECTION</span>
                  <h2 id="section-connection">模型连接</h2>
                  <p>统一管理调用方式、服务连接、模型选择与链路能力。</p>
                </div>
              </div>

              <!-- 顶部调用方式切换：前端直连 vs 后端调用 -->
              <div class="settings-field">
                <div class="segmented-control two-up" role="group" aria-label="调用方式">
                  <button
                    type="button"
                    class="segmented-option"
                    :class="{ active: draft.transport === 'direct' }"
                    :aria-pressed="draft.transport === 'direct'"
                    @click="setTransport('direct')"
                  >
                    <Monitor :size="15" aria-hidden="true" style="margin-right: 6px; vertical-align: -2px;" />
                    前端直连
                  </button>
                  <button
                    type="button"
                    class="segmented-option"
                    :class="{ active: draft.transport === 'backend' }"
                    :aria-pressed="draft.transport === 'backend'"
                    @click="setTransport('backend')"
                  >
                    <Server :size="15" aria-hidden="true" style="margin-right: 6px; vertical-align: -2px;" />
                    后端调用
                  </button>
                </div>
              </div>

              <!-- 后端调用配置视图 (匹配视觉设计图 1) -->
              <template v-if="draft.transport === 'backend'">
                <div class="settings-field">
                  <div class="field-label-row">
                    <label for="backend-api-url" class="settings-label">后端 API 地址</label>
                    <div class="status-badge" :class="backendReachableStatus">
                      <span class="status-dot"></span>
                      <span>{{ backendReachableLabel }}</span>
                    </div>
                  </div>
                  <div class="input-with-action">
                    <input
                      id="backend-api-url"
                      v-model="draft.backend.url"
                      class="settings-input"
                      placeholder="http://localhost:3001"
                      spellcheck="false"
                      autocomplete="url"
                      @input="onBackendUrlChanged"
                    />
                    <button
                      type="button"
                      class="btn-refresh action-inside-btn"
                      :disabled="loadingBackendProviders"
                      :class="{ loading: loadingBackendProviders }"
                      @click="loadBackendProviders"
                    >
                      <RefreshCw :size="14" :class="{ spinning: loadingBackendProviders }" aria-hidden="true" />
                      <span>{{ loadingBackendProviders ? '刷新中…' : '刷新服务' }}</span>
                    </button>
                  </div>
                  <span class="settings-hint">填写后端 Fastify 地址，不要添加末尾的 /api。保存后立即用于后端代理请求。</span>
                </div>

                <!-- 后端服务选择：独立厂商卡片 -->
                <div class="settings-field">
                  <label class="settings-label">后端服务选择</label>
                  <div class="backend-service-cards">
                    <div
                      v-for="provider in backendServiceList"
                      :key="provider.id"
                      class="service-card"
                      :class="{ active: draft.backend.provider === provider.id, disabled: !provider.configured }"
                      @click="selectBackendService(provider.id)"
                    >
                      <div class="service-card-icon">
                        <Bot v-if="provider.id === 'ollama'" :size="20" />
                        <Waypoints v-else-if="provider.id === 'openai'" :size="20" />
                        <Sparkles v-else :size="20" />
                      </div>
                      <div class="service-card-info">
                        <strong class="service-card-name">{{ provider.name }}</strong>
                      </div>
                    </div>
                  </div>
                  <span class="settings-hint subtle-note">API Key 由后端管理</span>
                </div>

                <!-- 默认模型与刷新模型列表 -->
                <div class="settings-field">
                  <div class="field-label-row">
                    <label for="backend-model-select" class="settings-label">默认模型</label>
                    <button
                      type="button"
                      class="btn-refresh"
                      :disabled="loadingBackendProviders"
                      @click="loadBackendProviders"
                    >
                      <RefreshCw :size="14" :class="{ spinning: loadingBackendProviders }" aria-hidden="true" />
                      <span>刷新模型列表</span>
                    </button>
                  </div>
                  <select
                    id="backend-model-select"
                    v-model="draft.backend.model"
                    class="settings-input settings-select"
                    @change="onBackendModelChanged"
                  >
                    <option v-for="m in currentBackendModels" :key="m" :value="m">{{ m }}</option>
                  </select>
                </div>

                <!-- 当前链路可用能力 -->
                <div class="settings-field">
                  <label class="settings-label">当前链路可用能力</label>
                  <div class="capabilities-badges">
                    <span class="cap-tag active"><span class="cap-dot"></span>普通聊天</span>
                    <span class="cap-tag disabled" title="当前连接不支持图片输入 (模型或后端接口未开启)">
                      <span class="cap-dot"></span>图片输入 (当前连接不支持)
                    </span>
                    <span class="cap-tag active"><span class="cap-dot"></span>知识库 RAG</span>
                    <span class="cap-tag active"><span class="cap-dot"></span>Agent 工具</span>
                  </div>
                </div>
              </template>

              <!-- 前端直连配置视图 -->
              <template v-else>
                <div class="provider-tabs" role="tablist" aria-label="直连服务厂商">
                  <button
                    v-for="provider in providers"
                    :key="provider.value"
                    type="button"
                    class="provider-tab"
                    :class="{ active: draft.provider === provider.value }"
                    role="tab"
                    :aria-selected="draft.provider === provider.value"
                    @click="selectDirectProvider(provider.value)"
                  >
                    <Bot v-if="provider.value === 'ollama'" :size="17" aria-hidden="true" />
                    <Waypoints v-else-if="provider.value === 'openai'" :size="17" aria-hidden="true" />
                    <Sparkles v-else :size="17" aria-hidden="true" />
                    <span>{{ provider.label }}</span>
                  </button>
                </div>

                <div class="settings-field-grid">
                  <div v-if="draft.provider === 'ollama'" class="settings-field">
                    <label for="ollama-url" class="settings-label">服务地址</label>
                    <input
                      id="ollama-url"
                      v-model="draft.ollama.url"
                      class="settings-input"
                      placeholder="http://localhost:11434"
                      spellcheck="false"
                      @input="onDirectDraftChanged"
                    />
                    <span class="settings-hint">Ollama 本地或局域网服务地址。</span>
                  </div>
                  <div v-else-if="draft.provider === 'openai'" class="settings-field">
                    <label for="openai-url" class="settings-label">服务地址</label>
                    <input
                      id="openai-url"
                      v-model="draft.openai.baseUrl"
                      class="settings-input"
                      placeholder="https://api.openai.com"
                      spellcheck="false"
                      @input="onDirectDraftChanged"
                    />
                    <span class="settings-hint">支持 OpenAI 兼容接口，例如 DeepSeek、Kimi 和通义。</span>
                  </div>
                  <div v-else class="settings-field">
                    <label class="settings-label">服务地址</label>
                    <div class="settings-readonly">Anthropic API <span>由 Claude 服务直连</span></div>
                    <span class="settings-hint">浏览器直连需配置跨域；或切换为后端调用模式。</span>
                  </div>

                  <div v-if="draft.provider === 'openai' || draft.provider === 'claude'" class="settings-field">
                    <label :for="`${draft.provider}-api-key`" class="settings-label">API Key</label>
                    <input
                      :id="`${draft.provider}-api-key`"
                      v-model="draft[draft.provider].apiKey"
                      class="settings-input"
                      type="password"
                      :placeholder="draft.provider === 'openai' ? 'sk-...' : 'sk-ant-...'"
                      spellcheck="false"
                      autocomplete="off"
                      @input="onDirectDraftChanged"
                    />
                    <span class="settings-hint">保存在浏览器本地，直连模型时使用。</span>
                  </div>
                </div>

                <div class="settings-field model-field">
                  <div class="field-label-row">
                    <label :for="`${draft.provider}-model`" class="settings-label">默认模型</label>
                    <button
                      type="button"
                      class="btn-refresh"
                      :disabled="loadingModels"
                      :class="{ loading: loadingModels }"
                      @click="loadModels"
                    >
                      <RefreshCw :size="14" :class="{ spinning: loadingModels }" aria-hidden="true" />
                      <span>{{ loadingModels ? '加载中…' : '刷新模型列表' }}</span>
                    </button>
                  </div>
                  <input
                    v-if="draft.provider === 'ollama'"
                    id="ollama-model"
                    v-model="draft.ollama.model"
                    class="settings-input"
                    list="ollama-models"
                    placeholder="例如：qwen2.5:7b"
                    spellcheck="false"
                    autocomplete="off"
                    @input="onDirectDraftChanged"
                  />
                  <input
                    v-else-if="draft.provider === 'openai'"
                    id="openai-model"
                    v-model="draft.openai.model"
                    class="settings-input"
                    list="openai-models"
                    placeholder="gpt-4o / deepseek-chat"
                    spellcheck="false"
                    autocomplete="off"
                    @input="onDirectDraftChanged"
                  />
                  <select
                    v-else
                    id="claude-model"
                    v-model="draft.claude.model"
                    class="settings-input settings-select"
                    @change="onDirectDraftChanged"
                  >
                    <option v-for="m in claudeModels" :key="m" :value="m">{{ m }}</option>
                  </select>
                  <datalist id="ollama-models"><option v-for="model in modelList" :key="model" :value="model" /></datalist>
                  <datalist id="openai-models"><option v-for="model in modelList" :key="model" :value="model" /></datalist>
                </div>

                <!-- 直连可用能力 -->
                <div class="settings-field">
                  <label class="settings-label">当前链路可用能力</label>
                  <div class="capabilities-badges">
                    <span class="cap-tag active"><span class="cap-dot"></span>普通聊天</span>
                    <span class="cap-tag" :class="directVisionSupported ? 'active' : 'disabled'" :title="directVisionDisabledReason">
                      <span class="cap-dot"></span>图片输入 {{ directVisionSupported ? '' : '(当前模型不支持)' }}
                    </span>
                    <span class="cap-tag disabled" title="RAG 仅支持后端调用"><span class="cap-dot"></span>知识库 RAG (直连不支持，需切换为后端调用)</span>
                    <span class="cap-tag disabled" title="Agent 工具仅支持后端调用"><span class="cap-dot"></span>Agent 工具 (直连不可用)</span>
                  </div>
                </div>
              </template>
            </section>

            <!-- 2. 外观 -->
            <section v-show="activeSection === 'appearance'" class="settings-section" aria-labelledby="section-appearance">
              <div class="section-heading">
                <div>
                  <span class="section-kicker">APPEARANCE</span>
                  <h2 id="section-appearance">外观</h2>
                  <p>选择界面主题，变更会立即生效。</p>
                </div>
              </div>
              <div class="theme-switcher" role="group" aria-label="主题">
                <button
                  v-for="theme in themes"
                  :key="theme.value"
                  type="button"
                  class="theme-btn"
                  :class="{ active: draft.theme === theme.value }"
                  :aria-pressed="draft.theme === theme.value"
                  @click="setTheme(theme.value)"
                >
                  <Moon v-if="theme.value === 'dark'" :size="17" aria-hidden="true" />
                  <Sun v-else-if="theme.value === 'light'" :size="17" aria-hidden="true" />
                  <Monitor v-else :size="17" aria-hidden="true" />
                  <span>{{ theme.label }}</span>
                </button>
              </div>
              <span class="settings-hint">主题设置立即生效；点击取消会恢复打开面板前的主题。</span>
            </section>

            <!-- 3. 模型参数 -->
            <section v-show="activeSection === 'model'" class="settings-section" aria-labelledby="section-model">
              <div class="section-heading">
                <div>
                  <span class="section-kicker">MODEL PARAMETERS</span>
                  <h2 id="section-model">模型参数</h2>
                  <p>控制当前模型的响应等待时间和上下文容量。</p>
                </div>
                <div class="model-chip"><Bot :size="15" aria-hidden="true" /><span>{{ currentModelSummary }}</span></div>
              </div>
              <div class="settings-field-grid two-columns">
                <div class="settings-field">
                  <div class="field-label-row">
                    <label for="response-timeout" class="settings-label">单个响应超时</label>
                    <span class="settings-value">{{ draft.responseTimeoutSeconds }} 秒</span>
                  </div>
                  <input id="response-timeout" v-model.number="draft.responseTimeoutSeconds" class="settings-input" type="number" min="5" step="5" />
                  <span class="settings-hint">等待模型返回首个片段的最长时间。</span>
                </div>
                <div class="settings-field">
                  <div class="field-label-row">
                    <label class="settings-label">顶栏显示模型</label>
                    <label class="settings-toggle" aria-label="顶栏显示模型">
                      <input v-model="draft.showModelInTopbar" type="checkbox" />
                      <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    </label>
                  </div>
                  <span class="settings-hint">在主界面标题旁显示当前模型选择胶囊。</span>
                </div>
              </div>
              <div class="settings-field context-field">
                <div class="field-label-row">
                  <div>
                    <label class="settings-label">上下文长度</label>
                    <span class="settings-hint field-subtitle">Token 估算上限</span>
                  </div>
                  <span class="settings-value">{{ contextTokenLabel }}</span>
                </div>
                <div class="context-presets">
                  <button
                    v-for="(tier, index) in contextTiers"
                    :key="tier.label"
                    type="button"
                    class="context-preset-btn"
                    :class="{ active: activeTierIndex === index }"
                    :aria-pressed="activeTierIndex === index"
                    @click="selectTier(index)"
                  >
                    {{ tier.label }}
                  </button>
                </div>
                <input
                  v-if="activeTier.max !== UNLIMITED"
                  :key="activeTierIndex"
                  v-model.number="draft.maxContextTokens"
                  class="settings-slider"
                  type="range"
                  :min="activeTier.min"
                  :max="activeTier.max"
                  :step="activeTier.step"
                  aria-label="上下文长度"
                />
                <div v-if="activeTier.max !== UNLIMITED" class="settings-slider-labels">
                  <span>{{ formatTokenLimit(activeTier.min) }}</span>
                  <span>{{ formatTokenLimit(activeTier.max) }}</span>
                </div>
              </div>
            </section>

            <!-- 4. 系统提示词 -->
            <section v-show="activeSection === 'prompt'" class="settings-section" aria-labelledby="section-prompt">
              <div class="section-heading">
                <div>
                  <span class="section-kicker">SYSTEM PROMPT</span>
                  <h2 id="section-prompt">系统提示词</h2>
                  <p>定义助手在新对话中的角色、语气与约束。</p>
                </div>
                <span class="prompt-badge">新对话生效</span>
              </div>
              <div class="settings-field" style="margin-bottom: 12px;">
                <label class="settings-label" style="margin-bottom: 6px;">场景预设模板</label>
                <div class="segmented-control two-up" role="group" aria-label="场景预设模板">
                  <button
                    type="button"
                    class="segmented-option"
                    :class="{ active: draft.scenario !== 'general' }"
                    :aria-pressed="draft.scenario !== 'general'"
                    @click="applyScenarioPreset('ticket')"
                  >
                    🛠️ 工单排障决策
                  </button>
                  <button
                    type="button"
                    class="segmented-option"
                    :class="{ active: draft.scenario === 'general' }"
                    :aria-pressed="draft.scenario === 'general'"
                    @click="applyScenarioPreset('general')"
                  >
                    📚 通用知识库问答
                  </button>
                </div>
              </div>
              <div class="prompt-editor">
                <textarea v-model="draft.systemPrompt" class="settings-textarea" rows="8" placeholder="输入系统提示词…"></textarea>
                <div class="prompt-editor-footer">
                  <span>{{ promptStats.characters }} 字 · 约 {{ promptStats.tokens }} Token</span>
                  <div class="prompt-actions">
                    <button type="button" class="text-action" @click="restorePrompt"><RotateCcw :size="14" aria-hidden="true" />恢复默认</button>
                    <button type="button" class="text-action danger-action" @click="draft.systemPrompt = ''"><Trash2 :size="14" aria-hidden="true" />清空</button>
                  </div>
                </div>
              </div>
              <div class="settings-info-card subtle">
                <MessageSquareText :size="17" aria-hidden="true" />
                <span>默认应用于新对话，已经开始的对话不会被重写。</span>
              </div>
            </section>

            <!-- 5. 知识库 -->
            <section v-show="activeSection === 'knowledge'" class="settings-section" aria-labelledby="section-knowledge">
              <div class="section-heading">
                <div>
                  <span class="section-kicker">KNOWLEDGE BASE</span>
                  <h2 id="section-knowledge">知识库</h2>
                  <p>配置后端调用时如何检索与使用工单知识库。</p>
                </div>
              </div>
              <div class="settings-field">
                <label class="settings-label">RAG 模式</label>
                <div class="segmented-control rag-control" :class="{ disabled: draft.transport !== 'backend' }" role="group" aria-label="RAG 模式">
                  <button
                    v-for="mode in ragModes"
                    :key="mode.value"
                    type="button"
                    class="segmented-option"
                    :class="{ active: draft.ragMode === mode.value }"
                    :disabled="draft.transport !== 'backend'"
                    :aria-pressed="draft.ragMode === mode.value"
                    @click="draft.ragMode = mode.value"
                  >
                    {{ mode.label }}
                  </button>
                </div>
                <span class="settings-hint">{{ draft.transport === 'backend' ? activeRagModeHint : 'RAG 仅支持后端调用；前端直连时该选项不生效。切回后端将恢复原设定。' }}</span>
              </div>
              <div class="settings-info-card" :class="{ warning: draft.transport !== 'backend' }">
                <Database :size="17" aria-hidden="true" />
                <div>
                  <strong>{{ draft.transport === 'backend' ? '知识库链路已就绪' : 'RAG 仅支持后端调用' }}</strong>
                  <span>{{ draft.transport === 'backend' ? '发送工单排障请求时，将按选定模式自动检索知识库片段。' : '当前处于前端直连模式，若需使用工单知识库，请切换至“后端调用”。' }}</span>
                </div>
              </div>
            </section>

            <!-- 6. 对话行为 -->
            <section v-show="activeSection === 'behavior'" class="settings-section" aria-labelledby="section-behavior">
              <div class="section-heading">
                <div>
                  <span class="section-kicker">CONVERSATION</span>
                  <h2 id="section-behavior">对话行为</h2>
                  <p>工单决策工作区保持现有的快速输入和流式体验。</p>
                </div>
              </div>
              <div class="behavior-list">
                <div class="behavior-row">
                  <span class="behavior-icon"><Sparkles :size="16" aria-hidden="true" /></span>
                  <div><strong>流式输出</strong><span>收到模型片段后立即显示。</span></div>
                  <span class="behavior-state">已启用</span>
                </div>
                <div class="behavior-row">
                  <span class="behavior-icon"><MessageSquareText :size="16" aria-hidden="true" /></span>
                  <div><strong>自动滚动</strong><span>停留在底部时跟随新消息，手动上滑后保留阅读位置。</span></div>
                  <span class="behavior-state">已启用</span>
                </div>
                <div class="behavior-row">
                  <span class="behavior-icon"><CornerDownLeft :size="16" aria-hidden="true" /></span>
                  <div><strong>Enter 发送</strong><span>Enter 发送消息，Shift + Enter 换行。</span></div>
                  <span class="behavior-state">已启用</span>
                </div>
              </div>
              <div class="settings-info-card subtle">
                <Settings2 :size="17" aria-hidden="true" />
                <span>这些行为由工单决策工作区统一管理，当前没有额外的持久化开关。</span>
              </div>
            </section>
          </main>
        </div>

        <!-- 底部栏：测试流程状态 + 真实测试按钮 + 取消 + 保存 -->
        <footer class="settings-footer" :class="{ 'has-save-error': saveError }">
          <div class="test-flow-status" role="status" aria-live="polite">
            <span class="test-flow-dot" :class="connectionTestFlowClass"></span>
            <span class="test-flow-text">{{ connectionTestFlowLabel }}</span>
          </div>
          <div class="footer-actions">
            <button
              v-if="connectionTestState === 'loading'"
              type="button"
              class="secondary-action btn-test-model btn-cancel-test"
              title="中断当前正在进行的连接测试"
              @click="cancelCurrentTest"
            >
              <X :size="15" aria-hidden="true" />
              <span>取消测试</span>
            </button>
            <button
              v-else
              type="button"
              class="secondary-action btn-test-model"
              :disabled="isTestModelDisabled"
              :title="testModelDisabledReason || '将发起一次最小真实推理请求，测试首个有效 token 是否正常到达'"
              @click="testCurrentModel"
            >
              <TestTube2 :size="15" aria-hidden="true" />
              <span>测试当前模型</span>
            </button>
            <button type="button" class="btn-cancel" @click="requestClose">取消</button>
            <button type="button" class="btn-save" :disabled="!hasUnsavedChanges || isSaving" :class="{ loading: isSaving }" @click="save">
              <LoaderCircle v-if="isSaving" class="spinning" :size="16" aria-hidden="true" />
              <Save v-else :size="16" aria-hidden="true" />
              <span>{{ isSaving ? '保存中…' : '保存更改' }}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch, type Component } from 'vue'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  CornerDownLeft,
  Database,
  LoaderCircle,
  MessageSquareText,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  TestTube2,
  Trash2,
  Waypoints,
  X,
} from 'lucide-vue-next'
import { persistSettings, settings, DEFAULT_TICKET_PROMPT, DEFAULT_GENERAL_PROMPT } from '../stores/settings'
import { fetchModels } from '../services/stream'
import { createRuntimeFromSettings } from '../services/runtime'
import { getClaudeModels } from '../services/providers/claude'
import { buildCatalogCacheKey, getBackendProvidersCatalog, type BackendChatProvider } from '../services/knowledge'
import { useAuthStore } from '../stores/auth'
import { testConnection, type TestConnectionResult } from '../services/connectionTester'
import { supportsVision } from '../services/modelCapabilities'
import { getValidBackendModels, resolveValidBackendModel } from '../services/activeConnection'
import type { AppSettings, BackendChatProviderType, BackendRagMode, ProviderType, ThemeType, TransportMode } from '../stores/settings'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'

const emit = defineEmits<{ close: [] }>()
const { confirm } = useConfirm()
const toast = useToast()
const UNLIMITED = 1100000

type SectionId = 'connection' | 'appearance' | 'model' | 'prompt' | 'knowledge' | 'behavior'
type ConnectionTestState = 'idle' | 'loading' | 'success' | 'error'

const sections: { id: SectionId; label: string; icon: Component }[] = [
  { id: 'connection', label: '模型连接', icon: Waypoints },
  { id: 'appearance', label: '外观', icon: Monitor },
  { id: 'model', label: '模型参数', icon: SlidersHorizontal },
  { id: 'prompt', label: '系统提示词', icon: MessageSquareText },
  { id: 'knowledge', label: '知识库', icon: Database },
  { id: 'behavior', label: '对话行为', icon: CornerDownLeft },
]

const themes: { value: ThemeType; label: string }[] = [
  { value: 'dark', label: '暗色' },
  { value: 'light', label: '浅色' },
  { value: 'system', label: '跟随系统' },
]

const providers: { value: ProviderType; label: string }[] = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'claude', label: 'Claude' },
]

const ragModes: { value: BackendRagMode; label: string; hint: string }[] = [
  { value: 'off', label: '关闭', hint: '发送 rag:false，后端直接推理，不检索知识库。' },
  { value: 'auto', label: '自动', hint: '发送 rag:auto，由后端按问题和命中分数自动判断是否检索。' },
  { value: 'force', label: '始终开启', hint: '发送 rag:true，后端强制检索，命中后注入资料。' },
]

const contextTiers = [
  { label: '8K', max: 8000, min: 500, step: 500 },
  { label: '32K', max: 32000, min: 1000, step: 1000 },
  { label: '128K', max: 128000, min: 2000, step: 2000 },
  { label: '256K', max: 256000, min: 4000, step: 4000 },
  { label: '1M', max: 1000000, min: 10000, step: 10000 },
  { label: '无限制', max: UNLIMITED, min: UNLIMITED, step: 1 },
]

const claudeModels = getClaudeModels()

const draft = reactive({
  ...settings,
  backend: { ...settings.backend },
  ollama: { ...settings.ollama },
  openai: { ...settings.openai },
  claude: { ...settings.claude },
})
const initialDraft = JSON.parse(JSON.stringify(draft)) as typeof draft

const activeSection = ref<SectionId>('connection')
const contentRef = ref<HTMLElement | null>(null)
const activeTierIndex = ref(findTierIndex(draft.maxContextTokens))
const activeTier = computed(() => contextTiers[activeTierIndex.value])

const modelList = ref<string[]>([])
const loadingModels = ref(false)
const modelError = ref('')

const backendProviders = ref<BackendChatProvider[]>([])
const loadingBackendProviders = ref(false)
const backendProviderError = ref('')
const backendReachable = ref<boolean | null>(null)
const auth = useAuthStore()
const loadedCatalogScope = ref<{ key: string; sessionVersion: number } | null>(null)
const hasCurrentBackendCatalog = computed(() => (
  backendReachable.value === true
  && !loadingBackendProviders.value
  && loadedCatalogScope.value?.key === buildCatalogCacheKey(draft.backend.url)
  && loadedCatalogScope.value.sessionVersion === auth.sessionVersion.value
))

const connectionTestState = ref<ConnectionTestState>('idle')
const connectionTestError = ref('')
const connectionTestSuccess = ref(false)
const testDurationMs = ref<number | null>(null)
const testFirstToken = ref('')

let currentTestAbortController: AbortController | null = null
let currentCatalogAbortController: AbortController | null = null
let draftTestSeq = 0
let draftCatalogSeq = 0

const saveError = ref('')
const isSaving = ref(false)

// 针对设计图 1 的三张后端服务卡片配置
const defaultBackendServices: Array<{ id: BackendChatProviderType; name: string }> = [
  { id: 'ollama', name: 'Ollama (本地)' },
  { id: 'openai', name: 'OpenAI 服务' },
  { id: 'anthropic', name: 'Claude 服务' },
]

const backendServiceList = computed(() => {
  const catalogList = backendProviders.value
  const hasLoaded = hasCurrentBackendCatalog.value
  return defaultBackendServices.map(def => {
    const matched = catalogList.find(p => p.id === def.id)
    if (!hasLoaded) {
      return {
        id: def.id,
        name: def.name,
        defaultModel: '',
        models: [],
        configured: false,
      }
    }
    const validModels = getValidBackendModels(matched)
    return {
      id: def.id,
      name: matched?.name || def.name,
      defaultModel: matched?.defaultModel || '',
      models: validModels,
      configured: Boolean(matched?.configured),
    }
  })
})

const currentBackendModels = computed<string[]>(() => {
  const currentSvc = backendServiceList.value.find(p => p.id === draft.backend.provider)
  if (!currentSvc || !currentSvc.configured) {
    return []
  }
  return currentSvc.models ?? []
})

watch(
  () => [draft.transport, draft.backend.provider, backendServiceList.value],
  () => {
    if (draft.transport !== 'backend' || !hasCurrentBackendCatalog.value) return
    const currentSvc = backendServiceList.value.find(p => p.id === draft.backend.provider)
    const validModel = resolveValidBackendModel(draft.backend.model, currentSvc)
    if (draft.backend.model !== validModel) {
      draft.backend.model = validModel
      onBackendModelChanged()
    }
  },
  { immediate: true }
)

const backendReachableStatus = computed(() => {
  if (backendReachable.value === true) return 'success'
  if (backendReachable.value === false) return 'error'
  return 'idle'
})

const backendReachableLabel = computed(() => {
  if (backendReachable.value === true) return '后端可访问'
  if (backendReachable.value === false) return '不可访问'
  return '待刷新'
})

const directVisionSupported = computed(() => {
  return supportsVision({
    provider: draft.provider,
    transport: 'direct',
    model: draft.provider === 'ollama' ? draft.ollama.model : draft.provider === 'openai' ? draft.openai.model : draft.claude.model,
    label: '',
    systemPrompt: '',
    maxContextTokens: 0,
    responseTimeoutSeconds: 0,
  })
})

const directVisionDisabledReason = computed(() => {
  return directVisionSupported.value ? undefined : '当前直连模型不支持图片输入'
})

const activeRagModeHint = computed(() => ragModes.find(mode => mode.value === draft.ragMode)?.hint ?? ragModes[0].hint)

const currentModelSummary = computed(() => {
  if (draft.transport === 'backend') {
    const matched = backendServiceList.value.find(p => p.id === draft.backend.provider)
    return `${matched?.name || draft.backend.provider} · ${draft.backend.model || '未选择模型'}`
  }
  const providerName = providers.find(p => p.value === draft.provider)?.label ?? draft.provider
  const modelName = draft.provider === 'ollama' ? draft.ollama.model : draft.provider === 'openai' ? draft.openai.model : draft.claude.model
  return `${providerName} · ${modelName || '未选择模型'}`
})

const promptStats = computed(() => ({
  characters: draft.systemPrompt.length,
  tokens: Math.max(0, Math.ceil(draft.systemPrompt.trim().length / 4)),
}))

const changedSettingCount = computed(() => {
  const currentTicketPrompt = draft.scenario === 'general'
    ? (draft.ticketPrompt ?? DEFAULT_TICKET_PROMPT)
    : draft.systemPrompt
  const currentGeneralPrompt = draft.scenario === 'general'
    ? draft.systemPrompt
    : (draft.generalPrompt ?? DEFAULT_GENERAL_PROMPT)

  const pairs: [unknown, unknown][] = [
    [draft.transport, initialDraft.transport],
    [draft.provider, initialDraft.provider],
    [draft.theme, initialDraft.theme],
    [draft.systemPrompt, initialDraft.systemPrompt],
    [draft.scenario, initialDraft.scenario],
    [currentTicketPrompt, initialDraft.ticketPrompt],
    [currentGeneralPrompt, initialDraft.generalPrompt],
    [draft.maxContextTokens, initialDraft.maxContextTokens],
    [draft.responseTimeoutSeconds, initialDraft.responseTimeoutSeconds],
    [draft.showModelInTopbar, initialDraft.showModelInTopbar],
    [draft.ragMode, initialDraft.ragMode],
    [draft.backend.url, initialDraft.backend.url],
    [draft.backend.provider, initialDraft.backend.provider],
    [draft.backend.model, initialDraft.backend.model],
    [draft.ollama.url, initialDraft.ollama.url],
    [draft.ollama.model, initialDraft.ollama.model],
    [draft.openai.apiKey, initialDraft.openai.apiKey],
    [draft.openai.baseUrl, initialDraft.openai.baseUrl],
    [draft.openai.model, initialDraft.openai.model],
    [draft.claude.apiKey, initialDraft.claude.apiKey],
    [draft.claude.model, initialDraft.claude.model],
  ]
  return pairs.filter(([current, initial]) => current !== initial).length
})

const hasUnsavedChanges = computed(() => changedSettingCount.value > 0)
const contextTokenLabel = computed(() => formatTokenLimit(draft.maxContextTokens))

const dirtySections = computed<Record<SectionId, boolean>>(() => ({
  connection: draft.transport !== initialDraft.transport
    || draft.backend.url !== initialDraft.backend.url
    || draft.backend.provider !== initialDraft.backend.provider
    || draft.backend.model !== initialDraft.backend.model
    || draft.provider !== initialDraft.provider
    || draft.ollama.url !== initialDraft.ollama.url
    || draft.ollama.model !== initialDraft.ollama.model
    || draft.openai.apiKey !== initialDraft.openai.apiKey
    || draft.openai.baseUrl !== initialDraft.openai.baseUrl
    || draft.openai.model !== initialDraft.openai.model
    || draft.claude.apiKey !== initialDraft.claude.apiKey
    || draft.claude.model !== initialDraft.claude.model,
  model: draft.maxContextTokens !== initialDraft.maxContextTokens
    || draft.responseTimeoutSeconds !== initialDraft.responseTimeoutSeconds
    || draft.showModelInTopbar !== initialDraft.showModelInTopbar,
  prompt: draft.systemPrompt !== initialDraft.systemPrompt
    || draft.scenario !== initialDraft.scenario
    || (draft.scenario === 'general' ? draft.systemPrompt : draft.generalPrompt) !== initialDraft.generalPrompt
    || (draft.scenario === 'ticket' ? draft.systemPrompt : draft.ticketPrompt) !== initialDraft.ticketPrompt,
  knowledge: draft.ragMode !== initialDraft.ragMode,
  behavior: false,
  appearance: draft.theme !== initialDraft.theme,
}))

const connectionTestFlowClass = computed(() => {
  if (connectionTestState.value === 'loading') return 'testing'
  if (connectionTestState.value === 'success') return 'success'
  if (connectionTestState.value === 'error') return 'error'
  return 'idle'
})

const connectionTestFlowLabel = computed(() => {
  if (connectionTestState.value === 'loading') {
    return '测试中：正在向模型发起一次最小流式推理测试…'
  }
  if (connectionTestState.value === 'success') {
    const duration = testDurationMs.value !== null ? ` [${testDurationMs.value}ms]` : ''
    const preview = testFirstToken.value ? ` (首字: "${testFirstToken.value.slice(0, 15)}")` : ''
    return draft.transport === 'backend'
      ? `后端服务测试通过${duration}${preview}`
      : `直连服务测试通过${duration}${preview}`
  }
  if (connectionTestState.value === 'error') {
    const duration = testDurationMs.value !== null ? ` [${testDurationMs.value}ms]` : ''
    return `调用失败${duration}：${connectionTestError.value}`
  }
  if (hasUnsavedChanges.value) {
    return `有 ${changedSettingCount.value} 项修改尚未保存 (测试使用草稿配置)`
  }
  return '设置已保存'
})

function findTierIndex(value: number): number {
  if (value >= UNLIMITED) return contextTiers.length - 1
  const index = contextTiers.findIndex(tier => value <= tier.max)
  return index < 0 ? contextTiers.length - 2 : index
}

function selectTier(index: number) {
  activeTierIndex.value = index
  draft.maxContextTokens = contextTiers[index].max
}

function formatTokenLimit(value: number): string {
  if (value >= UNLIMITED) return '无限制'
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return String(value)
}

function setTheme(theme: ThemeType) {
  draft.theme = theme
  settings.theme = theme
}

function restorePrompt() {
  if (draft.scenario === 'general') {
    draft.generalPrompt = DEFAULT_GENERAL_PROMPT
    draft.systemPrompt = DEFAULT_GENERAL_PROMPT
  } else {
    draft.ticketPrompt = DEFAULT_TICKET_PROMPT
    draft.systemPrompt = DEFAULT_TICKET_PROMPT
  }
}

function applyScenarioPreset(target: 'ticket' | 'general') {
  if (draft.scenario === target) return
  // 保存当前正在编辑的内容到对应独立字段
  if (draft.scenario === 'general') {
    draft.generalPrompt = draft.systemPrompt
  } else {
    draft.ticketPrompt = draft.systemPrompt
  }
  draft.scenario = target
  draft.systemPrompt = target === 'general'
    ? (draft.generalPrompt?.trim() ? draft.generalPrompt : DEFAULT_GENERAL_PROMPT)
    : (draft.ticketPrompt?.trim() ? draft.ticketPrompt : DEFAULT_TICKET_PROMPT)
}

function sectionHasChanges(sectionId: SectionId): boolean {
  return dirtySections.value[sectionId]
}

function resetTestState() {
  if (currentTestAbortController) {
    currentTestAbortController.abort()
    currentTestAbortController = null
  }
  draftTestSeq++
  connectionTestState.value = 'idle'
  connectionTestError.value = ''
  connectionTestSuccess.value = false
  testDurationMs.value = null
  testFirstToken.value = ''
}

function setTransport(mode: TransportMode) {
  draft.transport = mode
  resetTestState()
  if (mode === 'backend') {
    void loadBackendProviders()
  } else {
    void loadModels()
  }
}

function selectBackendService(id: BackendChatProviderType) {
  draft.backend.provider = id
  if (hasCurrentBackendCatalog.value) {
    const svc = backendServiceList.value.find(p => p.id === id)
    draft.backend.model = resolveValidBackendModel(draft.backend.model, svc)
  }
  onBackendModelChanged()
}

function selectDirectProvider(value: ProviderType) {
  draft.provider = value
  resetTestState()
  void loadModels()
}

function onBackendUrlChanged() {
  draftCatalogSeq++
  if (currentCatalogAbortController) {
    currentCatalogAbortController.abort()
    currentCatalogAbortController = null
  }
  loadingBackendProviders.value = false
  backendProviders.value = []
  backendReachable.value = null
  loadedCatalogScope.value = null
  backendProviderError.value = ''
  resetTestState()
}

function onBackendModelChanged() {
  resetTestState()
}

onUnmounted(() => {
  if (currentCatalogAbortController) {
    currentCatalogAbortController.abort()
    currentCatalogAbortController = null
  }
  resetTestState()
})

function onDirectDraftChanged() {
  resetTestState()
}

function discardChanges() {
  settings.theme = initialDraft.theme
  emit('close')
}

async function requestClose() {
  if (!hasUnsavedChanges.value) {
    discardChanges()
    return
  }
  const shouldDiscard = await confirm({
    title: '放弃未保存的修改？',
    message: `还有 ${changedSettingCount.value} 项修改未保存，放弃后这些内容将丢失。`,
    cancelText: '继续编辑',
    confirmText: '放弃更改',
    danger: true,
  })
  if (shouldDiscard) discardChanges()
}

async function loadModels() {
  loadingModels.value = true
  modelError.value = ''
  modelList.value = []
  resetTestState()
  const providerKey = draft.provider
  const runtime = createRuntimeFromSettings({ ...draft, provider: providerKey, transport: 'direct' })
  try {
    const list = await fetchModels(runtime)
    if (providerKey === 'claude') {
      modelList.value = claudeModels
    } else if (list.length === 0) {
      modelError.value = '未能获取模型列表，请检查服务地址或 API Key 是否正确。'
    } else {
      modelList.value = list
      const currentModel = providerKey === 'openai' ? draft.openai.model : draft.ollama.model
      if (!currentModel.trim()) {
        if (providerKey === 'openai') draft.openai.model = list[0]
        else draft.ollama.model = list[0]
      }
    }
  } catch (error) {
    modelError.value = error instanceof Error ? error.message : '模型列表加载失败。'
  } finally {
    loadingModels.value = false
  }
}

async function loadBackendProviders() {
  const seq = ++draftCatalogSeq
  if (currentCatalogAbortController) {
    currentCatalogAbortController.abort()
  }
  const abortCtrl = new AbortController()
  currentCatalogAbortController = abortCtrl

  loadingBackendProviders.value = true
  backendReachable.value = null
  loadedCatalogScope.value = null
  backendProviderError.value = ''
  resetTestState()

  const catalogScope = {
    key: buildCatalogCacheKey(draft.backend.url),
    sessionVersion: auth.sessionVersion.value,
  }
  const isCurrentRequest = () => (
    seq === draftCatalogSeq
    && !abortCtrl.signal.aborted
    && catalogScope.key === buildCatalogCacheKey(draft.backend.url)
    && catalogScope.sessionVersion === auth.sessionVersion.value
  )

  try {
    const draftUrl = draft.backend.url
    const catalog = await getBackendProvidersCatalog({
      baseUrl: draftUrl,
      forceRefresh: true,
      signal: abortCtrl.signal,
      skipAuthInterception: true,
    })

    if (!isCurrentRequest()) return

    if (catalog.state === 'success') {
      backendProviders.value = catalog.providers
      backendReachable.value = true
      loadedCatalogScope.value = catalogScope

      if (catalog.providers.length > 0) {
        const currentProvider = catalog.providers.find(p => p.id === draft.backend.provider)
        if (!currentProvider || !currentProvider.configured) {
          backendProviderError.value = currentProvider
            ? `${currentProvider.name || draft.backend.provider} 未在后端配置可用密钥或服务`
            : `后端未提供当前选中的厂商 (${draft.backend.provider})`
        } else {
          const validModels = getValidBackendModels(currentProvider)
          if (validModels.length === 0) {
            backendProviderError.value = `${currentProvider.name || draft.backend.provider} 无可用模型候选`
          }
        }
      } else {
        backendProviderError.value = '后端无可用模型服务'
      }
    } else if (catalog.state === 'error') {
      backendReachable.value = false
      backendProviderError.value = catalog.error || '后端厂商列表获取失败。'
      backendProviders.value = []
    }
  } catch (error: any) {
    if (!isCurrentRequest()) return
    if (error?.name === 'AbortError') return
    backendReachable.value = false
    backendProviderError.value = error instanceof Error ? error.message : '后端厂商列表获取失败。'
    backendProviders.value = []
  } finally {
    if (seq === draftCatalogSeq) {
      loadingBackendProviders.value = false
      currentCatalogAbortController = null
    }
  }
}

const testModelDisabledReason = computed<string | undefined>(() => {
  if (draft.transport === 'backend') {
    if (!hasCurrentBackendCatalog.value) {
      return '服务目录不可用'
    }
    const currentSvc = backendServiceList.value.find(p => p.id === draft.backend.provider)
    if (!currentSvc || !currentSvc.configured) {
      return '服务未配置'
    }
    const validModels = currentSvc.models ?? []
    if (validModels.length === 0 || !draft.backend.model || !validModels.includes(draft.backend.model)) {
      return '当前没有有效模型'
    }
    return undefined
  } else {
    if (draft.provider === 'ollama' && !draft.ollama.model?.trim()) {
      return '未填写 Ollama 模型'
    }
    if (draft.provider === 'openai') {
      if (!draft.openai.apiKey?.trim()) return '请先填写 API Key'
      if (!draft.openai.model?.trim()) return '未填写模型名称'
    }
    if (draft.provider === 'claude') {
      if (!draft.claude.apiKey?.trim()) return '请先填写 API Key'
      if (!draft.claude.model?.trim()) return '未选择 Claude 模型'
    }
    return undefined
  }
})
const isTestModelDisabled = computed(() => Boolean(testModelDisabledReason.value))

async function testCurrentModel() {
  const seq = ++draftTestSeq
  if (currentTestAbortController) {
    currentTestAbortController.abort()
  }

  if (testModelDisabledReason.value) {
    connectionTestSuccess.value = false
    connectionTestState.value = 'error'
    connectionTestError.value = testModelDisabledReason.value
    return
  }

  const abortCtrl = new AbortController()
  currentTestAbortController = abortCtrl

  connectionTestState.value = 'loading'
  connectionTestError.value = ''
  connectionTestSuccess.value = false
  testDurationMs.value = null
  testFirstToken.value = ''

  const timeoutMs = Math.max(5, draft.responseTimeoutSeconds || 30) * 1000

  try {
    let result: TestConnectionResult

    if (draft.transport === 'backend') {
      const model = draft.backend.model?.trim()
      if (!model) throw new Error('当前没有有效模型')

      result = await testConnection({
        transport: 'backend',
        provider: draft.backend.provider,
        model,
        baseUrl: draft.backend.url,
        timeoutMs,
        signal: abortCtrl.signal,
      })
    } else {
      let model = ''
      let baseUrl = ''
      let apiKey = ''

      if (draft.provider === 'ollama') {
        model = draft.ollama.model?.trim()
        baseUrl = draft.ollama.url
        if (!model) throw new Error('未填写 Ollama 模型')
      } else if (draft.provider === 'openai') {
        model = draft.openai.model?.trim()
        baseUrl = draft.openai.baseUrl
        apiKey = draft.openai.apiKey?.trim()
        if (!apiKey) throw new Error('请先填写 API Key')
        if (!model) throw new Error('未填写模型名称')
      } else if (draft.provider === 'claude') {
        model = draft.claude.model?.trim()
        apiKey = draft.claude.apiKey?.trim()
        if (!apiKey) throw new Error('请先填写 API Key')
        if (!model) throw new Error('未选择 Claude 模型')
      }

      result = await testConnection({
        transport: 'direct',
        provider: draft.provider,
        model,
        baseUrl,
        apiKey,
        timeoutMs,
        signal: abortCtrl.signal,
      })
    }

    if (seq !== draftTestSeq) return

    testDurationMs.value = result.durationMs
    if (result.ok) {
      testFirstToken.value = result.firstToken || ''
      connectionTestSuccess.value = true
      connectionTestState.value = 'success'
    } else {
      connectionTestSuccess.value = false
      connectionTestState.value = 'error'
      connectionTestError.value = result.error || '测试失败'
    }
  } catch (err: any) {
    if (seq !== draftTestSeq) return
    testDurationMs.value = null
    connectionTestSuccess.value = false
    connectionTestState.value = 'error'
    connectionTestError.value = err?.message || '测试异常'
  } finally {
    if (seq === draftTestSeq) {
      currentTestAbortController = null
    }
  }
}

function cancelCurrentTest() {
  if (currentTestAbortController) {
    currentTestAbortController.abort()
    currentTestAbortController = null
  }
  draftTestSeq++
  connectionTestState.value = 'idle'
  connectionTestError.value = '测试已取消'
  connectionTestSuccess.value = false
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value)) return 30
  return Math.max(5, Math.round(value))
}

function createSettingsSnapshot(): AppSettings {
  const backend = { ...draft.backend }
  if (draft.transport === 'backend' && hasCurrentBackendCatalog.value) {
    const provider = backendServiceList.value.find(item => item.id === backend.provider)
    backend.model = resolveValidBackendModel(backend.model, provider)
  }
  const ticketPrompt = draft.scenario === 'general'
    ? (draft.ticketPrompt ?? DEFAULT_TICKET_PROMPT)
    : draft.systemPrompt
  const generalPrompt = draft.scenario === 'general'
    ? draft.systemPrompt
    : (draft.generalPrompt ?? DEFAULT_GENERAL_PROMPT)

  return {
    transport: draft.transport,
    provider: draft.provider,
    theme: draft.theme,
    systemPrompt: draft.systemPrompt,
    ticketPrompt,
    generalPrompt,
    maxContextTokens: draft.maxContextTokens,
    responseTimeoutSeconds: normalizeTimeout(draft.responseTimeoutSeconds),
    showModelInTopbar: draft.showModelInTopbar,
    ragMode: draft.ragMode,
    scenario: draft.scenario,
    backend,
    ollama: { ...draft.ollama },
    openai: { ...draft.openai },
    claude: { ...draft.claude },
  }
}

function save() {
  if (!hasUnsavedChanges.value || isSaving.value) return
  isSaving.value = true
  saveError.value = ''
  try {
    const nextSettings = createSettingsSnapshot()
    persistSettings(nextSettings)
    Object.assign(settings, {
      transport: nextSettings.transport,
      provider: nextSettings.provider,
      theme: nextSettings.theme,
      systemPrompt: nextSettings.systemPrompt,
      ticketPrompt: nextSettings.ticketPrompt,
      generalPrompt: nextSettings.generalPrompt,
      maxContextTokens: nextSettings.maxContextTokens,
      responseTimeoutSeconds: nextSettings.responseTimeoutSeconds,
      showModelInTopbar: nextSettings.showModelInTopbar,
      ragMode: nextSettings.ragMode,
      scenario: nextSettings.scenario,
    })
    Object.assign(settings.backend, nextSettings.backend)
    Object.assign(settings.ollama, nextSettings.ollama)
    Object.assign(settings.openai, nextSettings.openai)
    Object.assign(settings.claude, nextSettings.claude)
    toast.show('设置已保存', 'success')
    emit('close')
  } catch (error) {
    saveError.value = error instanceof Error && error.message
      ? `未能保存到此设备：${error.message}`
      : '未能保存到此设备，请检查浏览器存储权限后重试。'
  } finally {
    isSaving.value = false
  }
}

watch(activeSection, async () => {
  await nextTick()
  if (contentRef.value) contentRef.value.scrollTop = 0
})

void loadModels()
void loadBackendProviders()
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  justify-content: flex-end;
  background: var(--bg-overlay);
}
.settings-panel {
  width: min(760px, 100vw);
  height: 100dvh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  animation: settings-drawer-in var(--motion-slow) var(--ease-standard);
}
@keyframes settings-drawer-in {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: translateX(0); }
}
.settings-header {
  min-height: 72px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
}
.settings-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.settings-eyebrow {
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
}
.settings-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}
.settings-close,
.btn-cancel,
.btn-save,
.btn-refresh,
.secondary-action,
.text-action,
.theme-btn,
.provider-tab,
.segmented-option,
.settings-nav-item,
.settings-mobile-tab,
.context-preset-btn {
  font: inherit;
  letter-spacing: 0;
}
.settings-close {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.settings-close:hover {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: var(--accent-border);
}
.settings-layout {
  min-height: 0;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
}
.settings-nav {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 22px 12px;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-sidebar);
}
.settings-nav-title {
  padding: 0 10px 10px;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .13em;
  text-transform: uppercase;
}
.settings-nav-item {
  min-height: 44px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 15px;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
}
.settings-nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-surface-2);
}
.settings-nav-item.active {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: var(--accent-border);
}
.settings-nav-note {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 14px 10px 4px;
  color: var(--text-faint);
  font-size: 11px;
}
.settings-nav-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 9px color-mix(in srgb, var(--success) 50%, transparent);
}
.settings-mobile-tabs {
  display: none;
}
.settings-content {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 28px 30px 120px;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}
.settings-section {
  max-width: 560px;
  margin: 0 auto;
}
.section-heading {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 26px;
}
.section-kicker {
  display: block;
  margin-bottom: 7px;
  color: var(--accent-text);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .14em;
}
.section-heading h2 {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-size: 24px;
  line-height: 1.2;
}
.section-heading p {
  max-width: 420px;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.55;
}
.section-heading > div { min-width: 0; }
.section-heading h2, .section-heading p { overflow-wrap: anywhere; }

.settings-field,
.settings-field-grid { min-width: 0; }
.settings-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}
.settings-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.settings-field-grid.two-columns { gap: 20px; }
.settings-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}
.settings-hint {
  min-width: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.subtle-note {
  margin-top: 4px;
  color: var(--text-faint);
}
.field-subtitle { display: block; margin-top: 3px; }
.field-label-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.settings-input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  outline: none;
  font-family: var(--font-sans);
  font-size: 13px;
  transition: border-color var(--motion-fast), box-shadow var(--motion-fast), background var(--motion-fast);
}
.settings-input:hover { border-color: var(--border-strong); }
.settings-input:focus { border-color: var(--accent); box-shadow: var(--focus-ring); }
.settings-input::placeholder { color: var(--text-placeholder); }
.settings-select { appearance: auto; cursor: pointer; }
.settings-readonly {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  color: var(--text-primary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-faint);
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.settings-readonly span { color: var(--text-muted); font-size: 11px; }

.input-with-action {
  display: flex;
  align-items: center;
  gap: 8px;
}
.input-with-action .settings-input {
  flex: 1 1 auto;
}
.action-inside-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* 视觉设计图 1: 后端服务卡片 */
.backend-service-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 4px;
}
.service-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: border-color var(--motion-fast), background var(--motion-fast), box-shadow var(--motion-fast);
}
.service-card:hover:not(.disabled) {
  border-color: var(--border-strong);
  background: var(--bg-surface);
}
.service-card.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, var(--bg-surface-2));
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 25%, transparent);
}
.service-card.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.service-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-text);
}
.service-card-name {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

/* 链路可用能力标签 */
.capabilities-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.cap-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
}
.cap-tag.active {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.28);
}
.cap-tag.disabled {
  color: var(--text-faint);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
}
.cap-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* 状态徽标 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  white-space: nowrap;
}
.status-badge.success {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.28);
}
.status-badge.error {
  color: var(--danger);
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
}
.status-badge.idle {
  color: var(--text-muted);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
.segmented-control.rag-control { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.segmented-control.disabled { opacity: .58; }
.segmented-option {
  min-width: 0;
  min-height: 40px;
  padding: 7px 9px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
}
.segmented-option:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-surface);
}
.segmented-option.active {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: var(--accent-border);
}
.segmented-option:disabled { cursor: not-allowed; }

.settings-info-card {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  color: var(--accent-text);
}
.settings-info-card > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.settings-info-card strong { color: var(--text-primary); font-size: 12px; }
.settings-info-card span { color: var(--text-muted); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.settings-info-card.subtle { color: var(--text-secondary); background: transparent; border-color: var(--border-faint); }
.settings-info-card.warning { color: var(--warning); background: var(--warning-bg); border-color: var(--warning-border); }

.provider-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 24px;
}
.provider-tab {
  min-width: 0;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 8px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
}
.provider-tab:hover { color: var(--text-primary); border-color: var(--border-strong); }
.provider-tab.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }

.btn-refresh,
.secondary-action,
.text-action {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn-refresh {
  flex: 0 0 auto;
  padding: 6px 10px;
  color: var(--accent-text);
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  font-size: 11px;
}
.btn-refresh:hover:not(:disabled),
.secondary-action:hover:not(:disabled) {
  background: var(--accent-bg);
  border-color: var(--accent);
}
.btn-refresh:disabled,
.secondary-action:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.spinning { animation: settings-spin 850ms linear infinite; }
@keyframes settings-spin { to { transform: rotate(360deg); } }

.model-chip,
.prompt-badge {
  max-width: 45%;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  color: var(--accent-text);
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-pill);
  font-size: 11px;
}
.model-chip span { min-width: 0; overflow-wrap: anywhere; }

.settings-value {
  color: var(--data-accent);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.context-field { margin-top: 4px; }
.context-presets {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  margin-top: 4px;
}
.context-preset-btn {
  min-width: 0;
  min-height: 36px;
  padding: 5px 4px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
}
.context-preset-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }
.context-preset-btn.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }
.settings-slider {
  appearance: none;
  width: 100%;
  height: 32px;
  margin: 4px 0 0;
  background: transparent;
  cursor: pointer;
}
.settings-slider::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--border);
}
.settings-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -5.5px;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}
.settings-slider-labels {
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 10px;
}

.prompt-editor {
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-input);
}
.settings-textarea {
  width: 100%;
  min-height: 180px;
  display: block;
  resize: vertical;
  padding: 14px;
  color: var(--text-primary);
  background: transparent;
  border: 0;
  outline: 0;
  font: inherit;
  font-size: 13px;
  line-height: 1.65;
}
.settings-textarea:focus { box-shadow: inset 0 0 0 2px var(--accent-border); }
.prompt-editor-footer {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
}
.prompt-actions { display: flex; gap: 5px; }
.text-action {
  padding: 5px 7px;
  min-height: 32px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  font-size: 11px;
}
.text-action:hover { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }
.text-action.danger-action:hover { color: var(--danger); background: var(--danger-bg); border-color: var(--danger-border); }

.behavior-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 24px;
  border-top: 1px solid var(--border-subtle);
}
.behavior-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 70px;
  border-bottom: 1px solid var(--border-subtle);
}
.behavior-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: var(--accent-text);
  background: var(--accent-bg);
  border-radius: var(--radius-sm);
}
.behavior-row div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.behavior-row strong { color: var(--text-primary); font-size: 13px; }
.behavior-row div span { color: var(--text-muted); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.behavior-state {
  padding: 4px 7px;
  color: var(--success);
  background: var(--success-bg);
  border-radius: var(--radius-pill);
  font-size: 10px;
  white-space: nowrap;
}

.theme-switcher {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.theme-btn {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
}
.theme-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }
.theme-btn.active { color: var(--accent-text); background: var(--accent-bg); border-color: var(--accent-border); }

/* 底部状态条与操作区 (匹配设计图 1) */
.settings-footer {
  min-height: 76px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 24px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-topbar);
}
.test-flow-status {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.test-flow-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--text-muted);
}
.test-flow-dot.success {
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}
.test-flow-dot.error {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}
.test-flow-dot.testing {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
  animation: test-dot-pulse 1s ease-in-out infinite alternate;
}
@keyframes test-dot-pulse {
  from { opacity: 0.4; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1.15); }
}
.test-flow-text {
  min-width: 0;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.btn-test-model {
  padding: 8px 14px;
  color: var(--text-primary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  font-size: 12px;
}
.btn-cancel-test {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
}
.btn-cancel-test:hover {
  background: rgba(239, 68, 68, 0.16);
  border-color: #ef4444;
}
.btn-cancel,
.btn-save {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.btn-cancel {
  color: var(--text-secondary);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
}
.btn-cancel:hover { color: var(--text-primary); border-color: var(--border-strong); }
.btn-save {
  color: #fff;
  background: var(--accent-deep);
  border: 1px solid var(--accent-border);
  box-shadow: 0 0 16px var(--accent-glow);
}
.btn-save:hover:not(:disabled) { background: var(--accent-deeper); }
.btn-save:disabled {
  color: var(--text-faint);
  background: var(--bg-surface-3);
  border-color: var(--border-faint);
  box-shadow: none;
  cursor: not-allowed;
}

.settings-close:focus-visible,
.settings-nav-item:focus-visible,
.settings-mobile-tab:focus-visible,
.provider-tab:focus-visible,
.segmented-option:focus-visible,
.btn-refresh:focus-visible,
.secondary-action:focus-visible,
.text-action:focus-visible,
.theme-btn:focus-visible,
.context-preset-btn:focus-visible,
.btn-cancel:focus-visible,
.btn-save:focus-visible,
.settings-toggle input:focus-visible + .toggle-track,
.settings-slider:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.settings-toggle {
  position: relative;
  display: inline-flex;
  min-width: 44px;
  min-height: 32px;
  align-items: center;
  justify-content: flex-end;
  cursor: pointer;
}
.settings-toggle input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.toggle-track {
  width: 38px;
  height: 22px;
  display: flex;
  align-items: center;
  padding: 3px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
}
.toggle-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform var(--motion-fast), background var(--motion-fast);
}
.settings-toggle input:checked + .toggle-track {
  background: var(--accent-bg);
  border-color: var(--accent-border);
}
.settings-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(16px);
  background: var(--accent);
}

.settings-header-actions {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-header-status {
  min-width: 0;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  color: var(--success);
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  white-space: nowrap;
}
.settings-header-status.dirty {
  color: var(--accent-text);
  background: var(--accent-bg);
  border-color: var(--accent-border);
}
.settings-header-status.error {
  color: var(--danger);
  background: var(--danger-bg);
  border-color: var(--danger-border);
}
.settings-dirty-banner {
  min-width: 0;
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 24px;
  color: var(--accent-text);
  background: var(--accent-bg);
  border-bottom: 1px solid var(--accent-border);
}
.settings-dirty-banner > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-dirty-banner strong {
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.35;
}
.settings-dirty-banner span {
  color: var(--accent-text);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.settings-nav-label,
.settings-tab-label {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow-wrap: anywhere;
}
.settings-dirty-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

@media (max-width: 767px) {
  .settings-panel { width: 100vw; border-left: 0; }
  .settings-header { min-height: 62px; padding: 0 14px 0 16px; }
  .settings-eyebrow { display: none; }
  .settings-title { font-size: 17px; }
  .settings-layout { display: flex; flex-direction: column; overflow: hidden; }
  .settings-nav { display: none; }
  .settings-mobile-tabs {
    min-width: 0;
    flex: 0 0 auto;
    display: flex;
    gap: 5px;
    overflow-x: auto;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-topbar);
    scrollbar-width: none;
  }
  .settings-mobile-tabs::-webkit-scrollbar { display: none; }
  .settings-mobile-tab {
    min-width: max-content;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    cursor: pointer;
    font-size: 12px;
  }
  .settings-mobile-tab.active {
    color: var(--accent-text);
    background: var(--accent-bg);
    border-color: var(--accent-border);
  }
  .settings-content {
    width: 100%;
    min-height: 0;
    flex: 1 1 auto;
    padding: 22px 16px calc(124px + env(safe-area-inset-bottom));
  }
  .settings-section { max-width: none; }
  .section-heading { margin-bottom: 22px; flex-wrap: wrap; }
  .section-heading h2 { font-size: 22px; }
  .section-heading p { font-size: 12px; }
  .backend-service-cards { grid-template-columns: 1fr; }
  .settings-field-grid,
  .settings-field-grid.two-columns { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .provider-tab { padding: 8px 5px; flex-direction: column; gap: 4px; font-size: 11px; }
  .segmented-option { padding: 7px 5px; }
  .context-presets { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .settings-textarea { min-height: 140px; }
  .prompt-editor-footer { align-items: flex-start; flex-direction: column; }
  .prompt-actions { width: 100%; justify-content: flex-end; }
  .model-chip, .prompt-badge { max-width: 100%; }
  .settings-footer {
    min-height: 96px;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  }
  .test-flow-status { flex: 0 0 auto; }
  .footer-actions { width: 100%; flex-wrap: wrap; }
  .footer-actions button { flex: 1 1 auto; }
}
</style>
