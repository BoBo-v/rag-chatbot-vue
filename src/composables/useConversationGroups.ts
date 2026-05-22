import { computed, type Ref } from 'vue'
import { settings } from '../stores/settings'
import type { Conversation } from '../types/chat'

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

export function useConversationGroups(conversations: Ref<Conversation[]>) {
    const groupedConversations = computed(() => {
        const groups: { label: string; items: Conversation[] }[] = []
        let currentLabel = ''
        for (const conv of conversations.value) {
            const label = getDateLabel(conv.updatedAt)
            if (label !== currentLabel) {
                currentLabel = label
                groups.push({ label, items: [] })
            }
            groups[groups.length - 1].items.push(conv)
        }
        return groups
    })

    const currentModelName = computed(() => {
        const p = settings.provider
        if (p === 'ollama') return settings.ollama.model
        if (p === 'openai') return settings.openai.model
        return settings.claude.model
    })

    return { groupedConversations, currentModelName }
}
