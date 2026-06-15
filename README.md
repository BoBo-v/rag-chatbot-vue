# AI Chat

一个基于 Vue 3、TypeScript 和 Vite 的本地优先 AI 聊天前端。项目支持普通聊天、多模型对比、本地会话持久化、全文搜索、图片/文件附件、Markdown/数学公式渲染，以及接入后端知识库 RAG。

## 功能

- 普通聊天：支持 Ollama、OpenAI 兼容接口、Claude，以及同源后端 `/api/chat`。
- 流式输出：统一处理 Ollama NDJSON、OpenAI SSE、Claude 流式响应，并支持停止生成、重试、继续生成。
- 会话管理：会话和消息保存在浏览器 IndexedDB，刷新页面后仍可恢复。
- 本地搜索：通过 Web Worker 建立会话搜索索引，避免阻塞聊天界面。
- 附件输入：支持图片附件和文本/代码文件附件；视觉能力取决于所选模型。
- Markdown 渲染：支持代码高亮、复制按钮、任务列表、行内公式 `$...$` 和块级公式 `$$...$$`。
- 多模型对比：多个模型并发回答同一问题，记录耗时和状态，支持汇总、历史查看、导出 Markdown/JSON。
- 知识库管理：上传 txt、md、pdf、png、jpg、jpeg、webp 到后端 RAG；查看文件、chunk、删除文件、检索调试。
- RAG 模式：后端聊天支持自动、强制、关闭三种模式，对应 `rag: "auto" | true | false`。
- 设置持久化：模型、主题、上下文长度、超时、后端 RAG 模式等保存在 `localStorage`。

## 技术栈

- Vue 3 + TypeScript + Vite
- Dexie / IndexedDB
- markdown-it + highlight.js + KaTeX
- Web Worker 搜索索引
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

## 模型接入

### Ollama

默认配置：

- Base URL: `http://localhost:11434`
- Model: `qwen2.5:7b`

如果关闭“后端对话服务”，前端会直接请求 Ollama：

```http
POST http://localhost:11434/api/chat
```

如果开启“后端对话服务”，前端会请求同源后端：

```http
POST /api/chat
```

请求体会包含：

```json
{
  "provider": "ollama",
  "model": "qwen2.5:7b",
  "rag": "auto",
  "messages": []
}
```

### OpenAI 兼容接口

支持配置 Base URL 和 API Key。开发环境下，OpenAI 兼容接口会走 Vite 同源代理前缀 `/__ai_proxy/openai`，用于绕过浏览器 CORS；生产环境会直接请求配置的厂商地址。

可用于 OpenAI、DeepSeek、通义千问兼容接口、Kimi 等 OpenAI 兼容服务。

### Claude

支持 Claude provider 配置 API Key 和模型名。浏览器直连 Claude API 可能受 CORS 限制，公开部署时建议通过后端代理。

## 知识库 RAG

知识库页面依赖后端提供以下接口：

| 功能 | 接口 |
| --- | --- |
| 上传文件 | `POST /api/upload` |
| 上传进度 | `GET /api/upload/progress/:progressId` |
| 文件列表 | `GET /api/files` |
| 文件详情 | `GET /api/files/:id` |
| 删除文件 | `DELETE /api/files/:id` |
| 检索调试 | `GET /api/search?q=...&topK=5&minScore=0.2` |
| 后端聊天 | `POST /api/chat` |
| 后端厂商列表 | `GET /api/providers` |

上传支持：

- `.txt`
- `.md`
- `.pdf`
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

前端默认不传 `overwrite`，也就是请求形态通常是：

```http
POST /api/upload?progressId=前端生成的ID
```

只有显式传入 `overwrite: true` 时才会发送 `overwrite=true`。

当前前端会在上传前做 10MB 大小校验。这个限制来自后端 Fastify multipart 默认配置。

图片入库流程由后端完成：图片先保存原图，再调用本地视觉模型识别成 Markdown；识别结果直接进入现有 RAG 流程，切块、embedding、写入 SQLite 向量库和全文索引。前端只展示上传进度和接口返回的 chunk 预览，不直接调用视觉模型。

RAG 模式：

- 自动：发送 `rag: "auto"`，由后端判断是否检索并注入资料。
- 关闭：发送 `rag: false`，直接推理，不检索知识库。
- 强制：发送 `rag: true`，强制检索，有结果则注入资料。

## 多模型对比

多模型对比页可以：

- 配置多个运行时并发生成。
- 上传图片或文本文件作为共同输入。
- 单独停止某个模型或停止全部。
- 查看状态、耗时、成功/失败统计。
- 对多个成功回答生成汇总答案。
- 保存对比历史到 IndexedDB。
- 导出 Markdown 或 JSON。

历史记录不会保存 API Key，恢复历史后适合查看和导出；重新请求需要新建对比。

## 数据存储

浏览器本地数据分两类：

- `localStorage`：保存设置项，例如 provider、模型名、主题、上下文长度、RAG 模式。
- IndexedDB：保存会话、消息、搜索索引、多模型对比记录。

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
  components/        通用组件和设置面板
  composables/       聊天、多模型对比、附件、滚动、搜索等组合逻辑
  db/                Dexie / IndexedDB 表结构和迁移
  search/            本地搜索索引、分词、排序、Worker 客户端
  services/          模型适配器、知识库接口、上下文构造、导出和持久化
  stores/            设置、聊天消息、会话状态
  styles/            全局主题、聊天样式、Markdown 样式
  types/             聊天和模型相关类型
  utils/             Markdown、数学公式、错误分类等工具
  views/             普通聊天、多模型对比、知识库页面
```

## 注意事项

- API Key 当前保存在浏览器 `localStorage`，适合本地个人使用；公开部署建议改为后端代理。
- 图片聊天附件和图片知识库入库是两条链路：当前知识库图片上传会由后端识别并进入 RAG；“图片伴随聊天提问但不入库”属于后续功能方向。
- RAG、图片入库、文件列表和检索调试都依赖后端接口；单独运行前端时，这些功能不可用。
- KaTeX 会把数学公式相关字体一起打包，构建产物里会出现 KaTeX 字体资源。
- 多模型对比和聊天历史都存储在浏览器本地，清理站点数据会删除这些记录。
