import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// 在 Node 测试环境中提供基础 DOM 环境
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
;(globalThis as any).window = dom.window
;(globalThis as any).document = dom.window.document

// 动态导入模块
const { allDemoScenarios, getDemoScenario } = await import('../src/demo/catalog')
const {
  createDemoUserMessage,
  createDemoAssistantMessage,
  createDemoRagContext,
  buildFullAssistantContent,
} = await import('../src/demo/adapters')
const { DemoPlaybackController } = await import('../src/demo/playback')

console.log('--- 🧪 开始演示沙盒核心契约、案例库与抗竞态调度器回归验证 ---')

// 1. 案例库与目录验证
console.log('1. 验证案例库结构与元数据完整性...')
assert.ok(allDemoScenarios.length >= 2, '演示案例库应至少包含 2 个案例')

const mainScenario = getDemoScenario('vite-proxy-404')
assert.equal(mainScenario.id, 'vite-proxy-404')
assert.equal(mainScenario.schemaVersion, '1.0')
assert.ok(mainScenario.evidenceSufficient, '主案例应标记为充分证据')
assert.ok(mainScenario.ticketMarkdown.includes('404 Not Found'), '主案例报障应包含 404 现象描述')
assert.ok(mainScenario.analysisMarkdown.includes('### 🛠️ 内部分析区'), '主案例内部分析必须包含规范内部分析区')
assert.ok(mainScenario.customerReplyDraft.includes('### ✉️ 客户回复草稿'), '主案例草稿区必须包含规范草稿标识')
assert.ok(mainScenario.knowledgeChunks.length >= 1, '主案例必须关联知识库切片')
assert.ok(mainScenario.knowledgeChunks[0].score >= 0.65, '主案例首个切片综合分必须 >= 0.65')

const edgeScenario = getDemoScenario('production-blank-screen')
assert.equal(edgeScenario.id, 'production-blank-screen')
assert.ok(!edgeScenario.evidenceSufficient, '边界案例应标记为证据不足')
assert.ok(edgeScenario.analysisMarkdown.includes('严禁主观臆测'), '边界案例必须声明防臆测准则')
assert.ok(edgeScenario.knowledgeChunks[0].score < 0.45, '边界案例切片综合分应 < 0.45')
console.log('   ✓ 案例库与切片规则验证通过')

// 2. 适配器转换契约验证
console.log('2. 验证消息与 RAG 上下文适配契约...')
const userMsg = createDemoUserMessage(mainScenario)
assert.equal(userMsg.role, 'user')
assert.equal(userMsg.status, 'done')
assert.equal(userMsg.content, mainScenario.ticketMarkdown)

const assistantMsg = createDemoAssistantMessage(mainScenario, 'loading')
assert.equal(assistantMsg.role, 'assistant')
assert.equal(assistantMsg.status, 'loading')

const retrievingContext = createDemoRagContext(mainScenario, 'retrieving')
assert.ok(retrievingContext.enabled)
assert.equal(retrievingContext.results.length, 0, '检索阶段结果列表应为空')

const hitContext = createDemoRagContext(mainScenario, 'hit')
assert.ok(hitContext.enabled)
assert.equal(hitContext.results.length, mainScenario.knowledgeChunks.length)
assert.equal(hitContext.results[0].filename, mainScenario.knowledgeChunks[0].documentTitle)
assert.equal(hitContext.results[0].score, mainScenario.knowledgeChunks[0].score)

const combinedContent = buildFullAssistantContent(mainScenario)
assert.ok(combinedContent.includes('---'), '组合内容必须包含双区分隔线')
console.log('   ✓ 适配器数据形态转换验证通过')

// 3. 调度器可取消性与抗竞态测试
console.log('3. 验证播放调度器 (DemoPlaybackController) 可取消性与防串流...')
const controller = new DemoPlaybackController()
const seq1 = controller.nextSequence()
assert.equal(controller.currentSequence, seq1)

// 快速启动下一个序列，前序任务必须失效
const seq2 = controller.nextSequence()
assert.equal(seq2, seq1 + 1)

// 测试 delay 是否随 sequence 失效
const delayPromise = controller.delay(100, seq1)
const delayResult = await delayPromise
assert.equal(delayResult, false, '过期序列的延迟任务必须返回 false')

// 测试流式文本分片生成
let streamedChunks = ''
const streamSeq = controller.nextSequence()
const streamOk = await controller.streamText(
  'ViteProxy404Test',
  streamSeq,
  (chunk) => {
    streamedChunks = chunk
  },
  { minChunkSize: 2, maxChunkSize: 4, intervalMs: 5 }
)
assert.ok(streamOk, '未中断的流式任务必须返回 true')
assert.equal(streamedChunks, 'ViteProxy404Test', '流式累积结果必须与原文完全一致')

// 测试中途 cancel() 是否能够立即截断
let abortedChunks = ''
const cancelSeq = controller.nextSequence()
const cancelPromise = controller.streamText(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  cancelSeq,
  (chunk) => {
    abortedChunks = chunk
    if (chunk.length >= 6) {
      controller.cancel()
    }
  },
  { minChunkSize: 1, maxChunkSize: 2, intervalMs: 10 }
)
const cancelResult = await cancelPromise
assert.equal(cancelResult, false, '被中途 cancel 的流式任务必须返回 false')
assert.ok(abortedChunks.length < 26, '被中断的任务不应继续输出全量字符')
console.log('   ✓ 播放调度器取消、防竞态与文本截断验证通过')

console.log('--- ✅ 演示沙盒全套核心回归测试 100% 通过！ ---')
