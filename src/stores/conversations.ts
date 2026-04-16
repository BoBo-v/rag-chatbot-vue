import { ref } from 'vue'
import { db } from '../db'
import type { Conversation } from '../types/chat'

// 模块级单例 —— 所有调用共享同一份状态
const conversations = ref<Conversation[]>([])
const currentId = ref<number | null>(null)

export function useConversations() {
    async function loadAll() {
        const list = await db.conversations.orderBy('updatedAt').reverse().toArray()
        conversations.value = list as Conversation[]
    }

    async function createConversation(title = '新对话'): Promise<number> {
        const now = Date.now()
        const id = await db.conversations.add({ title, createdAt: now, updatedAt: now })
        const conv: Conversation = { id: id as number, title, createdAt: now, updatedAt: now }
        conversations.value.unshift(conv)
        currentId.value = id as number
        return id as number
    }

    function selectConversation(id: number) {
        currentId.value = id
    }

    async function deleteConversation(id: number) {
        await db.messages.where('conversationId').equals(id).delete()
        await db.conversations.delete(id)
        conversations.value = conversations.value.filter(c => c.id !== id)
        if (currentId.value === id) {
            currentId.value = conversations.value[0]?.id ?? null
        }
    }

    /** 重新从 DB 拉取列表（用于更新 updatedAt 排序） */
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
