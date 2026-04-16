import { ref } from 'vue'
import type { Message, MessageStatus, Role } from '../types/chat'
import { db } from '../db'

// 模块级单例 —— 所有调用共享同一份消息列表
const messages = ref<Message[]>([])

export function useChat() {
    /** 从 DB 加载指定会话的消息 */
    async function loadForConversation(conversationId: number) {
        const dbMessages = await db.messages
            .where('conversationId')
            .equals(conversationId)
            .sortBy('createdAt')

        messages.value = dbMessages.map(m => ({
            id: m.id,
            role: m.role as Role,
            content: m.content,
            status: m.status as MessageStatus,
            canContinue: m.canContinue,
        }))
    }

    /** 清空内存中的消息（切换到新对话时调用） */
    function clearMessages() {
        messages.value = []
    }

    function addMessage(message: Message) {
        messages.value.push(message)
    }

    function createAssistantMessage(): Message {
        const msg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            status: 'loading'
        }
        messages.value.push(msg)
        return msg
    }

    function appendToMessage(id: string, chunk: string) {
        const msg = messages.value.find(m => m.id === id)
        if (msg) {
            msg.content += chunk
            msg.status = 'streaming'
        }
    }

    function updateMessageStatus(id: string, status: MessageStatus) {
        const msg = messages.value.find(m => m.id === id)
        if (msg) {
            msg.status = status
            msg.canContinue = status === 'aborted'
        }
    }

    function finishMessage(id: string) {
        updateMessageStatus(id, 'done')
    }

    function abortMessage(id: string) {
        updateMessageStatus(id, 'aborted')
    }

    function errorMessage(id: string) {
        updateMessageStatus(id, 'error')
    }

    return {
        messages,
        addMessage,
        clearMessages,
        loadForConversation,
        abortMessage,
        errorMessage,
        createAssistantMessage,
        appendToMessage,
        finishMessage,
    }
}
