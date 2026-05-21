import type { DBSearchDoc } from '../db'

const TITLE_BOOST = 3
const USER_MESSAGE_BOOST = 1.4
const ASSISTANT_MESSAGE_BOOST = 1

export function scoreDoc(doc: DBSearchDoc, queryTerms: string[], matchedTerms: Set<string>): number {
    if (matchedTerms.size === 0) return 0

    let score = 0
    const title = doc.title.toLowerCase()
    const content = doc.content.toLowerCase()

    for (const term of queryTerms) {
        if (!matchedTerms.has(term)) continue
        if (title.includes(term)) score += TITLE_BOOST
        if (content.includes(term)) score += 1
    }

    score *= doc.role === 'user' ? USER_MESSAGE_BOOST : ASSISTANT_MESSAGE_BOOST
    score += Math.min(0.25, 1 / Math.max(1, doc.length))
    return score
}

export function createSnippet(content: string, terms: string[], maxLength = 120): string {
    if (!content) return ''

    const lowerContent = content.toLowerCase()
    const firstHit = terms
        .map(term => lowerContent.indexOf(term))
        .filter(index => index >= 0)
        .sort((a, b) => a - b)[0]

    if (firstHit === undefined) {
        return content.length > maxLength ? `${content.slice(0, maxLength)}...` : content
    }

    const start = Math.max(0, firstHit - 32)
    const end = Math.min(content.length, start + maxLength)
    const prefix = start > 0 ? '...' : ''
    const suffix = end < content.length ? '...' : ''
    return `${prefix}${content.slice(start, end)}${suffix}`
}
