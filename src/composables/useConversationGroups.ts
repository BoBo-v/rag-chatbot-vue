import { computed, type Ref } from 'vue'
import { settings } from '../stores/settings'
import type { Conversation } from '../types/chat'

// 把时间戳转换成侧边栏更友好的分组标题，例如“今天”“昨天”“上周”。
export function getDateLabel(timestamp: number): string {
    const now = new Date()
    const date = new Date(timestamp)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000)

    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays <= 7) return `${diffDays}天前`
    if (diffDays <= 14) return '上周'
    if (diffDays <= 30) return '上月'
    return `${date.getFullYear()}/${date.getMonth() + 1}`
}

// 这个 composable 专门服务侧边栏：
// groupedConversations 负责按日期分组；currentModelName 负责显示当前模型名。
export function useConversationGroups(conversations: Ref<Conversation[]>) {
    const groupedConversations = computed(() => {
        const groups: { label: string; items: Conversation[] }[] = []
        let currentLabel = ''
        for (const conv of conversations.value) {
            const label = getDateLabel(conv.updatedAt)
            // conversations 已经按 updatedAt 排好序，所以遍历时只要遇到新 label 就开新组。
            if (label !== currentLabel) {
                currentLabel = label
                groups.push({ label, items: [] })
            }
            groups[groups.length - 1].items.push(conv)
        }
        return groups
    })

    const currentModelName = computed(() => {
        if (settings.transport === 'backend') {
            return `${settings.backend.provider} / ${settings.backend.model || settings.ollama.model}`
        }

        const p = settings.provider
        if (p === 'ollama') {
            return settings.ollama.model
        }
        if (p === 'openai') return settings.openai.model
        return settings.claude.model
    })

    return { groupedConversations, currentModelName }
}
