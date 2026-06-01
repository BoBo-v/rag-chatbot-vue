export interface KnowledgeUploadResult {
    fileName: string
    ok: boolean
    message?: string
    charCount?: number
    chunkCount?: number
}

const KNOWLEDGE_UPLOAD_ENDPOINT = '/api/upload'
const KNOWLEDGE_FILE_FIELD = 'file'

export async function uploadKnowledgeFile(file: File): Promise<KnowledgeUploadResult> {
    const formData = new FormData()
    formData.append(KNOWLEDGE_FILE_FIELD, file, file.name)

    let response: Response
    try {
        response = await fetch(KNOWLEDGE_UPLOAD_ENDPOINT, {
            method: 'POST',
            body: formData,
        })
    } catch (error) {
        return {
            fileName: file.name,
            ok: false,
            message: error instanceof Error ? error.message : '无法连接知识库上传接口',
        }
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '')
        return {
            fileName: file.name,
            ok: false,
            message: text || `上传失败: ${response.status}`,
        }
    }

    return {
        fileName: file.name,
        ok: true,
        ...(await readResponseData(response)),
    }
}

async function readResponseData(response: Response): Promise<Pick<KnowledgeUploadResult, 'message' | 'charCount' | 'chunkCount'>> {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
        const data = await response.json().catch(() => null)
        return {
            message: typeof data?.message === 'string'
                ? data.message
                : typeof data?.detail === 'string'
                    ? data.detail
                    : undefined,
            charCount: typeof data?.charCount === 'number' ? data.charCount : undefined,
            chunkCount: typeof data?.chunkCount === 'number' ? data.chunkCount : undefined,
        }
    }

    const text = await response.text().catch(() => '')
    return { message: text || undefined }
}
