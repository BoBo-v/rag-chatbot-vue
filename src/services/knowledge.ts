export interface StoredKnowledgeFile {
    id: string
    filename: string
    mimeType: string
    size: number
    charCount: number
    chunkCount: number
    createdAt: string
    contentHash?: string
}

export interface KnowledgeChunk {
    id: string
    fileId: string
    filename: string
    chunkIndex: number
    text: string
    createdAt?: string
    pageNumber?: number
    embeddingSize?: number
}

export interface KnowledgeFileDetail extends StoredKnowledgeFile {
    chunks: KnowledgeChunk[]
}

export interface KnowledgeSearchResult {
    id: string
    fileId: string
    filename: string
    chunkIndex: number
    score: number
    vectorScore: number
    keywordScore: number
    text: string
    pageNumber?: number
}

export interface KnowledgeUploadResult {
    fileName: string
    ok: boolean
    message?: string
    file?: StoredKnowledgeFile
    chunks?: { text: string; chunkIndex: number }[]
    charCount?: number
    chunkCount?: number
    deduplicated?: boolean
    overwritten?: boolean
}

export type UploadProgressPhase = 'receiving' | 'parsing' | 'chunking' | 'embedding' | 'storing' | 'completed' | 'failed'

export interface UploadProgress {
    id: string
    phase: UploadProgressPhase
    percent: number
    message: string
    loaded?: number
    total?: number
    done: boolean
    error?: string
    updatedAt: string
}

export interface KnowledgeUploadOptions {
    overwrite?: boolean
    onProgress?: (progress: UploadProgress) => void
}

export interface KnowledgeSearchOptions {
    q: string
    topK?: number
    minScore?: number
    fileId?: string
}

import { reactive } from 'vue'
import { apiFetch, apiUrl, resolveTargetBaseUrl } from './api'
import { useAuthStore } from '../stores/auth'
import type { BackendChatProvider, BackendProvidersCatalog } from '../types/connection'
export type { BackendChatProvider, BackendProvidersCatalog, CatalogState } from '../types/connection'

export interface VectorStoreStatus {
    currentEmbeddingModel?: string
    fileCount?: number
    chunkCount?: number
    compatibleChunkCount?: number
    incompatibleChunkCount?: number
    needsReindex?: boolean
    embeddingDistributions?: Array<{
        embeddingModel: string
        embeddingDim: number | null
        chunkCount: number
    }>
}

const KNOWLEDGE_UPLOAD_ENDPOINT = '/api/upload'
const KNOWLEDGE_FILE_FIELD = 'file'

export interface GetBackendProvidersCatalogOptions {
    baseUrl?: string
    forceRefresh?: boolean
    signal?: AbortSignal
    skipAuthInterception?: boolean
}

interface CatalogCacheEntry {
    catalog: BackendProvidersCatalog
    lastSuccessCatalog?: BackendProvidersCatalog
    seq: number
    sessionVersion: number
    currentPromise: Promise<BackendProvidersCatalog> | null
    abortController: AbortController | null
}

let globalSessionVersion = 0
const catalogCacheMap = new Map<string, CatalogCacheEntry>()

function getCurrentUsername(): string {
    try {
        const authStore = useAuthStore()
        return authStore.user?.value?.username || 'anonymous'
    } catch {
        return 'anonymous'
    }
}

export function buildCatalogCacheKey(baseUrl?: string): string {
    const resolvedUrl = resolveTargetBaseUrl(baseUrl)
    const username = getCurrentUsername()
    return `${resolvedUrl}|${username}`
}

export const sharedCatalogState = reactive<Record<string, BackendProvidersCatalog>>({})

export function getSharedBackendProvidersCatalog(baseUrl?: string): BackendProvidersCatalog {
    const key = buildCatalogCacheKey(baseUrl)
    return sharedCatalogState[key] || {
        state: 'idle',
        baseUrl: resolveTargetBaseUrl(baseUrl),
        providers: [],
    }
}

export function getCachedBackendProvidersCatalog(baseUrl?: string): BackendProvidersCatalog | undefined {
    const key = buildCatalogCacheKey(baseUrl)
    return catalogCacheMap.get(key)?.catalog || sharedCatalogState[key]
}

export function resetBackendProvidersCatalog(): void {
    globalSessionVersion++
    for (const entry of catalogCacheMap.values()) {
        if (entry.abortController) {
            entry.abortController.abort()
            entry.abortController = null
        }
        entry.currentPromise = null
    }
    catalogCacheMap.clear()
    for (const key of Object.keys(sharedCatalogState)) {
        delete sharedCatalogState[key]
    }
}

export async function getBackendProvidersCatalog(
    options: GetBackendProvidersCatalogOptions = {}
): Promise<BackendProvidersCatalog> {
    const resolvedUrl = resolveTargetBaseUrl(options.baseUrl)
    const usernameAtStart = getCurrentUsername()
    const sessionVersionAtStart = globalSessionVersion
    const key = `${resolvedUrl}|${usernameAtStart}`

    let entry = catalogCacheMap.get(key)
    if (!entry) {
        entry = {
            catalog: {
                state: 'idle',
                baseUrl: resolvedUrl,
                providers: [],
            },
            seq: 0,
            sessionVersion: sessionVersionAtStart,
            currentPromise: null,
            abortController: null,
        }
        catalogCacheMap.set(key, entry)
    }

    if (!options.forceRefresh && entry.catalog.state === 'success') {
        return entry.catalog
    }

    if (!options.forceRefresh && entry.currentPromise) {
        return entry.currentPromise
    }

    if (options.forceRefresh && entry.abortController) {
        entry.abortController.abort()
        entry.abortController = null
    }

    const mySeq = ++entry.seq
    const controller = new AbortController()
    entry.abortController = controller
    entry.catalog = {
        state: 'loading',
        baseUrl: resolvedUrl,
        providers: entry.catalog.providers,
    }
    sharedCatalogState[key] = entry.catalog

    const promise = (async () => {
        let abortListener: (() => void) | undefined
        if (options.signal) {
            if (options.signal.aborted) {
                controller.abort(options.signal.reason)
            } else {
                abortListener = () => controller.abort(options.signal?.reason)
                options.signal.addEventListener('abort', abortListener, { once: true })
            }
        }

        try {
            const res = await apiFetch('/api/providers', {
                method: 'GET',
                signal: controller.signal,
            }, {
                baseUrl: resolvedUrl,
                skipAuthInterception: options.skipAuthInterception,
            })

            if (!res.ok) {
                const errMsg = await readErrorMessage(res)
                throw new Error(errMsg)
            }

            const data = await readJson<{ providers?: BackendChatProvider[] }>(res)
            const providers = Array.isArray(data?.providers) ? data.providers : []

            const currentEntry = catalogCacheMap.get(key)
            const nowUsername = getCurrentUsername()

            // 提交结果防污染校验：
            // 会话版本必须匹配、该 Key 的最新序号必须匹配、当前用户身份必须匹配
            if (
                sessionVersionAtStart !== globalSessionVersion
                || !currentEntry
                || currentEntry.seq !== mySeq
                || nowUsername !== usernameAtStart
            ) {
                const staleErr = new Error('CATALOG_REQUEST_SUPERSEDED')
                ;(staleErr as any).name = 'AbortError'
                throw staleErr
            }

            const successCatalog: BackendProvidersCatalog = {
                state: 'success',
                baseUrl: resolvedUrl,
                providers,
            }
            currentEntry.catalog = successCatalog
            currentEntry.lastSuccessCatalog = successCatalog
            sharedCatalogState[key] = successCatalog
            return successCatalog
        } catch (err: unknown) {
            const currentEntry = catalogCacheMap.get(key)
            const nowUsername = getCurrentUsername()
            const isStale = (
                sessionVersionAtStart !== globalSessionVersion
                || !currentEntry
                || currentEntry.seq !== mySeq
                || nowUsername !== usernameAtStart
            )

            if (!isStale && currentEntry) {
                if (controller.signal.aborted) {
                    // 主动取消不覆盖为永久 error 状态；若此前已有成功目录则恢复成功状态，首次取消保持 idle
                    if (currentEntry.catalog.state === 'loading') {
                        if (currentEntry.lastSuccessCatalog) {
                            currentEntry.catalog = currentEntry.lastSuccessCatalog
                        } else {
                            currentEntry.catalog = {
                                state: 'idle',
                                baseUrl: resolvedUrl,
                                providers: currentEntry.catalog.providers,
                            }
                        }
                        sharedCatalogState[key] = currentEntry.catalog
                    }
                } else {
                    currentEntry.catalog = {
                        state: 'error',
                        baseUrl: resolvedUrl,
                        providers: [],
                        error: err instanceof Error ? err.message : String(err),
                    }
                    sharedCatalogState[key] = currentEntry.catalog
                }
            }
            throw err
        } finally {
            if (abortListener && options.signal) {
                options.signal.removeEventListener('abort', abortListener)
            }
            const currentEntry = catalogCacheMap.get(key)
            if (currentEntry && currentEntry.seq === mySeq) {
                currentEntry.currentPromise = null
                currentEntry.abortController = null
            }
        }
    })()

    entry.currentPromise = promise
    return promise
}

export async function uploadKnowledgeFile(file: File, options: KnowledgeUploadOptions = {}): Promise<KnowledgeUploadResult> {
    const formData = new FormData()
    formData.append(KNOWLEDGE_FILE_FIELD, file, file.name)

    const progressId = options.onProgress ? createProgressId() : undefined
    const events = progressId && options.onProgress
        ? subscribeUploadProgress(progressId, options.onProgress)
        : undefined
    const params = new URLSearchParams()
    if (options.overwrite) params.set('overwrite', 'true')
    if (progressId) params.set('progressId', progressId)
    const endpoint = params.size > 0
        ? `${KNOWLEDGE_UPLOAD_ENDPOINT}?${params.toString()}`
        : KNOWLEDGE_UPLOAD_ENDPOINT

    let response: Response
    try {
        response = await apiFetch(endpoint, {
            method: 'POST',
            body: formData,
        })
    } catch (error) {
        events?.close()
        return {
            fileName: file.name,
            ok: false,
            message: error instanceof Error ? error.message : '无法连接知识库上传接口',
        }
    }

    if (!response.ok) {
        events?.close()
        return {
            fileName: file.name,
            ok: false,
            message: await readErrorMessage(response),
        }
    }

    const data = await readJson<{
        message?: string
        detail?: string
        file?: StoredKnowledgeFile
        chunks?: { text: string; chunkIndex: number }[]
        deduplicated?: boolean
        overwritten?: boolean
    }>(response)
    events?.close()
    return {
        fileName: file.name,
        ok: true,
        message: data?.message ?? data?.detail,
        file: data?.file,
        chunks: data?.chunks,
        charCount: data?.file?.charCount,
        chunkCount: data?.file?.chunkCount ?? data?.chunks?.length,
        deduplicated: data?.deduplicated,
        overwritten: data?.overwritten,
    }
}

function subscribeUploadProgress(
    progressId: string,
    onProgress: (progress: UploadProgress) => void
): EventSource {
    const events = new EventSource(apiUrl(`/api/upload/progress/${encodeURIComponent(progressId)}`), {
        withCredentials: true,
    })
    events.addEventListener('progress', event => {
        const progress = JSON.parse(event.data) as UploadProgress
        onProgress(progress)
        if (progress.done) events.close()
    })
    events.onerror = () => {
        events.close()
    }
    return events
}

function createProgressId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return Math.random().toString(36).slice(2)
}

export async function listKnowledgeFiles(): Promise<StoredKnowledgeFile[]> {
    const data = await fetchJson<{ files: StoredKnowledgeFile[] }>('/api/files')
    return data.files ?? []
}

export async function getKnowledgeFile(id: string): Promise<KnowledgeFileDetail> {
    const data = await fetchJson<{ file: KnowledgeFileDetail }>(`/api/files/${encodeURIComponent(id)}`)
    return data.file
}

export async function deleteKnowledgeFile(id: string): Promise<boolean> {
    const data = await fetchJson<{ ok: boolean }>(`/api/files/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    })
    return data.ok
}

export async function searchKnowledge(options: KnowledgeSearchOptions): Promise<KnowledgeSearchResult[]> {
    const params = new URLSearchParams()
    params.set('q', options.q)
    if (options.topK !== undefined) params.set('topK', String(options.topK))
    if (options.minScore !== undefined) params.set('minScore', String(options.minScore))
    if (options.fileId) params.set('fileId', options.fileId)

    const data = await fetchJson<{ results: KnowledgeSearchResult[] }>(`/api/search?${params.toString()}`)
    return data.results ?? []
}

export async function fetchBackendChatProviders(options?: { baseUrl?: string; skipAuthInterception?: boolean }): Promise<BackendChatProvider[]> {
    const catalog = await getBackendProvidersCatalog(options)
    return catalog.providers
}

export async function getVectorStoreStatus(): Promise<VectorStoreStatus> {
    const data = await fetchJson<VectorStoreStatus & { status?: VectorStoreStatus }>('/api/vector-store/status')
    return data.status ?? data
}

async function fetchJson<T>(path: string, init?: RequestInit, options?: { baseUrl?: string }): Promise<T> {
    let response: Response
    try {
        response = await apiFetch(path, init, options)
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : '无法连接知识库接口', { cause: error })
    }

    if (!response.ok) {
        throw new Error(await readErrorMessage(response))
    }

    const data = await readJson<T>(response)
    if (!data) throw new Error('知识库接口返回为空')
    return data
}

async function readJson<T>(response: Response): Promise<T | null> {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return null
    return response.json().catch(() => null)
}

async function readErrorMessage(response: Response): Promise<string> {
    const data = await readJson<{ error?: string; message?: string }>(response)
    if (data?.error) return data.error
    if (data?.message) return data.message
    const text = await response.text().catch(() => '')
    return text || `请求失败: ${response.status}`
}
