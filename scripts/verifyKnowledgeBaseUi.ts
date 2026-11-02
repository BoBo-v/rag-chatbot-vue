import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reindexVectorStore } from '../src/services/knowledge'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

console.log('=== 开始执行技术知识库与评测模块重构自动化断言 ===\n')

// 断言 1: services/knowledge.ts 导出 reindexVectorStore 并具备正确类型定义
console.log('-> 断言 1: 验证 services/knowledge.ts 导出 reindexVectorStore...')
assert.equal(typeof reindexVectorStore, 'function', 'reindexVectorStore 必须作为函数导出')
console.log('   ✓ reindexVectorStore 函数导出且可用')

// 断言 2: KnowledgeBase.vue 模板与结构完备性
console.log('\n-> 断言 2: 验证 KnowledgeBase.vue 模板结构对齐原型 ai_rag.html...')
const kbVuePath = path.resolve(rootDir, 'src/views/KnowledgeBase.vue')
const kbVueContent = fs.readFileSync(kbVuePath, 'utf8')

// 1. 验证 SSE 6 阶段实时流水线
assert.ok(kbVueContent.includes('kb-sse-pipeline'), '模板必须包含 kb-sse-pipeline 实时流水线容器')
assert.ok(kbVueContent.includes('1.receiving'), '流水线必须包含 1.receiving')
assert.ok(kbVueContent.includes('2.parsing'), '流水线必须包含 2.parsing')
assert.ok(kbVueContent.includes('3.chunking'), '流水线必须包含 3.chunking')
assert.ok(kbVueContent.includes('4.embedding'), '流水线必须包含 4.embedding')
assert.ok(kbVueContent.includes('5.storing'), '流水线必须包含 5.storing')
assert.ok(kbVueContent.includes('6.completed'), '流水线必须包含 6.completed')
console.log('   ✓ SSE 6阶段流水线 (receiving ➔ parsing ➔ chunking ➔ embedding ➔ storing ➔ completed) 结构完整')

// 2. 验证中栏双列切片视图与图片多模态对照切换
assert.ok(kbVueContent.includes('kbView'), '组件中必须声明 kbView 视图模式状态')
assert.ok(kbVueContent.includes('kb-chunk-grid'), '模板必须包含 kb-chunk-grid 双列高密度切片容器')
assert.ok(kbVueContent.includes('kb-vision-container'), '模板必须包含 kb-vision-container 多模态对照容器')
assert.ok(kbVueContent.includes('kb-arch-svg'), '多模态图片视图必须包含纯矢量架构图保障不黑屏')
console.log('   ✓ 双列切片网格与多模态图片视觉对照视图及切换逻辑完整')

// 3. 验证 3 维检索分数与联动定位
assert.ok(kbVueContent.includes('kb-3d-scores'), '右栏检索调试卡片必须包含 kb-3d-scores 3维分数容器')
assert.ok(kbVueContent.includes('score-total'), '3维分数容器必须包含 Score 总分')
assert.ok(kbVueContent.includes('score-vec'), '3维分数容器必须包含 Vec 向量分')
assert.ok(kbVueContent.includes('score-fts'), '3维分数容器必须包含 FTS5 关键词分')
assert.ok(kbVueContent.includes('highlightKbChunk'), '必须实现 highlightKbChunk 点击定位联动函数')
assert.ok(kbVueContent.includes('chunk-flash'), '必须实现 chunk-flash 发光呼吸动画')
assert.ok(kbVueContent.includes('kb-mark'), '必须支持关键词高亮 mark 标记')
console.log('   ✓ 右栏检索调试器 3D 分数与点击卡片联动定位 Chunk 逻辑完整')

// 断言 3: RagEvalPanel.vue 评测面板卡片化指标与 3D 分数
console.log('\n-> 断言 3: 验证 RagEvalPanel.vue 结构与样式...')
const evalVuePath = path.resolve(rootDir, 'src/views/RagEvalPanel.vue')
const evalVueContent = fs.readFileSync(evalVuePath, 'utf8')

assert.ok(evalVueContent.includes('summary-card'), '评测统计栏必须包含 summary-card 现代指标卡片')
assert.ok(evalVueContent.includes('rag-eval-3d-scores'), '评测结果列表必须包含 rag-eval-3d-scores 3维分数行')
assert.ok(evalVueContent.includes('rag-eval-match-pill'), '评测命中必须包含 rag-eval-match-pill 状态胶囊')
console.log('   ✓ RAG 评测面板卡片化指标与 3D 分数展示完整')

console.log('\n=== 所有知识库与评测重构自动化断言全部通过 (3/3) ===\n')
