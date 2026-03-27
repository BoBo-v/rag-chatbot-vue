import { ref } from 'vue'
import type { Message,MessageStatus } from '../types/chat'

export function useChat() {
    //聊天列表
    const messages = ref<Message[]>([])

    /**
     * 添加消息到消息列表
     * @param message - 要添加的消息对象，包含 id、role、content 等属性
     */
    function addMessage(message: Message) {
        messages.value.push(message)
    }

    /**
     * 创建助手消息并添加到消息列表
     * @returns 新创建的助手消息对象，包含初始化的 id、role、content 和 status 属性
     */
    function createAssistantMessage(): Message {
        const msg: Message = {
            id:crypto.randomUUID(),
            role: 'assistant',
            content: '',
            status: 'loading'
        }
        messages.value.push(msg)
        return msg
    }

    /**
     * 向指定消息追加内容片段
     * @param id - 消息的唯一标识符
     * @param chunk - 要追加的内容片段
     */
    function appendToMessage(id: string, chunk: string) {
        const msg = messages.value.find(m => m.id === id)
        if (msg) {
            msg.content += chunk
            msg.status = 'streaming'
        }
    }

    /**
     * 更新指定消息的状态
     * @param id - 消息的唯一标识符
     * @param status - 要更新到的目标状态
     */
    function updateMessageStatus(id: string, status: MessageStatus) {
        const msg = messages.value.find(m => m.id === id)
        if (msg) {
            msg.status = status
            msg.canContinue=status==='aborted'
        }
    }
    /**
     * 完成指定消息，将其状态标记为已完成
     * @param id - 消息的唯一标识符
     */
    function finishMessage(id: string) {
        updateMessageStatus(id, 'done')
    }
    /**
     * 中止指定消息的处理
     * @param id - 要中止的消息的唯一标识符
     */
    function abortMessage(id: string) {
        updateMessageStatus(id, 'aborted')
    }
    /**
     * 将指定消息标记为错误状态
     * @param id - 要标记为错误的消息的唯一标识符
     */
    function errorMessage(id: string) {
        updateMessageStatus(id, 'error')
    }
    return {
        messages,
        addMessage,
        abortMessage,
        errorMessage,
        createAssistantMessage,
        appendToMessage,
        finishMessage
    }
}