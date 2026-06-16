# 图片上传功能实现记录

## 概述

为 AI Chat 应用增加了图片上传能力，支持用户在对话中发送图片给 AI 模型进行视觉理解。三家 Provider（Ollama、OpenAI 兼容、Claude）均已适配各自的多模态 API 格式。

---

## Bug 修复记录

### 问题：发送图片后无响应、无报错、无 loading 状态

**根因分析**：

1. **`buildMessages` 去重逻辑导致图片消息被覆盖**
   - 用户只发图片不输入文字时，`content` 为空字符串，`handleSend` 传给 `runStream` 的 `prompt` 也是空字符串
   - `buildMessages` 将空 prompt 转成 `'请继续'`，但消息列表中用户消息的 `content` 是 `''`
   - 去重判断 `lastSelected.content === userMsg` → `'' !== '请继续'` → 不匹配
   - 于是追加了一条**没有图片**的 `{role:'user', content:'请继续'}` 排在最后
   - 模型只看到"请继续"三个字，完全不知道有图片

2. **纯文本模型静默忽略图片**
   - Ollama 的 `qwen2.5:7b` 是纯文本模型，不支持 `images` 字段
   - 收到图片后既不报错也不处理，导致用户以为功能不工作

**修复方案**：

1. **改写 `buildMessages` 的去重逻辑**（`context.ts`）
   - 当最后一条用户消息携带图片时，不再追加额外消息
   - 如果图片消息的 `content` 为空，用 `userMsg`（即 `'请描述这张图片'`）填充
   - 这样模型收到的是：图片 + "请描述这张图片"

2. **`handleSend` 增加 `promptText` 逻辑**（`useChatView.ts`）
   - 纯图片发送时，`promptText` 默认为 `'请描述这张图片'`
   - 存储的 `content` 仍为空（UI 显示只有图片），但发给 API 的 prompt 有意义

3. **Ollama 视觉模型检测**（`useChatView.ts`）
   - 发送图片时检查当前 Ollama 模型名是否包含已知视觉模型关键词
   - 不匹配时弹出 warning toast：提示用户切换到 llava / minicpm-v / qwen2-vl 等视觉模型
   - 不阻止发送，因为可能有未列入白名单的新视觉模型

### Ollama 视觉模型说明

Ollama 只有专门的视觉模型才支持图片输入。常见支持图片的模型：

| 模型 | 说明 |
|------|------|
| `llava` | 最常用的开源视觉模型 |
| `bakllava` | BakLLaVA，LLaVA 变体 |
| `minicpm-v` | 面壁智能的轻量视觉模型 |
| `qwen2-vl` | 通义千问视觉版（注意不是 qwen2.5） |
| `llama3.2-vision` | Meta 的视觉模型 |
| `moondream` | 轻量视觉模型 |
| `cogvlm` | 智谱清言视觉模型 |

**不支持图片的常见模型**：`qwen2.5`、`llama3`、`mistral`、`gemma` 等纯文本模型。

---

## 改动文件清单

| 文件 | 改动内容 |
|------|----------|
| `src/types/chat.ts` | 新增 `ImageAttachment` 接口，`Message` 增加可选 `images` 字段 |
| `src/db/index.ts` | 新增 `DBImage` 接口，`DBMessage` 增加 `images` 字段，数据库升级到 version 2 |
| `src/services/context.ts` | `ChatMessage` 增加 `images` 字段，`buildMessages` 支持图片 token 估算 |
| `src/services/providers/ollama.ts` | 适配 Ollama 多模态格式（`images: [base64]`） |
| `src/services/providers/openai.ts` | 适配 OpenAI Vision 格式（`content: [{type:"image_url",...}]`） |
| `src/services/providers/claude.ts` | 适配 Claude Vision 格式（`content: [{type:"image", source:{...}}]`） |
| `src/stores/chat.ts` | `loadForConversation` 加载时携带 `images` 字段 |
| `src/composables/useChatView.ts` | 新增 `pendingImages`、`addImages`、`removeImage`，`handleSend` 携带图片 |
| `src/views/StyleChat.vue` | 上传按钮、图片预览条、消息内图片展示、粘贴/拖拽支持、大图预览 |
| `src/styles/chat.css` | 上传按钮、预览条、消息图片、大图浮层样式 |

---

## 设计决策与原因

### 1. 图片存储方案：base64 内联

**做法**：图片转为 base64 字符串，直接存入 IndexedDB 的 `messages` 表中。

**为什么这样做**：
- 三家 API 都要求 base64 格式，存储时就转好可以直接发送，无需二次转换
- 避免引入额外的文件存储服务或 Blob 存储表
- 对于聊天场景的图片（通常 < 5MB），base64 内联的性能开销可接受
- 消息和图片在同一条记录中，删除会话时图片自动清理，无需额外的垃圾回收

**取舍**：base64 编码会使体积增大约 33%，大量高清图片会增加 IndexedDB 存储压力。当前限制单张 10MB 以控制。

### 2. 类型设计：独立的 `ImageAttachment` 接口

**做法**：新增 `ImageAttachment` 类型包含 `base64`、`mediaType`、`name`，挂在 `Message.images` 可选字段上。

**为什么这样做**：
- 保持 `Message.content` 仍为纯文本 `string`，不破坏现有代码的字符串假设
- 图片作为附件与文本分离，UI 层可以独立渲染
- `mediaType` 是各家 API 的必传字段，存储时携带可避免运行时猜测
- 可选字段 `images?` 确保纯文本消息不增加任何开销

### 3. Provider 适配：各家格式独立转换

三家 API 的多模态消息格式完全不同：

- **Ollama**：消息体同级 `images: ["base64string"]`
- **OpenAI**：`content` 从字符串变为数组 `[{type:"image_url", image_url:{url:"data:..."}}]`
- **Claude**：`content` 数组 `[{type:"image", source:{type:"base64", media_type, data}}]`

**为什么在各 provider 文件内转换**：
- 格式差异太大，统一抽象反而增加复杂度
- 在 `buildMessages` 层保持通用的 `images` 数组，各 provider 在发请求前自行适配
- 改动局部化：后续新增 provider 只需在自己的文件中处理图片格式

### 4. 上下文裁剪：图片的 token 估算

**做法**：每张图片按 1000 token 估算。

**为什么这样做**：
- OpenAI 的 Vision API 一张图约消耗 85-1105 token（取决于分辨率），1000 是合理中位数
- Claude 按图片尺寸计费，一般也在数百到千级 token
- 精确计算需要解码图片获取分辨率再查表，过于复杂
- 粗估足够保证上下文不会因为大量图片而溢出

### 5. UI 交互设计

#### 上传入口（三种方式）

1. **上传按钮**：输入框左侧的图片图标，点击打开文件选择器
2. **粘贴**：在输入框中 Ctrl+V 粘贴剪贴板中的图片
3. **拖拽**：将图片文件拖入输入框区域

**为什么提供三种方式**：
- 上传按钮是最基础的操作，移动端友好
- 粘贴是桌面端最常见的图片插入方式（截图后直接粘贴）
- 拖拽是从文件管理器传图的直觉操作

#### 预览条

图片选择后在输入框上方显示缩略图预览条，每张图右上角有删除按钮。

**为什么这样做**：
- 发送前确认图片是否正确，避免误发
- 删除按钮 hover 才显示，不干扰视觉
- 水平滚动支持多张图片

#### 消息内图片展示

用户消息气泡内，图片在文本上方以缩略图展示，点击可打开全屏预览。

**为什么这样做**：
- 图片在上、文字在下的布局与"图文描述"的阅读习惯一致
- 缩略图限制 200px，不撑爆气泡
- 全屏预览（lightbox）方便查看细节，点击遮罩即可关闭

### 6. 数据库版本升级

**做法**：Dexie 从 version(1) 升级到 version(2)。

**为什么这样做**：
- Dexie 要求 schema 变更时必须升版本号
- `images` 字段不是索引字段，只是存储字段，所以 stores 定义不变
- 已有数据无需迁移：旧消息没有 `images` 字段，读取时 `undefined` 即表示无图片

### 7. 文件验证

**做法**：限制格式为 PNG/JPEG/GIF/WEBP，单文件不超过 10MB。

**为什么这样做**：
- 这四种是三家 API 共同支持的图片格式
- 10MB 限制避免 base64 转换后过大（~13MB），防止 IndexedDB 写入缓慢
- 不符合条件时 toast 提示用户，而非静默忽略

---

## 数据流

```
用户选择图片（按钮/粘贴/拖拽）
  ↓
addImages() → FileReader.readAsDataURL() → pendingImages[]
  ↓
用户点击发送
  ↓
handleSend()
  ├─ 取出 pendingImages 快照并清空
  ├─ addMessage({ content, images, ... })
  ├─ db.messages.add({ content, images, ... })
  └─ runStream()
       ├─ buildMessages() → ChatMessage[] 包含 images
       └─ provider.xxxStream()
            └─ 转换为 API 特定格式发送
```

---

## 各 Provider 消息格式对照

### 纯文本消息（无变化）

```json
{ "role": "user", "content": "你好" }
```

### 带图片消息

**Ollama：**
```json
{
  "role": "user",
  "content": "这张图片是什么？",
  "images": ["iVBORw0KGgo..."]
}
```

**OpenAI 兼容：**
```json
{
  "role": "user",
  "content": [
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } },
    { "type": "text", "text": "这张图片是什么？" }
  ]
}
```

**Claude：**
```json
{
  "role": "user",
  "content": [
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "iVBORw0KGgo..." } },
    { "type": "text", "text": "这张图片是什么？" }
  ]
}
```
