import assert from 'node:assert/strict'

// 模拟测试组件状态与逻辑
class MockKnowledgeSelectionManager {
  currentSelectionSeq = 0
  selectionAbortController: AbortController | null = null
  isComponentUnmounted = false

  selectedFileId = ''
  fileDetail: any = null
  rawImageUrl = ''
  rawImageError = ''
  loadingDetail = false
  rawImageLoading = false

  revokedBlobUrls: string[] = []

  revokeRawImageUrl(): void {
    if (this.rawImageUrl && this.rawImageUrl.startsWith('blob:')) {
      this.revokedBlobUrls.push(this.rawImageUrl)
      this.rawImageUrl = ''
    }
  }

  abortCurrentSelection(revokeImage = true): void {
    if (this.selectionAbortController) {
      this.selectionAbortController.abort()
      this.selectionAbortController = null
    }
    if (revokeImage) {
      this.revokeRawImageUrl()
    }
  }

  async selectFile(
    id: string,
    fetchDetail: (id: string, signal: AbortSignal) => Promise<any>,
    fetchRawImage?: (id: string, signal: AbortSignal) => Promise<string>
  ) {
    const seq = ++this.currentSelectionSeq
    this.abortCurrentSelection(true)

    this.selectedFileId = id
    this.fileDetail = null
    this.rawImageUrl = ''
    this.rawImageError = ''

    const controller = new AbortController()
    this.selectionAbortController = controller
    const signal = controller.signal

    this.loadingDetail = true

    const detailPromise = (async () => {
      try {
        const detail = await fetchDetail(id, signal)
        if (this.isComponentUnmounted || signal.aborted || this.currentSelectionSeq !== seq) return
        this.fileDetail = detail
      } catch (error: any) {
        if (this.isComponentUnmounted || signal.aborted || this.currentSelectionSeq !== seq) return
        if (error?.name !== 'AbortError') {
          this.fileDetail = null
        }
      } finally {
        if (!this.isComponentUnmounted && !signal.aborted && this.currentSelectionSeq === seq) {
          this.loadingDetail = false
        }
      }
    })()

    const imagePromise = (async () => {
      if (!fetchRawImage) return
      this.rawImageLoading = true
      try {
        const url = await fetchRawImage(id, signal)
        if (this.isComponentUnmounted || signal.aborted || this.currentSelectionSeq !== seq) {
          if (url && url.startsWith('blob:')) {
            this.revokedBlobUrls.push(url)
          }
          return
        }
        this.revokeRawImageUrl()
        this.rawImageUrl = url
      } catch (err: any) {
        if (this.isComponentUnmounted || signal.aborted || this.currentSelectionSeq !== seq) return
        if (err?.name !== 'AbortError') {
          this.rawImageError = err?.message || '原图加载失败'
        }
      } finally {
        if (!this.isComponentUnmounted && !signal.aborted && this.currentSelectionSeq === seq) {
          this.rawImageLoading = false
        }
      }
    })()

    await Promise.allSettled([detailPromise, imagePromise])
  }

  unmount(): void {
    this.isComponentUnmounted = true
    this.abortCurrentSelection(true)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function run() {
  console.log('[Test] 开始验证知识库详情与原图竞态保护...')

  // 场景 1: 快速连点 A -> B -> A，且 B 延迟返回
  console.log('[Test] 场景 1: 快速连点 A -> B -> A...')
  {
    const manager = new MockKnowledgeSelectionManager()

    // 第一次选择 A (慢 100ms)
    const pA1 = manager.selectFile('file-A', async (id, signal) => {
      await delay(100)
      signal.throwIfAborted()
      return { id, filename: 'A.txt', version: 1 }
    })

    // 立即选择 B (慢 120ms)
    const pB = manager.selectFile('file-B', async (id, signal) => {
      await delay(120)
      signal.throwIfAborted()
      return { id, filename: 'B.txt', version: 1 }
    })

    // 立即再次选择 A (快 20ms)
    const pA2 = manager.selectFile('file-A', async (id, signal) => {
      await delay(20)
      signal.throwIfAborted()
      return { id, filename: 'A.txt', version: 2 }
    })

    await Promise.all([pA1, pB, pA2])

    assert.strictEqual(manager.selectedFileId, 'file-A')
    assert.strictEqual(manager.fileDetail?.version, 2, '最终写入的必须是第 2 次选择 A 的最新结果')
  }

  // 场景 2: A 的详情比 B 慢（A 延迟 80ms，B 延迟 20ms）
  console.log('[Test] 场景 2: A 的详情响应比 B 慢...')
  {
    const manager = new MockKnowledgeSelectionManager()

    const pA = manager.selectFile('file-A', async (id, signal) => {
      await delay(80)
      signal.throwIfAborted()
      return { id, filename: 'A.txt' }
    })

    await delay(10) // 10ms 后切换到 B

    const pB = manager.selectFile('file-B', async (id, signal) => {
      await delay(20)
      signal.throwIfAborted()
      return { id, filename: 'B.txt' }
    })

    await Promise.all([pA, pB])

    assert.strictEqual(manager.selectedFileId, 'file-B')
    assert.strictEqual(manager.fileDetail?.filename, 'B.txt', '迟到的 A 绝对不能覆盖 B 的详情')
  }

  // 场景 3: 原图加载比详情慢，且中途切换走
  console.log('[Test] 场景 3: 原图加载比详情慢且中途切换...')
  {
    const manager = new MockKnowledgeSelectionManager()

    let imgAFetchAborted = false
    const pImgA = manager.selectFile(
      'img-A',
      async (id, signal) => {
        await delay(10)
        signal.throwIfAborted()
        return { id, filename: 'A.png' }
      },
      async (_id, signal) => {
        try {
          await delay(100)
          signal.throwIfAborted()
          return `blob:url-img-A`
        } catch (e) {
          if (signal.aborted) imgAFetchAborted = true
          throw e
        }
      }
    )

    await delay(30) // 详情已返回，原图还在路上，用户切换到 doc-C
    const pDocC = manager.selectFile('doc-C', async (id, signal) => {
      await delay(10)
      signal.throwIfAborted()
      return { id, filename: 'C.md' }
    })

    await Promise.all([pImgA, pDocC])

    assert.strictEqual(manager.selectedFileId, 'doc-C')
    assert.strictEqual(manager.fileDetail?.filename, 'C.md')
    assert.strictEqual(manager.rawImageUrl, '', '切换到非图片后，原图必须为空')
    assert.ok(imgAFetchAborted || manager.revokedBlobUrls.includes('blob:url-img-A'), '迟到的原图请求必须被 abort 中止或其 Blob 被释放')
  }

  // 场景 4: 组件已卸载时不能继续写入 state
  console.log('[Test] 场景 4: 组件已卸载时不能继续写入 state...')
  {
    const manager = new MockKnowledgeSelectionManager()

    const pLoad = manager.selectFile('file-X', async (id, signal) => {
      await delay(50)
      signal.throwIfAborted()
      return { id, filename: 'X.txt' }
    })

    await delay(10)
    manager.unmount() // 模拟路由离开组件卸载

    await pLoad

    assert.strictEqual(manager.fileDetail, null, '卸载后即使响应返回也不得写入 state')
  }

  console.log('[Test] ✅ 知识库详情与原图竞态保护所有用例通过！')
}

run().catch(err => {
  console.error('[Test] ❌ 竞态验证失败:', err)
  process.exit(1)
})
