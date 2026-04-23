import { ref } from 'vue'
import type { Message, MessageStatus, Role } from '../types/chat'
import { db } from '../db'

// 模块级单例 —— 所有调用 useChat() 的地方共享同一份消息列表
// 这样 StyleChat.vue 和 useChatView.ts 操作的永远是同一个 ref
const messages = ref<Message[]>([])

export function useChat() {

    /**
     * 从 IndexedDB 加载指定会话的所有消息，替换当前内存列表。
     * 切换会话时调用，确保界面显示的是目标会话的历史记录。
     */
    async function loadForConversation(conversationId: number) {
        const dbMessages = await db.messages
            .where('conversationId')
            .equals(conversationId)
            .sortBy('createdAt')   // 按创建时间升序，保证消息顺序正确

        messages.value = dbMessages.map(m => ({
            id: m.id,
            role: m.role as Role,
            content: m.content,
            status: m.status as MessageStatus,
            canContinue: m.canContinue,
            errorMessage: m.errorMessage,
        }))
    }

    /**
     * 清空内存中的消息列表。
     * 新建对话（currentId = null）时调用，让界面呈现空白状态。
     */
    function clearMessages() {
        messages.value = []
    }

    /**
     * 向列表末尾追加一条消息（用户消息 / 已构造好的 AI 消息）。
     */
    function addMessage(message: Message) {
        messages.value.push(message)
    }

    /**
     * 创建 AI 占位消息并立即推入列表。
     * 在真正开始流式请求前调用，让界面先显示 loading 动画，
     * 后续通过 appendToMessage / updateMessage 逐步填充内容。
     * 返回该消息对象，调用方用其 id 追踪这条 AI 消息。
     */
    function createAssistantMessage(): Message {
        const msg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            status: 'loading'   // 初始为 loading，收到第一个 chunk 后变为 streaming
        }
        messages.value.push(msg)
        return msg
    }

    /**
     * 向指定消息追加一段文本（流式输出时逐字符调用）。
     * 同时将状态改为 streaming，触发界面的光标闪烁效果。
     */
    function appendToMessage(id: string, chunk: string) {
        const msg = messages.value.find(m => m.id === id)
        if (msg) {
            msg.content += chunk
            msg.status = 'streaming'
        }
    }

    /**
     * 批量更新指定消息的字段（id 不可修改）。
     * 典型用法：
     *   updateMessage(id, { status: 'done' })
     *   updateMessage(id, { status: 'aborted', canContinue: true })
     *   updateMessage(id, { formattedContent: html })
     */
    function updateMessage(id: string, changes: Omit<Partial<Message>, 'id'>) {
        const msg = messages.value.find(m => m.id === id)
        if (msg) {
            Object.assign(msg, changes)
        }
    }

    return {
        messages,
        addMessage,
        clearMessages,
        loadForConversation,
        updateMessage,
        createAssistantMessage,
        appendToMessage,
    }
}
