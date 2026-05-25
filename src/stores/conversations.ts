import { ref } from 'vue'
import { db } from '../db'
import type { Conversation } from '../types/chat'

// 会话列表是模块级单例：所有调用 useConversations() 的地方共享同一份状态。
// conversations 用于侧边栏列表，currentId 表示当前正在打开的会话。
const conversations = ref<Conversation[]>([])
const currentId = ref<number | null>(null)

export function useConversations() {
    // 从 IndexedDB 读取全部会话，并按更新时间倒序排列。
    async function loadAll() {
        const list = await db.conversations.orderBy('updatedAt').reverse().toArray()
        conversations.value = list as Conversation[]
    }

    // 新建会话时同时更新数据库和内存状态，避免 UI 等待下一次刷新。
    async function createConversation(title = '新对话'): Promise<number> {
        const now = Date.now()
        const id = await db.conversations.add({ title, createdAt: now, updatedAt: now })
        const conv: Conversation = { id: id as number, title, createdAt: now, updatedAt: now }
        conversations.value.unshift(conv)
        currentId.value = id as number
        return id as number
    }

    // 选择会话只需要修改 currentId；消息加载由 useChatView 里的 watcher 负责。
    function selectConversation(id: number) {
        currentId.value = id
    }

    // 删除会话要先删消息，再删会话本身，否则消息表会留下无归属数据。
    async function deleteConversation(id: number) {
        await db.messages.where('conversationId').equals(id).delete()
        await db.conversations.delete(id)
        conversations.value = conversations.value.filter(c => c.id !== id)
        if (currentId.value === id) {
            currentId.value = conversations.value[0]?.id ?? null
        }
    }

    // 当会话 updatedAt 改变后，重新读取列表可以让侧边栏排序保持正确。
    async function refreshList() {
        const list = await db.conversations.orderBy('updatedAt').reverse().toArray()
        conversations.value = list as Conversation[]
    }

    return {
        conversations,
        currentId,
        loadAll,
        createConversation,
        selectConversation,
        deleteConversation,
        refreshList,
    }
}
