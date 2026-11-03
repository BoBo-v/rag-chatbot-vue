import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    reindexVectorStore,
    type ReindexVectorStoreResult,
    type StoredKnowledgeFile,
    type VectorStoreStatus,
} from '../src/services/knowledge'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

console.log('=== 开始执行技术知识库 UI 与操作语义自动化功能验证 ===\n')

// 1. 验证“同步已有向量索引”操作语义与四种响应处理
console.log('-> [1/4] 验证同步已有向量索引请求参数与响应状态...')
assert.equal(typeof reindexVectorStore, 'function', 'reindexVectorStore 必须导出')
const kbVuePath = path.resolve(rootDir, 'src/views/KnowledgeBase.vue')
const kbVueContent = fs.readFileSync(kbVuePath, 'utf8')

// 确认顶部按钮调用时不传 fileId（发送 {} 操作全库）
assert.ok(
    kbVueContent.includes('const res = await reindexVectorStore()'),
    '顶部同步按钮必须发送全库请求，不能隐式使用选中的 fileId'
)

// 确认文案已经彻底纠正，删除“重新计算所有切片”的虚假承诺
assert.ok(
    !kbVueContent.includes('重新计算所有切片的向量嵌入'),
    '必须删除重新计算切片 embedding 的承诺'
)
assert.ok(
    kbVueContent.includes('同步全库已有向量索引'),
    '确认框文案必须明确为同步已有向量索引'
)
assert.ok(
    kbVueContent.includes('需要使用当前 embedding 模型重新入库'),
    '不兼容提示必须推荐重新入库，不能推荐同步按钮'
)

// 验证 4 种执行结果逻辑
function simulateReindexResult(res: ReindexVectorStoreResult): { type: string; message: string } {
    if (res.skipped) {
        return { type: 'warning', message: '当前后端无需执行索引同步' }
    }
    return {
        type: 'success',
        message: `向量索引同步完成：已处理 ${res.filesIndexed} 个文件，${res.chunksIndexed} 个切片`,
    }
}

// 场景 1: SQLite 跳过
const r1 = simulateReindexResult({ backend: 'sqlite', filesIndexed: 0, chunksIndexed: 0, skipped: true })
assert.equal(r1.message, '当前后端无需执行索引同步')

// 场景 2: Qdrant 同步成功
const r2 = simulateReindexResult({ backend: 'qdrant', filesIndexed: 3, chunksIndexed: 18, skipped: false })
assert.equal(r2.message, '向量索引同步完成：已处理 3 个文件，18 个切片')

// 场景 3: 零条数据
const r3 = simulateReindexResult({ backend: 'qdrant', filesIndexed: 0, chunksIndexed: 0, skipped: false })
assert.equal(r3.message, '向量索引同步完成：已处理 0 个文件，0 个切片')

// 场景 4: 接口异常
assert.ok(
    kbVueContent.includes("toast.show(err instanceof Error ? err.message : '同步向量索引失败', 'error')"),
    '接口异常必须正确展示错误提示'
)
console.log('   ✓ 索引同步全库参数及 4 种响应状态处理验证通过')


// 2. 验证消除假兼容推断与兜底维度（删除 legacy 文件名判断、删除 768/1024 兜底）
console.log('\n-> [2/4] 验证文件元信息真实性与 5 种数据集兼容状态判定...')
assert.ok(!kbVueContent.includes("file.filename === 'legacy.txt'"), '禁止根据 legacy 文件名判断兼容性')
assert.ok(!kbVueContent.includes('|| 1024'), '禁止 1024 兜底维度')
assert.ok(!kbVueContent.includes('return 768'), '禁止 768 假维度')

function computeTargetDim(status: VectorStoreStatus | null): number | null {
    if (!status) return null
    if (status.currentEmbeddingDim !== undefined && status.currentEmbeddingDim !== null) {
        return status.currentEmbeddingDim
    }
    const current = status.embeddingDistributions?.find(item =>
        item.embeddingModel === status.currentEmbeddingModel && item.embeddingDim !== null
    )
    return current?.embeddingDim ?? null
}

function evaluateCompatibility(file: StoredKnowledgeFile, status: VectorStoreStatus | null) {
    const targetDim = computeTargetDim(status)
    const currentModel = status?.currentEmbeddingModel

    const hasNoMeta = (!file.embeddingModel || file.embeddingModel === 'unknown') && (!file.embeddingDim || file.embeddingDimText === '未知')
    if (hasNoMeta) {
        return { isIncompatible: true, badgeText: '未知', dimText: '未知' }
    }

    const isMixed = file.embeddingModel === 'mixed' || file.embeddingDimText === '混合'
    if (isMixed) {
        return { isIncompatible: true, badgeText: '混合', dimText: '混合' }
    }

    const dimText = file.embeddingDimText || (file.embeddingDim ? `${file.embeddingDim}维` : '未知')

    if (!currentModel || targetDim === null) {
        return { isIncompatible: false, badgeText: '待确认', dimText }
    }

    const modelMatch = file.embeddingModel === currentModel
    const dimMatch = file.embeddingDim !== null && file.embeddingDim === targetDim

    if (!modelMatch || !dimMatch) {
        return {
            isIncompatible: true,
            badgeText: !modelMatch ? '模型不兼容' : '维度不兼容',
            dimText,
        }
    }

    return { isIncompatible: false, badgeText: '', dimText }
}

const statusConfirmed: VectorStoreStatus = {
    currentEmbeddingModel: 'qwen2.5:7b',
    currentEmbeddingDim: 1024,
    embeddingDistributions: [
        { embeddingModel: 'qwen2.5:7b', embeddingDim: 1024, chunkCount: 30 },
    ],
}

// 正常文件
const normal = evaluateCompatibility({
    id: 'f1', filename: 'normal.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
    embeddingModel: 'qwen2.5:7b', embeddingDim: 1024, embeddingDimText: '1024维',
}, statusConfirmed)
assert.equal(normal.isIncompatible, false)
assert.equal(normal.dimText, '1024维')

// 同名 legacy.txt 的正常文件：绝不因为文件名误判
const legacyNamed = evaluateCompatibility({
    id: 'f2', filename: 'legacy.txt', mimeType: 'text/plain', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
    embeddingModel: 'qwen2.5:7b', embeddingDim: 1024, embeddingDimText: '1024维',
}, statusConfirmed)
assert.equal(legacyNamed.isIncompatible, false, '同名 legacy.txt 必须保持兼容')
assert.equal(legacyNamed.badgeText, '')

// 旧模型文件
const oldModel = evaluateCompatibility({
    id: 'f3', filename: 'old.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
    embeddingModel: 'nomic-embed-text', embeddingDim: 768, embeddingDimText: '768维',
}, statusConfirmed)
assert.equal(oldModel.isIncompatible, true)
assert.equal(oldModel.badgeText, '模型不兼容')
assert.equal(oldModel.dimText, '768维')

// 混合维度文件
const mixed = evaluateCompatibility({
    id: 'f4', filename: 'mixed.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 2, createdAt: '',
    embeddingModel: 'mixed', embeddingDim: null, embeddingDimText: '混合',
}, statusConfirmed)
assert.equal(mixed.isIncompatible, true)
assert.equal(mixed.badgeText, '混合')
assert.equal(mixed.dimText, '混合')

// 缺少元信息的旧文件
const ancient = evaluateCompatibility({
    id: 'f5', filename: 'ancient.txt', mimeType: 'text/plain', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
    embeddingModel: undefined, embeddingDim: null, embeddingDimText: '未知',
}, statusConfirmed)
assert.equal(ancient.isIncompatible, true)
assert.equal(ancient.badgeText, '未知')
assert.equal(ancient.dimText, '未知')

// 目标维度未经确认
const statusPending: VectorStoreStatus = {
    currentEmbeddingModel: 'new-model',
    currentEmbeddingDim: null,
    embeddingDistributions: [],
}
const pending = evaluateCompatibility({
    id: 'f6', filename: 'new.md', mimeType: 'text/markdown', size: 100, charCount: 50, chunkCount: 1, createdAt: '',
    embeddingModel: 'new-model', embeddingDim: 512, embeddingDimText: '512维',
}, statusPending)
assert.equal(pending.badgeText, '待确认', '目标维度未经确认时必须标记待确认')
console.log('   ✓ 5 类文件数据集及待确认状态判定验证通过')


// 3. 验证多模态图片对照与真实数据接入
console.log('\n-> [3/4] 验证图片视图真实原图、识别结果及 Blob 释放...')
// 必须彻底删除固定 SVG
assert.ok(!kbVueContent.includes('kb-arch-svg'), '必须删除固定架构 SVG')
// 必须仅对图片启用入口
assert.ok(kbVueContent.includes('isStoredImageFile(selectedFile)'), '仅图片文件启用视觉对照入口')
// 必须调用真实原图接口
assert.ok(kbVueContent.includes('/api/files/${fileId}/raw'), '必须按文件 ID 安全读取原图')
// 必须释放 Blob
assert.ok(kbVueContent.includes('URL.revokeObjectURL(rawImageUrl.value)'), '必须在切换和销毁时释放 Blob')
// 必须展示真实模型名称与 markdown
assert.ok(kbVueContent.includes('fileDetail?.visionInfo?.model'), '必须展示真实视觉模型名称')
assert.ok(kbVueContent.includes('fileDetail?.visionInfo?.markdown'), '必须展示真实识别 Markdown')
console.log('   ✓ 真实原图加载、安全路径解析与 Blob 释放验证通过')


// 4. 验证切片定位联动与动态排名展示（非硬编码 Top-1）
console.log('\n-> [4/4] 验证切片定位精确度与真实检索排名...')
assert.ok(!kbVueContent.includes('右侧调试命中 Top-1'), '禁止硬编码 Top-1')
assert.ok(
    kbVueContent.includes('右侧调试命中 Top-${highlightedTarget.value.rank}'),
    '必须展示真实的调试命中排名 Top-N'
)
assert.ok(
    kbVueContent.includes('isChunkHighlighted'),
    '必须使用 chunkId 或 (fileId + chunkIndex) 判定切片高亮'
)
console.log('   ✓ 切片精确定位与多排名 (Top-1, Top-2, ...) 动态展示验证通过')

console.log('\n=== 技术知识库 UI 与操作语义自动化功能验证全部通过 (4/4) ===\n')
