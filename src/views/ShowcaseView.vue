<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowRight,
  Bot,
  Check,
  Code2,
  Columns2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Layers,
  Lock,
  MessageSquare,
  Moon,
  Network,
  RotateCcw,
  Shield,
  Sparkles,
  Sun,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-vue-next'
import { settings } from '../stores/settings'

const emit = defineEmits<{
  (e: 'enter-workspace', mode?: 'chat' | 'agent' | 'compare' | 'knowledge'): void
}>()

// ── 主题同步与切换逻辑 ──
const systemPrefersDark = ref(
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
)

let sysMediaQuery: MediaQueryList | null = null
function handleSysThemeChange(e: MediaQueryListEvent) {
  systemPrefersDark.value = e.matches
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    sysMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    sysMediaQuery.addEventListener('change', handleSysThemeChange)
  }
})

onBeforeUnmount(() => {
  sysMediaQuery?.removeEventListener('change', handleSysThemeChange)
})

const isLightMode = computed(() => {
  if (settings.theme === 'light') return true
  if (settings.theme === 'dark') return false
  return !systemPrefersDark.value
})

function toggleTheme() {
  settings.theme = isLightMode.value ? 'dark' : 'light'
}

// ── 场景切换：企业工单排障 vs 个人私有知识库 ──
type Scenario = 'enterprise' | 'personal'
const activeScenario = ref<Scenario>('enterprise')

// ── 展台当前选中的工作台 Tab ──
type MockupTab = 'chat' | 'agent' | 'compare' | 'knowledge'
const activeMockTab = ref<MockupTab>('chat')

// ── 复制交互状态 ──
const copiedWeChat = ref(false)
const copiedCommand = ref(false)

const authorInfo = {
  name: 'AI Chat 架构作者',
  role: '全栈 AI 开发者 · 专注于本地模型工程化落地',
  wechat: 'zhanglaoshi117',
  email: '', // 邮箱先隐藏
}

const deployCommand = `git clone https://github.com/your-username/ai-chat.git
# 启动本地 Fastify 高性能后端 (支持图片 OCR 与向量库)
cd node-Fastify && npm install && npm run dev:server
# 启动前端工作台
cd ../ai-chat && npm install && npm run dev`

function handleCopyWeChat() {
  navigator.clipboard.writeText(authorInfo.wechat).then(() => {
    copiedWeChat.value = true
    setTimeout(() => {
      copiedWeChat.value = false
    }, 2200)
  })
}

function handleCopyCommand() {
  navigator.clipboard.writeText(deployCommand).then(() => {
    copiedCommand.value = true
    setTimeout(() => {
      copiedCommand.value = false
    }, 2200)
  })
}

function handleEnterWorkspace(targetMode: 'chat' | 'agent' | 'compare' | 'knowledge' = 'chat') {
  emit('enter-workspace', targetMode)
}

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
  }
}

// 模拟打字机微动效
const isSimulatingThinking = ref(false)
function triggerAgentSimulation() {
  isSimulatingThinking.value = true
  setTimeout(() => {
    isSimulatingThinking.value = false
  }, 1800)
}
</script>

<template>
  <div class="showcase-shell" :class="{ 'theme-light': isLightMode }">
    <!-- ── 背景动态环境光晕 ── -->
    <div class="showcase-bg">
      <div class="orb orb-primary" aria-hidden="true"></div>
      <div class="orb orb-secondary" aria-hidden="true"></div>
      <div class="orb orb-cyan" aria-hidden="true"></div>
      <div class="grid-canvas" aria-hidden="true"></div>
    </div>

    <!-- ── 1. 悬浮毛玻璃顶栏 ── -->
    <header class="showcase-nav">
      <div class="nav-container">
        <div class="nav-brand" @click="scrollToSection('hero')">
          <div class="brand-icon-wrapper">
            <img src="/favicon.svg" alt="AI Chat Studio" class="brand-logo" />
            <span class="brand-pulse"></span>
          </div>
          <div class="brand-text-col">
            <span class="brand-name">AI Chat Studio</span>
            <span class="brand-pill">v1.0 Local-First</span>
          </div>
        </div>

        <nav class="nav-links">
          <a href="#scenarios" @click.prevent="scrollToSection('scenarios')">定位场景</a>
          <a href="#showcase-dock" @click.prevent="scrollToSection('showcase-dock')">四大工作台</a>
          <a href="#features" @click.prevent="scrollToSection('features')">核心特性</a>
          <a href="#architecture" @click.prevent="scrollToSection('architecture')">全栈架构</a>
          <a href="#deploy" @click.prevent="scrollToSection('deploy')">本地部署</a>
          <a href="#contact" @click.prevent="scrollToSection('contact')">联系作者</a>
        </nav>

        <div class="nav-actions">
          <button
            type="button"
            class="btn-theme-toggle"
            :title="isLightMode ? '切换为暗黑模式' : '切换为亮色模式'"
            :aria-label="isLightMode ? '切换为暗黑模式' : '切换为亮色模式'"
            @click="toggleTheme"
          >
            <Moon v-if="isLightMode" :size="16" />
            <Sun v-else :size="16" />
          </button>
          <button type="button" class="btn-ghost" @click="scrollToSection('contact')">
            <MessageSquare :size="15" />
            <span>商务/咨询</span>
          </button>
          <button type="button" class="btn-primary" @click="handleEnterWorkspace('chat')">
            <span>进入工作台</span>
            <ArrowRight :size="16" />
          </button>
        </div>
      </div>
    </header>

    <!-- ── 2. Hero 黄金视觉区 ── -->
    <section id="hero" class="hero-section">
      <div class="hero-content">
        <!-- 顶部微胶囊 -->
        <div class="hero-badge">
          <Sparkles :size="14" class="badge-sparkle" />
          <span>Vue 3 + Fastify 5 · 2026 本地优先全栈 AI 生产力引擎</span>
          <span class="badge-dot"></span>
        </div>

        <!-- 主标语 -->
        <h1 class="hero-title">
          让私有知识库与工程排障<br />
          <span class="gradient-text">拥有企业级大模型决策力</span>
        </h1>

        <!-- 副标语 -->
        <p class="hero-description">
          为开发者与技术团队打造的双模态 AI 生产力工作台。
          兼具 <strong>100% 数据本地驻留</strong> 的多模态视觉混合检索 RAG，
          与集成 <strong>Anthropic MCP 标准协议</strong> 的 ReAct 自主排障 Agent。
        </p>

        <!-- 场景切换胶囊开关 -->
        <div id="scenarios" class="scenario-switch-container">
          <div class="scenario-switch">
            <button
              type="button"
              class="scenario-btn"
              :class="{ active: activeScenario === 'enterprise' }"
              @click="activeScenario = 'enterprise'"
            >
              <Workflow :size="16" />
              <span>🏢 企业工单与自主排障</span>
              <span v-if="activeScenario === 'enterprise'" class="active-indicator"></span>
            </button>
            <button
              type="button"
              class="scenario-btn"
              :class="{ active: activeScenario === 'personal' }"
              @click="activeScenario = 'personal'"
            >
              <Shield :size="16" />
              <span>🧠 个人与团队私有知识库</span>
              <span v-if="activeScenario === 'personal'" class="active-indicator"></span>
            </button>
          </div>

          <p class="scenario-hint">
            <span v-if="activeScenario === 'enterprise'">
              🎯 <strong>企业视角</strong>：面对生产故障排查、复杂技术工单，启用 ReAct 思考链路、真实联网搜索、时区计算与断点任务续传。
            </span>
            <span v-else>
              🛡️ <strong>私有化视角</strong>：上传代码、PDF 与架构截图，本地视觉模型智能解析转 Markdown，敏感资产 100% 物理隔离、杜绝外泄。
            </span>
          </p>
        </div>

        <!-- 行动按钮组 -->
        <div class="hero-cta-group">
          <button type="button" class="btn-hero-primary" @click="handleEnterWorkspace('chat')">
            <Flame :size="18" />
            <span>立即在线体验工作台</span>
            <span class="btn-subtext">无需配置 · 已部署即用</span>
          </button>

          <button type="button" class="btn-hero-secondary" @click="scrollToSection('deploy')">
            <Terminal :size="18" />
            <span>私有化部署指引 & 源码</span>
          </button>
        </div>

        <!-- ── 3D 透视展台 (Mockup Dock) ── -->
        <div id="showcase-dock" class="mockup-dock">
          <!-- 展台顶部 Tabs -->
          <div class="mockup-header">
            <div class="window-dots" aria-hidden="true">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>

            <div class="mockup-tabs">
              <button
                type="button"
                class="mockup-tab"
                :class="{ active: activeMockTab === 'chat' }"
                @click="activeMockTab = 'chat'"
              >
                <MessageSquare :size="15" />
                <span>工单决策 (RAG)</span>
              </button>
              <button
                type="button"
                class="mockup-tab"
                :class="{ active: activeMockTab === 'agent' }"
                @click="activeMockTab = 'agent'"
              >
                <Bot :size="15" />
                <span>排障 Agent (MCP)</span>
              </button>
              <button
                type="button"
                class="mockup-tab"
                :class="{ active: activeMockTab === 'compare' }"
                @click="activeMockTab = 'compare'"
              >
                <Columns2 :size="15" />
                <span>多模型竞技场</span>
              </button>
              <button
                type="button"
                class="mockup-tab"
                :class="{ active: activeMockTab === 'knowledge' }"
                @click="activeMockTab = 'knowledge'"
              >
                <Database :size="15" />
                <span>知识库与评测</span>
              </button>
            </div>

            <div class="window-action-link" @click="handleEnterWorkspace(activeMockTab)">
              <span>在实际应用中打开</span>
              <ExternalLink :size="13" />
            </div>
          </div>

          <!-- 展台主体视窗 -->
          <div class="mockup-body">
            <!-- 视窗 1：工单决策与 RAG 引用预览 -->
            <div v-show="activeMockTab === 'chat'" class="mockup-view-pane">
              <div class="pane-split">
                <div class="pane-chat-side">
                  <div class="chat-msg user-msg">
                    <div class="msg-avatar">User</div>
                    <div class="msg-bubble">生产环境 Nginx 反向代理偶发 502 Bad Gateway，结合知识库排查常见原因？</div>
                  </div>
                  <div class="chat-msg ai-msg">
                    <div class="msg-avatar ai-avatar">AI</div>
                    <div class="msg-bubble">
                      <p>根据内部技术支持知识库检索，定位到 2 个高置信度原因与排查方案：</p>
                      <ol class="styled-list">
                        <li><strong>上游 Fastify 服务负载或长连接超时</strong>：<code>keepalive_timeout</code> 设置低于上游。</li>
                        <li><strong>后端进程重启期间的连接拒绝</strong>：查看 PM2/Docker 容器健康检查日志。</li>
                      </ol>
                      <!-- 真实 RAG 引用芯片卡片 -->
                      <div class="rag-citation-card">
                        <div class="citation-head">
                          <span class="rag-chip">RAG 混合检索命中</span>
                          <span class="score-tag">综合分 0.88</span>
                          <span class="score-sub">向量分: 0.91 · 关键词分: 0.76</span>
                        </div>
                        <div class="citation-source">来源文档: <code>ops/nginx_troubleshooting.md (Chunk #4)</code></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pane-preview-side">
                  <div class="preview-mini-header">
                    <Code2 :size="14" />
                    <span>内置 Web 代码隔离沙盒（实时渲染）</span>
                  </div>
                  <div class="preview-code-box">
                    <div class="code-line"><span class="kwd">http</span> {</div>
                    <div class="code-line indent"><span class="prop">proxy_connect_timeout</span> 60s;</div>
                    <div class="code-line indent"><span class="prop">proxy_read_timeout</span> 120s;</div>
                    <div class="code-line">}</div>
                  </div>
                  <div class="preview-status-tag">
                    <Check :size="13" />
                    <span>沙盒已就绪 · 支持 iframe 隔离热预览</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 视窗 2：排障 Agent 与 ReAct 链路 -->
            <div v-show="activeMockTab === 'agent'" class="mockup-view-pane">
              <div class="agent-trace-shell">
                <div class="agent-prompt-bar">
                  <span class="agent-tag">Agent-v1</span>
                  <span>目标：排查 Vite 生产构建空白屏并验证当前服务器时区配置</span>
                  <button type="button" class="btn-micro-run" @click="triggerAgentSimulation">
                    <RotateCcw :size="12" />
                    <span>重新演练链路</span>
                  </button>
                </div>

                <div class="trace-steps">
                  <div class="trace-item thought">
                    <div class="trace-dot"></div>
                    <div class="trace-label">Thinking (自主思考)</div>
                    <div class="trace-desc">用户报告 Vite 构建后白屏，需先调用只读工具检索 base 路径与 public 静态目录配置。</div>
                  </div>

                  <div class="trace-item tool">
                    <div class="trace-dot tool-dot"></div>
                    <div class="trace-label">
                      <span>Tool Call: <code>readonly_mcp.read_config</code></span>
                      <span class="tool-tag">Anthropic MCP 协议</span>
                    </div>
                    <div class="trace-desc">参数: <code>{ "path": "vite.config.ts" }</code> ➔ 返回 <code>base: '/ai/'</code></div>
                  </div>

                  <div class="trace-item tool">
                    <div class="trace-dot tool-dot"></div>
                    <div class="trace-label">
                      <span>Tool Call: <code>datetime.query_timezone</code></span>
                      <span class="tool-tag">Native Tool</span>
                    </div>
                    <div class="trace-desc">调用原生时间工具验证服务器默认时区: <code>Asia/Shanghai (UTC+8)</code></div>
                  </div>

                  <div class="trace-item observation" :class="{ pulse: isSimulatingThinking }">
                    <div class="trace-dot obs-dot"></div>
                    <div class="trace-label">Observation & Conclusion (诊断结论)</div>
                    <div class="trace-desc">确认 Nginx 缺少 <code>location /ai/</code> 静态重写路由导致资源 404，已自动生成适配补丁。</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 视窗 3：多模型竞技场与 Diff 对比 -->
            <div v-show="activeMockTab === 'compare'" class="mockup-view-pane">
              <div class="compare-matrix">
                <div class="compare-col">
                  <div class="compare-model-head">
                    <span class="model-badge ollama">Ollama / Qwen 2.5 (本地)</span>
                    <span class="ttft-tag">TTFT: 142ms</span>
                  </div>
                  <div class="compare-card-body">
                    <p class="model-text">采用 SQLite WAL 模式并为高频查询添加联合复合索引，能消除并发读写锁竞争...</p>
                    <div class="model-stat">耗时: 1.1s · 吞吐: 85 tokens/s</div>
                  </div>
                </div>

                <div class="compare-col">
                  <div class="compare-model-head">
                    <span class="model-badge openai">OpenAI / GPT-4o</span>
                    <span class="ttft-tag">TTFT: 380ms</span>
                  </div>
                  <div class="compare-card-body">
                    <p class="model-text">建议在连接池中开启 PRAGMA synchronous = NORMAL，并将缓存区扩大到 64MB...</p>
                    <div class="model-stat">耗时: 1.8s · 吞吐: 62 tokens/s</div>
                  </div>
                </div>

                <div class="compare-col">
                  <div class="compare-model-head">
                    <span class="model-badge claude">Claude 3.5 Sonnet</span>
                    <span class="ttft-tag">TTFT: 420ms</span>
                  </div>
                  <div class="compare-card-body">
                    <p class="model-text">综合两套方案：将读事务分流至只读句柄，并在迁移脚本中预热 FTS5 虚拟表...</p>
                    <div class="model-stat">耗时: 2.1s · 吞吐: 58 tokens/s</div>
                  </div>
                </div>
              </div>

              <div class="compare-footer-bar">
                <Sparkles :size="14" />
                <span>支持一键多模型共识归纳 (Consensus Synthesis) · 代码差异 Diff 高亮 · 导出 Markdown 评测报告</span>
              </div>
            </div>

            <!-- 视窗 4：知识库 6 阶段流水线与评测 -->
            <div v-show="activeMockTab === 'knowledge'" class="mockup-view-pane">
              <div class="kb-demo-shell">
                <div class="kb-pipeline-header">
                  <div>
                    <strong>多模态文件入库流水线（实时 SSE 流）</strong>
                    <p>上传图片/PDF/TXT ➔ 视觉 OCR ➔ 智能切块 ➔ 双路向量化入库</p>
                  </div>
                  <span class="status-pill-green">Qdrant / SQLite 向量库状态: 正常</span>
                </div>

                <div class="pipeline-steps">
                  <div class="pipe-step done">
                    <div class="pipe-circle"><Check :size="12" /></div>
                    <span>Receiving</span>
                  </div>
                  <div class="pipe-line done"></div>

                  <div class="pipe-step done">
                    <div class="pipe-circle"><Check :size="12" /></div>
                    <span>Parsing (视觉 OCR)</span>
                  </div>
                  <div class="pipe-line done"></div>

                  <div class="pipe-step done">
                    <div class="pipe-circle"><Check :size="12" /></div>
                    <span>Chunking (700字/100重叠)</span>
                  </div>
                  <div class="pipe-line done"></div>

                  <div class="pipe-step active">
                    <div class="pipe-circle">4</div>
                    <span>Embedding (bge-m3)</span>
                  </div>
                  <div class="pipe-line"></div>

                  <div class="pipe-step">
                    <div class="pipe-circle">5</div>
                    <span>Storing (FTS5 + Vector)</span>
                  </div>
                </div>

                <div class="eval-metrics-row">
                  <div class="eval-metric-box">
                    <span class="eval-label">测试集运行</span>
                    <strong>100% 通过</strong>
                  </div>
                  <div class="eval-metric-box">
                    <span class="eval-label">平均命中召回率 (Hit Rate)</span>
                    <strong>94.6%</strong>
                  </div>
                  <div class="eval-metric-box">
                    <span class="eval-label">倒数排名 (MRR)</span>
                    <strong>0.912</strong>
                  </div>
                  <div class="eval-metric-box">
                    <span class="eval-label">防幻觉摘录准确率</span>
                    <strong>99.1%</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 3. 数据与硬核实力标尺 (赛博全景指标矩阵) ── -->
    <section class="metrics-bar-section">
      <div class="container">
        <div class="metrics-section-header">
          <div class="metrics-header-pill">
            <span class="pulsing-beacon"></span>
            SYSTEM BENCHMARKS &amp; RELIABILITY
          </div>
          <h3 class="metrics-section-title">为苛刻的本地工程环境打造的硬核指标</h3>
        </div>

        <div class="metrics-grid">
          <!-- 卡片 1: 本地隐私安全 -->
          <div class="metric-card metric-card--emerald">
            <div class="metric-card-watermark">100%</div>
            <div class="metric-card-laser"></div>
            
            <div class="metric-card-top">
              <div class="metric-tag">
                <span class="tag-code">SEC-01</span>
                <span class="tag-sep">/</span>
                <span class="tag-label">物理级隔离</span>
              </div>
              <div class="metric-status-badge">
                <span class="status-dot"></span>
                <span>0-Cloud 离线</span>
              </div>
            </div>

            <div class="metric-card-core">
              <div class="metric-icon-wrap">
                <Shield :size="20" />
              </div>
              <div class="metric-stat-group">
                <div class="metric-num-wrap">
                  <span class="metric-num">100</span>
                  <span class="metric-unit">%</span>
                </div>
                <h4 class="metric-title">本地隐私安全</h4>
              </div>
            </div>

            <p class="metric-desc">
              数据保存在浏览器 IndexedDB 与本地后端，拒绝云端隐秘泄露
            </p>

            <div class="metric-tech-widget widget-storage">
              <div class="widget-route-bar">
                <span class="route-node">
                  <Lock :size="11" /> IndexedDB
                </span>
                <span class="route-arrow">➔</span>
                <span class="route-node">本地 SQLite</span>
                <span class="route-deny">✖ 零云端回传</span>
              </div>
            </div>

            <div class="metric-specs-footer">
              <span class="spec-pill">🔒 浏览器沙盒持久化</span>
              <span class="spec-pill">🛡️ 密钥零回传</span>
            </div>
          </div>

          <!-- 卡片 2: SSE 上传流水线 -->
          <div class="metric-card metric-card--cyan">
            <div class="metric-card-watermark">06</div>
            <div class="metric-card-laser"></div>

            <div class="metric-card-top">
              <div class="metric-tag">
                <span class="tag-code">PIPE-02</span>
                <span class="tag-sep">/</span>
                <span class="tag-label">视觉 OCR 管线</span>
              </div>
              <div class="metric-status-badge">
                <span class="status-dot"></span>
                <span>SSE 实时推流</span>
              </div>
            </div>

            <div class="metric-card-core">
              <div class="metric-icon-wrap">
                <Layers :size="20" />
              </div>
              <div class="metric-stat-group">
                <div class="metric-num-wrap">
                  <span class="metric-num">6</span>
                  <span class="metric-unit">阶段</span>
                </div>
                <h4 class="metric-title">SSE 上传流水线</h4>
              </div>
            </div>

            <p class="metric-desc">
              支持图片视觉 OCR 识别转 Markdown，打通架构图与截图检索
            </p>

            <div class="metric-tech-widget widget-pipeline">
              <div class="pipeline-track">
                <div class="pipeline-step step-done" title="上传"><span>1</span></div>
                <div class="pipeline-line"></div>
                <div class="pipeline-step step-done" title="校验"><span>2</span></div>
                <div class="pipeline-line"></div>
                <div class="pipeline-step step-active" title="OCR"><span>3</span></div>
                <div class="pipeline-line"></div>
                <div class="pipeline-step" title="切块"><span>4</span></div>
                <div class="pipeline-line"></div>
                <div class="pipeline-step" title="向量"><span>5</span></div>
                <div class="pipeline-line"></div>
                <div class="pipeline-step" title="入库"><span>6</span></div>
              </div>
              <div class="pipeline-label">视觉提取 ➔ 语义切块 ➔ 向量入库</div>
            </div>

            <div class="metric-specs-footer">
              <span class="spec-pill">🖼️ Qwen-VL 视觉解析</span>
              <span class="spec-pill">⚡ 毫秒级分块广播</span>
            </div>
          </div>

          <!-- 卡片 3: 3 大协议标准集成 -->
          <div class="metric-card metric-card--purple">
            <div class="metric-card-watermark">03</div>
            <div class="metric-card-laser"></div>

            <div class="metric-card-top">
              <div class="metric-tag">
                <span class="tag-code">PROTO-03</span>
                <span class="tag-sep">/</span>
                <span class="tag-label">开放互联协议</span>
              </div>
              <div class="metric-status-badge">
                <span class="status-dot"></span>
                <span>开放协议族</span>
              </div>
            </div>

            <div class="metric-card-core">
              <div class="metric-icon-wrap">
                <Network :size="20" />
              </div>
              <div class="metric-stat-group">
                <div class="metric-num-wrap">
                  <span class="metric-num">3</span>
                  <span class="metric-unit">大协议</span>
                </div>
                <h4 class="metric-title">标准无缝集成</h4>
              </div>
            </div>

            <p class="metric-desc">
              深度支持 Ollama、OpenAI 接口规范及 Anthropic MCP 协议
            </p>

            <div class="metric-tech-widget widget-chips">
              <div class="protocol-chip">
                <span class="chip-glow"></span>
                <strong>Ollama</strong> 本地原语
              </div>
              <div class="protocol-chip">
                <span class="chip-glow"></span>
                <strong>OpenAI</strong> 标准生态
              </div>
              <div class="protocol-chip">
                <span class="chip-glow"></span>
                <strong>MCP</strong> 协议扩展
              </div>
            </div>

            <div class="metric-specs-footer">
              <span class="spec-pill">🔌 零侵入热插拔</span>
              <span class="spec-pill">🌐 工具调用标准化</span>
            </div>
          </div>

          <!-- 卡片 4: 0 丢包断点续传恢复 -->
          <div class="metric-card metric-card--amber">
            <div class="metric-card-watermark">00</div>
            <div class="metric-card-laser"></div>

            <div class="metric-card-top">
              <div class="metric-tag">
                <span class="tag-code">RES-04</span>
                <span class="tag-sep">/</span>
                <span class="tag-label">任务守护状态机</span>
              </div>
              <div class="metric-status-badge">
                <span class="status-dot"></span>
                <span>幂等生成引擎</span>
              </div>
            </div>

            <div class="metric-card-core">
              <div class="metric-icon-wrap">
                <RotateCcw :size="20" />
              </div>
              <div class="metric-stat-group">
                <div class="metric-num-wrap">
                  <span class="metric-num">0</span>
                  <span class="metric-unit">丢包</span>
                </div>
                <h4 class="metric-title">断点续传恢复</h4>
              </div>
            </div>

            <p class="metric-desc">
              基于 Last-Event-ID 与幂等生成任务，断网刷新无损恢复
            </p>

            <div class="metric-tech-widget widget-replay">
              <div class="replay-stream">
                <span class="pulse-icon"><Zap :size="12" /></span>
                <span class="replay-text">Last-Event-ID 游标重放</span>
                <span class="replay-badge">无损续接</span>
              </div>
            </div>

            <div class="metric-specs-footer">
              <span class="spec-pill">🔄 刷新状态不中断</span>
              <span class="spec-pill">💾 幂等任务锁保护</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 4. Bento Grid 核心特性矩阵 ── -->
    <section id="features" class="bento-section">
      <div class="container">
        <div class="section-heading text-center">
          <span class="sub-badge">Feature Matrix</span>
          <h2 class="section-title">重构本地大模型的生产力边界</h2>
          <p class="section-desc">打破单薄的“套壳对话框”，为真正的工程排障、文档资产沉淀与多模型决策构建坚固闭环。</p>
        </div>

        <div class="bento-grid">
          <!-- 卡片 1 (大卡·视觉多模态 RAG) -->
          <div class="bento-card bento-span-2 bento-card-gradient">
            <div class="bento-card-inner">
              <div class="card-tag">核心壁垒 · 多模态视觉 RAG</div>
              <h3 class="card-title">打破纯文本限制：把流程图与报错截图一并装入知识库</h3>
              <p class="card-desc">
                无需事先人工转换。上传 PNG/JPG/WebP 格式的架构图或错误堆栈，系统自动调度本地视觉大模型（如 Qwen-VL）提炼结构化 Markdown，切块向量化并写入 SQLite FTS5，使视觉资产也能像文本一样被精准混合召回。
              </p>
              <div class="card-visual-pill-row">
                <span class="v-pill">🖼️ 视觉 OCR 结构化提取</span>
                <span class="v-pill">⚡ 稠密向量 + 稀疏 FTS5 双路排序</span>
                <span class="v-pill">🎯 智能 RAG 意图门控</span>
                <span class="v-pill">🛡️ 严格防幻觉来源追溯</span>
              </div>
            </div>
          </div>

          <!-- 卡片 2 (中卡·自主排障 Agent) -->
          <div class="bento-card">
            <div class="bento-card-inner">
              <div class="card-tag">实战工具链 · ReAct Agent</div>
              <h3 class="card-title">集成 Anthropic MCP 标准的受控排障循环</h3>
              <p class="card-desc">
                思考过程、工具调用全链路透明可见。原生挂载实时联网搜索（真实来源 URL）、时区精确推算以及基于 MCP 协议的各类外部扩展工具。
              </p>
              <div class="mini-tool-tags">
                <code>web_search</code>
                <code>datetime (IANA)</code>
                <code>readonly_mcp</code>
                <code>calculator</code>
              </div>
            </div>
          </div>

          <!-- 卡片 3 (中卡·多模型同台竞技) -->
          <div class="bento-card">
            <div class="bento-card-inner">
              <div class="card-tag">横向竞技场 · Model Arena</div>
              <h3 class="card-title">并发对比 · 首字延迟 TTFT · 代码差异 Diff</h3>
              <p class="card-desc">
                同一难题并发派发给本地 Ollama、云端 Claude 与 OpenAI。实时记录吞吐与延迟，代码行级对比，一键提取共识归纳。
              </p>
              <div class="mini-stats-chip">
                <span>⚡ TTFT 毫秒捕获</span>
                <span>📊 Markdown/JSON 导出</span>
              </div>
            </div>
          </div>

          <!-- 卡片 4 (中卡·实时沙盒与断点续传) -->
          <div class="bento-card bento-span-2">
            <div class="bento-card-inner">
              <div class="card-tag">工程底座 · 零白屏与容灾</div>
              <h3 class="card-title">Web 代码安全隔离预览 · 离线全量工单检索</h3>
              <p class="card-desc">
                AI 生成的前端网页可在隔离 iframe 沙盒中直接执行热预览；聊天记录与索引全部沉淀在浏览器 IndexedDB 中，并由后台独立 Web Worker 支撑海量工单的离线秒级检索。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 5. 全栈系统架构解密 (赛博拓扑工程矩阵) ── -->
    <section id="architecture" class="arch-section">
      <div class="container">
        <div class="section-heading text-center">
          <div class="arch-badge-wrapper">
            <span class="arch-beacon-pulse"></span>
            <span class="sub-badge arch-badge">System Architecture</span>
          </div>
          <h2 class="section-title">前后端协同的极致高并发架构</h2>
          <p class="section-desc">以 Fastify 5 异步事件循环为核心枢纽，贯穿本地端侧存储与本地/云端大模型。</p>

          <div class="arch-telemetry-strip">
            <div class="telemetry-stat">
              <span class="telemetry-lbl">核心路由延迟</span>
              <strong class="telemetry-num">&lt; 1.2ms</strong>
            </div>
            <div class="telemetry-divider">/</div>
            <div class="telemetry-stat">
              <span class="telemetry-lbl">事件循环吞吐</span>
              <strong class="telemetry-num">40,000+ Req/s</strong>
            </div>
            <div class="telemetry-divider">/</div>
            <div class="telemetry-stat">
              <span class="telemetry-lbl">端侧数据隔离</span>
              <strong class="telemetry-num">100% 本地闭环</strong>
            </div>
          </div>
        </div>

        <div class="arch-topology">
          <!-- ── 节点 1：前端工程工作台 (Vue 3) ── -->
          <div class="arch-node-col client-col">
            <div class="node-glow-bar glow-client"></div>
            <div class="arch-node-header">
              <div class="header-icon-box icon-client">
                <Terminal :size="18" />
              </div>
              <div class="header-text-group">
                <div class="node-layer-tag">LAYER 01 · CLIENT</div>
                <h3 class="node-main-title">前端工程工作台 (Vue 3)</h3>
              </div>
              <span class="status-pill status-client">Client Sandboxed</span>
            </div>

            <div class="arch-node-box">
              <div class="node-tech-item">
                <div class="node-bullet-num">01</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">4 大专属工作区模式</span>
                    <span class="node-tag">Workspace</span>
                  </div>
                  <div class="node-sub">智能对话 · Agent 工坊 · 竞技场 · 知识库</div>
                </div>
              </div>

              <div class="node-tech-item">
                <div class="node-bullet-num">02</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">IndexedDB 本地隐私数据库</span>
                    <span class="node-tag">Privacy</span>
                  </div>
                  <div class="node-sub">浏览器端离线持久化，拒绝云端隐秘泄露</div>
                </div>
              </div>

              <div class="node-tech-item">
                <div class="node-bullet-num">03</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">Web Worker 离线全文索引</span>
                    <span class="node-tag">Worker</span>
                  </div>
                  <div class="node-sub">后台线程分词与倒排检索，主线程 0 掉帧</div>
                </div>
              </div>

              <div class="node-tech-item">
                <div class="node-bullet-num">04</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">安全隔离 iframe 代码预览</span>
                    <span class="node-tag">Sandbox</span>
                  </div>
                  <div class="node-sub">HTML/Vue/React 实时渲染与跨域严格拦截</div>
                </div>
              </div>
            </div>

            <div class="node-footer-specs">
              <span class="spec-code">Vite 6</span>
              <span class="spec-code">Pinia Store</span>
              <span class="spec-code">Web Workers</span>
            </div>
          </div>

          <!-- ── 数据流通道 1: Client ➔ Core Hub ── -->
          <div class="arch-flow-connector">
            <div class="connector-pipe pipe-forward">
              <span class="pipe-pulse"></span>
            </div>
            <div class="connector-badge">
              <span class="flow-symbol">⚡</span>
              <span class="flow-text">SSE / HTTP/2</span>
            </div>
            <div class="connector-pipe pipe-backward">
              <span class="pipe-pulse"></span>
            </div>
            <div class="connector-sub">NDJSON 流式管道</div>
          </div>

          <!-- ── 节点 2：Fastify 5 服务引擎 (Node.js) - 核心枢纽 ── -->
          <div class="arch-node-col main-hub">
            <div class="node-glow-bar glow-hub"></div>
            <div class="arch-node-header hub-header">
              <div class="header-icon-box icon-hub">
                <Cpu :size="20" />
              </div>
              <div class="header-text-group">
                <div class="node-layer-tag tag-hub">CORE KERNEL HUB · 异步中枢</div>
                <h3 class="node-main-title">Fastify 5 服务引擎 (Node.js)</h3>
              </div>
              <span class="status-pill status-hub">Active Engine</span>
            </div>

            <div class="arch-node-box hub-box">
              <div class="node-tech-item hub-item">
                <div class="node-bullet-num bullet-hub">01</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">毫秒级异步路由 (TypeScript)</span>
                    <span class="node-tag tag-purple">Fast Router</span>
                  </div>
                  <div class="node-sub">Find-My-Way 高速基数树分发，极低内存驻留</div>
                </div>
              </div>

              <div class="node-tech-item hub-item">
                <div class="node-bullet-num bullet-hub">02</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">SSE / NDJSON 实时事件重放</span>
                    <span class="node-tag tag-purple">Streaming</span>
                  </div>
                  <div class="node-sub">分块背压感知直出，保障超长上下文无卡顿</div>
                </div>
              </div>

              <div class="node-tech-item hub-item">
                <div class="node-bullet-num bullet-hub">03</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">可恢复任务管理 (Last-Event-ID)</span>
                    <span class="node-tag tag-purple">Resumable</span>
                  </div>
                  <div class="node-sub">断网与页面刷新无损回放，游标幂等状态锁</div>
                </div>
              </div>

              <div class="node-tech-item hub-item">
                <div class="node-bullet-num bullet-hub">04</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">内置可观测性仪表盘 Dashboard</span>
                    <span class="node-tag tag-purple">Telemetry</span>
                  </div>
                  <div class="node-sub">实时吞吐量统计、Agent 执行轨迹与系统指标</div>
                </div>
              </div>

              <div class="node-tech-item hub-item">
                <div class="node-bullet-num bullet-hub">05</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">敏感密钥自动脱敏与安全策略</span>
                    <span class="node-tag tag-purple">Security</span>
                  </div>
                  <div class="node-sub">请求日志自动过滤脱敏，CORS / 速率熔断防护</div>
                </div>
              </div>
            </div>

            <div class="node-footer-specs">
              <span class="spec-code hub-spec">Node 20+</span>
              <span class="spec-code hub-spec">TypeScript</span>
              <span class="spec-code hub-spec">High Concurrency</span>
              <span class="spec-code hub-spec">Zero Leak</span>
            </div>
          </div>

          <!-- ── 数据流通道 2: Core Hub ➔ Model & Storage ── -->
          <div class="arch-flow-connector">
            <div class="connector-pipe pipe-forward">
              <span class="pipe-pulse"></span>
            </div>
            <div class="connector-badge">
              <span class="flow-symbol">🔮</span>
              <span class="flow-text">JSON-RPC / REST</span>
            </div>
            <div class="connector-pipe pipe-backward">
              <span class="pipe-pulse"></span>
            </div>
            <div class="connector-sub">双路检索与调度</div>
          </div>

          <!-- ── 节点 3：混合检索与模型层 ── -->
          <div class="arch-node-col storage-col">
            <div class="node-glow-bar glow-storage"></div>
            <div class="arch-node-header">
              <div class="header-icon-box icon-storage">
                <Database :size="18" />
              </div>
              <div class="header-text-group">
                <div class="node-layer-tag">LAYER 03 · INFERENCE</div>
                <h3 class="node-main-title">混合检索与模型层</h3>
              </div>
              <span class="status-pill status-storage">Hybrid Core</span>
            </div>

            <div class="arch-node-box">
              <div class="node-tech-item">
                <div class="node-bullet-num">01</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">SQLite Vector / Qdrant 向量库</span>
                    <span class="node-tag">Vector</span>
                  </div>
                  <div class="node-sub">稠密向量嵌入，余弦相似度高维语义最近邻</div>
                </div>
              </div>

              <div class="node-tech-item">
                <div class="node-bullet-num">02</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">SQLite FTS5 BM25 全文检索</span>
                    <span class="node-tag">FTS5</span>
                  </div>
                  <div class="node-sub">关键词稀疏检索与双路 RRF 混合重排评分</div>
                </div>
              </div>

              <div class="node-tech-item">
                <div class="node-bullet-num">03</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">本地 Ollama (对话 + 视觉 OCR)</span>
                    <span class="node-tag">Ollama</span>
                  </div>
                  <div class="node-sub">Qwen2.5 / DeepSeek / 视觉架构图结构化转 Markdown</div>
                </div>
              </div>

              <div class="node-tech-item">
                <div class="node-bullet-num">04</div>
                <div class="node-content">
                  <div class="node-title-row">
                    <span class="node-name">OpenAI / Claude / MCP 协议</span>
                    <span class="node-tag">Ecosystem</span>
                  </div>
                  <div class="node-sub">无缝对接云端旗舰模型与 Anthropic MCP 工具规范</div>
                </div>
              </div>
            </div>

            <div class="node-footer-specs">
              <span class="spec-code">SQLite Vector</span>
              <span class="spec-code">FTS5 BM25</span>
              <span class="spec-code">Anthropic MCP</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 6. 在线体验 vs 私有化部署说明 ── -->
    <section id="deploy" class="deploy-section">
      <div class="container">
        <div class="section-heading text-center">
          <span class="sub-badge">Deployment Guide</span>
          <h2 class="section-title">线上即刻体验 · 本地私有化深度掌控</h2>
          <p class="section-desc">云端体验前端工作台交互，本地运行 Fastify 守护绝对数据隐私。</p>
        </div>

        <div class="deploy-comparison-grid">
          <!-- 左列：云端在线体验版 -->
          <div class="deploy-card live-card">
            <div class="deploy-status-tag">🟢 在线运行中 · 点击即用</div>
            <h3 class="deploy-card-title">云端体验前端版</h3>
            <p class="deploy-card-desc">专供快速体验界面交互、多模型横评逻辑与内置排障演练沙盒。</p>

            <ul class="deploy-feature-list">
              <li><Check :size="15" class="green-check" /> 体验现代 UI 界面、自适应暗黑科技质感</li>
              <li><Check :size="15" class="green-check" /> 多模型并发对比与代码 Diff 差异高亮</li>
              <li><Check :size="15" class="green-check" /> 内置故障排查沙盒（Vite 404、生产白屏案例）</li>
              <li><Check :size="15" class="green-check" /> 纯浏览器端 IndexedDB 隐私数据存储</li>
            </ul>

            <div class="deploy-notice-box">
              <span>ℹ️ 提示：受限于线上沙盒环境，涉及本地大模型 OCR 与私有知识库深度切块入库，需搭配本地后端运行。</span>
            </div>

            <button type="button" class="btn-deploy-action" @click="handleEnterWorkspace('chat')">
              <span>立即在线体验前端工作台</span>
              <ArrowRight :size="15" />
            </button>
          </div>

          <!-- 右列：本地完整私有化部署 -->
          <div class="deploy-card private-card">
            <div class="deploy-status-tag purple-tag">🔒 企业级私有化 · 100% 物理隔离</div>
            <h3 class="deploy-card-title">本地完整私有版</h3>
            <p class="deploy-card-desc">完整解锁 Fastify 5、Ollama 视觉大模型、Qdrant 向量库与真实 MCP 工具。</p>

            <ul class="deploy-feature-list">
              <li><Check :size="15" class="purple-check" /> 独享本地视觉大模型图片/架构图 OCR 识别</li>
              <li><Check :size="15" class="purple-check" /> 本地 SQLite / Qdrant 稠密向量库与 FTS5 双路检索</li>
              <li><Check :size="15" class="purple-check" /> 真实执行 MCP 工具链、联网搜索与断点续传任务</li>
              <li><Check :size="15" class="purple-check" /> 数据 100% 留存在本地内网，零泄露风险</li>
            </ul>

            <!-- 终端极速命令框 -->
            <div class="terminal-box">
              <div class="terminal-bar">
                <span class="term-dot"></span>
                <span class="term-title">Quickstart CLI</span>
                <button type="button" class="btn-copy-code" @click="handleCopyCommand">
                  <Check v-if="copiedCommand" :size="12" />
                  <Copy v-else :size="12" />
                  <span>{{ copiedCommand ? '已复制命令' : '复制命令' }}</span>
                </button>
              </div>
              <pre class="terminal-code"><code>{{ deployCommand }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 7. 联系作者与技术支持专属卡片 ── -->
    <section id="contact" class="contact-section">
      <div class="container">
        <div class="contact-card">
          <div class="contact-left">
            <div class="author-badge">
              <div class="author-avatar-ring">
                <span class="avatar-letter">AI</span>
              </div>
              <div class="author-meta">
                <h3 class="author-name">{{ authorInfo.name }}</h3>
                <p class="author-role">{{ authorInfo.role }}</p>
              </div>
            </div>

            <p class="contact-intro">
              如果您对 <strong>本地大模型知识库定制、企业级 Agent 排障决策台、前后端完整源码获取或架构方案</strong> 有任何想法，欢迎直接联系我交流探讨！
            </p>

            <div class="contact-channels">
              <div class="contact-row">
                <span class="channel-label">微信咨询:</span>
                <code class="channel-code">{{ authorInfo.wechat }}</code>
                <button type="button" class="btn-copy-channel" @click="handleCopyWeChat">
                  <Check v-if="copiedWeChat" :size="13" />
                  <Copy v-else :size="13" />
                  <span>{{ copiedWeChat ? '已复制微信' : '复制微信号' }}</span>
                </button>
              </div>

              <!-- 邮箱联系方式暂时隐藏，微信作为唯一直接咨询通道 -->
              <div v-if="authorInfo.email" class="contact-row">
                <span class="channel-label">电子邮箱:</span>
                <a :href="`mailto:${authorInfo.email}`" class="channel-link">{{ authorInfo.email }}</a>
              </div>
            </div>
          </div>

          <div class="contact-right">
            <div class="service-box">
              <div class="service-title">💼 合作与支持范围</div>
              <div class="service-item">
                <div class="service-dot"></div>
                <div>
                  <strong>前后端完整源码与部署脚手架</strong>
                  <p>获取经过严格测试的工程工程代码、配置文件模板与验证套件。</p>
                </div>
              </div>
              <div class="service-item">
                <div class="service-dot"></div>
                <div>
                  <strong>企业私有知识库 / Agent 定制开发</strong>
                  <p>根据团队业务文档、报错日志与技术支持系统进行定制化落地。</p>
                </div>
              </div>
              <div class="service-item">
                <div class="service-dot"></div>
                <div>
                  <strong>技术架构与模型评测咨询</strong>
                  <p>交流多模态视觉 RAG 召回调优、MCP 协议挂载与高并发流式服务。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 8. 科技感页脚 ── -->
    <footer class="showcase-footer">
      <div class="container footer-content">
        <div class="footer-brand">
          <img src="/favicon.svg" alt="AI Chat" class="footer-logo" />
          <span>AI Chat & Fastify · Local-First AI Engine</span>
        </div>

        <div class="footer-tags">
          <span class="tech-tag">Vue 3</span>
          <span class="tech-tag">Fastify 5</span>
          <span class="tech-tag">TypeScript</span>
          <span class="tech-tag">Ollama</span>
          <span class="tech-tag">SQLite / Qdrant</span>
          <span class="tech-tag">Anthropic MCP</span>
        </div>

        <div class="footer-actions">
          <button type="button" class="btn-footer-link" @click="scrollToSection('hero')">
            回到顶部 ↑
          </button>
          <button type="button" class="btn-footer-enter" @click="handleEnterWorkspace('chat')">
            进入工作台 ➔
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ── 核心容器与深空科技背景 ── */
.showcase-shell {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  background-color: #07080e;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
}

.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

/* 动态背景光晕与点阵画布 */
.showcase-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.28;
}

.orb-primary {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, #6366f1, transparent 70%);
  top: -150px;
  left: 50%;
  transform: translateX(-50%);
}

.orb-secondary {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, #a855f7, transparent 70%);
  top: 30%;
  right: -100px;
}

.orb-cyan {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, #06b6d4, transparent 70%);
  bottom: 10%;
  left: -150px;
}

.grid-canvas {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.45;
}

/* ── 1. 悬浮毛玻璃顶栏 ── */
.showcase-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(7, 8, 14, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.nav-container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.brand-icon-wrapper {
  position: relative;
  width: 32px;
  height: 32px;
}

.brand-logo {
  width: 32px;
  height: 32px;
}

.brand-pulse {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.brand-text-col {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-name {
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
  color: #fff;
}

.brand-pill {
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.35);
  color: #818cf8;
  font-weight: 600;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 24px;
}

.nav-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-links a:hover {
  color: #fff;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-theme-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.25);
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.25);
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
  transition: all 0.2s;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
}

/* ── 2. Hero 黄金视觉区 ── */
.hero-section {
  position: relative;
  z-index: 10;
  padding: 60px 24px 80px;
}

.hero-content {
  max-width: 1080px;
  margin: 0 auto;
  text-align: center;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 999px;
  font-size: 0.8rem;
  color: #a5b4fc;
  font-weight: 500;
  margin-bottom: 24px;
}

.badge-sparkle {
  color: #38bdf8;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 6px #38bdf8;
}

.hero-title {
  font-size: clamp(2.2rem, 5vw, 3.6rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.03em;
  color: #fff;
  margin-bottom: 20px;
}

.gradient-text {
  background: linear-gradient(135deg, #38bdf8 0%, #818cf8 45%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-description {
  max-width: 740px;
  margin: 0 auto 32px;
  font-size: 1.05rem;
  color: #94a3b8;
  line-height: 1.7;
}

.hero-description strong {
  color: #f1f5f9;
}

/* 场景切换胶囊 */
.scenario-switch-container {
  margin: 0 auto 36px;
  max-width: 660px;
}

.scenario-switch {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px;
  border-radius: 12px;
  gap: 6px;
}

.scenario-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.scenario-btn.active {
  background: rgba(99, 102, 241, 0.2);
  color: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.scenario-hint {
  margin-top: 12px;
  font-size: 0.88rem;
  color: #cbd5e1;
}

/* Hero 行动按钮 */
.hero-cta-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 50px;
  flex-wrap: wrap;
}

.btn-hero-primary {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 28px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: #fff;
  font-size: 0.98rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 28px rgba(79, 70, 229, 0.45);
  transition: all 0.25s;
}

.btn-hero-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 36px rgba(79, 70, 229, 0.6);
}

.btn-subtext {
  font-size: 0.72rem;
  font-weight: 400;
  opacity: 0.85;
  margin-top: 2px;
}

.btn-hero-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 15px 24px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  color: #e2e8f0;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-hero-secondary:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

/* ── 3D 透视展台 (Mockup Dock) ── */
.mockup-dock {
  background: rgba(15, 17, 28, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  backdrop-filter: blur(20px);
  text-align: left;
}

.mockup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-wrap: wrap;
  gap: 12px;
}

.window-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot-red { background: #ef4444; }
.dot-yellow { background: #f59e0b; }
.dot-green { background: #10b981; }

.mockup-tabs {
  display: flex;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  padding: 3px;
  border-radius: 8px;
}

.mockup-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.mockup-tab.active {
  background: rgba(99, 102, 241, 0.25);
  color: #fff;
}

.window-action-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: #818cf8;
  cursor: pointer;
  transition: color 0.2s;
}

.window-action-link:hover {
  color: #a5b4fc;
}

.mockup-body {
  padding: 24px;
  min-height: 380px;
}

/* 展台分栏（工单决策） */
.pane-split {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
}

.chat-msg {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #e2e8f0;
  flex-shrink: 0;
}

.ai-avatar {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
}

.msg-bubble {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 0.88rem;
  color: #cbd5e1;
}

.user-msg .msg-bubble {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.25);
  color: #fff;
}

.styled-list {
  padding-left: 20px;
  margin: 10px 0;
  font-size: 0.84rem;
}

.rag-citation-card {
  margin-top: 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 8px;
  padding: 10px 14px;
}

.citation-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.rag-chip {
  font-size: 0.72rem;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.score-tag {
  font-size: 0.75rem;
  color: #10b981;
  font-weight: 700;
}

.score-sub {
  font-size: 0.72rem;
  color: #94a3b8;
}

.citation-source {
  font-size: 0.75rem;
  color: #94a3b8;
}

.pane-preview-side {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.preview-mini-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 12px;
}

.preview-code-box {
  background: #0b0d17;
  border-radius: 8px;
  padding: 12px;
  font-family: monospace;
  font-size: 0.78rem;
  color: #94a3b8;
  flex: 1;
}

.code-line .kwd { color: #818cf8; font-weight: 600; }
.code-line .prop { color: #38bdf8; }
.indent { padding-left: 16px; }

.preview-status-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #10b981;
  margin-top: 12px;
}

/* 展台 2：排障 Agent 链路 */
.agent-trace-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-prompt-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.04);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
}

.agent-tag {
  background: #6366f1;
  color: #fff;
  font-size: 0.72rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  margin-right: 8px;
}

.btn-micro-run {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 4px;
  color: #cbd5e1;
  font-size: 0.75rem;
  padding: 4px 8px;
  cursor: pointer;
}

.trace-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 2px dashed rgba(255, 255, 255, 0.12);
  margin-left: 10px;
  padding-left: 18px;
}

.trace-item {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 14px;
}

.trace-dot {
  position: absolute;
  left: -24px;
  top: 12px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6366f1;
}

.tool-dot { background: #38bdf8; }
.obs-dot { background: #10b981; }

.trace-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-tag {
  font-size: 0.68rem;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 1px 5px;
  border-radius: 4px;
}

.trace-desc {
  font-size: 0.82rem;
  color: #94a3b8;
}

/* 展台 3：多模型对比 */
.compare-matrix {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.compare-col {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
}

.compare-model-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.model-badge {
  font-size: 0.74rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.model-badge.ollama { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.model-badge.openai { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.model-badge.claude { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

.ttft-tag {
  font-size: 0.7rem;
  color: #94a3b8;
}

.model-text {
  font-size: 0.82rem;
  color: #cbd5e1;
  margin-bottom: 12px;
}

.model-stat {
  font-size: 0.72rem;
  color: #64748b;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 8px;
}

.compare-footer-bar {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.82rem;
  color: #818cf8;
  background: rgba(99, 102, 241, 0.08);
  padding: 10px;
  border-radius: 8px;
}

/* 展台 4：知识库流水线 */
.kb-demo-shell {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.kb-pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.kb-pipeline-header strong { font-size: 0.92rem; color: #fff; }
.kb-pipeline-header p { font-size: 0.8rem; color: #94a3b8; }

.status-pill-green {
  font-size: 0.74rem;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #34d399;
  padding: 3px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.pipeline-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.3);
  padding: 18px 20px;
  border-radius: 12px;
}

.pipe-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: #64748b;
}

.pipe-step.done { color: #34d399; }
.pipe-step.active { color: #38bdf8; font-weight: 600; }

.pipe-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
}

.pipe-step.done .pipe-circle { background: #10b981; color: #fff; }
.pipe-step.active .pipe-circle { background: #38bdf8; color: #000; font-weight: bold; }

.pipe-line {
  flex: 1;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 8px;
  position: relative;
  top: -10px;
}

.pipe-line.done { background: #10b981; }

.eval-metrics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.eval-metric-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.eval-label {
  display: block;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-bottom: 4px;
}

.eval-metric-box strong {
  font-size: 1.1rem;
  color: #fff;
}

/* ── 3. 数据与硬核实力标尺 (赛博全景指标矩阵) ── */
.metrics-bar-section {
  position: relative;
  z-index: 10;
  padding: 40px 0 65px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.metrics-section-header {
  text-align: center;
  margin-bottom: 32px;
}

.metrics-header-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.22);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #a5b4fc;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.pulsing-beacon {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: beacon-pulse 2s infinite ease-in-out;
}

@keyframes beacon-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.4); }
}

.metrics-section-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: -0.01em;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.metric-card {
  position: relative;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.78) 0%, rgba(15, 23, 42, 0.92) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 22px 20px 18px;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
}

.metric-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.75);
}

.metric-card-laser {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.8;
  transition: all 0.3s;
}

.metric-card:hover .metric-card-laser {
  opacity: 1;
  height: 3px;
}

.metric-card-watermark {
  position: absolute;
  right: 12px;
  top: 8px;
  font-size: 5rem;
  font-weight: 900;
  font-family: 'JetBrains Mono', 'Space Grotesk', system-ui, sans-serif;
  line-height: 1;
  pointer-events: none;
  user-select: none;
  opacity: 0.04;
  letter-spacing: -0.05em;
  transition: all 0.35s;
}

.metric-card:hover .metric-card-watermark {
  opacity: 0.09;
  transform: scale(1.05) translateX(-4px);
}

/* 顶部标签栏 */
.metric-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  position: relative;
  z-index: 2;
}

.metric-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 2px 8px;
  border-radius: 6px;
}

.metric-tag .tag-code {
  font-weight: 700;
  color: #cbd5e1;
}

.metric-tag .tag-sep {
  opacity: 0.4;
}

.metric-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.68rem;
  font-weight: 500;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.03);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

/* 核心数值展示区 */
.metric-card-core {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  position: relative;
  z-index: 2;
}

.metric-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.3s;
}

.metric-card:hover .metric-icon-wrap {
  transform: scale(1.08) rotate(3deg);
}

.metric-stat-group {
  display: flex;
  flex-direction: column;
}

.metric-num-wrap {
  display: flex;
  align-items: baseline;
  gap: 3px;
  line-height: 1.1;
}

.metric-num {
  font-size: 2.1rem;
  font-weight: 900;
  font-family: 'JetBrains Mono', 'Space Grotesk', system-ui, sans-serif;
  letter-spacing: -0.03em;
}

.metric-unit {
  font-size: 0.95rem;
  font-weight: 700;
  opacity: 0.9;
}

.metric-title {
  font-size: 1.02rem;
  font-weight: 700;
  color: #f8fafc;
  margin-top: 1px;
  letter-spacing: -0.01em;
}

.metric-desc {
  font-size: 0.82rem;
  color: #94a3b8;
  line-height: 1.55;
  margin-bottom: 14px;
  position: relative;
  z-index: 2;
  flex-grow: 1;
}

/* 微科技视效组件 */
.metric-tech-widget {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 12px;
  position: relative;
  z-index: 2;
  font-size: 0.72rem;
}

/* Widget 1: 本地存储路由 */
.widget-storage .widget-route-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-wrap: wrap;
}

.route-node {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #34d399;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
}

.route-arrow {
  color: #64748b;
  font-size: 0.7rem;
}

.route-deny {
  color: #f87171;
  font-size: 0.68rem;
  font-weight: 600;
  background: rgba(239, 68, 68, 0.12);
  padding: 1px 5px;
  border-radius: 4px;
}

/* Widget 2: 6阶段流水线 */
.widget-pipeline .pipeline-track {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}

.pipeline-step {
  width: 17px;
  height: 17px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.06);
  color: #64748b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.25s;
}

.pipeline-step.step-done {
  background: rgba(6, 182, 212, 0.2);
  border-color: #06b6d4;
  color: #67e8f9;
}

.pipeline-step.step-active {
  background: #06b6d4;
  color: #090d16;
  box-shadow: 0 0 10px #06b6d4;
  transform: scale(1.15);
}

.pipeline-line {
  flex: 1;
  height: 2px;
  background: rgba(6, 182, 212, 0.3);
  margin: 0 2px;
}

.pipeline-label {
  font-size: 0.68rem;
  color: #67e8f9;
  opacity: 0.85;
  text-align: center;
}

/* Widget 3: 协议微芯片 */
.widget-chips {
  display: flex;
  gap: 5px;
  justify-content: space-between;
}

.protocol-chip {
  position: relative;
  flex: 1;
  text-align: center;
  padding: 4px 2px;
  border-radius: 6px;
  background: rgba(168, 85, 247, 0.08);
  border: 1px solid rgba(168, 85, 247, 0.25);
  font-size: 0.65rem;
  color: #d8b4fe;
  white-space: nowrap;
}

.protocol-chip strong {
  color: #fff;
  display: block;
  font-size: 0.7rem;
}

/* Widget 4: 断点续传重播 */
.widget-replay .replay-stream {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.pulse-icon {
  color: #fbbf24;
  display: flex;
  align-items: center;
  animation: lightning-flash 1.8s infinite ease-in-out;
}

@keyframes lightning-flash {
  0%, 100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 2px #fbbf24); }
  50% { transform: scale(1.2); opacity: 0.6; filter: drop-shadow(0 0 8px #fbbf24); }
}

.replay-text {
  font-family: 'JetBrains Mono', monospace;
  color: #fde68a;
  font-size: 0.68rem;
  font-weight: 600;
}

.replay-badge {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 700;
}

/* 底部特性微标签 */
.metric-specs-footer {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  position: relative;
  z-index: 2;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.spec-pill {
  font-size: 0.68rem;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.03);
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

/* ── 4 色系专属霓虹主题 ── */
/* 1. Emerald - 隐私安全 */
.metric-card--emerald {
  border-color: rgba(16, 185, 129, 0.22);
}
.metric-card--emerald .metric-card-laser {
  background: linear-gradient(90deg, transparent, #10b981 50%, transparent);
  box-shadow: 0 0 12px #10b981;
}
.metric-card--emerald .status-dot {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}
.metric-card--emerald .metric-icon-wrap {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.metric-card--emerald .metric-num {
  background: linear-gradient(135deg, #a7f3d0 0%, #10b981 60%, #059669 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.metric-card--emerald .metric-unit {
  color: #34d399;
}
.metric-card--emerald:hover {
  border-color: rgba(16, 185, 129, 0.45);
  box-shadow: 0 20px 45px -12px rgba(16, 185, 129, 0.25);
}

/* 2. Cyan - 流水线 */
.metric-card--cyan {
  border-color: rgba(6, 182, 212, 0.22);
}
.metric-card--cyan .metric-card-laser {
  background: linear-gradient(90deg, transparent, #06b6d4 50%, transparent);
  box-shadow: 0 0 12px #06b6d4;
}
.metric-card--cyan .status-dot {
  background: #06b6d4;
  box-shadow: 0 0 6px #06b6d4;
}
.metric-card--cyan .metric-icon-wrap {
  background: rgba(6, 182, 212, 0.12);
  color: #06b6d4;
  border: 1px solid rgba(6, 182, 212, 0.25);
}
.metric-card--cyan .metric-num {
  background: linear-gradient(135deg, #a5f3fc 0%, #06b6d4 60%, #0891b2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.metric-card--cyan .metric-unit {
  color: #22d3ee;
}
.metric-card--cyan:hover {
  border-color: rgba(6, 182, 212, 0.45);
  box-shadow: 0 20px 45px -12px rgba(6, 182, 212, 0.25);
}

/* 3. Purple - 协议标准 */
.metric-card--purple {
  border-color: rgba(168, 85, 247, 0.22);
}
.metric-card--purple .metric-card-laser {
  background: linear-gradient(90deg, transparent, #a855f7 50%, transparent);
  box-shadow: 0 0 12px #a855f7;
}
.metric-card--purple .status-dot {
  background: #a855f7;
  box-shadow: 0 0 6px #a855f7;
}
.metric-card--purple .metric-icon-wrap {
  background: rgba(168, 85, 247, 0.12);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.25);
}
.metric-card--purple .metric-num {
  background: linear-gradient(135deg, #e9d5ff 0%, #a855f7 60%, #7e22ce 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.metric-card--purple .metric-unit {
  color: #c084fc;
}
.metric-card--purple:hover {
  border-color: rgba(168, 85, 247, 0.45);
  box-shadow: 0 20px 45px -12px rgba(168, 85, 247, 0.25);
}

/* 4. Amber - 断点续传 */
.metric-card--amber {
  border-color: rgba(245, 158, 11, 0.22);
}
.metric-card--amber .metric-card-laser {
  background: linear-gradient(90deg, transparent, #f59e0b 50%, transparent);
  box-shadow: 0 0 12px #f59e0b;
}
.metric-card--amber .status-dot {
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}
.metric-card--amber .metric-icon-wrap {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.25);
}
.metric-card--amber .metric-num {
  background: linear-gradient(135deg, #fef3c7 0%, #f59e0b 60%, #d97706 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.metric-card--amber .metric-unit {
  color: #fbbf24;
}
.metric-card--amber:hover {
  border-color: rgba(245, 158, 11, 0.45);
  box-shadow: 0 20px 45px -12px rgba(245, 158, 11, 0.25);
}

/* ── 4. Bento Grid 核心特性矩阵 ── */
.bento-section {
  position: relative;
  z-index: 10;
  padding: 90px 0;
}

.section-heading {
  max-width: 700px;
  margin: 0 auto 50px;
}

.text-center { text-align: center; }

.sub-badge {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #818cf8;
  margin-bottom: 12px;
}

.section-title {
  font-size: clamp(1.8rem, 3.5vw, 2.5rem);
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
  margin-bottom: 14px;
}

.section-desc {
  font-size: 0.98rem;
  color: #94a3b8;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.bento-span-2 {
  grid-column: span 2;
}

.bento-card {
  background: rgba(18, 20, 32, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 30px;
  backdrop-filter: blur(16px);
  transition: all 0.25s;
}

.bento-card:hover {
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

.bento-card-gradient {
  background: linear-gradient(135deg, rgba(28, 31, 56, 0.6) 0%, rgba(18, 20, 32, 0.6) 100%);
}

.card-tag {
  font-size: 0.74rem;
  font-weight: 700;
  color: #818cf8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.4;
  margin-bottom: 12px;
}

.card-desc {
  font-size: 0.88rem;
  color: #94a3b8;
  line-height: 1.6;
  margin-bottom: 18px;
}

.card-visual-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.v-pill {
  font-size: 0.78rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 5px 12px;
  border-radius: 999px;
  color: #e2e8f0;
}

.mini-tool-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mini-tool-tags code {
  font-size: 0.75rem;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  padding: 3px 8px;
  border-radius: 4px;
}

.mini-stats-chip {
  display: flex;
  gap: 12px;
  font-size: 0.78rem;
  color: #38bdf8;
}

/* ── 5. 全栈系统架构解密 (赛博拓扑工程矩阵) ── */
.arch-section {
  position: relative;
  z-index: 10;
  padding: 85px 0 95px;
  background: radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.05) 0%, rgba(10, 14, 26, 0.6) 70%);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.arch-badge-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.arch-beacon-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #6366f1;
  box-shadow: 0 0 10px #6366f1;
  animation: beacon-pulse 2s infinite ease-in-out;
}

.arch-telemetry-strip {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  margin-top: 22px;
  padding: 8px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  font-size: 0.78rem;
}

.telemetry-stat {
  display: flex;
  align-items: center;
  gap: 6px;
}

.telemetry-lbl {
  color: #94a3b8;
}

.telemetry-num {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: #a5b4fc;
}

.telemetry-divider {
  color: rgba(255, 255, 255, 0.2);
  font-size: 0.75rem;
}

/* 拓扑容器 */
.arch-topology {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 14px;
  margin-top: 48px;
  position: relative;
}

.arch-node-col {
  flex: 1;
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.5);
}

.arch-node-col:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 20px 45px -12px rgba(0, 0, 0, 0.7);
}

/* 顶部微发光条 */
.node-glow-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  transition: all 0.3s;
}

.glow-client {
  background: linear-gradient(90deg, transparent, #06b6d4 50%, transparent);
}

.glow-hub {
  background: linear-gradient(90deg, transparent, #818cf8 50%, transparent);
  height: 3px;
  box-shadow: 0 0 14px #6366f1;
}

.glow-storage {
  background: linear-gradient(90deg, transparent, #10b981 50%, transparent);
}

/* 节点头部 */
.arch-node-header {
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.header-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-client {
  background: rgba(6, 182, 212, 0.12);
  color: #06b6d4;
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.icon-hub {
  background: rgba(99, 102, 241, 0.18);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.35);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
}

.icon-storage {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.header-text-group {
  flex: 1;
}

.node-layer-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #64748b;
  margin-bottom: 2px;
}

.tag-hub {
  color: #818cf8;
}

.node-main-title {
  font-size: 0.96rem;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: -0.01em;
  line-height: 1.25;
}

.status-pill {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.status-client {
  background: rgba(6, 182, 212, 0.1);
  color: #38bdf8;
  border: 1px solid rgba(6, 182, 212, 0.2);
}

.status-hub {
  background: rgba(99, 102, 241, 0.15);
  color: #c7d2fe;
  border: 1px solid rgba(99, 102, 241, 0.3);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
}

.status-storage {
  background: rgba(16, 185, 129, 0.1);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

/* 核心中枢主卡样式 */
.main-hub {
  flex: 1.15;
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 0 0 35px rgba(99, 102, 241, 0.14), 0 16px 36px -10px rgba(0, 0, 0, 0.6);
  background: linear-gradient(180deg, rgba(20, 24, 48, 0.9) 0%, rgba(15, 23, 42, 0.98) 100%);
}

.main-hub:hover {
  border-color: rgba(99, 102, 241, 0.55);
  box-shadow: 0 0 45px rgba(99, 102, 241, 0.22), 0 24px 50px -10px rgba(0, 0, 0, 0.75);
}

.hub-header {
  background: rgba(99, 102, 241, 0.08);
}

/* 节点内部条目 */
.arch-node-box {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-grow: 1;
}

.node-tech-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  transition: all 0.25s;
}

.node-tech-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateX(2px);
}

.hub-item {
  background: rgba(99, 102, 241, 0.04);
  border-color: rgba(99, 102, 241, 0.1);
}

.hub-item:hover {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.25);
}

.node-bullet-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  font-weight: 800;
  color: #64748b;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 5px;
  border-radius: 4px;
  margin-top: 1px;
}

.bullet-hub {
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.15);
}

.node-content {
  flex: 1;
}

.node-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
}

.node-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #e2e8f0;
}

.node-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.62rem;
  font-weight: 600;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
}

.tag-purple {
  color: #c7d2fe;
  background: rgba(99, 102, 241, 0.12);
}

.node-sub {
  font-size: 0.72rem;
  color: #94a3b8;
  line-height: 1.4;
}

/* 节点底部规格标签 */
.node-footer-specs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.spec-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.hub-spec {
  color: #c7d2fe;
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.2);
}

/* ── 数据流通道 (Flow Connector) ── */
.arch-flow-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 90px;
  flex-shrink: 0;
  position: relative;
}

.connector-pipe {
  width: 100%;
  height: 2px;
  background: rgba(99, 102, 241, 0.2);
  position: relative;
  overflow: hidden;
}

.pipe-pulse {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 30px;
  background: linear-gradient(90deg, transparent, #818cf8, transparent);
  animation: pulse-travel 2.2s infinite linear;
}

.pipe-backward .pipe-pulse {
  animation: pulse-travel-rev 2.2s infinite linear;
}

@keyframes pulse-travel {
  0% { left: -30px; }
  100% { left: 100%; }
}

@keyframes pulse-travel-rev {
  0% { right: -30px; }
  100% { right: 100%; }
}

.connector-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.3);
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
  font-size: 0.65rem;
  font-weight: 700;
  color: #c7d2fe;
  white-space: nowrap;
}

.flow-symbol {
  font-size: 0.7rem;
}

.connector-sub {
  font-size: 0.65rem;
  color: #94a3b8;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
}

/* ── 6. 在线体验 vs 私有化部署 ── */
.deploy-section {
  position: relative;
  z-index: 10;
  padding: 90px 0;
}

.deploy-comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 28px;
  margin-top: 40px;
}

.deploy-card {
  background: rgba(18, 20, 32, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 32px;
  display: flex;
  flex-direction: column;
}

.live-card {
  border-color: rgba(16, 185, 129, 0.25);
}

.private-card {
  border-color: rgba(168, 85, 247, 0.35);
  background: linear-gradient(135deg, rgba(25, 21, 46, 0.7) 0%, rgba(18, 20, 32, 0.7) 100%);
}

.deploy-status-tag {
  align-self: flex-start;
  font-size: 0.74rem;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 600;
  margin-bottom: 14px;
}

.purple-tag {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.deploy-card-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 8px;
}

.deploy-card-desc {
  font-size: 0.88rem;
  color: #94a3b8;
  margin-bottom: 20px;
}

.deploy-feature-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.deploy-feature-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.86rem;
  color: #cbd5e1;
}

.green-check { color: #10b981; }
.purple-check { color: #a855f7; }

.deploy-notice-box {
  background: rgba(0, 0, 0, 0.3);
  border-left: 3px solid #38bdf8;
  padding: 10px 14px;
  font-size: 0.8rem;
  color: #94a3b8;
  border-radius: 0 6px 6px 0;
  margin-top: auto;
  margin-bottom: 20px;
}

.btn-deploy-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  background: #10b981;
  border: none;
  border-radius: 10px;
  color: #fff;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-deploy-action:hover {
  background: #059669;
  transform: translateY(-1px);
}

/* 终端代码框 */
.terminal-box {
  background: #090a12;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  margin-top: auto;
}

.terminal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.term-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
}

.term-title {
  font-size: 0.72rem;
  color: #94a3b8;
  font-family: monospace;
}

.btn-copy-code {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 4px;
  color: #cbd5e1;
  font-size: 0.72rem;
  cursor: pointer;
}

.terminal-code {
  margin: 0;
  padding: 14px;
  font-family: 'Fira Code', monospace;
  font-size: 0.78rem;
  color: #a5b4fc;
  line-height: 1.5;
  overflow-x: auto;
}

/* ── 7. 联系作者专属卡片 ── */
.contact-section {
  position: relative;
  z-index: 10;
  padding: 60px 0 90px;
}

.contact-card {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 36px;
  background: linear-gradient(135deg, rgba(23, 26, 45, 0.8) 0%, rgba(13, 15, 26, 0.9) 100%);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 20px;
  padding: 40px;
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
}

.author-badge {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.author-avatar-ring {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.4);
}

.avatar-letter {
  font-weight: 800;
  font-size: 1.1rem;
  color: #fff;
}

.author-name {
  font-size: 1.25rem;
  font-weight: 800;
  color: #fff;
}

.author-role {
  font-size: 0.82rem;
  color: #818cf8;
}

.contact-intro {
  font-size: 0.9rem;
  color: #94a3b8;
  line-height: 1.6;
  margin-bottom: 24px;
}

.contact-channels {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
}

.channel-label {
  color: #64748b;
  width: 70px;
}

.channel-code {
  font-family: monospace;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 6px;
  color: #38bdf8;
  font-weight: 600;
}

.btn-copy-channel {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 6px;
  color: #a5b4fc;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy-channel:hover {
  background: rgba(99, 102, 241, 0.25);
  color: #fff;
}

.channel-link {
  color: #a5b4fc;
  text-decoration: none;
  font-weight: 500;
}

.channel-link:hover {
  text-decoration: underline;
}

.service-box {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 22px;
  height: 100%;
}

.service-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 16px;
}

.service-item {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.service-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6366f1;
  margin-top: 6px;
  flex-shrink: 0;
}

.service-item strong {
  display: block;
  font-size: 0.85rem;
  color: #e2e8f0;
  margin-bottom: 2px;
}

.service-item p {
  font-size: 0.78rem;
  color: #94a3b8;
  margin: 0;
  line-height: 1.4;
}

/* ── 8. 页脚 ── */
.showcase-footer {
  position: relative;
  z-index: 10;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 36px 0;
  background: #05060b;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  color: #94a3b8;
}

.footer-logo {
  width: 22px;
  height: 22px;
}

.footer-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tech-tag {
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.05);
  padding: 3px 8px;
  border-radius: 4px;
  color: #64748b;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.btn-footer-link {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.82rem;
  cursor: pointer;
}

.btn-footer-link:hover { color: #fff; }

.btn-footer-enter {
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
  color: #a5b4fc;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-footer-enter:hover {
  background: #6366f1;
  color: #fff;
}

/* ── 响应式适配 ── */
@media (max-width: 992px) {
  .nav-links { display: none; }
  .bento-grid { grid-template-columns: 1fr; }
  .bento-span-2 { grid-column: span 1; }
  .pane-split { grid-template-columns: 1fr; }
  .compare-matrix { grid-template-columns: 1fr; }
  .arch-topology {
    flex-direction: column;
    gap: 16px;
  }
  .arch-flow-connector {
    width: 100%;
    flex-direction: row;
    gap: 12px;
    padding: 8px 0;
  }
  .connector-pipe {
    width: 60px;
    height: 2px;
  }
  .deploy-comparison-grid { grid-template-columns: 1fr; }
  .contact-card { grid-template-columns: 1fr; }
  .metrics-grid { grid-template-columns: repeat(2, 1fr); }
  .eval-metrics-row { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .container {
    padding: 0 16px;
  }

  .nav-container {
    padding: 10px 16px;
  }

  .hero-section {
    padding: 40px 16px 56px;
  }

  .hero-badge {
    max-width: 100%;
    font-size: 0.74rem;
    padding: 5px 10px;
    line-height: 1.35;
  }

  .hero-title {
    font-size: clamp(1.85rem, 6.5vw, 2.6rem);
  }

  .hero-description {
    font-size: 0.92rem;
    padding: 0 4px;
    margin-bottom: 24px;
  }

  .mockup-header {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 10px 12px;
  }

  .window-dots {
    display: none;
  }

  .mockup-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    width: 100%;
    scrollbar-width: none;
    padding: 3px;
    gap: 4px;
  }

  .mockup-tabs::-webkit-scrollbar {
    display: none;
  }

  .mockup-tab {
    flex-shrink: 0;
    padding: 6px 10px;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .window-action-link {
    display: none;
  }

  .mockup-body {
    padding: 14px 10px;
  }

  .chat-msg {
    gap: 8px;
    margin-bottom: 12px;
  }

  .msg-avatar {
    width: 28px;
    height: 28px;
    font-size: 0.7rem;
  }

  .msg-bubble {
    font-size: 0.82rem;
    padding: 10px 12px;
  }

  .trace-steps {
    margin-left: 2px;
    padding-left: 12px;
    gap: 10px;
  }

  .trace-dot {
    left: -18px;
    width: 8px;
    height: 8px;
  }

  .trace-item {
    padding: 8px 10px;
  }

  .trace-label {
    font-size: 0.78rem;
    flex-wrap: wrap;
  }

  .trace-desc {
    font-size: 0.76rem;
    line-height: 1.45;
  }

  .agent-prompt-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.78rem;
  }

  .btn-micro-run {
    align-self: flex-end;
  }

  .compare-footer-bar {
    font-size: 0.74rem;
    text-align: center;
    padding: 8px;
    line-height: 1.4;
  }

  .pipeline-steps {
    overflow-x: auto;
    justify-content: flex-start;
    gap: 14px;
    padding: 12px 10px;
  }

  .pipe-step {
    flex-shrink: 0;
    min-width: 68px;
    font-size: 0.7rem;
  }

  .pipe-line {
    display: none;
  }

  .eval-metrics-row {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .eval-metric-box {
    padding: 10px 6px;
  }

  .eval-metric-box strong {
    font-size: 1rem;
  }

  .bento-section,
  .arch-section,
  .deploy-section {
    padding: 56px 0;
  }

  .section-title {
    font-size: 1.6rem;
  }

  .section-desc {
    font-size: 0.88rem;
  }

  .arch-telemetry-strip {
    flex-wrap: wrap;
    justify-content: center;
    border-radius: 14px;
    gap: 8px 14px;
    padding: 10px 14px;
  }

  .bento-card {
    padding: 22px 16px;
  }

  .card-title {
    font-size: 1.15rem;
  }

  .deploy-card {
    padding: 22px 16px;
  }

  .deploy-card-title {
    font-size: 1.25rem;
  }

  .contact-section {
    padding: 40px 0 60px;
  }

  .contact-card {
    padding: 22px 16px;
    gap: 24px;
  }

  .author-name {
    font-size: 1.15rem;
  }

  .contact-intro {
    font-size: 0.85rem;
  }

  .contact-row {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .channel-label {
    width: auto;
    font-size: 0.78rem;
  }

  .channel-code {
    text-align: center;
    font-size: 0.95rem;
    padding: 8px;
  }

  .btn-copy-channel {
    width: 100%;
    justify-content: center;
    padding: 8px;
  }

  .footer-content {
    flex-direction: column;
    text-align: center;
    gap: 16px;
  }

  .footer-tags {
    justify-content: center;
  }

  .footer-actions {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .brand-pill {
    display: none;
  }

  .nav-actions .btn-theme-toggle {
    width: 30px;
    height: 30px;
  }

  .nav-actions .btn-ghost {
    padding: 6px 8px;
    font-size: 0.75rem;
  }

  .nav-actions .btn-ghost span {
    display: none;
  }

  .nav-actions .btn-primary {
    padding: 6px 10px;
    font-size: 0.78rem;
  }

  .hero-title {
    font-size: 1.7rem;
  }

  .scenario-switch {
    flex-direction: column;
    width: 100%;
  }

  .scenario-btn {
    width: 100%;
    justify-content: center;
    font-size: 0.82rem;
    padding: 8px 12px;
  }

  .hero-cta-group {
    flex-direction: column;
    width: 100%;
    gap: 10px;
  }

  .btn-hero-primary,
  .btn-hero-secondary {
    width: 100%;
    padding: 12px 16px;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .metric-card {
    padding: 18px 16px 14px;
  }

  .metric-card-watermark {
    font-size: 3.6rem;
  }

  .v-pill {
    font-size: 0.72rem;
    padding: 4px 8px;
  }

  .eval-metrics-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .terminal-code {
    font-size: 0.68rem;
    padding: 10px;
  }

  .btn-deploy-action {
    width: 100%;
  }
}

/* ── 亮色主题 (Light Mode) 优雅柔和重塑 ── */
.showcase-shell.theme-light {
  background-color: #f7f6fb;
  color: #333852;
}

.showcase-shell.theme-light .grid-canvas {
  background-image: radial-gradient(rgba(99, 102, 241, 0.14) 1px, transparent 1px);
  opacity: 0.45;
}

.showcase-shell.theme-light .orb-primary {
  background: radial-gradient(circle, rgba(99, 102, 241, 0.10), transparent 70%);
}

.showcase-shell.theme-light .orb-secondary {
  background: radial-gradient(circle, rgba(168, 85, 247, 0.08), transparent 70%);
}

.showcase-shell.theme-light .orb-cyan {
  background: radial-gradient(circle, rgba(6, 182, 212, 0.08), transparent 70%);
}

/* 顶栏 */
.showcase-shell.theme-light .showcase-nav {
  background: rgba(247, 246, 251, 0.88);
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
}

.showcase-shell.theme-light .brand-name {
  color: #2b3048;
}

.showcase-shell.theme-light .brand-pill {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.22);
  color: #6366f1;
}

.showcase-shell.theme-light .nav-links a {
  color: #606882;
}

.showcase-shell.theme-light .nav-links a:hover {
  color: #2b3048;
}

.showcase-shell.theme-light .btn-theme-toggle {
  background: rgba(255, 255, 255, 0.75);
  border-color: rgba(203, 213, 225, 0.8);
  color: #525a75;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.showcase-shell.theme-light .btn-theme-toggle:hover {
  background: #ffffff;
  color: #333852;
  border-color: rgba(148, 163, 184, 0.8);
}

.showcase-shell.theme-light .btn-ghost {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(203, 213, 225, 0.8);
  color: #4a526d;
}

.showcase-shell.theme-light .btn-ghost:hover {
  background: #ffffff;
  color: #2b3048;
  border-color: rgba(148, 163, 184, 0.9);
}

/* Hero 黄金视觉区 */
.showcase-shell.theme-light .hero-badge {
  background: rgba(99, 102, 241, 0.07);
  border-color: rgba(99, 102, 241, 0.22);
  color: #5551dc;
}

.showcase-shell.theme-light .hero-title {
  color: #24283b;
}

.showcase-shell.theme-light .gradient-text {
  background: linear-gradient(135deg, #0284c7 0%, #6366f1 45%, #9333ea 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.showcase-shell.theme-light .hero-description {
  color: #5d667e;
}

.showcase-shell.theme-light .hero-description strong {
  color: #2b3048;
}

.showcase-shell.theme-light .scenario-switch {
  background: rgba(238, 240, 248, 0.8);
  border-color: rgba(218, 224, 238, 0.9);
}

.showcase-shell.theme-light .scenario-btn {
  color: #646e88;
}

.showcase-shell.theme-light .scenario-btn.active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
}

.showcase-shell.theme-light .scenario-hint {
  color: #475069;
}

.showcase-shell.theme-light .btn-hero-secondary {
  background: #ffffff;
  border-color: rgba(203, 213, 225, 0.8);
  color: #333852;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
}

.showcase-shell.theme-light .btn-hero-secondary:hover {
  background: #f8fafc;
  color: #202436;
  border-color: rgba(148, 163, 184, 0.9);
}

/* 3D 展台 (Mockup Dock) */
.showcase-shell.theme-light .mockup-dock {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 24px 60px rgba(99, 102, 241, 0.08), 0 4px 16px rgba(0, 0, 0, 0.02);
}

.showcase-shell.theme-light .mockup-header {
  background: rgba(248, 249, 253, 0.95);
  border-bottom: 1px solid rgba(230, 235, 245, 0.9);
}

.showcase-shell.theme-light .mockup-tabs {
  background: rgba(238, 241, 250, 0.85);
}

.showcase-shell.theme-light .mockup-tab {
  color: #6b748e;
}

.showcase-shell.theme-light .mockup-tab.active {
  background: #ffffff;
  color: #4f46e5;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.08);
}

.showcase-shell.theme-light .window-action-link {
  color: #5a54e0;
}

.showcase-shell.theme-light .window-action-link:hover {
  color: #4338ca;
}

.showcase-shell.theme-light .msg-avatar {
  background: rgba(235, 238, 248, 0.9);
  color: #434a65;
}

.showcase-shell.theme-light .msg-bubble {
  background: #f9fafd;
  border: 1px solid rgba(226, 232, 244, 0.9);
  color: #414862;
}

.showcase-shell.theme-light .user-msg .msg-bubble {
  background: rgba(99, 102, 241, 0.07);
  border-color: rgba(99, 102, 241, 0.2);
  color: #2e285a;
}

.showcase-shell.theme-light .rag-citation-card {
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.showcase-shell.theme-light .citation-source {
  color: #5b647d;
}

.showcase-shell.theme-light .pane-preview-side {
  background: #f9fafd;
  border: 1px solid rgba(226, 232, 244, 0.9);
}

.showcase-shell.theme-light .preview-mini-header {
  color: #2e334a;
}

.showcase-shell.theme-light .preview-code-box {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 244, 0.9);
  color: #475069;
}

.showcase-shell.theme-light .agent-prompt-bar {
  background: #f9fafd;
  border: 1px solid rgba(226, 232, 244, 0.9);
  color: #2e334a;
}

.showcase-shell.theme-light .btn-micro-run {
  background: rgba(235, 238, 248, 0.9);
  color: #475069;
}

.showcase-shell.theme-light .trace-steps {
  border-left-color: rgba(99, 102, 241, 0.22);
}

.showcase-shell.theme-light .trace-item {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 244, 0.9);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

.showcase-shell.theme-light .trace-label {
  color: #2b3048;
}

.showcase-shell.theme-light .trace-desc {
  color: #57607a;
}

.showcase-shell.theme-light .compare-col {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 244, 0.9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.showcase-shell.theme-light .model-text {
  color: #414862;
}

.showcase-shell.theme-light .model-stat {
  color: #717a94;
  border-top: 1px solid rgba(235, 238, 248, 0.9);
}

.showcase-shell.theme-light .compare-footer-bar {
  background: rgba(99, 102, 241, 0.06);
  color: #4f46e5;
}

.showcase-shell.theme-light .kb-pipeline-header strong {
  color: #24283b;
}

.showcase-shell.theme-light .kb-pipeline-header p {
  color: #6b748e;
}

.showcase-shell.theme-light .pipeline-steps {
  background: #f9fafd;
  border: 1px solid rgba(226, 232, 244, 0.9);
}

.showcase-shell.theme-light .pipe-step {
  color: #6b748e;
}

.showcase-shell.theme-light .pipe-circle {
  background: rgba(235, 238, 248, 0.9);
  color: #475069;
}

.showcase-shell.theme-light .eval-metric-box {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 244, 0.9);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

.showcase-shell.theme-light .eval-label {
  color: #717a94;
}

.showcase-shell.theme-light .eval-metric-box strong {
  color: #24283b;
}

/* 标尺与特性矩阵 (赛博指标卡亮色主题深度定制) */
.showcase-shell.theme-light .metrics-bar-section {
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
}

.showcase-shell.theme-light .metrics-header-pill {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.2);
  color: #4f46e5;
}

.showcase-shell.theme-light .metrics-section-title {
  color: #1e293b;
}

.showcase-shell.theme-light .metric-card {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(226, 232, 244, 0.95);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.03);
}

.showcase-shell.theme-light .metric-card:hover {
  background: #ffffff;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.08);
}

.showcase-shell.theme-light .metric-card-watermark {
  opacity: 0.04;
  -webkit-text-stroke: 1.5px rgba(0, 0, 0, 0.15);
}

.showcase-shell.theme-light .metric-card-top .metric-tag {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #475569;
}

.showcase-shell.theme-light .metric-card-top .metric-tag .tag-code {
  color: #1e293b;
}

.showcase-shell.theme-light .metric-status-badge {
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.showcase-shell.theme-light .metric-title {
  color: #1e293b;
}

.showcase-shell.theme-light .metric-desc {
  color: #475569;
}

.showcase-shell.theme-light .metric-tech-widget {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.showcase-shell.theme-light .pipeline-step {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #94a3b8;
}

.showcase-shell.theme-light .pipeline-step.step-done {
  background: rgba(6, 182, 212, 0.15);
  border-color: #0891b2;
  color: #0891b2;
}

.showcase-shell.theme-light .pipeline-step.step-active {
  background: #0891b2;
  color: #ffffff;
}

.showcase-shell.theme-light .pipeline-line {
  background: rgba(6, 182, 212, 0.25);
}

.showcase-shell.theme-light .pipeline-label {
  color: #0e7490;
}

.showcase-shell.theme-light .protocol-chip {
  background: rgba(168, 85, 247, 0.06);
  border-color: rgba(168, 85, 247, 0.25);
  color: #7e22ce;
}

.showcase-shell.theme-light .protocol-chip strong {
  color: #6b21a8;
}

.showcase-shell.theme-light .widget-replay .replay-text {
  color: #92400e;
}

.showcase-shell.theme-light .metric-specs-footer {
  border-top-color: #e2e8f0;
}

.showcase-shell.theme-light .spec-pill {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #475569;
}

.showcase-shell.theme-light .metric-card--emerald .metric-num {
  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.showcase-shell.theme-light .metric-card--cyan .metric-num {
  background: linear-gradient(135deg, #0284c7 0%, #06b6d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.showcase-shell.theme-light .metric-card--purple .metric-num {
  background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.showcase-shell.theme-light .metric-card--amber .metric-num {
  background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.showcase-shell.theme-light .section-title {
  color: #24283b;
}

.showcase-shell.theme-light .section-desc {
  color: #5d667e;
}

.showcase-shell.theme-light .bento-card {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 244, 0.9);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.02);
}

.showcase-shell.theme-light .bento-card-gradient {
  background: linear-gradient(135deg, #ffffff 0%, #f7f6fc 100%);
}

.showcase-shell.theme-light .card-title {
  color: #24283b;
}

.showcase-shell.theme-light .card-desc {
  color: #5d667e;
}

.showcase-shell.theme-light .v-pill {
  background: rgba(243, 244, 251, 0.9);
  border: 1px solid rgba(226, 232, 244, 0.9);
  color: #414862;
}

/* 架构拓扑 (赛博拓扑工程矩阵亮色主题适配) */
.showcase-shell.theme-light .arch-section {
  background: radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.04) 0%, rgba(248, 249, 253, 0.95) 70%);
  border-top: 1px solid rgba(226, 232, 240, 0.85);
  border-bottom: 1px solid rgba(226, 232, 240, 0.85);
}

.showcase-shell.theme-light .arch-telemetry-strip {
  background: #ffffff;
  border-color: rgba(226, 232, 240, 0.95);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.showcase-shell.theme-light .telemetry-lbl {
  color: #64748b;
}

.showcase-shell.theme-light .telemetry-num {
  color: #4f46e5;
}

.showcase-shell.theme-light .telemetry-divider {
  color: #cbd5e1;
}

.showcase-shell.theme-light .arch-node-col {
  background: #ffffff;
  border-color: rgba(226, 232, 244, 0.95);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.03);
}

.showcase-shell.theme-light .arch-node-col:hover {
  background: #ffffff;
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 0 16px 36px rgba(99, 102, 241, 0.08);
}

.showcase-shell.theme-light .arch-node-header {
  background: #f8fafc;
  border-bottom-color: #e2e8f0;
}

.showcase-shell.theme-light .node-main-title {
  color: #1e293b;
}

.showcase-shell.theme-light .node-layer-tag {
  color: #64748b;
}

.showcase-shell.theme-light .main-hub {
  background: #ffffff;
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.08), 0 10px 24px rgba(0, 0, 0, 0.04);
}

.showcase-shell.theme-light .hub-header {
  background: rgba(99, 102, 241, 0.06);
}

.showcase-shell.theme-light .node-tech-item {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.showcase-shell.theme-light .node-tech-item:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.showcase-shell.theme-light .hub-item {
  background: rgba(99, 102, 241, 0.03);
  border-color: rgba(99, 102, 241, 0.15);
}

.showcase-shell.theme-light .hub-item:hover {
  background: rgba(99, 102, 241, 0.06);
  border-color: rgba(99, 102, 241, 0.28);
}

.showcase-shell.theme-light .node-name {
  color: #1e293b;
}

.showcase-shell.theme-light .node-sub {
  color: #64748b;
}

.showcase-shell.theme-light .node-bullet-num {
  background: #e2e8f0;
  color: #475569;
}

.showcase-shell.theme-light .bullet-hub {
  background: rgba(99, 102, 241, 0.15);
  color: #4f46e5;
}

.showcase-shell.theme-light .node-footer-specs {
  background: #f8fafc;
  border-top-color: #e2e8f0;
}

.showcase-shell.theme-light .spec-code {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #475569;
}

.showcase-shell.theme-light .hub-spec {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.2);
  color: #4338ca;
}

.showcase-shell.theme-light .connector-badge {
  background: #f1f5f9;
  border-color: rgba(99, 102, 241, 0.3);
  color: #4338ca;
}

.showcase-shell.theme-light .connector-sub {
  color: #64748b;
}

/* 部署说明 */
.showcase-shell.theme-light .deploy-card {
  background: #ffffff;
  border: 1px solid rgba(226, 232, 244, 0.9);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.02);
}

.showcase-shell.theme-light .private-card {
  background: linear-gradient(135deg, #ffffff 0%, #faf8fe 100%);
}

.showcase-shell.theme-light .deploy-card-title {
  color: #24283b;
}

.showcase-shell.theme-light .deploy-card-desc {
  color: #5d667e;
}

.showcase-shell.theme-light .deploy-feature-list li {
  color: #414862;
}

.showcase-shell.theme-light .deploy-notice-box {
  background: rgba(2, 132, 199, 0.06);
  color: #0284c7;
  border-left-color: #0284c7;
}

.showcase-shell.theme-light .terminal-box {
  background: #1e2235;
  border: 1px solid rgba(30, 41, 59, 0.2);
}

.showcase-shell.theme-light .terminal-code {
  color: #cbd5e1;
}

/* 联系作者专属卡片 */
.showcase-shell.theme-light .contact-card {
  background: linear-gradient(135deg, #ffffff 0%, #f7f6fc 100%);
  border: 1px solid rgba(99, 102, 241, 0.22);
  box-shadow: 0 16px 40px rgba(99, 102, 241, 0.06);
}

.showcase-shell.theme-light .author-name {
  color: #24283b;
}

.showcase-shell.theme-light .author-role {
  color: #6366f1;
}

.showcase-shell.theme-light .contact-intro {
  color: #57607a;
}

.showcase-shell.theme-light .channel-code {
  background: #f4f5fc;
  border: 1px solid rgba(218, 224, 238, 0.9);
  color: #4f46e5;
}

.showcase-shell.theme-light .service-box {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(226, 232, 244, 0.9);
}

.showcase-shell.theme-light .service-title {
  color: #24283b;
}

.showcase-shell.theme-light .service-item strong {
  color: #2b3048;
}

.showcase-shell.theme-light .service-item p {
  color: #6b748e;
}

/* 页脚 */
.showcase-shell.theme-light .showcase-footer {
  background: #f5f4fa;
  border-top: 1px solid rgba(226, 232, 240, 0.8);
}

.showcase-shell.theme-light .footer-brand {
  color: #5d667e;
}

.showcase-shell.theme-light .tech-tag {
  background: rgba(0, 0, 0, 0.04);
  color: #5d667e;
}

.showcase-shell.theme-light .btn-footer-link {
  color: #6b748e;
}

.showcase-shell.theme-light .btn-footer-link:hover {
  color: #24283b;
}

.showcase-shell.theme-light .btn-footer-enter {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.28);
  color: #4f46e5;
}
</style>
