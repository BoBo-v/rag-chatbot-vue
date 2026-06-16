当前状态(2026-04-28 更新)

阶段
Phase 1 - Month 1 - Week 2 - RAG 基础实现完成 / 前端集成待启动

18 个月目标
成为 AI 应用工程师,抗击 AI 对前端行业的结构性冲击

核心认知(每次对话前先看一眼)
- 我的风险不是被 AI 替代,是被"会用 AI 的同级工程师"替代
- 前端深度已过 90% 分位,继续挖是边际递减 → 每周复习前端深度不超过 20% 时间
- 外包背景最大的坑是"只会实现不会定义问题" → 项目要当产品做,不只当练习
- AI Chat 是作品载体,不是学习目的。功能 60-70 分就停,叠加 AI 工程含量更重要

教学原则(Claude 请遵守)
- 按"偏低水位高级前端"标准对话,不从基础讲起
- 不直接给代码答案,先问我思路,再纠正,再给正确版
- 我一旦偏离主线想学新东西,提醒我回到身份锚
- 我一旦想回头"再补一下 XX 基础",先问我:这个不补会死吗?不会就往前走
- 每周进度同步时,既看完成情况,也点评代码质量
- 作品集视角优先于技术深度视角:每个功能先问"这个能不能写进简历/README"

我是谁
3 年前端,Vue/uni-app 方向,多端开发经验(小程序、App、Electron)。
跨端广度足够但深度不足(权限/上架生疏)。
JS/浏览器/Vue3 底层扎实,代码架构意识在位,但长期做外包缺独立作品。
现在 AI Chat 项目中补齐 TS 实战 + 积累拿得出手的作品。

已经掌握(不用再教)
JS/TS:
- Event Loop、Promise 原理(手写约 80%)
- this/闭包/原型链
- TS:基础标注、泛型+约束、keyof/T[K]、映射类型(Pick/Partial/Readonly 手写)、
  条件类型、infer(手写 ReturnType/Parameters)
- 工具类型真实项目运用:Partial / Omit / Omit<Partial<T>,K>
- 知道何时用 ReturnType 推断 vs 显式声明 interface(稳定结构用 interface)

Vue3:
- 响应式(Proxy/track/trigger/effect)
- scheduler(queueJob/nextTick)
- diff(双端对比/LIS)
- compiler(patchFlag/block tree 原理,细节规则未完全内化——不再回补)

浏览器:
- 渲染 pipeline(DOM→CSSOM→Layout→Paint→Raster→Composite)
- 回流/重绘/合成、Layout Thrashing、GPU 合成层

跨端(广而不深):
- uni-app:小程序(商城/社区)、Android App、Electron
- SDK 集成:支付(支付宝/微信)、IM、地图、扫码、蓝牙、推送
- 上架流程:应用宝、iOS App Store(走过完整流程但细节生疏)

数据库基础认知:
- 关系型 / 文档型 / 键值型 / 向量数据库 / 图数据库的分类和选型思路
- Dexie(IndexedDB 封装)基本 CRUD、索引声明规则

薄弱点(重点关注,但不是全部都要补)
- 代码输出稳定性(虚拟列表动态高度版独立写不出)—— 通过做项目自然补,不单独刷
- 面试表达:缺总-分-总,概念混用 —— Phase 1 末期集中练
- Node / Agent:已有基础,继续深入
- React:未开始 —— 优先级下调,Phase 2 末期或 Phase 3 再看
- 学习焦虑:容易陷入"复习 > 前进" —— 用"不补会死吗"原则强制推进

当前项目:AI Chat

技术栈:
前端：Vue 3 + Vite + TypeScript + Dexie + Composable 架构
后端：Fastify + @fastify/cors + @fastify/multipart + dotenv
模型：Ollama (qwen2.5:7b 对话 + nomic-embed-text 向量化) 通过后端代理
RAG：pdf-parse + 自研 chunker + 内存 vector store

已实现:
- 流式输出 + 打字机效果(rAF + queue 调度)
- 中断/继续生成(含完整状态守卫:isStreaming 入口守卫、status 校验、queue/isFlushing 重置、try/finally)
- 多会话管理(切换、创建、删除、首条自动创建)
- 消息 + 会话双表持久化
- Markdown 异步渲染(完成后格式化,避免流式 re-parse)
- 用户滚动中断检测 + unread 提示 + 回到底部
- 统一 updateMessage 接口(Omit<Partial<Message>, 'id'>)
- 消息状态职责统一:handleStop 只中断流,onDone 统一设消息状态,finally 做兜底
- StreamController 显式 interface(types/chat.ts)
- error 状态 UI + 重试功能
- 三函数抽象重构(runStream):handleSend/handleRetry/handleContinue 共用核心
- Node 后端层(Fastify 流式代理)
- 后端 /api/tags 接口 + 前端模型动态切换 + 设置面板
- RAG 全链路:文件上传 → 文本提取(PDF/TXT) → 切片(overlap) → 向量化(Ollama embed) → 内存存储 → 余弦相似度检索 → 注入 prompt

后端已有接口:
- POST /api/chat — 流式代理(含 RAG 检索注入)
- POST /api/upload — 文件上传 + 文本提取 + 切片 + 向量化 + 存储
- GET /api/tags — 拉取 Ollama 模型列表

已完成进度:
Day 1-2: 前端功能实现(流式输出、多会话、持久化、中断/继续)
Day 2: Bug 修复(handleContinue 守卫、handleStop 去重、命名、类型提取)
Day 3: error UI + 重试功能
Day 4: 三函数抽象重构(runStream) + Node 后端层(Fastify 流式代理)
Day 5: 后端 /api/tags 接口 + 前端模型选择器 + 设置面板
Day 6: RAG 全链路实现(上传 → 提取 → 切片 → 向量化 → 存储 → 检索注入)

技术收获(面试素材):
Day 4:
- 抽象方法论:"找不变量"五步法(列动作→圈共有→圈差异→起名→入口只做准备)
- 闭包陷阱:变量和操作它的函数必须住在同一个闭包(queue/flushQueue 事件)
- 心态突破:从"怕删错所以全留"到"默认删,编译器兜底"
- 全栈架构:为什么要加后端代理层(安全/统一入口/可观测性/后续 RAG)
- 流式代理:Node 后端边读边转发 NDJSON 流

Day 6:
- RAG pipeline 完整链路:上传 → 提取 → chunking → embedding → 检索 → 注入
- 文本切片策略:段落累加 + overlap 防边界丢失 + 超长段落按句号二次分割
- 向量化:Ollama /api/embed 本地 embedding,无需外部 API
- 语义检索:余弦相似度算法,内存 vector store
- Node 踩坑经验:pdf-parse 版本兼容(CJS/ESM 导出差异)、PowerShell 转义问题

接下来的优先级:
1. 前端加文件上传入口(UI + 对接 /api/upload)
2. RAG 增强:持久化 vector store(当前重启丢失)、多文件管理、删除文档
3. 后端加基础日志(请求时间、模型、token 用量)
4. 开始调研 Agent 能力(Function Calling / Tool Use)

18 个月路线(调整版 —— 重点变化:Node/AI 工程前移)

Phase 1 (M1-3):AI Chat 从前端 demo → AI 应用工程 demo
里程碑:一个同时体现"前端 + Node + AI 集成"三维能力的作品

Week 1  ✅ 前端功能闭环 + 代码重构
Week 2  ✅ Node 后端层 + RAG 基础实现 ← 当前位置
Week 3-4 RAG 增强(持久化/多文件/前端集成) + Agent 调研
Week 5-8 Agent 能力:让对话能调用工具(计算器 / 搜索 / 读本地文件)
学 Function Calling / Tool Use 协议
Week 9-12 README 产品化 + Deploy + 面试表达练习(总-分-总)

Phase 2 (M4-9):深入 AI 工程
Prompt 工程实战、Evals 体系、上下文管理、多 Agent 编排
目标:有真实用户的 AI 产品(不一定要赚钱,但要有人用)
这一阶段可以考虑启动求职,作品已经足以换工作

Phase 3 (M10-18):细分方向深挖
候选方向:AI 应用架构 / RAG 基础设施 / Agent 编排框架 / AI + 垂直行业
具体选哪个,到时根据市场信号和个人兴趣再定,现在不预设

作品集思维(每完成一个功能问自己)
- 这个功能能不能写进 README 的 "Features" 段?
- 这个技术决策背后有没有 tradeoff 可以讲?(选 A 不选 B 的原因)
- 用户为什么会用我的,而不是 ChatGPT?差异化在哪?
- 如果面试官问"你这个项目最有技术含量的地方是什么",我能讲 5 分钟吗?