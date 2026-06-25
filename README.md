# AI Chat

AI Chat 是一个面向本地知识库问答、模型效果评估和检索链路排查的工程化前端项目。它不是单纯的聊天 Demo，而是把“资料入库、RAG 检索、引用解释、多模型对比、运行指标观察”串成一套可调试的 AI 工作台。

项目基于 Vue 3、TypeScript 和 Vite 构建，默认面向本地 Ollama 和同源后端服务，也支持 OpenAI 兼容接口与 Claude。

## 核心定位

- 本地知识库 RAG：上传文本、PDF 和图片资料，经过后端解析、切块、embedding 后进入 SQLite 向量库和全文索引。
- 多模型对比：同一问题并发请求多个模型，观察回答质量、耗时、成功失败状态，并支持汇总和导出。
- 可观测指标：展示 RAG 是否启用、命中文件、chunk 分数、向量分、关键词分、片段内容、上传阶段、对比耗时和运行状态。
- 本地优先：会话、消息、搜索索引和对比历史保存在浏览器 IndexedDB；设置保存在 localStorage。

## 功能总览

### 聊天与 RAG

- 支持 Ollama、OpenAI 兼容接口、Claude，以及同源后端 `/api/chat`。
- 设置层把连接方式、模型厂商和 RAG 开关拆开：
  - 浏览器直连：前端直接请求 Ollama、OpenAI 兼容接口或 Claude。
  - 后端代理：前端统一请求 `/api/chat`，由后端管理厂商路由、鉴权和 RAG。
  - RAG 开关：只在后端代理模式下生效。
- 支持流式输出、停止生成、重试、继续生成。
- 支持后端 RAG 模式：
  - `rag: "auto"`：由后端自动判断是否检索并注入资料。
  - `rag: true`：强制检索知识库，有结果则注入资料。
  - `rag: false`：关闭知识库，直接推理。
- 发送聊天前可调用 `/api/chat/context` 预取 RAG 上下文，并在 AI 回复下方展示引用资料。
- 引用资料展示包含：
  - 本次是否启用 RAG
  - 命中文件名
  - chunk 编号
  - `score`
  - `vectorScore`
  - `keywordScore`
  - chunk 片段预览

### 本地知识库

- 支持上传：
  - `.txt`
  - `.md`
  - `.pdf`
  - `.png`
  - `.jpg`
  - `.jpeg`
  - `.webp`
- 普通文本和 PDF 由后端解析为文本。
- 图片先保存原图，再由本地视觉模型识别、翻译、整理为 Markdown，然后进入现有 RAG 流程。
- 上传进度通过 SSE 展示，包含：
  - `receiving`
  - `parsing`
  - `chunking`
  - `embedding`
  - `storing`
  - `completed`
  - `failed`
- 图片入库时会重点展示解析阶段，因为这里需要等待视觉模型。
- 文件详情页可以查看文件元数据、chunk 数量和 chunk 文本预览。
- 检索调试页可查看某个问题会命中哪些资料以及对应分数。

### 多模型对比

- 支持配置多个模型运行时，并发回答同一个问题。
- 支持图片或文本附件作为共同输入。
- 支持单独停止某个模型或停止全部模型。
- 展示每个模型的运行状态、耗时、错误信息和回答内容。
- 支持对多个成功回答生成汇总答案。
- 对比历史保存到 IndexedDB。
- 支持导出 Markdown 和 JSON。

### 可观测与排查

这个项目重点保留了排查 AI 系统行为所需的信息：

- RAG 是否启用。
- RAG 是自动、强制还是关闭。
- 检索命中了哪些文件。
- 命中了哪些 chunk。
- 综合分、向量分、关键词分。
- 注入片段预览。
- 上传进度和图片识别阶段。
- 多模型耗时、成功数、失败数、平均耗时。
- 流式请求错误、超时、停止状态。

项目不展示模型完整思维链，只展示可解释的外部上下文和运行指标。

## 技术栈

- Vue 3
- TypeScript
- Vite
- Dexie / IndexedDB
- markdown-it
- highlight.js
- KaTeX
- Web Worker 搜索索引
- @bobocn/element
- ESLint

## 快速开始

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

构建：

```bash
npm run build
```

预览构建产物：

```bash
npm run preview
```

代码检查：

```bash
npm run lint
```

## 后端接口约定

知识库和后端 RAG 能力依赖同源后端接口。只运行前端时，普通聊天、本地历史、多模型对比等前端能力仍可使用，但知识库相关能力不可用。

前端有两种连接方式：

- 浏览器直连模式：前端直接访问当前 provider 的接口，适合本地 Ollama 或允许浏览器访问的 OpenAI 兼容服务。
- 后端代理模式：前端统一访问 `/api/chat`，后端负责 provider、model、API Key 和 RAG 注入。

RAG 依赖后端知识库检索，因此只在后端代理模式下可用。

### 上传知识库文件

```http
POST /api/upload
```

请求：

- `multipart/form-data`
- 字段：`file`
- query：
  - `progressId=前端生成的ID`
  - `overwrite=true | false`

当前前端默认不传 `overwrite`，也就是：

```http
POST /api/upload?progressId=前端生成的ID
```

只有明确覆盖时才传 `overwrite=true`。

后端文件大小限制来自 Fastify multipart 配置，当前按 10MB 处理。

### 上传进度

```http
GET /api/upload/progress/:progressId
```

SSE 返回进度：

```json
{
  "phase": "parsing",
  "percent": 45,
  "message": "正在识别图片内容",
  "done": false
}
```

### 文件管理

```http
GET /api/files
GET /api/files/:id
DELETE /api/files/:id
```

前端展示：

- 文件名
- MIME 类型
- 文件大小
- 字符数
- chunk 数
- embedding 模型
- embedding 维度
- 创建时间
- chunk 文本预览

### 向量库状态

```http
GET /api/vector-store/status
```

用于展示：

- 当前 embedding 模型
- 文件数量
- chunk 数量
- 是否需要重建索引：`needsReindex`
- 是否存在旧模型或旧维度的 chunk

### 检索调试

```http
GET /api/search?q=...&topK=5&minScore=0.55
```

用于排查“为什么这次没有引用知识库”：

- 命中文件名
- chunkIndex
- score
- vectorScore
- keywordScore
- chunk 文本

RAG Eval 可导入示例测试集：`public/examples/rag-eval-cases.frontend-ai.json`。

### 聊天

```http
POST /api/chat
```

请求示例：

```json
{
  "provider": "ollama",
  "model": "qwen3:8b",
  "rag": "auto",
  "messages": [
    { "role": "user", "content": "根据知识库回答这个问题" }
  ]
}
```

返回为按行输出的 JSON 流，前端逐行解析：

- `message.content`：增量文本
- `error`：流式错误
- `done`：结束

### RAG 上下文预览

```http
POST /api/chat/context
```

请求体和 `/api/chat` 一致，但不调用模型，只返回后端准备注入的 RAG 上下文：

```json
{
  "enabled": true,
  "prompt": "...",
  "results": [
    {
      "fileId": "...",
      "filename": "demo.png",
      "chunkIndex": 0,
      "score": 0.82,
      "vectorScore": 0.76,
      "keywordScore": 0.91,
      "text": "命中的片段内容..."
    }
  ]
}
```

前端第一版采用“发送前预取上下文”的方案，因此 `/api/chat/context` 和 `/api/chat` 会各检索一次。小型本地知识库通常可以接受；如果后续需要严格一致，可以让后端在 `/api/chat` 流开始前返回 metadata。

## 图片知识库流程

当前已完成的是“图片作为知识库资料上传入库，然后聊天时通过 RAG 检索使用图片识别出来的文本”。

流程：

1. 前端上传 `png/jpg/jpeg/webp` 到 `/api/upload`。
2. 后端保存原图到 `UPLOAD_DIR`。
3. 后端调用本地视觉模型 `VISION_MODEL`，默认 `qwen3-vl:2b`。
4. 视觉模型把图片内容识别、翻译、整理成 Markdown。
5. Markdown 作为知识库文本进入 RAG 流程。
6. 文本切块、embedding、写入 SQLite 向量库和全文索引。
7. 上传接口返回 file 元数据和 chunks，前端展示 chunk 预览。

当前没有单独的 parsed 文件表；识别文本存在 chunk 中。

“聊天框直接带图片提问，但不入库”属于后续功能方向。

## 本地数据存储

浏览器本地数据分两类：

- `localStorage`：保存 provider、模型名、主题、上下文长度、超时、RAG 模式等设置。
- IndexedDB：保存会话、消息、搜索索引和多模型对比记录。

IndexedDB 数据库名：

```text
ai-chat-db
```

主要表：

- `conversations`
- `messages`
- `searchDocs`
- `searchTerms`
- `searchTermStats`
- `searchTags`
- `recentSearches`
- `searchMeta`
- `comparisonSessions`
- `comparisonRuns`

## 项目结构

```text
src/
  components/        通用组件、设置面板、引用资料展示、确认弹窗
  composables/       聊天、多模型对比、附件、滚动、搜索等组合逻辑
  db/                Dexie / IndexedDB 表结构
  search/            本地搜索索引、分词、排序、Worker 客户端
  services/          模型适配器、知识库接口、上下文构造、对比导出和持久化
  stores/            设置、聊天消息、会话状态
  styles/            全局主题、聊天样式、Markdown 样式
  types/             聊天、RAG、模型和对比相关类型
  utils/             Markdown、数学公式、错误分类等工具
  views/             聊天、多模型对比、知识库页面
```

## 适合展示的工程点

- RAG 链路可解释：不是只展示模型回答，还展示引用来源和检索分数。
- 多模型评测闭环：并发请求、状态跟踪、耗时统计、汇总、历史和导出。
- 本地知识库工作流：上传、进度、解析、切块、检索调试、删除。
- 前端持久化：会话、消息、搜索索引和对比历史都落在 IndexedDB。
- 流式交互：统一处理 Ollama NDJSON、OpenAI SSE、Claude SSE 和后端 JSON 行流。
- Markdown 和数学公式：支持代码高亮、复制、KaTeX 行内和块级公式。
- 主题和组件集成：接入 `@bobocn/element`，并通过主题变量同步暗色和亮色模式。

## 注意事项

- API Key 当前保存在浏览器 `localStorage`，适合本地个人使用；公开部署建议改为后端代理。
- 知识库、图片入库、检索调试和 RAG 上下文预览依赖后端接口。
- 图片入库会调用本地视觉模型，耗时明显长于普通文本上传。
- 清理浏览器站点数据会删除本地会话、消息、搜索索引和多模型对比历史。
- 构建产物包含 KaTeX 字体资源，属于数学公式渲染依赖。
