import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// 在 Node 测试环境中提供真实的 DOMPurify window 环境
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
;(globalThis as any).window = dom.window
;(globalThis as any).document = dom.window.document
;(globalThis as any).Element = dom.window.Element

// 动态导入 sanitizeHtml
const { sanitizeHtml } = await import('../src/utils/sanitize')

console.log('--- 开始测试 DOMPurify 连续净化（3次）一致性与 Hook 生命周期 ---')

const attackSample = `
<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:red;z-index:99999">恶意全屏遮罩</div>
<div class="code-block-wrapper" id="fake-block">
  <div class="code-block-header">
    <button class="code-action-btn code-copy-btn">伪造复制</button>
  </div>
</div>
<input type="text" value="偷取凭据" />
<input type="checkbox" checked />
<script>alert('xss')</script>
<img src="x" onerror="alert('img xss')" />
<a href="javascript:alert('link xss')">恶意链接</a>
<span class="katex"><span class="strut" style="height:0.8em;color:#ff0000;background-color:rgba(0,0,0,0.5)">公式安全样式</span></span>
`

for (let round = 1; round <= 3; round++) {
  console.log(`执行第 ${round} 轮净化...`)
  const result = sanitizeHtml(attackSample)

  // 1. 普通 position:fixed 等样式必须被移除
  assert.ok(!result.includes('position:fixed'), `第 ${round} 轮: position:fixed 必须被移除`)
  assert.ok(!result.includes('z-index:99999'), `第 ${round} 轮: 危险 z-index 必须被移除`)

  // 2. 伪造代码块类名必须被移除
  assert.ok(!result.includes('code-block-wrapper'), `第 ${round} 轮: code-block-wrapper 伪造类名必须被移除`)
  assert.ok(!result.includes('code-copy-btn'), `第 ${round} 轮: code-copy-btn 伪造类名必须被移除`)

  // 3. 普通文本输入框必须被移除
  assert.ok(!result.includes('type="text"'), `第 ${round} 轮: 普通文本输入框必须被移除`)

  // 4. 任务清单 checkbox 必须保留且带 disabled 属性
  assert.ok(result.includes('type="checkbox"'), `第 ${round} 轮: 任务清单 checkbox 必须保留`)
  assert.ok(result.includes('disabled'), `第 ${round} 轮: 任务清单 checkbox 必须被禁用`)

  // 5. script、onerror、javascript: 链接必须被过滤
  assert.ok(!result.includes('<script'), `第 ${round} 轮: script 标签必须被彻底移除`)
  assert.ok(!result.includes('onerror'), `第 ${round} 轮: onerror 事件必须被移除`)
  assert.ok(!result.includes('javascript:'), `第 ${round} 轮: javascript: 伪协议必须被清除`)

  // 6. KaTeX 布局和安全颜色正常保留
  assert.ok(result.includes('katex'), `第 ${round} 轮: katex 结构必须保留`)
  assert.ok(result.includes('height:0.8em'), `第 ${round} 轮: KaTeX 度量 height 样式必须保留`)
  assert.ok(result.includes('color:#ff0000'), `第 ${round} 轮: KaTeX 安全颜色属性必须保留`)
}

console.log('✅ DOMPurify 连续净化 3 轮测试全部通过，Hook 生命周期与过滤规则持续生效！')
