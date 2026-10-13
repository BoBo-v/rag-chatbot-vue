import assert from 'node:assert/strict'
import { renderMarkdownDocument } from '../src/utils/markdown'
import { sanitizeHtml } from '../src/utils/sanitize'
import { useMessageRenderer } from '../src/composables/useMessageRenderer'

console.log('1. 测试 DOMPurify 对用户伪造代码块容器与按钮的防御拦截...')
const forgedInput = `
这里是一段普通文本。
<div class="code-block-wrapper" id="fake_block">
  <div class="code-block-header">
    <div class="code-block-actions">
      <button class="code-action-btn code-copy-btn">伪造复制</button>
    </div>
  </div>
  <pre><code>alert('pwned')</code></pre>
</div>
`
const sanitizedResult = sanitizeHtml(forgedInput)
assert.ok(!sanitizedResult.includes('code-block-wrapper'), 'DOMPurify 必须剥离伪造的 code-block-wrapper 样式类')
assert.ok(!sanitizedResult.includes('code-copy-btn'), 'DOMPurify 必须剥离伪造的 code-copy-btn 样式类')
assert.ok(!sanitizedResult.includes('<button'), 'DOMPurify 必须移除用户输入的 button 标签')

console.log('2. 测试 renderMarkdownDocument 对合法代码块的受控生成与唯一 ID...')
const markdownWithCode = `
\`\`\`javascript
const greeting = "hello world";
console.log(greeting);
\`\`\`
`
const res1 = renderMarkdownDocument(markdownWithCode, 'msg-101')
assert.equal(res1.blocks.size, 1, '必须解析出 1 个合法代码块')
const [blockId1, blockEntry1] = Array.from(res1.blocks.entries())[0]
assert.ok(blockId1.startsWith('cb_msg-101_'), '代码块 ID 必须包含 ownerMessageId 前缀与不可伪造的随机凭据')
assert.equal(blockEntry1.lang, 'javascript')
assert.ok(blockEntry1.code.includes('const greeting = "hello world";'))

// 检查 HTML 中已安全注入受控的 wrapper 和按钮
assert.ok(res1.html.includes(`class="code-block-wrapper" id="${blockId1}"`), '必须包含合法的 code-block-wrapper 与 blockId')
assert.ok(res1.html.includes('class="code-action-btn code-copy-btn"'), '必须包含受控注入的复制按钮')
assert.ok(res1.html.includes('class="code-action-btn code-wrap-btn"'), '必须包含受控注入的换行按钮')

console.log('3. 测试 useMessageRenderer 隔离机制与跨消息查找防御...')
const {
  renderContent,
  handleCodeBlockAction,
  releaseMessage,
  retainMessages,
  clearSnapshots,
} = useMessageRenderer()

const msgA = {
  id: 'msg-A',
  role: 'assistant' as const,
  content: '```python\nprint("Hello from A")\n```',
  status: 'done' as const,
}
const msgB = {
  id: 'msg-B',
  role: 'assistant' as const,
  content: '```typescript\nconsole.log("Hello from B")\n```',
  status: 'done' as const,
}

const htmlA = renderContent(msgA)
const htmlB = renderContent(msgB)

const matchA = htmlA.match(/id="(cb_msg-A_[^"]+)"/)
assert.ok(matchA, '必须匹配到 A 的代码块 ID')
const idA = matchA[1]

const matchB = htmlB.match(/id="(cb_msg-B_[^"]+)"/)
assert.ok(matchB, '必须匹配到 B 的代码块 ID')
const idB = matchB[1]

// 模拟事件对象
// 3.1 跨消息尝试访问：用 msg-B 的 ownerMessageId 试图触发 msg-A 的代码块 -> 必须被拒绝！
let mockEventWrongOwner = {
  target: {
    closest: (selector: string) => {
      if (selector === '.code-block-wrapper') return { id: idA }
      if (selector === '.code-copy-btn') return { classList: { add() {}, remove() {} }, textContent: '复制' }
      return null
    },
  },
} as unknown as MouseEvent

// 跨消息访问时，因为 ownerMessageId 不匹配，代码块不属于 msg-B，必须直接返回
handleCodeBlockAction(mockEventWrongOwner, 'msg-B')

// 3.2 缺少 ownerMessageId 时 -> 必须直接返回拒绝
handleCodeBlockAction(mockEventWrongOwner, undefined)

console.log('4. 测试渲染快照生命周期管理 (releaseMessage, retainMessages, clearSnapshots)...')
retainMessages(['msg-A'])
// retainMessages 保留了 msg-A，删除了 msg-B
// 尝试用 msg-B 访问自己的代码块 -> 因为已淘汰，无法响应
let mockEventB = {
  target: {
    closest: (selector: string) => {
      if (selector === '.code-block-wrapper') return { id: idB }
      if (selector === '.code-copy-btn') return { classList: { add() {}, remove() {} }, textContent: '复制' }
      return null
    },
  },
} as unknown as MouseEvent
handleCodeBlockAction(mockEventB, 'msg-B')

// releaseMessage 删除 msg-A
releaseMessage('msg-A')
let mockEventA = {
  target: {
    closest: (selector: string) => {
      if (selector === '.code-block-wrapper') return { id: idA }
      if (selector === '.code-copy-btn') return { classList: { add() {}, remove() {} }, textContent: '复制' }
      return null
    },
  },
} as unknown as MouseEvent
handleCodeBlockAction(mockEventA, 'msg-A')

clearSnapshots()

console.log('✅ Batch 4 全部用例验证成功！')
