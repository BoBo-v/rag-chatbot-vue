// 聊天领域的公共类型。把类型集中放在这里，可以让组件、store、服务层共享同一套数据结构。

// 当前只支持两种消息角色：用户和 AI 助手。
export type Role = 'user' | 'assistant'

// 一条消息在生命周期中会经过这些状态。
// loading: 占位等待中；streaming: 正在流式输出；done: 完成；error: 失败；aborted: 用户中断。
export type MessageStatus = 'loading' | 'streaming' | 'done' | 'error' | 'aborted'

// 图片附件在本地保存为 base64，发送给不同模型 provider 时再转换成对应格式。
export interface ImageAttachment {
    base64: string
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
    name: string
}

// 文本/代码文件附件会把文件内容读到内存和 IndexedDB。
export interface FileAttachment {
    name: string
    content: string
    size: number
}

// UI 层使用的消息对象。它比 DBMessage 多了 formattedContent、time 等展示用字段。
export interface Message {
    id: string
    role: Role
    content: string
    images?: ImageAttachment[]
    files?: FileAttachment[]
    status: MessageStatus
    time?: string
    canContinue?: boolean
    formattedContent?: string
    errorMessage?: string
}

// 统一错误分类，方便 UI 根据错误类型展示更友好的提示。
export type ChatErrorType = 'network' | 'auth' | 'server' | 'timeout' | 'unknown'

export interface ChatError {
    type: ChatErrorType
    message: string
    status?: number
}

// 侧边栏展示的会话摘要。
export interface Conversation {
    id: number
    title: string
    createdAt: number
    updatedAt: number
}

// 记录一次流式请求的控制器。停止生成时会通过它同时取消 fetch 和 reader。
export interface StreamController {
    messageId: string
    controller: AbortController
    reader: ReadableStreamDefaultReader | null
    isAborted: boolean
    abort(): void
}
