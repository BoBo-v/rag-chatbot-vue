<script setup lang="ts">
import { ref } from 'vue'
import {
  ArrowRight,
  Bot,
  Check,
  Code2,
  Columns2,
  Copy,
  Database,
  ExternalLink,
  Flame,
  Layers,
  MessageSquare,
  Network,
  RotateCcw,
  Shield,
  Sparkles,
  Terminal,
  Workflow,
} from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'enter-workspace', mode?: 'chat' | 'agent' | 'compare' | 'knowledge'): void
}>()

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
  <div class="showcase-shell">
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

    <!-- ── 3. 数据与硬核实力标尺 ── -->
    <section class="metrics-bar-section">
      <div class="container">
        <div class="metrics-grid">
          <div class="metric-item">
            <div class="metric-icon"><Shield :size="20" /></div>
            <div class="metric-num">100%</div>
            <div class="metric-title">本地隐私安全</div>
            <div class="metric-desc">数据保存在浏览器 IndexedDB 与本地后端，拒绝云端隐秘泄露</div>
          </div>

          <div class="metric-item">
            <div class="metric-icon"><Layers :size="20" /></div>
            <div class="metric-num">6 阶段</div>
            <div class="metric-title">SSE 上传流水线</div>
            <div class="metric-desc">支持图片视觉 OCR 识别转 Markdown，打通架构图与截图检索</div>
          </div>

          <div class="metric-item">
            <div class="metric-icon"><Network :size="20" /></div>
            <div class="metric-num">3 大协议</div>
            <div class="metric-title">标准无缝集成</div>
            <div class="metric-desc">深度支持 Ollama、OpenAI 接口规范及 Anthropic MCP 协议</div>
          </div>

          <div class="metric-item">
            <div class="metric-icon"><RotateCcw :size="20" /></div>
            <div class="metric-num">0 丢包</div>
            <div class="metric-title">断点续传恢复</div>
            <div class="metric-desc">基于 Last-Event-ID 与幂等生成任务，断网刷新无损恢复</div>
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

    <!-- ── 5. 全栈系统架构解密 ── -->
    <section id="architecture" class="arch-section">
      <div class="container">
        <div class="section-heading text-center">
          <span class="sub-badge">Architecture</span>
          <h2 class="section-title">前后端协同的极致高并发架构</h2>
          <p class="section-desc">以 Fastify 5 异步事件循环为核心枢纽，贯穿本地端侧存储与本地/云端大模型。</p>
        </div>

        <div class="arch-topology">
          <div class="arch-node-col">
            <div class="arch-node-header">前端工程工作台 (Vue 3)</div>
            <div class="arch-node-box">
              <div class="node-item">4 大专属工作区模式</div>
              <div class="node-item">IndexedDB 本地隐私数据库</div>
              <div class="node-item">Web Worker 离线全文索引</div>
              <div class="node-item">安全隔离 iframe 代码预览</div>
            </div>
          </div>

          <div class="arch-flow-arrow">➔</div>

          <div class="arch-node-col main-hub">
            <div class="arch-node-header hub-header">Fastify 5 服务引擎 (Node.js)</div>
            <div class="arch-node-box hub-box">
              <div class="node-item">毫秒级异步路由 (TypeScript)</div>
              <div class="node-item">SSE / NDJSON 实时事件重放</div>
              <div class="node-item">可恢复任务管理 (Last-Event-ID)</div>
              <div class="node-item">内置可观测性仪表盘 Dashboard</div>
              <div class="node-item">敏感密钥自动脱敏与安全策略</div>
            </div>
          </div>

          <div class="arch-flow-arrow">➔</div>

          <div class="arch-node-col">
            <div class="arch-node-header">混合检索与模型层</div>
            <div class="arch-node-box">
              <div class="node-item">SQLite Vector / Qdrant 向量库</div>
              <div class="node-item">SQLite FTS5 BM25 全文检索</div>
              <div class="node-item">本地 Ollama (对话 + 视觉 OCR)</div>
              <div class="node-item">OpenAI / Claude / MCP 协议</div>
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

/* ── 3. 数据与硬核实力标尺 ── */
.metrics-bar-section {
  position: relative;
  z-index: 10;
  padding: 30px 0 60px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.metric-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 24px;
  transition: all 0.25s;
}

.metric-item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(99, 102, 241, 0.3);
  transform: translateY(-2px);
}

.metric-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.metric-num {
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  margin-bottom: 4px;
}

.metric-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 6px;
}

.metric-desc {
  font-size: 0.82rem;
  color: #94a3b8;
  line-height: 1.5;
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

/* ── 5. 全栈系统架构解密 ── */
.arch-section {
  position: relative;
  z-index: 10;
  padding: 80px 0;
  background: rgba(0, 0, 0, 0.25);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.arch-topology {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 40px;
}

.arch-node-col {
  flex: 1;
  background: rgba(18, 20, 32, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  overflow: hidden;
}

.arch-node-header {
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.88rem;
  font-weight: 700;
  color: #fff;
}

.main-hub {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 0 24px rgba(99, 102, 241, 0.15);
}

.hub-header {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.arch-node-box {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-item {
  font-size: 0.82rem;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.arch-flow-arrow {
  font-size: 1.4rem;
  color: #6366f1;
  font-weight: bold;
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
  .arch-topology { flex-direction: column; }
  .arch-flow-arrow { transform: rotate(90deg); margin: 6px 0; }
  .deploy-comparison-grid { grid-template-columns: 1fr; }
  .contact-card { grid-template-columns: 1fr; }
  .metrics-grid { grid-template-columns: repeat(2, 1fr); }
  .eval-metrics-row { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .metrics-grid { grid-template-columns: 1fr; }
  .scenario-switch { flex-direction: column; }
  .pipeline-steps { overflow-x: auto; justify-content: flex-start; gap: 16px; }
  .pipe-line { display: none; }
}
</style>
