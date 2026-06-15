import { ref } from 'vue'
import type { Message, MessageStatus, Role } from '../types/chat'
import { db } from '../db'

// 消息列表是模块级单例：所有调用 useChat() 的地方共享同一个 messages。
// 这样 StyleChat.vue 展示的消息，和 useChatView.ts 修改的消息永远是同一份数据。
const messages = ref<Message[]>([])

export function useChat() {
    function normalizeRestoredMessageStatus(m: { role: Role; status: MessageStatus }) {
        if (m.role === 'assistant' && (m.status === 'loading' || m.status === 'streaming')) {
            return {
                status: 'aborted' as MessageStatus,
                canContinue: true,
            }
        }
        return {
            status: m.status,
            canContinue: undefined,
        }
    }

    // 从 IndexedDB 加载某个会话的全部消息，并替换当前内存消息列表。
    // 切换会话时调用它，保证页面展示的是目标会话的历史记录。
    async function loadForConversation(conversationId: number) {
        const dbMessages = await db.messages
            .where('conversationId')
            .equals(conversationId)
            .sortBy('createdAt')

        messages.value = dbMessages.map(m => {
            const role = m.role as Role
            const restored = normalizeRestoredMessageStatus({
                role,
                status: m.status as MessageStatus,
            })

            return {
                id: m.id,
                role,
                content: m.content,
                images: m.images,
                files: m.files,
                status: restored.status,
                canContinue: restored.canContinue ?? m.canContinue,
                errorMessage: m.errorMessage,
                ragContext: m.ragContext,
            }
        })
    }

    // 新建会话或取消选中会话时，用空列表清空聊天区域。
    function clearMessages() {
        messages.value = []
    }

    // 向当前消息列表末尾追加一条消息。
    function addMessage(message: Message) {
        messages.value.push(message)
    }

    // 创建一个空的 AI 占位消息，先显示 loading，后续流式输出再不断追加内容。
    function createAssistantMessage(): Message {
        const msg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            status: 'loading',
        }
        messages.value.push(msg)
        return msg
    }

    // 流式输出时每收到一段文本，就追加到指定 AI 消息后面。
    function appendToMessage(id: string, chunk: string) {
        const msg = messages.value.find(m => m.id === id)
        if (msg) {
            msg.content += chunk
            msg.status = 'streaming'
        }
    }

    // 批量更新一条消息的字段，比如把 loading 改为 done/error/aborted。
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
