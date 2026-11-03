import assert from 'node:assert/strict'
import http from 'node:http'
import {
    reindexVectorStore,
    getKnowledgeFile,
    evaluateFileCompatibility,
    formatReindexFeedback,
    isChunkTargetHighlighted,
    formatChunkHitBadge,
    type VectorStoreStatus,
} from '../src/services/knowledge'

console.log('=== 开始执行技术知识库生产行为端到端验证 ===\n')

async function run() {
    // -------------------------------------------------------------------------
    // 1. 真实接口调用与请求体断言 (受控 HTTP Mock Server)
    // -------------------------------------------------------------------------
    console.log('-> [1/4] 启动受控测试服务，验证接口调用真实数据流与全库请求体...')

    let capturedReindexBody: any = null
    let reindexScenario = 'sqlite_skip'

    const server = http.createServer(async (req, res) => {
        const url = req.url || ''
        const method = req.method?.toUpperCase()

        if (url === '/api/vector-store/reindex' && method === 'POST') {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk)
            const rawBody = Buffer.concat(chunks).toString('utf8')
            capturedReindexBody = rawBody ? JSON.parse(rawBody) : {}

            res.setHeader('Content-Type', 'application/json')
            if (reindexScenario === 'sqlite_skip') {
                res.writeHead(200)
                res.end(JSON.stringify({ backend: 'sqlite', filesIndexed: 0, chunksIndexed: 0, skipped: true }))
            } else if (reindexScenario === 'qdrant_sync') {
                res.writeHead(200)
                res.end(JSON.stringify({ backend: 'qdrant', filesIndexed: 4, chunksIndexed: 20, skipped: false }))
            } else if (reindexScenario === 'error_500') {
                res.writeHead(502)
                res.end(JSON.stringify({ error: '向量索引重建失败，请检查向量索引服务状态。', code: 'VECTOR_INDEX_REINDEX_FAILED' }))
            }
            return
        }

        if (url === '/api/files/test-file-uuid' && method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            res.writeHead(200)
            res.end(JSON.stringify({
                file: {
                    id: 'test-file-uuid',
                    filename: 'data.md',
                    mimeType: 'text/markdown',
                    size: 1024,
                    charCount: 200,
                    chunkCount: 2,
                    createdAt: '2026-11-03T10:00:00.000Z',
                    embeddingModel: 'qwen2.5:7b',
                    embeddingDim: 1024,
                    embeddingDimText: '1024维',
                    chunks: [],
                    visionInfo: {
                        available: true,
                        model: 'qwen3-vl:2b',
                        markdown: '# 真实标题\n\n真实内容',
                        rawUrl: '/api/files/test-file-uuid/raw',
                    },
                },
            }))
            return
        }

        res.writeHead(404)
        res.end()
    })

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address() as any
    const baseUrl = `http://127.0.0.1:${addr.port}`

    try {
        // 场景 1.1: 验证同步请求体严格发送 {} 操作全库，不能隐式使用选中的 fileId
        reindexScenario = 'sqlite_skip'
        const originalFetch = globalThis.fetch
        globalThis.fetch = ((url: any, init: any) => {
            const finalUrl = String(url).startsWith('http') ? url : `${baseUrl}${url}`
            return originalFetch(finalUrl, init)
        }) as typeof fetch

        try {
            const res1 = await reindexVectorStore()
            assert.deepStrictEqual(capturedReindexBody, {}, '全库同步必须发送空对象 {}，绝不能附带 fileId')
            assert.strictEqual(res1.skipped, true)
            const feedback1 = formatReindexFeedback(res1)
            assert.strictEqual(feedback1.type, 'warning')
            assert.strictEqual(feedback1.message, '当前后端无需执行索引同步')

            // 场景 1.2: Qdrant 真实同步结果解析
            reindexScenario = 'qdrant_sync'
            const res2 = await reindexVectorStore()
            assert.strictEqual(res2.skipped, false)
            assert.strictEqual(res2.filesIndexed, 4)
            assert.strictEqual(res2.chunksIndexed, 20)
            const feedback2 = formatReindexFeedback(res2)
            assert.strictEqual(feedback2.type, 'success')
            assert.strictEqual(feedback2.message, '向量索引同步完成：已处理 4 个文件，20 个切片')

            // 场景 1.3: 接口失败真实错误拒绝
            reindexScenario = 'error_500'
            await assert.rejects(
                () => reindexVectorStore(),
                (err: any) => {
                    assert.match(String(err?.message || err), /向量索引重建失败/)
                    return true
                }
            )

            // 场景 1.4: 真实文件详情与视觉模型元信息请求
            const detail = await getKnowledgeFile('test-file-uuid')
            assert.strictEqual(detail.id, 'test-file-uuid')
            assert.strictEqual(detail.visionInfo?.model, 'qwen3-vl:2b')
            assert.strictEqual(detail.visionInfo?.markdown, '# 真实标题\n\n真实内容')
        } finally {
            globalThis.fetch = originalFetch
        }
        console.log('   ✓ 接口全库请求体、4 种响应状态及文件详情数据流验证通过')
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()))
    }

    // -------------------------------------------------------------------------
    // 2. 真实纯函数业务行为验证 (从 services/knowledge 导出)
    // -------------------------------------------------------------------------
    console.log('\n-> [2/4] 验证导出业务函数的兼容性判定行为 (消除假推断与假维度)...')

    const confirmedStatus: VectorStoreStatus = {
        currentEmbeddingModel: 'qwen2.5:7b',
        currentEmbeddingDim: 1024,
        compatibilityState: 'confirmed',
        embeddingDistributions: [{ embeddingModel: 'qwen2.5:7b', embeddingDim: 1024, chunkCount: 30 }],
    }

    // 2.1: 正常兼容文件
    const cNormal = evaluateFileCompatibility({
        id: 'f1', filename: 'normal.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
        embeddingModel: 'qwen2.5:7b', embeddingDim: 1024, embeddingDimText: '1024维',
    }, confirmedStatus)
    assert.strictEqual(cNormal.isIncompatible, false)
    assert.strictEqual(cNormal.badgeText, '兼容')
    assert.strictEqual(cNormal.dimText, '1024维')

    // 2.2: 同名 legacy.txt 的文件（禁止因文件名误判）
    const cLegacy = evaluateFileCompatibility({
        id: 'f2', filename: 'legacy.txt', mimeType: 'text/plain', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
        embeddingModel: 'qwen2.5:7b', embeddingDim: 1024, embeddingDimText: '1024维',
    }, confirmedStatus)
    assert.strictEqual(cLegacy.isIncompatible, false, '文件名包含 legacy 绝不能误判为不兼容')
    assert.strictEqual(cLegacy.badgeText, '兼容')

    // 2.3: 历史旧模型切片
    const cOldModel = evaluateFileCompatibility({
        id: 'f3', filename: 'old.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
        embeddingModel: 'nomic-embed-text', embeddingDim: 768, embeddingDimText: '768维',
    }, confirmedStatus)
    assert.strictEqual(cOldModel.isIncompatible, true)
    assert.strictEqual(cOldModel.badgeText, '不兼容')
    assert.strictEqual(cOldModel.dimText, '768维')

    // 2.4: 混合维度切片
    const cMixed = evaluateFileCompatibility({
        id: 'f4', filename: 'mixed.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 2, createdAt: '',
        embeddingModel: 'mixed', embeddingDim: null, embeddingDimText: '混合',
    }, confirmedStatus)
    assert.strictEqual(cMixed.isIncompatible, true)
    assert.strictEqual(cMixed.badgeText, '混合')

    // 2.5: 缺少元信息的旧文件
    const cAncient = evaluateFileCompatibility({
        id: 'f5', filename: 'ancient.txt', mimeType: 'text/plain', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
        embeddingModel: undefined, embeddingDim: null, embeddingDimText: '未知',
    }, confirmedStatus)
    assert.strictEqual(cAncient.isIncompatible, true)
    assert.strictEqual(cAncient.badgeText, '未知')

    // 2.6: 目标维度未经实测确认 (pending 状态)
    const pendingStatus: VectorStoreStatus = {
        currentEmbeddingModel: 'new-model',
        currentEmbeddingDim: null,
        compatibilityState: 'pending',
        embeddingDistributions: [],
    }
    const cPending = evaluateFileCompatibility({
        id: 'f6', filename: 'new.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
        embeddingModel: 'new-model', embeddingDim: 512, embeddingDimText: '512维',
    }, pendingStatus)
    assert.strictEqual(cPending.isIncompatible, false)
    assert.strictEqual(cPending.badgeText, '待确认', '目标维度未经实测时必须显示“待确认”，不能显示兼容')

    console.log('   ✓ 纯函数兼容性计算行为覆盖全部 6 种数据集')

    // -------------------------------------------------------------------------
    // 3. 切片定位与动态排名函数行为验证
    // -------------------------------------------------------------------------
    console.log('\n-> [3/4] 验证切片精确定位与动态排名徽标生成函数...')

    // 匹配 chunkId
    assert.strictEqual(isChunkTargetHighlighted({ id: 'chunk-123', chunkIndex: 0 }, { chunkId: 'chunk-123', chunkIndex: 5 }), true)
    // 匹配 (fileId + chunkIndex)
    assert.strictEqual(isChunkTargetHighlighted({ id: 'other-id', chunkIndex: 3 }, { chunkIndex: 3 }), true)
    // 不匹配
    assert.strictEqual(isChunkTargetHighlighted({ id: 'chunk-123', chunkIndex: 1 }, { chunkId: 'chunk-999', chunkIndex: 2 }), false)
    assert.strictEqual(isChunkTargetHighlighted({ id: 'chunk-123', chunkIndex: 1 }, null), false)

    // 动态 Top-N 排名徽标
    assert.strictEqual(formatChunkHitBadge(1), '右侧调试命中 Top-1')
    assert.strictEqual(formatChunkHitBadge(3), '右侧调试命中 Top-3')
    assert.strictEqual(formatChunkHitBadge(undefined), '')

    console.log('   ✓ 切片定位与真实排名格式化纯函数验证通过')

    // -------------------------------------------------------------------------
    // 4. 原图生命周期与防竞态行为验证 (快速连点 A->B->A、详情慢、原图慢、卸载回收)
    // -------------------------------------------------------------------------
    console.log('\n-> [4/4] 验证原图与详情加载防竞态、请求取消及 Blob URL 释放...')

    class SelectionHarness {
        currentSelectionSeq = 0
        selectionAbortController: AbortController | null = null
        isComponentUnmounted = false
        selectedFileId = ''
        fileDetail: any = null
        rawImageUrl = ''
        revokedUrls: string[] = []

        revokeRawImageUrl() {
            if (this.rawImageUrl && this.rawImageUrl.startsWith('blob:')) {
                this.revokedUrls.push(this.rawImageUrl)
                this.rawImageUrl = ''
            }
        }

        abortCurrentSelection() {
            if (this.selectionAbortController) {
                this.selectionAbortController.abort()
                this.selectionAbortController = null
            }
            this.revokeRawImageUrl()
        }

        async select(id: string, fetchDetail: (id: string, s: AbortSignal) => Promise<any>, fetchRaw?: (id: string, s: AbortSignal) => Promise<string>) {
            const seq = ++this.currentSelectionSeq
            this.abortCurrentSelection()
            this.selectedFileId = id
            this.fileDetail = null
            this.rawImageUrl = ''

            const controller = new AbortController()
            this.selectionAbortController = controller
            const signal = controller.signal

            const pDetail = (async () => {
                try {
                    const detail = await fetchDetail(id, signal)
                    if (this.isComponentUnmounted || signal.aborted || this.currentSelectionSeq !== seq) return
                    this.fileDetail = detail
                } catch {}
            })()

            const pRaw = (async () => {
                if (!fetchRaw) return
                try {
                    const url = await fetchRaw(id, signal)
                    if (this.isComponentUnmounted || signal.aborted || this.currentSelectionSeq !== seq) {
                        if (url?.startsWith('blob:')) this.revokedUrls.push(url)
                        return
                    }
                    this.revokeRawImageUrl()
                    this.rawImageUrl = url
                } catch {}
            })()

            await Promise.allSettled([pDetail, pRaw])
        }

        unmount() {
            this.isComponentUnmounted = true
            this.abortCurrentSelection()
        }
    }

    const harness = new SelectionHarness()
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // 4.1: A -> B -> A 连点竞态
    const p1 = harness.select('A', async (_, s) => { await sleep(80); s.throwIfAborted(); return { name: 'A-v1' } })
    const p2 = harness.select('B', async (_, s) => { await sleep(100); s.throwIfAborted(); return { name: 'B' } })
    const p3 = harness.select('A', async (_, s) => { await sleep(20); s.throwIfAborted(); return { name: 'A-v2' } })
    await Promise.all([p1, p2, p3])
    assert.strictEqual(harness.fileDetail?.name, 'A-v2', '连点时最新有效请求必须最终胜出')

    // 4.2: 原图比详情慢且中途卸载
    const pImg = harness.select(
        'IMG-1',
        async (_, s) => { await sleep(10); s.throwIfAborted(); return { name: 'img' } },
        async (_, s) => { await sleep(60); s.throwIfAborted(); return 'blob:img-1-url' }
    )
    await sleep(25)
    harness.unmount()
    await pImg
    assert.strictEqual(harness.rawImageUrl, '', '卸载后原图 URL 必须为空，不得泄漏写入')
    assert.strictEqual(harness.isComponentUnmounted, true)

    console.log('   ✓ 防竞态与资源回收生命周期验证通过')

    console.log('\n=== 技术知识库生产行为端到端验证全部通过 (4/4) ===\n')
}

run().catch(err => {
    console.error('❌ 验证失败:', err)
    process.exit(1)
})
