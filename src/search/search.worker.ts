import { db, type DBSearchDoc } from '../db'
import { countTerms, tokenize } from './tokenizer'
import { createSnippet, scoreDoc } from './ranker'
import { LruCache } from './cache'
import type {
    RecentSearch,
    SearchIndexInput,
    SearchQuery,
    SearchResult,
    WorkerRequest,
    WorkerResponse,
} from './types'

const SEARCH_INDEX_VERSION = '1'
const resultCache = new LruCache<string, SearchResult[]>(100)

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    void handleRequest(event.data)
})

async function handleRequest(request: WorkerRequest): Promise<void> {
    try {
        let payload: unknown

        switch (request.type) {
            case 'INDEX_MESSAGE':
                await indexMessage(request.payload)
                break
            case 'DELETE_CONVERSATION':
                await deleteConversationIndex(request.payload.conversationId)
                break
            case 'SEARCH':
                payload = await search(request.payload)
                break
            case 'SUGGEST':
                payload = await suggest(request.payload.prefix, request.payload.limit)
                break
            case 'GET_RECENT_SEARCHES':
                payload = await getRecentSearches(request.payload?.limit)
                break
            case 'CLEAR_RECENT_SEARCHES':
                await db.recentSearches.clear()
                break
            case 'REBUILD_INDEX':
                await rebuildIndex()
                break
        }

        postResponse({ type: 'SUCCESS', requestId: request.requestId, payload })
    } catch (err: unknown) {
        postResponse({
            type: 'ERROR',
            requestId: request.requestId,
            error: err instanceof Error ? err.message : String(err),
        })
    }
}

async function indexMessage(input: SearchIndexInput): Promise<void> {
    const { message, conversation } = input
    const createdAt = input.createdAt ?? Date.now()
    const updatedAt = input.updatedAt ?? conversation.updatedAt ?? createdAt
    const tags = input.tags ?? []
    const terms = tokenize(`${conversation.title} ${message.content}`)
    const termCounts = countTerms(terms)

    await db.transaction(
        'rw',
        [
            db.searchDocs,
            db.searchTerms,
            db.searchTermStats,
            db.searchTags,
            db.searchMeta,
        ],
        async () => {
            const existing = await db.searchDocs.where('messageId').equals(message.id).first()
            if (existing?.docId !== undefined) {
                await removeDoc(existing.docId)
            }

            const docId = await db.searchDocs.add({
                messageId: message.id,
                conversationId: conversation.id,
                role: message.role,
                title: conversation.title,
                content: message.content,
                createdAt,
                updatedAt,
                length: Math.max(terms.length, 1),
                tags,
            })

            const termRows = Array.from(termCounts.entries()).map(([term, stat]) => ({
                term,
                docId,
                tf: stat.tf,
                positions: stat.positions,
            }))

            if (termRows.length > 0) {
                await db.searchTerms.bulkPut(termRows)
                await Promise.all(termRows.map(row => refreshTermStat(row.term)))
            }

            if (tags.length > 0) {
                await db.searchTags.bulkPut(tags.map(tag => ({ tag, docId })))
            }

            await db.searchMeta.put({ key: 'indexVersion', value: SEARCH_INDEX_VERSION })
        },
    )

    resultCache.clear()
}

async function removeDoc(docId: number): Promise<void> {
    const oldTerms = await db.searchTerms.where('docId').equals(docId).toArray()
    await db.searchTerms.where('docId').equals(docId).delete()
    await db.searchTags.where('docId').equals(docId).delete()
    await db.searchDocs.delete(docId)
    await Promise.all([...new Set(oldTerms.map(row => row.term))].map(refreshTermStat))
}

async function refreshTermStat(term: string): Promise<void> {
    const df = await db.searchTerms.where('term').equals(term).count()
    if (df === 0) {
        await db.searchTermStats.delete(term)
        return
    }
    await db.searchTermStats.put({ term, df, updatedAt: Date.now() })
}

async function deleteConversationIndex(conversationId: number): Promise<void> {
    const docs = await db.searchDocs.where('conversationId').equals(conversationId).toArray()
    await db.transaction('rw', db.searchDocs, db.searchTerms, db.searchTermStats, db.searchTags, async () => {
        for (const doc of docs) {
            if (doc.docId !== undefined) await removeDoc(doc.docId)
        }
    })
    resultCache.clear()
}

async function search(input: SearchQuery): Promise<SearchResult[]> {
    const queryTerms = tokenize(input.query)
    const limit = input.limit ?? 20
    const filtersHash = JSON.stringify(input.filters ?? {})
    const cacheKey = JSON.stringify({ terms: queryTerms, filters: input.filters ?? {}, limit })
    const cached = resultCache.get(cacheKey)
    if (cached) return cached

    if (queryTerms.length === 0) return []

    const postings = await Promise.all(
        queryTerms.map(term => db.searchTerms.where('term').equals(term).toArray()),
    )
    const candidateScores = new Map<number, Set<string>>()

    postings.forEach((rows, index) => {
        const term = queryTerms[index]
        for (const row of rows) {
            const matched = candidateScores.get(row.docId) ?? new Set<string>()
            matched.add(term)
            candidateScores.set(row.docId, matched)
        }
    })

    const docs = await db.searchDocs.bulkGet([...candidateScores.keys()])
    const results: SearchResult[] = []

    for (const doc of docs) {
        if (!doc || doc.docId === undefined) continue
        if (!matchesFilters(doc, input)) continue

        const matchedTerms = candidateScores.get(doc.docId)
        if (!matchedTerms) continue

        results.push({
            conversationId: doc.conversationId,
            messageId: doc.messageId,
            title: doc.title,
            snippet: createSnippet(doc.content, queryTerms),
            score: scoreDoc(doc, queryTerms, matchedTerms),
            updatedAt: doc.updatedAt,
        })
    }

    results.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    const topResults = results.slice(0, limit)
    resultCache.set(cacheKey, topResults)
    await rememberSearch(input.query, filtersHash, topResults.length)
    return topResults
}

function matchesFilters(doc: DBSearchDoc, input: SearchQuery): boolean {
    const filters = input.filters
    if (!filters) return true
    if (filters.role && filters.role !== 'all' && doc.role !== filters.role) return false
    if (filters.from !== undefined && doc.createdAt < filters.from) return false
    if (filters.to !== undefined && doc.createdAt > filters.to) return false
    if (filters.tags?.length) {
        const tagSet = new Set(doc.tags)
        if (!filters.tags.every(tag => tagSet.has(tag))) return false
    }
    return true
}

async function suggest(prefix: string, limit = 8): Promise<string[]> {
    const normalizedPrefix = tokenize(prefix)[0]
    if (!normalizedPrefix) return []

    const terms = await db.searchTermStats
        .where('term')
        .startsWith(normalizedPrefix)
        .reverse()
        .sortBy('df')

    return terms.slice(0, limit).map(term => term.term)
}

async function rememberSearch(query: string, filtersHash: string, hitCount: number): Promise<void> {
    const trimmed = query.trim()
    if (!trimmed) return

    const existing = await db.recentSearches
        .where('query')
        .equals(trimmed)
        .filter(item => item.filtersHash === filtersHash)
        .first()

    if (existing?.id !== undefined) {
        await db.recentSearches.update(existing.id, { usedAt: Date.now(), hitCount })
    } else {
        await db.recentSearches.add({ query: trimmed, filtersHash, usedAt: Date.now(), hitCount })
    }
}

async function getRecentSearches(limit = 10): Promise<RecentSearch[]> {
    const rows = await db.recentSearches.orderBy('usedAt').reverse().limit(limit).toArray()
    return rows.map(row => ({
        query: row.query,
        filtersHash: row.filtersHash,
        usedAt: row.usedAt,
        hitCount: row.hitCount,
    }))
}

async function rebuildIndex(): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.searchDocs,
            db.searchTerms,
            db.searchTermStats,
            db.searchTags,
            db.searchMeta,
        ],
        async () => {
            await db.searchDocs.clear()
            await db.searchTerms.clear()
            await db.searchTermStats.clear()
            await db.searchTags.clear()
            await db.searchMeta.put({ key: 'indexVersion', value: SEARCH_INDEX_VERSION })
        },
    )
    resultCache.clear()
}

function postResponse(response: WorkerResponse): void {
    self.postMessage(response)
}
