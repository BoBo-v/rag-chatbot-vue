import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useChat } from '../stores/chat'
import { useConversations } from '../stores/conversations'
import { generateStreamWithContext } from '../services/stream'
import { createRuntimeFromSettings, freezeRuntime } from '../services/runtime'
import { getCachedBackendProvidersCatalog } from '../services/knowledge'
import {
    cancelBackendChatRun,
    BackendChatRunClientError,
    createBackendChatRun,
    getBackendChatRun,
    ragContextFromRunEvent,
    type BackendChatRunEvent,
} from '../services/providers/backendChatRun'
import { db } from '../db'
import { classifyError } from '../utils/error'
import { runBackendChatRunRecoveryCoordinator } from '../services/providers/backendChatRunCoordinator'
import { useToast } from './useToast'
import { settings } from '../stores/settings'
import { resolveActiveConnection } from '../services/activeConnection'
import { searchService } from '../search/SearchService'
import { useAttachments } from './useAttachments'
import { useChatScroll } from './useChatScroll'
import { useTypewriterStream } from './useTypewriterStream'
import { useConfirm } from './useConfirm'
import type { Message, StreamController } from "../types/chat.ts"
import type { ModelRuntimeConfig } from '../types/model'

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
        conversations, currentId, generatingConvIds, markConversationGenerating, unmarkConversationGenerating,
        loadAll, createConversation, selectConversation, deleteConversation, renameConversation, refreshList,
    } = useConversations()

    const toast = useToast()
    const { confirm } = useConfirm()
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
    let activeGenerationRunId: string | null = null
    // createConversation 会设置 currentId，触发 watcher 加载消息——
    // 但 handleSend 中刚写入内存的消息会被 loadForConversation 覆盖清空，
    // 所以在 handleSend 创建会话期间用此标志临时屏蔽 watcher
    // Creating the first message also creates a conversation and changes currentId.
    // This flag skips the currentId watcher once so it does not reload and wipe the just-added message.
    let suppressConvWatch = false
    const streamMessageConversations = new Map<string, number>()
    const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const resumingGenerationMessages = new Set<string>()
    const detachedGenerationMessages = new Set<string>()
    let activeStreamTransport: 'direct' | 'backend' | null = null
    let activeStreamSettled: Promise<void> | null = null
    let resumeCheckTimer: ReturnType<typeof setTimeout> | null = null
    let switchSeq = 0

    // ── 会话切换 ─────────────────────────────────────────────

    watch(currentId, async (newId) => {
        const currentSeq = ++switchSeq
        // currentId is the single source of truth for conversation switching.
        // When it changes, load that conversation's messages into the chat window.
        if (suppressConvWatch) {
            suppressConvWatch = false
            return
        }
        if (newId !== null) {
            await loadForConversation(newId)
        } else {
            clearMessages()
        }
        if (currentSeq !== switchSeq) return
        await nextTick()
        resetAfterConversationChange()
        if (newId !== null) void resumePendingGeneration(newId)
    })

    async function handleSelectConversation(id: number) {
        if (id === currentId.value) {
            sidebarOpen.value = false
            return
        }
        if (!await prepareForConversationNavigation()) return
        selectConversation(id)
        sidebarOpen.value = false
    }

    async function handleNewConversation() {
        if (currentId.value === null) {
            sidebarOpen.value = false
            return
        }
        if (!await prepareForConversationNavigation()) return
        currentId.value = null
        sidebarOpen.value = false
    }

    async function prepareForConversationNavigation(): Promise<boolean> {
        if (!isStreaming.value) return true

        if (activeStreamTransport === 'backend') {
            const messageId = streamCtrl?.messageId
            if (messageId) {
                const convId = streamMessageConversations.get(messageId)
                if (convId !== undefined) void flushMessagePersist(messageId, convId)
                detachedGenerationMessages.add(messageId)
                streamCtrl?.controller.abort()
                toast.show('回答已转到后台生成，返回该会话时会自动恢复', 'success')
            }
            return true
        }

        const confirmed = await confirm({
            title: '停止回答并切换会话？',
            message: '当前为直连模式。切换会话会停止正在生成的回答，离开后无法自动恢复。',
            confirmText: '停止并切换',
            cancelText: '继续等待',
        })
        if (!confirmed) return false

        handleStop()
        return true
    }

    async function waitForActiveStreamToSettle(): Promise<void> {
        const pending = activeStreamSettled
        if (pending) await pending
    }

    async function handleDeleteConversation(id: number) {
        const conversation = conversations.value.find(item => item.id === id)
        const title = conversation?.title || '这条对话'
        const confirmed = await confirm({
            title: '删除对话',
            message: `确定删除「${title}」吗？删除后无法恢复。`,
            confirmText: '删除',
            danger: true,
        })
        if (!confirmed) return

        unmarkConversationGenerating(id)
        await deleteConversation(id)
        // Search index data is derived data. If cleanup fails, chat deletion should still succeed.
        void searchService.deleteConversation(id).catch(err => {
            console.warn('[search] 删除会话索引失败', err)
        })
    }

    async function handleRenameConversation(id: number, newTitle: string) {
        await renameConversation(id, newTitle)
        toast.show('会话已重命名', 'success')
    }

    // ── 持久化 ───────────────────────────────────────────────

    async function persistMessage(
        msgId: string,
        convId: number,
        createdAt?: number,
        statusOverride?: Message['status'],
    ) {
        const msg = messages.value.find(m => m.id === msgId)
        if (!msg) return
        await persistMessageSnapshot(msg, convId, createdAt, statusOverride)
    }

    async function persistMessageSnapshot(
        msg: Message,
        convId: number,
        createdAt?: number,
        statusOverride?: Message['status'],
    ) {
        // 最终保存不能只依赖当前 messages 列表。
        // 用户在回答刚结束时切换会话会替换内存列表，所以这里允许用结束瞬间的快照落库。
        const existing = await db.messages.get(msg.id)
        await db.messages.put({
            id: msg.id,
            conversationId: convId,
            role: msg.role,
            content: msg.content,
            images: msg.images?.map(image => ({ ...image })),
            files: msg.files?.map(file => ({ ...file })),
            status: statusOverride ?? msg.status,
            canContinue: msg.canContinue,
            errorMessage: msg.errorMessage,
            generationRunId: msg.generationRunId,
            generationSequence: msg.generationSequence,
            generationTurnId: msg.generationTurnId,
            generationRunStatus: msg.generationRunStatus,
            generationBaseUrl: msg.generationBaseUrl,
            ragContext: msg.ragContext
                ? {
                    ...msg.ragContext,
                    results: msg.ragContext.results.map(result => ({ ...result })),
                }
                : undefined,
            createdAt: createdAt ?? existing?.createdAt ?? Date.now(),
        })
    }

    function clearPersistTimer(msgId: string) {
        const timer = persistTimers.get(msgId)
        if (!timer) return
        clearTimeout(timer)
        persistTimers.delete(msgId)
    }

    function scheduleMessagePersist(msgId: string) {
        const convId = streamMessageConversations.get(msgId)
        if (convId === undefined || persistTimers.has(msgId)) return

        persistTimers.set(msgId, setTimeout(() => {
            persistTimers.delete(msgId)
            void persistMessage(msgId, convId, undefined, 'loading').catch(err => {
                console.warn('[chat] 持久化流式消息失败', err)
            })
        }, 500))
    }

    async function flushMessagePersist(msgId: string, convId: number) {
        clearPersistTimer(msgId)
        await persistMessage(msgId, convId)
    }

    async function flushMessageSnapshotPersist(msg: Message, convId: number) {
        clearPersistTimer(msg.id)
        await persistMessageSnapshot(snapshotMessage(msg), convId)
    }

    function snapshotMessage(msg: Message): Message {
        return {
            ...msg,
            images: msg.images?.map(image => ({ ...image })),
            files: msg.files?.map(file => ({ ...file })),
            ragContext: msg.ragContext
                ? {
                    ...msg.ragContext,
                    results: msg.ragContext.results.map(result => ({ ...result })),
                }
                : undefined,
        }
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
        const { formatMarkdownAsync } = await import('../utils/markdownAsync')
        try {
            msg.formattedMarkdown = await formatMarkdownAsync(msg.content)
        } catch {
            // 格式化异常时保留原始 Markdown
        }
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
        // 后端 Run 必须显式 DELETE 才会停止模型；中断 SSE 本身不会取消后台任务。
        if (!streamCtrl) return
        const msgId = streamCtrl.messageId
        const runId = activeGenerationRunId
        const convId = streamMessageConversations.get(msgId) ?? currentId.value
        const targetMsg = messages.value.find(m => m.id === msgId)

        typewriter.abort(msgId)
        streamCtrl.abort()

        // 立即在内存与界面将该消息设为取消终态，防止切换会话后被误恢复
        updateMessage(msgId, {
            status: 'aborted',
            canContinue: true,
            generationRunStatus: 'cancelled',
        })
        if (convId !== null) {
            unmarkConversationGenerating(convId)
            void flushMessagePersist(msgId, convId)
        }

        if (runId) {
            void cancelBackendChatRun(runId, { baseUrl: targetMsg?.generationBaseUrl }).catch(err => {
                console.warn('[chat] 取消后端生成任务失败', err)
            })
        }
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
        if (pendingImages.value.length > 0) {
            const activeConn = resolveActiveConnection(settings)
            if (!activeConn.capabilities.vision) {
                toast.show(activeConn.visionDisabledReason || '当前连接不支持图片输入，请移除图片或切换至支持视觉的模型连接后再发送', 'warning')
                return
            }
        }
        const userText = inputValue.value.trim()
        const images = pendingImages.value.length > 0
            ? pendingImages.value.map(img => ({ base64: img.base64, mediaType: img.mediaType, name: img.name }))
            : undefined
        const files = pendingFiles.value.length > 0
            ? pendingFiles.value.map(f => ({ name: f.name, content: f.content, size: f.size }))
            : undefined

        if (!userText && !images?.length && !files?.length) return

        // 统一在清空输入、保存消息及发起异步操作前校验连接状态与有效候选
        const catalog = getCachedBackendProvidersCatalog(settings.backend?.url)
        const active = resolveActiveConnection(settings, catalog)
        if (!active.isConfigured) {
            toast.show(active.error || '当前模型服务未就绪或未配置，无法发送消息', 'warning')
            return
        }

        const runtimeSnapshot = freezeRuntime(createRuntimeFromSettings(settings, catalog))

        inputValue.value = ''
        clearAttachments()

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
        await db.conversations.update(convId, { updatedAt: userCreatedAt })
        await refreshList()

        const aiMsg = createAssistantMessage()
        await scrollToBottom()
        streamMessageConversations.set(aiMsg.id, convId)
        await persistMessage(aiMsg.id, convId)
        await runStream({
            aiMessageId: aiMsg.id,
            prompt: promptText,
            convId,
            sourceUserMessageId: userMsgId,
            runtime: runtimeSnapshot,
        })
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

        if (errMsg.generationRunId && !isTerminalRunStatus(errMsg.generationRunStatus)) {
            updateMessage(errMsg.id, {
                status: errMsg.content ? 'streaming' : 'loading',
                canContinue: false,
                errorMessage: undefined,
            })
            streamMessageConversations.set(errMsg.id, currentId.value)
            await flushMessagePersist(errMsg.id, currentId.value)
            await runStream({
                aiMessageId: errMsg.id,
                prompt: '',
                convId: currentId.value,
                resumeRunId: errMsg.generationRunId,
            })
            return
        }

        if (errMsg.generationTurnId && !errMsg.generationRunId) {
            const catalog = getCachedBackendProvidersCatalog(settings.backend?.url)
            const active = resolveActiveConnection(settings, catalog)
            if (!active.isConfigured) {
                toast.show(active.error || '当前模型服务未就绪或未配置，无法重试', 'warning')
                return
            }
            const runtimeSnapshot = freezeRuntime(createRuntimeFromSettings(settings, catalog))

            const contextMessages = messages.value
                .filter(message => message.id !== errMsg.id)
                .map(snapshotMessage)
            updateMessage(errMsg.id, {
                content: '',
                formattedMarkdown: undefined,
                formattedContent: undefined,
                status: 'loading',
                canContinue: false,
                errorMessage: undefined,
                generationRunStatus: 'queued',
            })
            streamMessageConversations.set(errMsg.id, currentId.value)
            await flushMessagePersist(errMsg.id, currentId.value)
            await runStream({
                aiMessageId: errMsg.id,
                prompt: userMsg.content,
                convId: currentId.value,
                contextMessages,
                sourceUserMessageId: userMsg.id,
                turnId: errMsg.generationTurnId,
                runtime: runtimeSnapshot,
            })
            return
        }

        const catalog = getCachedBackendProvidersCatalog(settings.backend?.url)
        const active = resolveActiveConnection(settings, catalog)
        if (!active.isConfigured) {
            toast.show(active.error || '当前模型服务未就绪或未配置，无法重试', 'warning')
            return
        }
        const runtimeSnapshot = freezeRuntime(createRuntimeFromSettings(settings, catalog))

        await db.messages.delete(messageId)
        messages.value.splice(msgIdx, 1)

        const aiMsg = createAssistantMessage()
        streamMessageConversations.set(aiMsg.id, currentId.value)
        await persistMessage(aiMsg.id, currentId.value)
        await runStream({
            aiMessageId: aiMsg.id,
            prompt: userMsg.content,
            convId: currentId.value,
            sourceUserMessageId: userMsg.id,
            regeneratedFromRunId: errMsg.generationRunId,
            runtime: runtimeSnapshot,
        })
    }

    // 重新生成：针对已生成的 AI 消息重新请求回复
    async function handleRegenerate(messageId: string) {
        if (isStreaming.value) return
        const msgIdx = messages.value.findIndex(m => m.id === messageId)
        if (msgIdx === -1 || currentId.value === null) return
        const targetMsg = messages.value[msgIdx]
        if (targetMsg.role !== 'assistant') return

        const userMsg = findPreviousUserMessage(messageId)
        if (!userMsg) return

        const catalog = getCachedBackendProvidersCatalog(settings.backend?.url)
        const active = resolveActiveConnection(settings, catalog)
        if (!active.isConfigured) {
            toast.show(active.error || '当前模型服务未就绪或未配置，无法重新生成', 'warning')
            return
        }
        const runtimeSnapshot = freezeRuntime(createRuntimeFromSettings(settings, catalog))

        updateMessage(targetMsg.id, {
            content: '',
            formattedMarkdown: undefined,
            formattedContent: undefined,
            status: 'loading',
            errorMessage: undefined,
            canContinue: false,
        })
        streamMessageConversations.set(targetMsg.id, currentId.value)
        await flushMessagePersist(targetMsg.id, currentId.value)

        const contextMessages = messages.value
            .slice(0, msgIdx)
            .map(snapshotMessage)

        await runStream({
            aiMessageId: targetMsg.id,
            prompt: userMsg.content,
            convId: currentId.value,
            contextMessages,
            sourceUserMessageId: userMsg.id,
            runtime: runtimeSnapshot,
        })
    }

    // 继续生成：复用已中断的 AI 消息，以空 prompt 续写
    async function handleContinue(messageId: string) {
        // Continue reuses an aborted assistant message and appends more content to it.
        if (isStreaming.value) return
        const msg = messages.value.find(m => m.id === messageId)
        if (!msg || currentId.value === null) return
        if (msg.status !== 'aborted') return

        const catalog = getCachedBackendProvidersCatalog(settings.backend?.url)
        const active = resolveActiveConnection(settings, catalog)
        if (!active.isConfigured) {
            toast.show(active.error || '当前模型服务未就绪或未配置，无法继续生成', 'warning')
            return
        }
        const runtimeSnapshot = freezeRuntime(createRuntimeFromSettings(settings, catalog))

        typewriter.restoreAbortedOutput(messageId)
        const contextMessages: Message[] = messages.value.map(item =>
            item.id === msg.id
                ? { ...snapshotMessage(item), status: 'aborted', canContinue: true }
                : snapshotMessage(item)
        )

        if (settings.transport === 'backend') {
            const sourceUserMessage = findPreviousUserMessage(messageId)
            if (!sourceUserMessage) return
            updateMessage(msg.id, { canContinue: false })
            await flushMessagePersist(msg.id, currentId.value)

            const continuation = createAssistantMessage()
            streamMessageConversations.set(continuation.id, currentId.value)
            await persistMessage(continuation.id, currentId.value)
            await runStream({
                aiMessageId: continuation.id,
                prompt: '',
                convId: currentId.value,
                contextMessages,
                sourceUserMessageId: sourceUserMessage.id,
                runtime: runtimeSnapshot,
            })
            return
        }

        updateMessage(msg.id, { status: 'loading', canContinue: false })
        streamMessageConversations.set(messageId, currentId.value)
        await flushMessagePersist(messageId, currentId.value)
        await runStream({
            aiMessageId: messageId,
            prompt: '',
            convId: currentId.value,
            contextMessages,
            skipRagContext: true,
            runtime: runtimeSnapshot,
        })
    }

    // ── 流式请求核心 ─────────────────────────────────────────

    interface RunStreamOptions {
        aiMessageId: string
        prompt: string   // 空字符串 = 续写
        convId: number
        contextMessages?: Message[]
        skipRagContext?: boolean
        sourceUserMessageId?: string
        turnId?: string
        regeneratedFromRunId?: string
        resumeRunId?: string
        runtime?: Readonly<ModelRuntimeConfig>
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
        let settleActiveStream: () => void = () => undefined
        const settled = new Promise<void>(resolve => { settleActiveStream = resolve })
        activeStreamSettled = settled
        typewriter.reset()
        needsStatusFallback = true
        const runtime = options.runtime || freezeRuntime(createRuntimeFromSettings(settings, getCachedBackendProvidersCatalog(settings.backend?.url)))
        if (!options.resumeRunId && !options.runtime) {
            const active = resolveActiveConnection(settings, getCachedBackendProvidersCatalog(settings.backend?.url))
            if (!active.isConfigured) {
                const errMsg = active.error || '当前模型服务未就绪或未配置'
                toast.show(errMsg, 'warning')
                updateMessage(options.aiMessageId, {
                    status: 'error',
                    errorMessage: errMsg,
                })
                await flushMessagePersist(options.aiMessageId, options.convId)
                settleActiveStream()
                return
            }
        }
        activeStreamTransport = options.resumeRunId ? 'backend' : runtime.transport
        streamCtrl = createStreamController(options.aiMessageId)
        isStreaming.value = true
        markConversationGenerating(options.convId)
        await nextTick()
        scheduleScroll()
        const requestMessages = options.contextMessages ?? messages.value

        try {
            if (options.resumeRunId) {
                await resumeBackendStream(options, options.resumeRunId)
            } else if (runtime.transport === 'backend') {
                await runBackendStream(options, requestMessages, runtime)
            } else {
                // 直连模型继续使用旧流，不影响已有 Ollama/OpenAI/Claude 行为。
                await generateStreamWithContext({
                    messages: requestMessages,
                    userText: options.prompt,
                    runtime,
                    onChunk: (chunk) => {
                        if (streamCtrl?.isAborted) return
                        typewriter.push(options.aiMessageId, chunk)
                        scheduleMessagePersist(options.aiMessageId)
                        handleIncomingChunk()
                    },
                    onDone: () => {
                        needsStatusFallback = false
                        unmarkConversationGenerating(options.convId)
                        typewriter.markDone(options.aiMessageId)
                    },
                    signal: streamCtrl.controller.signal,
                })
            }
        } catch (err: unknown) {
            if (detachedGenerationMessages.has(options.aiMessageId)) {
                needsStatusFallback = false
                return
            }
            unmarkConversationGenerating(options.convId)
            if (streamCtrl?.isAborted) {
                needsStatusFallback = false
                updateMessage(options.aiMessageId, { status: 'aborted', canContinue: true })
                return
            }
            const expiredRun = Boolean(options.resumeRunId)
                && err instanceof BackendChatRunClientError
                && err.code === 'GENERATION_RUN_NOT_FOUND'
            const chatErr = expiredRun
                ? { type: 'server' as const, message: '生成任务缓存已过期，无法继续恢复。', status: 404 }
                : classifyError(err)
            needsStatusFallback = false
            updateMessage(options.aiMessageId, {
                status: 'error',
                errorMessage: chatErr.message,
                ...(expiredRun
                    ? {
                        generationRunId: undefined,
                        generationSequence: 0,
                        generationRunStatus: 'failed' as const,
                    }
                    : {}),
            })
            toast.show(chatErr.message, 'error')
        } finally {
            // This block runs for success, error, and abort.
            // It persists the assistant message, updates the conversation timestamp, and refreshes search.
            try {
                await typewriter.waitForPendingDone()

                if (needsStatusFallback) {
                    if (detachedGenerationMessages.has(options.aiMessageId)) {
                        // 处于转入后台生成的任务，保留后台生成状态，绝不标记为 aborted 或 done
                    } else if (streamCtrl?.isAborted) {
                        unmarkConversationGenerating(options.convId)
                        updateMessage(options.aiMessageId, {
                            status: 'aborted',
                            canContinue: true,
                            generationRunStatus: 'cancelled',
                        })
                    } else {
                        unmarkConversationGenerating(options.convId)
                        updateMessage(options.aiMessageId, { status: 'done' })
                    }
                }

                const aiMessage = messages.value.find(msg => msg.id === options.aiMessageId)
                if (aiMessage) {
                    await flushMessageSnapshotPersist(aiMessage, options.convId)
                } else {
                    await flushMessagePersist(options.aiMessageId, options.convId)
                }
                const isDetached = detachedGenerationMessages.has(options.aiMessageId)
                if (!isDetached) {
                    const updatedAt = Date.now()
                    await db.conversations.update(options.convId, { updatedAt })
                    await refreshList()
                    if (aiMessage && (!aiMessage.generationRunId || isTerminalRunStatus(aiMessage.generationRunStatus))) {
                        queueSearchIndex(aiMessage, options.convId, updatedAt, updatedAt)
                    }
                }
            } finally {
                detachedGenerationMessages.delete(options.aiMessageId)
                streamMessageConversations.delete(options.aiMessageId)
                activeGenerationRunId = null
                activeStreamTransport = null
                streamCtrl = null
                isStreaming.value = false
                scheduleScroll()
                if (activeStreamSettled === settled) activeStreamSettled = null
                settleActiveStream()
            }
        }
    }

    async function subscribeChatRunEventsWithRetry(
        options: RunStreamOptions,
        runId: string,
        initialSequence: number,
        needInitialSnapshot = false,
        baseUrl?: string,
    ): Promise<void> {
        await runBackendChatRunRecoveryCoordinator({
            runId,
            baseUrl,
            initialSequence,
            needInitialSnapshot,
            signal: streamCtrl?.controller.signal,
            getCurrentSequence: () => {
                const currentMsg = messages.value.find(item => item.id === options.aiMessageId)
                return currentMsg?.generationSequence ?? initialSequence
            },
            onSnapshotFetch: (snapshot) => {
                if (snapshot.assistantMessageId !== options.aiMessageId || snapshot.conversationId !== String(options.convId)) {
                    throw new Error('生成任务与当前聊天消息不匹配。')
                }
                updateMessage(options.aiMessageId, { generationRunStatus: snapshot.status })
                if (isTerminalRunStatus(snapshot.status)) {
                    updateMessage(options.aiMessageId, { errorMessage: undefined })
                    applyTerminalRunSnapshot(options.aiMessageId, snapshot, options.convId)
                    return true
                }
            },
            onSnapshotSync: (snapshot) => {
                updateMessage(options.aiMessageId, {
                    content: snapshot.outputText,
                    generationSequence: snapshot.lastSequence,
                    formattedMarkdown: undefined,
                    formattedContent: undefined,
                })
            },
            onProgress: () => {
                updateMessage(options.aiMessageId, { errorMessage: undefined })
            },
            onRetryNotice: (attempt, maxAttempts) => {
                toast.show(`连接中断，正在恢复 (${attempt}/${maxAttempts})...`, 'warning', 2500)
                updateMessage(options.aiMessageId, {
                    errorMessage: `连接中断，正在恢复 (${attempt}/${maxAttempts})...`,
                })
            },
            onEvent: async (event) => {
                await handleBackendRunEvent(options, event)
            },
        })
    }

    async function runBackendStream(
        options: RunStreamOptions,
        requestMessages: Message[],
        runtime: ReturnType<typeof createRuntimeFromSettings>,
    ): Promise<void> {
        const message = messages.value.find(item => item.id === options.aiMessageId)
        if (!message) throw new Error('找不到待生成的助手消息。')
        const sourceUserMessageId = options.sourceUserMessageId ?? findPreviousUserMessage(options.aiMessageId)?.id
        if (!sourceUserMessageId) throw new Error('找不到生成任务对应的用户消息。')

        const turnId = options.turnId ?? message.generationTurnId ?? crypto.randomUUID()
        updateMessage(options.aiMessageId, {
            generationTurnId: turnId,
            generationRunStatus: 'queued',
            errorMessage: undefined,
            generationBaseUrl: runtime.baseUrl,
        })
        await flushMessagePersist(options.aiMessageId, options.convId)

        const created = await createBackendChatRun({
            messages: requestMessages,
            userText: options.prompt,
            runtime,
            conversationId: options.convId,
            turnId,
            sourceUserMessageId,
            assistantMessageId: options.aiMessageId,
            regeneratedFromRunId: options.regeneratedFromRunId,
            baseUrl: runtime.baseUrl,
        })

        activeGenerationRunId = created.run.runId
        const afterSequence = message.generationRunId === created.run.runId
            ? message.generationSequence ?? 0
            : 0

        // 检查在建单接口返回的这几十毫秒内，用户是否已经点击了停止
        if (streamCtrl?.isAborted) {
            void cancelBackendChatRun(created.run.runId, { baseUrl: runtime.baseUrl }).catch(() => undefined)
            updateMessage(options.aiMessageId, {
                generationRunId: created.run.runId,
                generationRunStatus: 'cancelled',
                status: 'aborted',
                canContinue: true,
                generationBaseUrl: runtime.baseUrl,
            })
            await flushMessagePersist(options.aiMessageId, options.convId)
            return
        }

        updateMessage(options.aiMessageId, {
            generationRunId: created.run.runId,
            generationRunStatus: created.run.status,
            generationSequence: afterSequence,
            generationBaseUrl: runtime.baseUrl,
        })
        await flushMessagePersist(options.aiMessageId, options.convId)
        markConversationGenerating(options.convId)

        if (detachedGenerationMessages.has(options.aiMessageId)) {
            return
        }

        await subscribeChatRunEventsWithRetry(options, created.run.runId, afterSequence, false, runtime.baseUrl)
    }

    async function resumeBackendStream(options: RunStreamOptions, runId: string): Promise<void> {
        const message = messages.value.find(item => item.id === options.aiMessageId)
        if (!message) throw new Error('找不到待恢复的助手消息。')

        if (!message.generationBaseUrl) {
            updateMessage(options.aiMessageId, {
                status: 'error',
                errorMessage: '历史任务缺失后端地址信息，请点击重新生成。',
                generationRunStatus: 'failed',
                canContinue: false,
            })
            toast.show('历史任务缺失后端地址信息，请点击重新生成。', 'warning')
            return
        }

        activeGenerationRunId = runId
        const afterSequence = message.generationSequence ?? 0

        await flushMessagePersist(options.aiMessageId, options.convId)
        await subscribeChatRunEventsWithRetry(options, runId, afterSequence, true, message.generationBaseUrl)
    }

    async function handleBackendRunEvent(options: RunStreamOptions, event: BackendChatRunEvent): Promise<void> {
        const message = messages.value.find(item => item.id === options.aiMessageId)
        if (!message || message.generationRunId !== event.runId || streamCtrl?.isAborted) return

        const baseChanges: Partial<Message> = { generationSequence: event.sequence }
        switch (event.type) {
            case 'run_started':
                updateMessage(options.aiMessageId, { ...baseChanges, generationRunStatus: 'running' })
                break
            case 'rag_context': {
                const rag = ragContextFromRunEvent(event)
                updateMessage(options.aiMessageId, {
                    ...baseChanges,
                    ragContext: rag
                        ? { mode: rag.mode, enabled: rag.enabled, results: rag.citations, scenario: rag.scenario }
                        : undefined,
                })
                break
            }
            case 'text_delta': {
                const content = typeof event.data.content === 'string' ? event.data.content : ''
                if (content) appendToMessage(options.aiMessageId, content)
                updateMessage(options.aiMessageId, { ...baseChanges, generationRunStatus: 'running' })
                handleIncomingChunk()
                break
            }
            case 'run_completed':
                needsStatusFallback = false
                unmarkConversationGenerating(options.convId)
                updateMessage(options.aiMessageId, { ...baseChanges, generationRunStatus: 'completed' })
                typewriter.markDone(options.aiMessageId)
                break
            case 'run_failed': {
                needsStatusFallback = false
                unmarkConversationGenerating(options.convId)
                const errorMessage = typeof event.data.message === 'string' ? event.data.message : '生成任务失败。'
                updateMessage(options.aiMessageId, {
                    ...baseChanges,
                    status: 'error',
                    generationRunStatus: 'failed',
                    errorMessage,
                })
                toast.show(errorMessage, 'error')
                break
            }
            case 'run_cancelled':
                needsStatusFallback = false
                unmarkConversationGenerating(options.convId)
                updateMessage(options.aiMessageId, {
                    ...baseChanges,
                    status: 'aborted',
                    canContinue: true,
                    generationRunStatus: 'cancelled',
                })
                break
        }
        scheduleMessagePersist(options.aiMessageId)
    }

    function findPreviousUserMessage(messageId: string): Message | null {
        const index = messages.value.findIndex(message => message.id === messageId)
        const start = index === -1 ? messages.value.length - 1 : index - 1
        for (let i = start; i >= 0; i -= 1) {
            if (messages.value[i].role === 'user') return messages.value[i]
        }
        return null
    }

    function isTerminalRunStatus(status: Message['generationRunStatus']): boolean {
        return status === 'completed' || status === 'failed' || status === 'cancelled'
    }

    function applyTerminalRunSnapshot(
        messageId: string,
        snapshot: Awaited<ReturnType<typeof getBackendChatRun>>,
        convId?: number,
    ): void {
        needsStatusFallback = false
        if (convId !== undefined) {
            unmarkConversationGenerating(convId)
        }
        if (snapshot.status === 'completed') {
            updateMessage(messageId, {
                content: snapshot.outputText,
                generationSequence: snapshot.lastSequence,
                generationRunStatus: 'completed',
                status: 'done',
                canContinue: false,
                errorMessage: undefined,
                formattedMarkdown: undefined,
                formattedContent: undefined,
            })
            void formatFinishedMessage(messageId)
            return
        }
        if (snapshot.status === 'cancelled') {
            updateMessage(messageId, {
                content: snapshot.outputText,
                generationSequence: snapshot.lastSequence,
                generationRunStatus: 'cancelled',
                status: 'aborted',
                canContinue: true,
                errorMessage: undefined,
                formattedMarkdown: undefined,
                formattedContent: undefined,
            })
            return
        }
        updateMessage(messageId, {
            content: snapshot.outputText,
            generationSequence: snapshot.lastSequence,
            generationRunStatus: 'failed',
            status: 'error',
            canContinue: false,
            errorMessage: snapshot.errorMessage ?? '生成任务失败。',
            formattedMarkdown: undefined,
            formattedContent: undefined,
        })
    }

    async function resumePendingGeneration(convId: number): Promise<void> {
        if (currentId.value !== convId) return
        await waitForActiveStreamToSettle()
        if (isStreaming.value || currentId.value !== convId) return
        const pending = [...messages.value].reverse().find(message =>
            message.role === 'assistant'
            && Boolean(message.generationRunId)
            && message.status !== 'aborted'
            && !isTerminalRunStatus(message.generationRunStatus)
        )
        if (!pending?.generationRunId) return
        if (resumingGenerationMessages.has(pending.id)) return
        resumingGenerationMessages.add(pending.id)

        try {
            updateMessage(pending.id, {
                status: pending.content ? 'streaming' : 'loading',
                canContinue: false,
                errorMessage: undefined,
            })
            streamMessageConversations.set(pending.id, convId)
            await flushMessagePersist(pending.id, convId)
            await runStream({
                aiMessageId: pending.id,
                prompt: '',
                convId,
                resumeRunId: pending.generationRunId,
            })
        } finally {
            resumingGenerationMessages.delete(pending.id)
        }
    }

    function schedulePendingGenerationResume() {
        if (document.visibilityState === 'hidden') return
        if (resumeCheckTimer !== null) clearTimeout(resumeCheckTimer)
        resumeCheckTimer = setTimeout(() => {
            resumeCheckTimer = null
            const convId = currentId.value
            if (convId !== null) void resumePendingGeneration(convId)
        }, 0)
    }

    function handleDocumentVisibilityChange() {
        if (document.visibilityState === 'visible') schedulePendingGenerationResume()
    }

    // ── 生命周期 ─────────────────────────────────────────────

    onMounted(async () => {
        // Page startup: attach scroll listener, load conversations, warm up search index, then open latest conversation.
        await nextTick()
        attachScrollListener()
        await loadAll()
        document.addEventListener('visibilitychange', handleDocumentVisibilityChange)
        window.addEventListener('pageshow', schedulePendingGenerationResume)
        window.addEventListener('focus', schedulePendingGenerationResume)
        void searchService.ensureIndex().catch(err => {
            console.warn('[search] 初始化索引失败', err)
        })
        try {
            const unfinishedRuns = await db.messages.filter(msg =>
                msg.role === 'assistant'
                && Boolean(msg.generationRunId)
                && msg.status !== 'aborted'
                && !isTerminalRunStatus(msg.generationRunStatus)
            ).toArray()
            for (const msg of unfinishedRuns) {
                if (typeof msg.conversationId === 'number') {
                    markConversationGenerating(msg.conversationId)
                }
            }
        } catch (e) {
            console.warn('[generatingConvIds] 恢复未完成状态失败', e)
        }
        if (conversations.value.length > 0 && currentId.value === null) {
            const latestId = conversations.value[0].id!
            selectConversation(latestId)
            // 刷新页面后 currentId 是内存态，watch 的触发时序不应承担首次恢复消息的职责。
            await loadForConversation(latestId)
            await nextTick()
            resetAfterConversationChange()
            void resumePendingGeneration(latestId)
        } else if (currentId.value !== null) {
            await loadForConversation(currentId.value)
            await nextTick()
            resetAfterConversationChange()
            void resumePendingGeneration(currentId.value)
        }
    })

    onUnmounted(() => {
        document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
        window.removeEventListener('pageshow', schedulePendingGenerationResume)
        window.removeEventListener('focus', schedulePendingGenerationResume)
        if (resumeCheckTimer !== null) {
            clearTimeout(resumeCheckTimer)
            resumeCheckTimer = null
        }
        detachScrollListener()
        for (const timer of persistTimers.values()) {
            clearTimeout(timer)
        }
        persistTimers.clear()
        streamMessageConversations.clear()
        resumingGenerationMessages.clear()
        detachedGenerationMessages.clear()
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
        generatingConvIds,
        toast,
        pendingImages,
        pendingFiles,
        handleSend,
        scrollToBottom,
        handleStop,
        handleContinue,
        handleRetry,
        handleRegenerate,
        handleSelectConversation,
        handleNewConversation,
        handleDeleteConversation,
        handleRenameConversation,
        addImages,
        removeImage,
        addFiles,
        removeFile,
    }
}
