# AI Chat 项目详细介绍

> 一个基于 Vue 3 + TypeScript 构建的多模型 AI 聊天应用，支持 Ollama、OpenAI、Claude 三大 AI 服务商，数据全部存储在本地浏览器中。

---

## 目录

- [这是什么项目？](#这是什么项目)
- [技术栈一览](#技术栈一览)
- [项目结构总览](#项目结构总览)
- [核心概念解释](#核心概念解释)
- [各模块详细说明](#各模块详细说明)
  - [入口文件](#1-入口文件)
  - [页面视图](#2-页面视图views)
  - [组件](#3-组件components)
  - [状态管理](#4-状态管理stores)
  - [数据库](#5-数据库db)
  - [服务层](#6-服务层services)
  - [工具函数](#7-工具函数utils)
  - [组合式函数](#8-组合式函数composables)
  - [类型定义](#9-类型定义types)
  - [样式文件](#10-样式文件styles)
- [数据流：一条消息的完整旅程](#数据流一条消息的完整旅程)
- [功能特性](#功能特性)
- [如何运行项目](#如何运行项目)
- [架构设计决策](#架构设计决策)

---

## 这是什么项目？

想象一下 ChatGPT 的网页版——你在左边选择对话，右边输入消息，AI 逐字逐句地回复你。这个项目就是做了一个类似的东西，但它有几个特点：

1. **支持多个 AI 服务商**：你可以选择用 Ollama（本地运行的 AI）、OpenAI（ChatGPT 背后的公司）、或者 Claude（Anthropic 的 AI），随时切换。
2. **数据存在本地**：所有的聊天记录都存储在你浏览器的 IndexedDB 中（可以理解为浏览器自带的小型数据库），不会上传到任何服务器。
3. **纯前端项目**：没有后端服务器，直接从浏览器调用 AI 的 API 接口。

---

## 技术栈一览

| 技术 | 用途 | 简单解释 |
|------|------|----------|
| **Vue 3** | 前端框架 | 负责页面的渲染和交互，就像房子的骨架 |
| **TypeScript** | 编程语言 | JavaScript 的加强版，多了类型检查，写代码时更安全 |
| **Vite** | 构建工具 | 负责把你的代码打包成浏览器能运行的文件，开发时提供热更新 |
| **Dexie.js** | 数据库 | 封装了浏览器的 IndexedDB，方便存储聊天记录 |
| **markdown-it** | Markdown 渲染 | 把 AI 回复的 Markdown 文本转成好看的 HTML |
| **highlight.js** | 代码高亮 | 让 AI 回复中的代码块有语法着色 |
| **Prettier** | 代码格式化 | 让 AI 回复中的代码块格式更美观 |

---

## 项目结构总览

```
ai-chat/
├── index.html              # 入口 HTML 文件（整个应用的"壳"）
├── package.json            # 项目依赖和脚本配置
├── vite.config.ts          # Vite 构建工具的配置
├── tsconfig.json           # TypeScript 配置
│
└── src/                    # 所有源代码都在这里
    ├── main.ts             # 应用入口：创建 Vue 实例
    ├── App.vue             # 根组件：处理主题切换
    │
    ├── views/              # 页面级组件
    │   ├── StyleChat.vue   # ★ 主页面（实际使用的聊天界面）
    │   └── Chat.vue        # 早期测试版页面（未使用）
    │
    ├── components/         # 可复用的 UI 组件
    │   └── SettingsPanel.vue  # 设置面板（选择模型、配置 API 等）
    │
    ├── composables/        # 组合式函数（业务逻辑）
    │   ├── useChatView.ts  # ★ 核心逻辑：发消息、流式输出、重试等
    │   └── useToast.ts     # 弹窗提示逻辑
    │
    ├── stores/             # 状态管理（全局共享的数据）
    │   ├── chat.ts         # 消息列表状态
    │   ├── conversations.ts # 会话列表状态
    │   └── settings.ts     # 用户设置状态（持久化到 localStorage）
    │
    ├── services/           # 与 AI 服务商通信
    │   ├── stream.ts       # 统一入口：路由到具体的服务商
    │   ├── context.ts      # 上下文管理：控制发给 AI 的消息量
    │   └── providers/      # 各服务商的具体实现
    │       ├── ollama.ts   # Ollama 接口
    │       ├── openai.ts   # OpenAI 接口（也兼容 DeepSeek 等）
    │       └── claude.ts   # Claude 接口
    │
    ├── db/                 # 数据库
    │   └── index.ts        # Dexie 数据库定义（表结构）
    │
    ├── types/              # TypeScript 类型定义
    │   └── chat.ts         # 消息、会话等数据结构的类型
    │
    ├── utils/              # 工具函数
    │   ├── markdown.ts     # Markdown 渲染
    │   └── error.ts        # 错误分类
    │
    └── styles/             # 样式文件
        ├── chat.css        # 聊天界面样式
        ├── markdown.css    # Markdown 内容样式
        └── tokens.css      # 设计变量（颜色、间距等）
```

> **★ 标记的是最核心的两个文件**，理解了它们基本就理解了整个项目。

---

## 核心概念解释

在深入代码之前，先理解几个关键概念：

### 什么是"流式输出"（Streaming）？

当你在 ChatGPT 中提问时，你会看到文字一个一个地蹦出来，而不是等 AI 想完了再一次性显示。这就是"流式输出"——AI 每生成一小段文字，就立刻发给你，前端收到后立刻显示。

技术上的实现：浏览器发送一个 HTTP 请求，服务器不是等全部处理完才返回，而是通过 **SSE（Server-Sent Events）** 或 **NDJSON** 格式持续发送数据块（chunk），前端逐个读取并显示。

### 什么是"上下文"（Context）？

AI 不像人类有持续的记忆。每次你发送消息时，需要把之前的对话历史也一起发过去，AI 才知道你们在聊什么。这些历史消息就是"上下文"。

但上下文有长度限制（比如 128K tokens），所以需要管理哪些历史消息该发、哪些该裁剪。

### 什么是 IndexedDB？

浏览器内置的数据库，可以存储大量结构化数据。和 `localStorage` 不同，IndexedDB 支持索引查询、存储大文件，适合存储聊天记录这种数据。本项目用 **Dexie.js** 库来简化操作。

### 什么是"组合式函数"（Composable）？

Vue 3 中复用逻辑的方式。你可以把一段相关的逻辑（变量 + 函数）封装成一个函数，在组件中调用它。比如 `useChatView()` 封装了发送消息、流式接收、滚动控制等所有聊天相关的逻辑，让 `StyleChat.vue` 页面组件保持简洁。

---

## 各模块详细说明

### 1. 入口文件

#### `index.html`

整个应用的 HTML 外壳，只有一个 `<div id="app"></div>`。Vue 会把整个应用"挂载"到这个 div 上。

#### `src/main.ts`

```typescript
// 做了三件事：
// 1. 引入样式文件
// 2. 创建 Vue 应用实例
// 3. 挂载到 #app 上
```

#### `src/App.vue`

根组件，职责很单一：
- 读取用户的主题设置（深色/浅色/跟随系统）
- 在 `<html>` 标签上设置 `data-theme` 属性
- 监听系统主题变化（比如你从浅色模式切换到深色模式）
- 渲染主页面 `<StyleChat />`

---

### 2. 页面视图（Views）

#### `src/views/StyleChat.vue` — 主页面 ★

这是你打开应用后看到的那个页面，负责整个聊天界面的布局和交互。

**页面布局：**

```
┌─────────────────────────────────────────────┐
│ ┌──────────┐ ┌────────────────────────────┐ │
│ │          │ │ 顶栏：菜单按钮 | 标题 | 设置│ │
│ │  侧边栏   │ ├────────────────────────────┤ │
│ │          │ │                            │ │
│ │ 会话列表  │ │       消息展示区域          │ │
│ │          │ │  用户消息（靠右，蓝色）      │ │
│ │ [新建会话] │ │  AI回复（靠左，灰色）       │ │
│ │ [删除会话] │ │                            │ │
│ │          │ ├────────────────────────────┤ │
│ │          │ │ 输入区：📎图片 📄文件 [输入框] 发送│ │
│ └──────────┘ └────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**它做了什么：**
- 调用 `useChatView()` 获取所有聊天逻辑和状态
- 渲染左侧会话列表（点击切换，支持新建和删除）
- 渲染消息气泡（区分用户和 AI，支持显示图片/文件附件）
- 渲染输入区域（文本框 + 图片上传 + 文件上传 + 发送/停止按钮）
- 显示各种状态：加载中动画、流式输出指示器、错误提示、重试按钮
- 图片灯箱预览（点击图片放大查看）
- Toast 弹窗通知（错误/成功/警告）
- 设置面板（点击齿轮图标打开）

**关键交互：**
- `Enter` 发送消息，`Shift+Enter` 换行
- 流式输出时显示"停止"按钮
- 出错时显示"重试"按钮
- 中断后显示"继续生成"按钮
- 有新消息且没滚到底部时显示"新消息"浮标

---

### 3. 组件（Components）

#### `src/components/SettingsPanel.vue` — 设置面板

一个模态窗口（弹出层），让用户配置 AI 服务。

**三个标签页：**

| 标签 | 配置项 | 说明 |
|------|--------|------|
| **Ollama** | 服务地址、模型选择 | 本地运行的 AI，默认地址 `localhost:11434` |
| **OpenAI** | API Key、服务地址、模型选择 | 支持 OpenAI 原版，也兼容 DeepSeek、Kimi 等使用相同接口的服务 |
| **Claude** | API Key、模型选择 | Anthropic 的 Claude 系列模型 |

**通用设置：**
- **系统提示词**：告诉 AI 它应该扮演什么角色（默认："你是一个专业的 AI 助手"）
- **上下文长度**：每次发送给 AI 的历史消息量，有预设档位（8K / 32K / 128K / 无限制）

所有设置修改后自动保存到 `localStorage`，刷新页面不会丢失。

---

### 4. 状态管理（Stores）

项目没有使用 Vuex 或 Pinia 这类状态管理库，而是用了更简单的方式：**模块级单例**。

> 简单说，就是在一个 `.ts` 文件里创建一个 `ref` 或 `reactive` 变量，所有导入这个变量的地方都共享同一份数据。

#### `src/stores/chat.ts` — 消息状态

管理当前会话的消息列表。

```typescript
// 核心数据
messages: Ref<Message[]>  // 当前显示的所有消息

// 核心函数
loadForConversation(convId)   // 从数据库加载某个会话的所有消息
addMessage(msg)               // 添加一条新消息
appendToMessage(id, chunk)    // 往某条消息后面追加文字（用于流式输出）
updateMessage(id, changes)    // 更新消息的状态（如从 loading → done）
clearMessages()               // 清空消息列表
createAssistantMessage()      // 创建一条 AI 消息的占位符
```

#### `src/stores/conversations.ts` — 会话状态

管理所有会话（左侧边栏的列表）。

```typescript
// 核心数据
conversations: Ref<Conversation[]>  // 所有会话列表
currentId: Ref<number | null>       // 当前选中的会话 ID

// 核心函数
loadAll()                    // 从数据库加载所有会话
createConversation(title)    // 创建新会话，返回 ID
selectConversation(id)       // 选中一个会话
deleteConversation(id)       // 删除会话及其所有消息
refreshList()                // 刷新列表（比如更新排序）
```

#### `src/stores/settings.ts` — 设置状态

管理用户的各项设置，自动持久化。

```typescript
// settings 是一个 reactive 对象，包含：
{
  provider: 'ollama' | 'openai' | 'claude',  // 当前使用哪个 AI 服务
  theme: 'dark' | 'light' | 'system',        // 主题
  systemPrompt: '你是一个专业的AI助手...',      // 系统提示词
  maxContextTokens: 128000,                   // 上下文窗口大小

  ollama: {
    url: 'http://localhost:11434',            // Ollama 服务地址
    model: 'qwen2.5:7b'                      // 默认模型
  },
  openai: {
    apiKey: '',                               // API 密钥
    baseUrl: 'https://api.openai.com',        // 服务地址
    model: 'gpt-4o'                           // 默认模型
  },
  claude: {
    apiKey: '',                               // API 密钥
    model: 'claude-sonnet-4-6'              // 默认模型
  }
}
```

**持久化机制**：用 `watch` 监听整个 settings 对象，一旦有变化就序列化后存入 `localStorage`。下次打开页面时从 `localStorage` 读取恢复。

---

### 5. 数据库（DB）

#### `src/db/index.ts`

使用 Dexie.js 定义了两张表：

**conversations 表（会话）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number (自增) | 主键 |
| title | string | 会话标题 |
| createdAt | number | 创建时间戳 |
| updatedAt | number | 最后更新时间戳 |

**messages 表（消息）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string (UUID) | 主键 |
| conversationId | number | 所属会话 ID（外键） |
| role | 'user' \| 'assistant' | 谁发的 |
| content | string | 消息文本内容 |
| images | ImageAttachment[] | 图片附件（base64 编码） |
| files | FileAttachment[] | 文件附件（文本内容） |
| status | string | 状态：loading/streaming/done/error/aborted |
| canContinue | boolean | 是否可以继续生成 |
| errorMessage | string | 错误信息 |
| createdAt | number | 创建时间戳 |

---

### 6. 服务层（Services）

这是与 AI 通信的核心层，采用了**策略模式**——统一的接口，不同的实现。

#### `src/services/stream.ts` — 统一入口

```typescript
// 根据当前设置的 provider 路由到具体实现
generateStreamWithContext(messages, userText, onChunk, onDone, signal)
  → if (provider === 'ollama')  → ollamaStream(...)
  → if (provider === 'openai')  → openaiStream(...)
  → if (provider === 'claude')  → claudeStream(...)

// 获取模型列表也是同样的路由
fetchModels()
  → 根据 provider 调用对应的模型获取函数
```

#### `src/services/context.ts` — 上下文管理

**这个模块解决一个核心问题**：AI 有上下文长度限制，你不能把所有历史消息都发过去。

```
buildMessages(messages, userText, systemPrompt, maxContextTokens)
```

**工作流程：**
1. 过滤掉未完成的消息（只保留 done/aborted/error 状态的）
2. 估算每条消息的 token 数（文字长度 + 图片按 1000 token 计算）
3. 从最新的消息往前加，直到达到 token 预算上限
4. 如果有文件附件，用 `<file>` 标签包裹内容
5. 返回最终的消息数组：`[系统提示, ...历史消息, 用户最新消息]`

#### `src/services/providers/ollama.ts` — Ollama 实现

Ollama 是一个可以在本地电脑运行 AI 模型的工具。

- **请求格式**：POST 请求到 `/api/chat`，body 包含消息数组和 `stream: true`
- **响应格式**：NDJSON（每行一个 JSON 对象）
- **每个 JSON 对象**包含 `message.content`（一小段文字）和 `done`（是否结束）
- **模型列表**：GET `/api/tags` 获取本地已下载的模型

#### `src/services/providers/openai.ts` — OpenAI 实现

支持 OpenAI 及所有兼容其 API 格式的服务（DeepSeek、Kimi、通义千问等）。

- **请求格式**：POST 请求到 `/v1/chat/completions`，带 `Authorization: Bearer <api_key>`
- **响应格式**：SSE（Server-Sent Events），每行 `data: {...JSON...}`
- **图片支持**：消息内容可以是数组，包含 `text` 和 `image_url` 类型的内容块
- **SSE 解析**：自带 `parseSSE()` 函数解析事件流
- **模型列表**：GET `/v1/models`，过滤出常用模型名

#### `src/services/providers/claude.ts` — Claude 实现

Anthropic 的 Claude 系列模型。

- **请求格式**：POST 到 `https://api.anthropic.com/v1/messages`，带 `x-api-key` 头
- **特殊设置**：需要 `anthropic-dangerous-direct-browser-access: true`（因为是直接从浏览器调用）
- **消息格式**：system 参数单独传，消息数组只包含 user/assistant
- **图片支持**：`type: 'image'` + `source.type: 'base64'`
- **SSE 事件**：监听 `content_block_delta` 事件获取文字块
- **模型列表**：硬编码（Claude 不提供模型列表 API）

---

### 7. 工具函数（Utils）

#### `src/utils/markdown.ts` — Markdown 渲染

把 AI 回复的 Markdown 文本转换成漂亮的 HTML。

**两个版本：**
- `renderMarkdown(text)` — **同步版本**，流式输出期间使用，速度优先
- `renderMarkdownAsync(text)` — **异步版本**，流式结束后使用，会用 Prettier 格式化代码

**特性：**
- 代码块有语言标签（如 "javascript"）
- 代码块有"复制"按钮
- 语法高亮（使用 github-dark 主题）
- 代码块显示行号

#### `src/utils/error.ts` — 错误分类

把各种 HTTP 错误和网络错误转换成用户友好的提示信息：

| 错误类型 | 判断条件 | 提示信息 |
|---------|---------|---------|
| 网络错误 | AbortError / fetch 失败 | "无法连接到服务" |
| 认证错误 | 401 / 403 | "API 密钥无效" |
| 限流错误 | 429 | "请求过于频繁" |
| 服务端错误 | 500+ | "服务端错误" |
| 未找到 | 404 | "模型或接口地址不存在" |
| 超时 | timeout 关键词 | "请求超时" |

---

### 8. 组合式函数（Composables）

#### `src/composables/useChatView.ts` — 核心逻辑 ★

这是整个项目最复杂的文件（约 540 行），封装了聊天界面的所有业务逻辑。

**功能分区：**

**① 会话管理**
- 监听 `currentId` 变化，自动加载对应会话的消息
- 切换会话时，如果正在流式输出则阻止切换
- 新建会话、删除会话

**② 滚动控制**
- 自动判断用户是否滚动到了底部
- 新消息到来时，如果在底部则自动滚动，否则显示"新消息"浮标
- 使用 `requestAnimationFrame` 优化滚动性能

**③ 打字机效果**
这是项目的一个亮点——AI 的回复不是直接显示整块文字，而是像打字机一样一个字一个字蹦出来：

```
网络层：  "你好，"  →  "我是AI"  →  "助手"     （按网速到达）
         ↓            ↓           ↓
队列：   ['你','好','，'] → ['我','是','A','I'] → ...
         ↓
渲染层：  每一帧显示一个字符（60fps）              （按帧率显示）
```

这样做的好处是：即使网络波动（一会儿快一会儿慢），用户看到的始终是平滑的逐字显示。

**④ 发送消息 `handleSend()`**
1. 验证输入不为空
2. 创建用户消息，显示在界面上
3. 如果是新对话，自动创建会话
4. 保存用户消息到数据库
5. 创建 AI 回复的占位消息（显示 loading 动画）
6. 调用 `runStream()` 开始流式请求

**⑤ 流式请求 `runStream()`**
1. 调用 `generateStreamWithContext()` 发起请求
2. 每收到一个 chunk（文字片段），推入队列，触发打字机效果
3. 完成后：把整段 Markdown 渲染成格式化的 HTML
4. 出错时：分类错误，显示 Toast 提示，设置消息状态为 error
5. 最终：无论成功失败，都把消息持久化到数据库

**⑥ 图片和文件附件**
- `addImages(files)` — 验证大小（≤10MB），转为 base64
- `addFiles(files)` — 验证大小（≤5MB），读取文本内容
- 发送时附带在消息中

**⑦ 重试和继续**
- `handleRetry(msgId)` — 删除错误消息，用之前的用户消息重新请求
- `handleContinue(msgId)` — 对被中断的消息发送空提示，让 AI 继续生成

#### `src/composables/useToast.ts` — 弹窗提示

简单的通知系统：

```typescript
show(message, type, duration)  // 显示一条提示（4秒后自动消失）
dismiss(id)                    // 手动关闭
```

支持三种类型：`error`（红色）、`success`（绿色）、`warning`（黄色）

---

### 9. 类型定义（Types）

#### `src/types/chat.ts`

定义了项目中所有核心数据结构：

```typescript
// 消息角色
type Role = 'user' | 'assistant'

// 消息状态生命周期
type MessageStatus = 'loading'    // AI 正在思考，还没开始回复
                   | 'streaming'  // AI 正在逐字回复中
                   | 'done'       // 回复完成
                   | 'error'      // 出错了
                   | 'aborted'    // 用户手动停止了

// 图片附件
interface ImageAttachment {
  base64: string       // 图片的 base64 编码
  mediaType: string    // 'image/png' | 'image/jpeg' 等
  name: string         // 文件名
}

// 文件附件
interface FileAttachment {
  name: string         // 文件名
  content: string      // 文件文本内容
  size: number         // 文件大小（字节）
}

// 一条聊天消息
interface Message {
  id: string                        // 唯一标识（UUID）
  role: Role                        // 谁发的
  content: string                   // 原始文本
  images?: ImageAttachment[]        // 图片附件
  files?: FileAttachment[]          // 文件附件
  status: MessageStatus             // 当前状态
  time?: string                     // 显示时间
  canContinue?: boolean             // 中断后是否可以继续
  formattedContent?: string         // 渲染后的 HTML（完成后才有）
  errorMessage?: string             // 错误信息
}

// 流式控制器（用于中断请求）
interface StreamController {
  messageId: string
  controller: AbortController       // 浏览器原生的请求中断机制
  reader: ReadableStreamDefaultReader | null
  isAborted: boolean
  abort(): void                     // 调用此方法停止 AI 回复
}
```

---

### 10. 样式文件（Styles）

#### `src/style.css` — 全局基础样式
- 定义 CSS 变量（颜色、字体等）
- 支持 `data-theme="dark"` / `data-theme="light"` 切换
- 跟随系统主题：`@media (prefers-color-scheme: dark)`

#### `src/styles/tokens.css` — 设计令牌
- 细粒度的颜色和间距变量

#### `src/styles/chat.css` — 聊天界面样式
- 整个聊天 UI 的样式（约 45KB，是最大的样式文件）
- 包含：侧边栏、消息气泡、输入框、按钮、动画等
- 响应式设计：手机端侧边栏变为覆盖层

#### `src/styles/markdown.css` — Markdown 样式
- AI 回复中的 Markdown 内容样式
- 代码块、列表、标题、表格等元素的样式

---

## 数据流：一条消息的完整旅程

下面用一个实际场景来串联所有模块——**用户发送"你好"并收到 AI 回复**：

```
用户在输入框输入"你好"，按下 Enter
          │
          ▼
  ┌─ StyleChat.vue ─────────────────┐
  │  监听到 Enter 键，调用 handleSend()  │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─ useChatView.ts ────────────────┐
  │  1. 验证输入不为空               │
  │  2. 创建 User 消息对象           │
  │     { role:'user', content:'你好' } │
  │  3. 发现 currentId 为空          │
  │     → 调用 createConversation()  │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─ conversations.ts ──────────────┐
  │  在 IndexedDB 中创建新会话        │
  │  返回 conversationId = 1         │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─ useChatView.ts（续）────────────┐
  │  4. 用户消息存入 IndexedDB        │
  │  5. 创建 AI 占位消息              │
  │     { role:'assistant', status:'loading' }│
  │  6. 调用 runStream()             │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─ stream.ts ─────────────────────┐
  │  检查 settings.provider = 'openai'│
  │  调用 buildMessages() 构建上下文   │
  │  路由到 openaiStream()           │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─ context.ts ────────────────────┐
  │  构建消息数组：                   │
  │  [                               │
  │    { role:'system', content:'你是AI助手' },│
  │    { role:'user', content:'你好' }│
  │  ]                               │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─ openai.ts ─────────────────────┐
  │  POST /v1/chat/completions       │
  │  → 收到 SSE 流                   │
  │  → chunk 1: "你"                 │
  │  → chunk 2: "好"                 │
  │  → chunk 3: "！我是"              │
  │  → chunk 4: "AI助手。"            │
  │  → [DONE]                        │
  └──────────┬──────────────────────┘
             │ onChunk / onDone 回调
             ▼
  ┌─ useChatView.ts（打字机）────────┐
  │  chunk → queue → flushQueue      │
  │  → 每一帧（16ms）显示一个字符      │
  │  → "你" → "你好" → "你好！" → ... │
  │                                  │
  │  全部完成后：                      │
  │  → renderMarkdownAsync() 格式化   │
  │  → 消息存入 IndexedDB             │
  │  → 更新会话的 updatedAt           │
  │  → 刷新侧边栏列表                 │
  └──────────┬──────────────────────┘
             │
             ▼
  ┌─ StyleChat.vue ─────────────────┐
  │  Vue 响应式更新 → 页面显示完整回复   │
  │  用户看到格式化的 AI 回复           │
  └─────────────────────────────────┘
```

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 多模型支持 | Ollama（本地）、OpenAI（及兼容服务）、Claude，一键切换 |
| 流式输出 | 打字机效果逐字显示 AI 回复，体验流畅 |
| 多会话管理 | 支持创建、切换、删除多个独立对话 |
| 本地持久化 | 聊天记录存储在 IndexedDB，刷新不丢失 |
| 图片上传 | 支持发送图片给 AI（需要模型支持多模态） |
| 文件上传 | 支持发送文本文件，AI 可以阅读文件内容 |
| Markdown 渲染 | AI 回复支持标题、列表、代码块等富文本 |
| 代码高亮 | 代码块自动语法高亮 + 复制按钮 + 格式化 |
| 深色/浅色主题 | 支持手动切换或跟随系统 |
| 上下文管理 | 智能控制发给 AI 的历史消息量，避免超限 |
| 错误处理 | 友好的错误提示，支持重试和继续生成 |
| 响应式布局 | 适配桌面和移动设备 |

---

## 如何运行项目

### 前提条件
- 安装 [Node.js](https://nodejs.org/)（建议 18+）
- 如果要用 Ollama，需要先安装并运行 [Ollama](https://ollama.ai/)

### 步骤

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 打开浏览器访问（默认端口见终端输出）
#    通常是 http://localhost:5173

# 4. 在设置面板中配置你的 AI 服务
#    - Ollama：确保 Ollama 正在运行，默认地址即可
#    - OpenAI：填入你的 API Key
#    - Claude：填入你的 API Key
```

### 构建生产版本

```bash
npm run build      # 构建
npm run preview    # 预览构建结果
```

---

## 架构设计决策

以下是项目中一些值得注意的设计选择，帮助你理解"为什么这样做"：

| 决策 | 做法 | 原因 |
|------|------|------|
| 状态管理 | 模块级单例（ref/reactive）| 项目规模不大，不需要 Vuex/Pinia 的额外复杂度 |
| 数据存储 | IndexedDB（Dexie） | 比 localStorage 容量大、支持索引查询，适合存储聊天记录 |
| 打字机效果 | RAF 队列逐字渲染 | 解耦网络速度和显示速度，保证视觉平滑 |
| Markdown 渲染 | 同步 + 异步双版本 | 流式期间用快速版本保证性能，结束后用完整版本保证质量 |
| 服务商抽象 | 策略模式 + 统一接口 | 添加新服务商只需实现同一接口，其余代码不用改 |
| 纯前端 | 无后端服务器 | 简单部署，数据安全（不经过第三方服务器） |
| 主题系统 | CSS 变量 + data 属性 | 切换主题只需改一个属性，所有颜色自动更新 |

---

> **总结**：这是一个功能完整的 AI 聊天前端应用，用现代 Vue 3 技术栈构建，支持多个 AI 服务商。代码结构清晰，每个模块职责单一。对于想学习 Vue 3 + TypeScript 实战、流式数据处理、或构建 AI 应用的开发者来说，是一个很好的参考项目。
