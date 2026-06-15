import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useChat } from '../stores/chat'
import { useConversations } from '../stores/conversations'
import { generateStreamWithContext } from '../services/stream'
import { createRuntimeFromSettings } from '../services/runtime'
import { fetchBackendChatContext } from '../services/providers/backendChat'
import { db } from '../db'
import { classifyError } from '../utils/error'
import { useToast } from './useToast'
import { settings } from '../stores/settings'
import { searchService } from '../search/SearchService'
import { useAttachments } from './useAttachments'
import { useChatScroll } from './useChatScroll'
import { useTypewriterStream } from './useTypewriterStream'
import type {Message, StreamController} from "../types/chat.ts";

/**
 * 聊天页面核心逻辑 composable
 *
 * 职责：
 *  1. 会话管理 —— 新建 / 切换 / 删除会话，监听 currentId 自动加载历史消息
 *  2. 消息收发 —— 发送用户消息、发起流式请求、处理重试与继续生成
 *  3. 流式渲染 —— 通过 chunk 队列 + requestAnimationFrame 实现打字机效果
 *  4. 滚动控制 —— 自动跟随、未读提示、手动回到底部
 *  5. 持久化   —— 消息写入 IndexedDB，会话时间戳更新
 *
 * 数据流概览（发送一条消息）：
 *   handleSend
 *     ├─ 确保会话存在（首条消息自动创建）
 *     ├─ 写入用户消息（内存 + DB）
 *     ├─ 创建 AI 占位消息（loading 状态）
 *     └─ runStream
 *          ├─ generateStreamWithContext（发起流式请求）
 *          │    ├─ onChunk → queue.push → flushQueue 逐字符写入（打字机）
 *          │    └─ onDone  → 标记 done / aborted，触发 Markdown 渲染
 *          └─ finally → 持久化 AI 消息、更新会话时间戳、刷新侧边栏
 */
export function useChatView() {
    const {
        messages, addMessage, clearMessages, updateMessage,
        loadForConversation, createAssistantMessage, appendToMessage,
    } = useChat()

    const {
        conversations, currentId,
        loadAll, createConversation, selectConversation, deleteConversation, refreshList,
    } = useConversations()

    const toast = useToast()
    const {
        pendingImages,
        pendingFiles,
        addImages,
        removeImage,
        addFiles,
        removeFile,
        clearAttachments,
    } = useAttachments(toast)
    const {
        unreadCount,
        containerRef,
        scheduleScroll,
        scrollToBottom,
        resetAfterConversationChange,
        handleIncomingChunk,
        attachScrollListener,
        detachScrollListener,
    } = useChatScroll()
    const typewriter = useTypewriterStream({
        appendToMessage,
        updateMessage,
        formatFinishedMessage,
        scheduleScroll,
        isAborted: () => streamCtrl?.isAborted ?? false,
    })

    // These refs are the state used directly by StyleChat.vue.
    // In script code we read/write .value; Vue templates unwrap refs automatically.

    // ── 响应式状态（模板绑定） ────────────────────────────────
    const inputValue   = ref<string>('')
    const isStreaming  = ref<boolean>(false)
    const sidebarOpen  = ref<boolean>(false)

    // ── 非响应式标志位 ───────────────────────────────────────
    let streamCtrl:  StreamController | null = null  // 当前流式请求控制器
    // createConversation 会设置 currentId，触发 watcher 加载消息——
    // 但 handleSend 中刚写入内存的消息会被 loadForConversation 覆盖清空，
    // 所以在 handleSend 创建会话期间用此标志临时屏蔽 watcher
    // Creating the first message also creates a conversation and changes currentId.
    // This flag skips the currentId watcher once so it does not reload and wipe the just-added message.
    let suppressConvWatch = false

    // ── 会话切换 ─────────────────────────────────────────────

    watch(currentId, async (newId) => {
        // currentId is the single source of truth for conversation switching.
        // When it changes, load that conversation's messages into the chat window.
        if (suppressConvWatch) return
        if (newId !== null) {
            await loadForConversation(newId)
        } else {
            clearMessages()
        }
        await nextTick()
        resetAfterConversationChange()
    })

    function handleSelectConversation(id: number) {
        // Do not switch conversations while streaming, otherwise the in-flight reply could be persisted to the wrong place.
        if (isStreaming.value) return
        selectConversation(id)
        sidebarOpen.value = false
    }

    function handleNewConversation() {
        if (isStreaming.value) return
        currentId.value = null
        sidebarOpen.value = false
    }

    async function handleDeleteConversation(id: number) {
        await deleteConversation(id)
        // Search index data is derived data. If cleanup fails, chat deletion should still succeed.
        void searchService.deleteConversation(id).catch(err => {
            console.warn('[search] 删除会话索引失败', err)
        })
    }

    // ── 持久化 ───────────────────────────────────────────────

    // upsert 一条消息到 IndexedDB（runStream finally 中调用）
    async function persistMessage(msgId: string, convId: number) {
        // Persist the final in-memory message into IndexedDB.
        // AI messages are written after streaming finishes so the stored content is complete.
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        await db.messages.put({
            id: msg.id,
            conversationId: convId,
            role: msg.role,
            content: msg.content,
            images: msg.images,
            files: msg.files,
            status: msg.status,
            canContinue: msg.canContinue,
            errorMessage: msg.errorMessage,
            ragContext: msg.ragContext,
            createdAt: Date.now(),
        })
    }

    function queueSearchIndex(msg: Message, convId: number, createdAt: number, updatedAt = createdAt) {
        // Indexing runs in the background through a worker and should not block the chat UI.
        const conversation = conversations.value.find(conv => conv.id === convId)
        if (!conversation) return

        void searchService.indexMessage({
            message: {
                id: msg.id,
                role: msg.role,
                content: msg.content,
                images: msg.images?.map(img => ({ ...img })),
                files: msg.files?.map(file => ({ ...file })),
                status: msg.status,
                canContinue: msg.canContinue,
                errorMessage: msg.errorMessage,
            },
            conversation: {
                id: conversation.id,
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt,
            },
            createdAt,
            updatedAt,
        }).catch(err => {
            console.warn('[search] 索引消息失败', err)
        })
    }

    // ── 流式输出状态 ─────────────────────────────────────────
    let needsStatusFallback = true

    // 生成结束后将原始 Markdown 渲染为 HTML（懒加载 markdown 工具）
    async function formatFinishedMessage(msgId: string) {
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        const { renderMarkdownAsync } = await import('../utils/markdownAsync')
        msg.formattedContent = await renderMarkdownAsync(msg.content)
    }

    // 封装 AbortController，abort() 同时中断网络请求 + ReadableStream + 标记 isAborted
    function createStreamController(messageId: string) {
        // AbortController cancels fetch; reader.cancel() stops reading the response stream.
        const ctrl = new AbortController()
        return {
            messageId,
            controller: ctrl,
            reader: null as ReadableStreamDefaultReader | null,
            isAborted: false,
            abort() {
                this.isAborted = true
                this.controller.abort()
                this.reader?.cancel()
            },
        }
    }

    // ── 用户操作入口 ─────────────────────────────────────────

    function handleStop() {
        // Stop generation from the UI. The provider request and stream reader are both cancelled.
        if (!streamCtrl) return
        typewriter.abort(streamCtrl.messageId)
        streamCtrl.abort()
    }

    // 发送消息：写入用户消息 → 创建 AI 占位 → 启动流式生成
    async function handleSend() {
        // Main send flow:
        // 1. Read text and attachments from the input area.
        // 2. Create a conversation if this is the first message.
        // 3. Save the user message.
        // 4. Create an assistant placeholder.
        // 5. Start the streaming model request.
        if (isStreaming.value) {
            return
        }
        const userText = inputValue.value.trim()
        const images = pendingImages.value.length > 0
            ? pendingImages.value.map(img => ({ base64: img.base64, mediaType: img.mediaType, name: img.name }))
            : undefined
        const files = pendingFiles.value.length > 0
            ? pendingFiles.value.map(f => ({ name: f.name, content: f.content, size: f.size }))
            : undefined
        inputValue.value = ''
        clearAttachments()

        if (!userText && !images?.length && !files?.length) return

        if (images?.length && settings.provider === 'ollama') {
            const model = settings.ollama.model.toLowerCase()
            const visionModels = ['llava', 'bakllava', 'minicpm-v', 'qwen2-vl', 'llama3.2-vision', 'moondream', 'cogvlm']
            const isVision = visionModels.some(v => model.includes(v))
            if (!isVision) {
                toast.show(`当前模型 ${settings.ollama.model} 可能不支持图片，建议使用 llava / minicpm-v / qwen2-vl 等视觉模型`, 'warning', 6000)
            }
        }

        const displayText = userText || (images ? '图片' : '') || (files ? files.map(f => f.name).join(', ') : '')
        const promptText = userText || (images ? '请描述这张图片' : '') || (files ? '请分析这些文件' : '')

        let convId = currentId.value
        if (convId === null) {
            suppressConvWatch = true
            convId = await createConversation(displayText.slice(0, 28) || '新对话')
            suppressConvWatch = false
        }

        const userMsgId = crypto.randomUUID()
        const userCreatedAt = Date.now()
        const userMessage: Message = { id: userMsgId, role: 'user', content: userText, images, files, status: 'done' }
        addMessage(userMessage)
        await db.messages.add({
            id: userMsgId,
            conversationId: convId,
            role: 'user',
            content: userText,
            images,
            files,
            status: 'done',
            createdAt: userCreatedAt,
        })
        queueSearchIndex(userMessage, convId, userCreatedAt)

        const aiMsg = createAssistantMessage()
        await runStream({ aiMessageId: aiMsg.id, prompt: promptText, convId })
    }

    // 重试：删除失败的 AI 消息，用同一条用户消息重新生成
    async function handleRetry(messageId: string) {
        // Retry removes the failed assistant message, finds the previous user message, and asks again.
        if (isStreaming.value) return
        const msgIdx = messages.value.findIndex(m => m.id === messageId)
        if (msgIdx === -1 || currentId.value === null) return
        const errMsg = messages.value[msgIdx]
        if (errMsg.status !== 'error') return

        let userMsg: Message | null = null
        for (let i = msgIdx - 1; i >= 0; i--) {
            if (messages.value[i].role === 'user') {
                userMsg = messages.value[i]
                break
            }
        }
        if (!userMsg) {
            console.warn('[handleRetry] 找不到原始用户消息')
            return
        }

        await db.messages.delete(messageId)
        messages.value.splice(msgIdx, 1)

        const aiMsg = createAssistantMessage()
        await runStream({ aiMessageId: aiMsg.id, prompt: userMsg.content, convId: currentId.value })
    }

    // 继续生成：复用已中断的 AI 消息，以空 prompt 续写
    async function handleContinue(messageId: string) {
        // Continue reuses an aborted assistant message and appends more content to it.
        if (isStreaming.value) return
        const msg = messages.value.find(m => m.id === messageId)
        if (!msg || currentId.value === null) return
        if (msg.status !== 'aborted') return
        typewriter.restoreAbortedOutput(messageId)
        const contextMessages: Message[] = messages.value.map(item =>
            item.id === msg.id
                ? { ...item, status: 'aborted', canContinue: true }
                : item
        )
        updateMessage(msg.id, { status: 'loading', canContinue: false })
        await runStream({
            aiMessageId: messageId,
            prompt: '',
            convId: currentId.value,
            contextMessages,
            skipRagContext: true,
        })
    }

    // ── 流式请求核心 ─────────────────────────────────────────

    interface RunStreamOptions {
        aiMessageId: string
        prompt: string   // 空字符串 = 续写
        convId: number
        contextMessages?: Message[]
        skipRagContext?: boolean
    }

    /**
     * 统一的流式请求执行器，handleSend / handleRetry / handleContinue 最终都委托到这里。
     *
     * 生命周期：
     *   1. 重置队列和标志位
     *   2. 调用 generateStreamWithContext 发起 SSE 流
     *   3. onChunk 推入 queue → flushQueue 打字机写入
     *   4. onDone 标记完成状态 + Markdown 渲染
     *   5. finally 持久化到 DB、刷新侧边栏
     */
    async function runStream(options: RunStreamOptions): Promise<void> {
        // Every generation path ends here: normal send, retry, and continue.
        // Reset transient stream state before starting a new provider request.
        typewriter.reset()
        needsStatusFallback = true
        isStreaming.value = true
        await nextTick()
        scheduleScroll()
        streamCtrl = createStreamController(options.aiMessageId)
        const runtime = createRuntimeFromSettings(settings)
        const requestMessages = options.contextMessages ?? messages.value

        if (!options.skipRagContext && runtime.provider === 'ollama' && runtime.useBackendChat) {
            try {
                const ragContext = await fetchBackendChatContext(
                    requestMessages,
                    options.prompt,
                    runtime,
                    streamCtrl.controller.signal,
                )
                updateMessage(options.aiMessageId, { ragContext })
            } catch (err) {
                if (!streamCtrl.controller.signal.aborted) {
                    // 引用资料只是可解释信息，获取失败不能阻断主回答。
                    updateMessage(options.aiMessageId, {
                        ragContext: {
                            mode: runtime.backendRagMode ?? 'auto',
                            enabled: false,
                            results: [],
                            errorMessage: err instanceof Error ? err.message : '引用资料获取失败',
                        },
                    })
                }
            }
        }

        try {
            // generateStreamWithContext chooses the active provider and calls onChunk for every text delta.
            await generateStreamWithContext({
                messages: requestMessages,
                userText: options.prompt,
                runtime,
                onChunk: (chunk) => {
                    if (streamCtrl?.isAborted) return
                    typewriter.push(options.aiMessageId, chunk)
                    handleIncomingChunk()
                },
                onDone: () => {
                    needsStatusFallback = false
                    typewriter.markDone(options.aiMessageId)
                },
                signal: streamCtrl.controller.signal,
            })
        } catch (err: unknown) {
            if (streamCtrl?.isAborted) {
                needsStatusFallback = false
                updateMessage(options.aiMessageId, { status: 'aborted', canContinue: true })
                return
            }
            const chatErr = classifyError(err)
            needsStatusFallback = false
            updateMessage(options.aiMessageId, {
                status: 'error',
                errorMessage: chatErr.message,
            })
            toast.show(chatErr.message, 'error')
        } finally {
            // This block runs for success, error, and abort.
            // It persists the assistant message, updates the conversation timestamp, and refreshes search.
            await typewriter.waitForPendingDone()

            isStreaming.value = false
            scheduleScroll()

            if (needsStatusFallback) {
                if (streamCtrl?.isAborted) {
                    updateMessage(options.aiMessageId, { status: 'aborted', canContinue: true })
                } else {
                    updateMessage(options.aiMessageId, { status: 'done' })
                }
            }

            await persistMessage(options.aiMessageId, options.convId)
            const updatedAt = Date.now()
            await db.conversations.update(options.convId, { updatedAt })
            await refreshList()
            const aiMessage = messages.value.find(msg => msg.id === options.aiMessageId)
            if (aiMessage) {
                queueSearchIndex(aiMessage, options.convId, updatedAt, updatedAt)
            }
            streamCtrl = null
        }
    }

    // ── 生命周期 ─────────────────────────────────────────────

    onMounted(async () => {
        // Page startup: attach scroll listener, load conversations, warm up search index, then open latest conversation.
        attachScrollListener()
        await loadAll()
        void searchService.ensureIndex().catch(err => {
            console.warn('[search] 初始化索引失败', err)
        })
        if (conversations.value.length > 0 && currentId.value === null) {
            const latestId = conversations.value[0].id!
            selectConversation(latestId)
            // 刷新页面后 currentId 是内存态，watch 的触发时序不应承担首次恢复消息的职责。
            await loadForConversation(latestId)
            await nextTick()
            resetAfterConversationChange()
        }
    })

    onUnmounted(() => {
        detachScrollListener()
    })

    // ── 对外暴露 ─────────────────────────────────────────────

    return {
        messages,
        inputValue,
        isStreaming,
        unreadCount,
        containerRef,
        sidebarOpen,
        conversations,
        currentId,
        toast,
        pendingImages,
        pendingFiles,
        handleSend,
        scrollToBottom,
        handleStop,
        handleContinue,
        handleRetry,
        handleSelectConversation,
        handleNewConversation,
        handleDeleteConversation,
        addImages,
        removeImage,
        addFiles,
        removeFile,
    }
}
