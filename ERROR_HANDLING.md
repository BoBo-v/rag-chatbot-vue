# 错误处理实现文档

## 概述

为 AI Chat 项目增加完整的错误处理机制，覆盖网络请求失败、API 认证错误、服务端异常等场景，并提供对应的 UI 状态反馈和恢复手段（重试）。

---

## 改动前的问题

项目原有的错误处理几乎为零：

- 所有 provider（Ollama/OpenAI/Claude）的 `fetch` 失败会抛出未被捕获的异常
- `useChatView.ts` 的 `handleSend` 没有 `catch` 分支，网络错误会导致 AI 消息停留在 `loading` 状态
- `types/chat.ts` 中虽然定义了 `MessageStatus = 'error'`，但从未使用
- 没有任何错误提示 UI（无 toast、无错误气泡）
- 用户遇到错误后只能刷新页面

---

## 设计思路

### 为什么分三层？

```
Provider 层（抛错） → Composable 层（捕获+分类） → UI 层（展示+恢复）
```

- **Provider 层**保持不变，继续 `throw Error`，不需要改动已有的 Ollama/OpenAI/Claude 代码
- **Composable 层**统一捕获，避免在每个 provider 里重复写错误 UI 逻辑
- **UI 层**根据消息状态渲染对应的视觉反馈

这样做的好处是：新增 provider 时不需要额外处理错误 UI，只要 throw 就行。

### 为什么用消息级错误而不是全局错误？

- 错误天然关联到某次生成请求，挂在 AI 消息上最直觉
- 用户可以针对失败的那条消息点重试，而不是重新输入
- 历史记录中也能看到哪些消息曾经失败过

### 为什么同时要 Toast？

消息级错误只有用户看到那条消息时才知道出错了。如果用户在其他会话或滚动位置，Toast 提供即时通知。两者互补：
- Toast → 即时感知（4秒后自动消失）
- 消息气泡 → 持久展示 + 操作入口（重试按钮）

---

## 具体改动

### 1. 类型扩展 — `src/types/chat.ts`

```typescript
// Message 接口新增字段
errorMessage?: string  // 存储具体的错误描述文字

// 新增错误分类类型
export type ChatErrorType = 'network' | 'auth' | 'server' | 'timeout' | 'unknown'
export interface ChatError {
    type: ChatErrorType
    message: string
    status?: number
}
```

**为什么要分类？** 不同错误类型对用户的指引不同：
- `auth` → 提示检查 API Key
- `network` → 提示检查网络/服务地址
- `server` → 提示稍后重试
- `timeout` → 提示检查连接

### 2. 错误分类工具 — `src/utils/error.ts`（新文件）

`classifyError(err: unknown): ChatError`

根据错误信息自动归类：
- `TypeError + fetch` → network（无法连接）
- HTTP 401/403 → auth（密钥问题）
- HTTP 429 → server（限流）
- HTTP 5xx → server（服务端崩溃）
- HTTP 404 → server（地址/模型不对）
- `AbortError` → 用户主动取消（不展示错误）

**为什么放在 utils 而不是 composable 里？** 纯函数、无副作用、方便单元测试，未来其他地方（如设置面板连接测试）也能复用。

### 3. Toast 通知系统 — `src/composables/useToast.ts`（新文件）

```typescript
const { toasts, show, dismiss } = useToast()
show('错误消息', 'error', 4000)  // 4秒后自动消失
```

**设计决策：**
- 使用模块级单例 `ref<ToastItem[]>`，与 `useChat` / `useConversations` 保持一致的模式
- 支持三种类型：`error` / `warning` / `success`
- 点击可手动关闭
- 没有引入第三方 Toast 库，保持零依赖

### 4. 核心逻辑改动 — `src/composables/useChatView.ts`

#### handleSend 增加 catch

```typescript
catch (err: unknown) {
    if (streamCtrl?.isAborted) return  // 用户主动停止不算错误
    const chatErr = classifyError(err)
    needsStatusFallback = false
    updateMessage(aiMsg.id, {
        status: 'error',
        errorMessage: chatErr.message,
    })
    toast.show(chatErr.message, 'error')
}
```

**关键细节：**
- `needsStatusFallback = false` — 防止 finally 里再覆盖成 `done`
- `isAborted` 检查 — 用户停止生成走的是 abort 流程，不应进入 error
- catch 之后 finally 仍然会执行持久化，确保错误状态也写入 DB

#### handleContinue 增加 catch

与 handleSend 对称，继续生成失败时同样设为 error 状态。

#### 新增 handleRetry

重试逻辑：
1. 找到 error 状态的 AI 消息
2. 向前搜索最近的用户消息作为原始输入
3. 删除失败的 AI 消息（内存 + DB）
4. 创建新的 AI 占位消息，重新调用 `generateStreamWithContext`

**为什么删除旧消息而不是原地重用？**
- 保持消息 ID 的不可变性语义
- 避免残留的 `errorMessage` 字段污染新消息
- DB 里也干净：删除旧记录，新建新记录

### 5. UI 展示 — `src/views/StyleChat.vue`

#### 消息气泡 error 状态

复用 aborted 状态的设计语言（红色边框 + 分隔线 + 徽章行），增加：
- 红色分隔线 + 错误图标（圆形叹号）+ 错误描述文字
- 气泡外：红色 "发送失败" 徽章 + "↻ 重试" 按钮

**为什么复用 aborted 的设计？**
- 视觉一致性：两种异常状态用相似的红色系表达
- 用户学习成本低：看到红色 + 按钮就知道可以操作

#### Toast 容器

```html
<transition-group name="toast-slide" tag="div" class="toast-container">
```

- 固定在右上角 `position: fixed`
- `transition-group` 实现进出动画
- `pointer-events: none` 容器本身不拦截点击，`toast-item` 单独开启

### 6. 样式 — `src/styles/chat.css`

新增约 150 行 CSS：
- `.error-*` 系列：错误状态气泡内部元素
- `.badge-error` / `.btn-retry`：气泡外的徽章和重试按钮
- `.toast-*` 系列：Toast 通知样式
- 亮色主题覆盖：`[data-theme="light"] .toast-item.*`
- 响应式：768px 断点下 toast 全宽展示

### 7. 数据持久化 — `src/db/index.ts` + `stores/chat.ts`

- `DBMessage` 接口增加 `errorMessage?: string`
- `persistMessage` 写入 `errorMessage`
- `loadForConversation` 读取 `errorMessage`

**为什么 Dexie 不需要版本迁移？** Dexie 的 schema 只声明索引列，非索引字段可以自由增减，不需要 `version(2)` 迁移。`errorMessage` 不需要查询索引，直接加即可。

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types/chat.ts` | 修改 | 新增 `errorMessage` 字段、`ChatError` 类型 |
| `src/utils/error.ts` | 新建 | 错误分类工具函数 |
| `src/composables/useToast.ts` | 新建 | Toast 通知 composable |
| `src/composables/useChatView.ts` | 修改 | 错误捕获、重试逻辑、toast 集成 |
| `src/views/StyleChat.vue` | 修改 | error 状态 UI、toast 容器 |
| `src/styles/chat.css` | 修改 | 错误 + toast 样式 |
| `src/db/index.ts` | 修改 | DBMessage 增加 errorMessage |
| `src/stores/chat.ts` | 修改 | 加载时读取 errorMessage |

---

## 错误处理流程图

```
用户发送消息
    │
    ├─ 正常流程 ──→ loading → streaming → done
    │
    └─ 异常流程 ──→ loading → [catch]
                          │
                          ├─ classifyError() 分类错误
                          ├─ 消息状态设为 'error'
                          ├─ 写入 errorMessage
                          ├─ 弹出 Toast 通知
                          └─ 持久化到 DB
                                │
                          用户点击"重试"
                                │
                          ├─ 删除旧 AI 消息
                          ├─ 查找原始用户消息
                          └─ 重新发起请求 ──→ loading → streaming → done
```

---

## 错误分类表

| HTTP 状态 | 错误类型 | 用户提示 |
|-----------|---------|---------|
| fetch 失败 | network | 无法连接到服务器，请检查网络或服务地址 |
| 401 / 403 | auth | API 密钥无效或已过期，请在设置中检查 |
| 404 | server | 模型或接口地址不存在，请检查设置 |
| 429 | server | 请求过于频繁，请稍后再试 |
| 5xx | server | 服务端错误 (xxx)，请稍后重试 |
| timeout | timeout | 请求超时，请检查网络连接 |
| 其他 | unknown | 显示原始错误信息 |
