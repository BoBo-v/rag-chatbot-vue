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
  <\/script>
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

console.log('All buildWebPreviewDocument tests passed successfully!')
