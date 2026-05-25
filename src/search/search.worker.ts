import { db, type DBMessage, type DBSearchDoc } from '../db'
import type { Conversation } from '../types/chat'
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

const SEARCH_INDEX_VERSION = '2'
const resultCache = new LruCache<string, SearchResult[]>(100)
let rebuildPromise: Promise<void> | null = null

// 搜索 worker 运行在后台线程，避免 IndexedDB 查询和索引计算阻塞聊天 UI。
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    void handleRequest(event.data)
})

async function handleRequest(request: WorkerRequest): Promise<void> {
    try {
        let payload: unknown

        switch (request.type) {
            // 写入/更新一条消息的搜索索引。
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
            case 'ENSURE_INDEX':
                await ensureIndex()
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
    // 写新索引前先确保旧索引已升级，避免新旧版本混在一起。
    await ensureIndex()
    await putSearchDoc(input)
}

type SearchableMessage = Pick<DBMessage, 'id' | 'role' | 'content' | 'files' | 'images'>

interface PutSearchDocInput {
    message: SearchableMessage
    conversation: Conversation
    createdAt?: number
    updatedAt?: number
    tags?: string[]
}

async function putSearchDoc(input: PutSearchDocInput, markIndexReady = true): Promise<void> {
    const { message, conversation } = input
    const createdAt = input.createdAt ?? Date.now()
    const updatedAt = input.updatedAt ?? conversation.updatedAt ?? createdAt
    const tags = input.tags ?? []
    const content = getSearchableMessageContent(message)
    // 搜索词来自“会话标题 + 消息内容 + 附件文本/文件名”。
    const terms = tokenize(`${conversation.title} ${content}`)
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
                // 同一条消息可能被重试或继续生成后再次索引，先删旧文档再写新文档。
                await removeDoc(existing.docId)
            }

            const docId = await db.searchDocs.add({
                messageId: message.id,
                conversationId: conversation.id,
                role: message.role,
                title: conversation.title,
                content,
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

            if (markIndexReady) {
                await db.searchMeta.put({ key: 'indexVersion', value: SEARCH_INDEX_VERSION })
            }
        },
    )

    resultCache.clear()
}

function getSearchableMessageContent(message: Pick<DBMessage, 'content' | 'files' | 'images'>): string {
    // 让上传文件的文件名/内容、图片名也能被侧边栏搜索到。
    const fileText = message.files
        ?.map(file => `${file.name} ${file.content}`)
        .join(' ') ?? ''
    const imageText = message.images
        ?.map(image => image.name)
        .join(' ') ?? ''
    return [message.content, fileText, imageText].filter(Boolean).join(' ')
}

async function removeDoc(docId: number): Promise<void> {
    // 删除搜索文档时必须同时清理倒排索引和标签索引。
    const oldTerms = await db.searchTerms.where('docId').equals(docId).toArray()
    await db.searchTerms.where('docId').equals(docId).delete()
    await db.searchTags.where('docId').equals(docId).delete()
    await db.searchDocs.delete(docId)
    await Promise.all([...new Set(oldTerms.map(row => row.term))].map(refreshTermStat))
}

async function refreshTermStat(term: string): Promise<void> {
    // 重新计算一个词出现在多少个文档里。
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
    await ensureIndex()
    const queryTerms = tokenize(input.query)
    const limit = input.limit ?? 20
    const filtersHash = JSON.stringify(input.filters ?? {})
    const cacheKey = JSON.stringify({ terms: queryTerms, filters: input.filters ?? {}, limit })
    const cached = resultCache.get(cacheKey)
    if (cached) return cached

    if (queryTerms.length === 0) return []

    // 倒排索引查询：先查每个词对应的 docId，再合并候选文档。
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
    const resultsByConversation = new Map<number, SearchResult>()

    for (const doc of docs) {
        if (!doc || doc.docId === undefined) continue
        if (!matchesFilters(doc, input)) continue

        const matchedTerms = candidateScores.get(doc.docId)
        if (!matchedTerms) continue

        const result = {
            conversationId: doc.conversationId,
            messageId: doc.messageId,
            title: doc.title,
            snippet: createSnippet(doc.content, queryTerms),
            score: scoreDoc(doc, queryTerms, matchedTerms),
            updatedAt: doc.updatedAt,
        }
        const existing = resultsByConversation.get(doc.conversationId)
        // 侧边栏按“会话”展示，所以同一会话多条消息命中时只保留最佳结果。
        if (!existing || result.score > existing.score || (result.score === existing.score && result.updatedAt > existing.updatedAt)) {
            resultsByConversation.set(doc.conversationId, result)
        }
    }

    const results = [...resultsByConversation.values()]
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
    // 完整重建索引：先读取所有会话和消息，再清空搜索表，最后逐条重新写入。
    const conversations = await db.conversations.toArray()
    const conversationsById = new Map(
        conversations
            .filter(conversation => conversation.id !== undefined)
            .map(conversation => [conversation.id!, conversation]),
    )
    const messages = await db.messages.toArray()

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
            // 重建完成前先删除版本号，防止中途失败后被误认为索引可用。
            await db.searchMeta.delete('indexVersion')
        },
    )

    for (const message of messages) {
        const conversation = conversationsById.get(message.conversationId)
        if (!conversation || conversation.id === undefined) continue
        await putSearchDoc({
            message,
            conversation: {
                id: conversation.id,
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
            },
            createdAt: message.createdAt,
            updatedAt: conversation.updatedAt,
        }, false)
    }
    await db.searchMeta.put({ key: 'indexVersion', value: SEARCH_INDEX_VERSION })
    resultCache.clear()
}

async function ensureIndex(): Promise<void> {
    // 如果版本号不一致，说明索引结构或内容规则变了，需要重建。
    const meta = await db.searchMeta.get('indexVersion')
    if (meta?.value === SEARCH_INDEX_VERSION) return
    if (!rebuildPromise) {
        rebuildPromise = rebuildIndex().finally(() => {
            rebuildPromise = null
        })
    }
    await rebuildPromise
}

function postResponse(response: WorkerResponse): void {
    self.postMessage(response)
}
