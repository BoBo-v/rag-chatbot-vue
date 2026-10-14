import assert from 'node:assert/strict'
import { buildWebPreviewDocument } from '../src/utils/webPreviewDocument'

console.log('Testing buildWebPreviewDocument...')

// Test 1: Preserves tags inside JavaScript string literals
const codeWithEmbeddedTags = `<!DOCTYPE html>
<html>
<head>
  <script>
    const str1 = '<body>';
    const str2 = '</body></html>';
    const template = \`<div>\${str1}</div>\`;
  </script>
</head>
<body>
  <h1>Safe Sandbox</h1>
</body>
</html>`

const doc1 = buildWebPreviewDocument(codeWithEmbeddedTags, {
  allowScripts: false,
})

assert.ok(doc1.includes("const str1 = '<body>';"), 'Should preserve <body> inside script literal')
assert.ok(doc1.includes("const str2 = '</body></html>';"), 'Should preserve </body></html> inside script literal')
assert.ok(doc1.includes("script-src 'none';"), 'CSP should disallow scripts when allowScripts is false')
assert.ok(doc1.includes("default-src 'none';"), 'CSP must include default-src none')
assert.ok(doc1.includes("base-uri 'none';"), 'CSP must include base-uri none')
assert.ok(doc1.includes("connect-src 'none';"), 'CSP must include connect-src none')
assert.ok(doc1.includes("navigate-to 'none';"), 'CSP must include navigate-to none')
assert.ok(doc1.includes("img-src data: blob:;"), 'CSP must restrict img-src to data: and blob: only')

// Test 2: Strips user-injected CSP meta tags
const codeWithMaliciousCsp = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src *; script-src * 'unsafe-eval'">
  <meta HTTP-EQUIV="content-security-policy" content="img-src https://evil.com">
  <title>Bypass Attempt</title>
</head>
<body>
  <p>Hello</p>
</body>
</html>`

const doc2 = buildWebPreviewDocument(codeWithMaliciousCsp, {
  allowScripts: true,
  previewId: 'test-123',
  injectConsoleBridge: true,
})

assert.ok(!doc2.includes('default-src *'), 'Must remove user-injected CSP')
assert.ok(!doc2.includes('https://evil.com'), 'Must remove user-injected evil img-src')
assert.ok(doc2.includes("script-src 'unsafe-inline';"), 'CSP should allow inline scripts when allowScripts is true')
assert.ok(doc2.includes('test-123'), 'Console bridge must be injected with previewId')
assert.ok(doc2.includes('SANDBOX_CONSOLE'), 'Console bridge must include SANDBOX_CONSOLE message protocol')

// Test 3: Fragment input without html/head/body outer shells
const fragmentCode = `<div id="app">Fragment test</div><style>.test { color: red; }</style>`
const doc3 = buildWebPreviewDocument(fragmentCode, {
  allowScripts: false,
})

assert.ok(doc3.startsWith('<!DOCTYPE html>'), 'Must produce standards doctype')
assert.ok(doc3.includes('<meta charset="UTF-8">'), 'Must include UTF-8 charset')
assert.ok(doc3.includes('<div id="app">Fragment test</div>'), 'Must preserve fragment content')

// Test 4: Strict ordering test when user scripts/links precede charset/CSP in original HTML
const codeWithScriptBeforeCharset = `<!DOCTYPE html>
<html>
<head>
  <script src="https://attacker.com/evil.js"></script>
  <link rel="stylesheet" href="https://attacker.com/style.css">
  <meta charset="gb2312">
  <title>Evil Order Attempt</title>
</head>
<body>
  <p>Dangerous Content</p>
</body>
</html>`

const doc4 = buildWebPreviewDocument(codeWithScriptBeforeCharset, {
  allowScripts: true,
  previewId: 'test-order-456',
  injectConsoleBridge: true,
})

const charsetPos = doc4.indexOf('<meta charset="UTF-8">')
const cspPos = doc4.indexOf('Content-Security-Policy')
const bridgePos = doc4.indexOf('test-order-456')
const evilScriptPos = doc4.indexOf('https://attacker.com/evil.js')
const evilLinkPos = doc4.indexOf('https://attacker.com/style.css')

assert.ok(charsetPos !== -1, 'Must contain canonical UTF-8 charset')
assert.ok(cspPos !== -1, 'Must contain strict CSP')
assert.ok(bridgePos !== -1, 'Must contain console bridge')
assert.ok(evilScriptPos !== -1, 'Must preserve user script content')
assert.ok(evilLinkPos !== -1, 'Must preserve user link content')

assert.ok(charsetPos < cspPos, 'Charset must be placed before CSP')
assert.ok(cspPos < bridgePos, 'CSP must be placed before bridge script')
assert.ok(bridgePos < evilScriptPos, 'Bridge and CSP must strictly precede user script')
assert.ok(cspPos < evilLinkPos, 'CSP must strictly precede user link/styles')
assert.ok(!doc4.includes('gb2312'), 'Old user charset must be stripped')

// Test 5: Strips meta refresh and ensures external links are blocked while in-page anchors are preserved
const codeWithRefreshAndLinks = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="5;url=https://evil.com/phishing">
  <meta HTTP-EQUIV="Refresh" content="0;URL=http://malicious.org">
  <title>Redirect Attack</title>
</head>
<body>
  <a id="nav-anchor" href="#section-2">跳转到第二节</a>
  <a id="nav-external" href="https://evil.com/hack" target="_blank">外部钓鱼网站</a>
  <a id="nav-js" href="javascript:alert('pwned')">伪协议链接</a>
  <map name="workmap">
    <area shape="rect" coords="34,44,270,350" alt="External Area" href="https://evil.com/map" target="_blank">
    <area shape="rect" coords="290,172,333,250" alt="Anchor Area" href="#map-anchor">
  </map>
  <form action="https://evil.com/post" method="POST"><button type="submit">提交</button></form>
  <button onclick="alert('click')">点击我</button>
  <div id="section-2"><h2>第二节</h2></div>
</body>
</html>`

const doc5Static = buildWebPreviewDocument(codeWithRefreshAndLinks, {
  allowScripts: false,
})

assert.ok(!doc5Static.includes('http-equiv="refresh"'), 'Must strip meta refresh tags')
assert.ok(!doc5Static.includes('HTTP-EQUIV="Refresh"'), 'Must strip case-insensitive meta refresh tags')
assert.ok(!doc5Static.includes('https://evil.com/phishing'), 'Must not contain meta refresh target URLs')
assert.ok(doc5Static.includes('href="#section-2"'), 'In-page anchor href must be preserved intact')
assert.ok(!doc5Static.includes('href="https://evil.com/hack"'), 'External link href must be blocked')
assert.ok(doc5Static.includes('href="#blocked"'), 'Blocked links must use #blocked placeholder')
assert.ok(doc5Static.includes('data-blocked-url="https://evil.com/hack"'), 'Original external URL should be preserved in data attribute for reference')
assert.ok(!doc5Static.includes('href="javascript:alert'), 'Dangerous javascript: pseudo-protocol must be blocked')
assert.ok(!doc5Static.includes('href="https://evil.com/map"'), 'External area href must be blocked')
assert.ok(doc5Static.includes('href="#map-anchor"'), 'In-page area anchor must be preserved')
assert.ok(!doc5Static.includes('action="https://evil.com/post"'), 'External form action must be blocked')
assert.ok(doc5Static.includes('action="#blocked"'), 'Blocked form action must use #blocked placeholder')
assert.ok(doc5Static.includes('data-blocked-form-url="https://evil.com/post"'), 'Form action URL preserved in data attribute')
assert.ok(!doc5Static.includes('onclick='), 'Inline event handlers must be stripped in static mode')

// Test 6: Interactive mode preserves onclick and injects navigation guard
const doc6Interactive = buildWebPreviewDocument(codeWithRefreshAndLinks, {
  allowScripts: true,
  previewId: 'guard-test',
  injectConsoleBridge: true,
})

assert.ok(!doc6Interactive.includes('http-equiv="refresh"'), 'Interactive mode must also strip meta refresh tags')
assert.ok(doc6Interactive.includes('沙箱环境已拦截外部链接跳转'), 'Interactive mode must inject navigation guard')
assert.ok(doc6Interactive.includes('沙箱环境已拦截 location.href 外部跳转'), 'Interactive mode must intercept location.href')
assert.ok(doc6Interactive.includes('沙箱环境已拦截 location.assign 外部跳转'), 'Interactive mode must intercept location.assign')
assert.ok(doc6Interactive.includes('onclick="alert(\'click\')"'), 'Interactive mode must preserve inline event handlers')

console.log('All buildWebPreviewDocument tests passed successfully!')
