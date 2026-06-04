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

const KNOWLEDGE_UPLOAD_ENDPOINT = '/api/upload'
const KNOWLEDGE_FILE_FIELD = 'file'

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
        response = await fetch(endpoint, {
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
    const events = new EventSource(`/api/upload/progress/${encodeURIComponent(progressId)}`)
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response
    try {
        response = await fetch(path, init)
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
