import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')

console.log('=== 开始执行页面端到端回归验证 (Playwright) ===\n')

async function main() {
    assert.ok(fs.existsSync(distDir), '必须先完成前端 npm run build 生成 dist 目录')

    // 1. 启动轻量静态资源托管服务
    const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.svg': 'image/svg+xml',
    }

    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        res.setHeader('Access-Control-Allow-Headers', '*')

        if (req.method === 'OPTIONS') {
            res.writeHead(204)
            res.end()
            return
        }

        let reqUrl = (req.url || '/').split('?')[0].split('#')[0]
        if (reqUrl.startsWith('/ai/')) {
            reqUrl = reqUrl.replace(/^\/ai\//, '/')
        } else if (reqUrl === '/ai') {
            reqUrl = '/'
        }

        let relativePath = reqUrl
        if (relativePath === '/' || !path.extname(relativePath)) {
            relativePath = 'index.html'
        }
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1)

        const filePath = path.join(distDir, relativePath)
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase()
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
            fs.createReadStream(filePath).pipe(res)
            return
        }

        // SPA fallback
        const indexPath = path.join(distDir, 'index.html')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        fs.createReadStream(indexPath).pipe(res)
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as { port: number }
    const appUrl = `http://127.0.0.1:${address.port}/ai/`

    let browser: Browser | null = null
    try {
        for (const opt of [{ channel: 'msedge', headless: true }, { channel: 'chrome', headless: true }, { headless: true }]) {
            try {
                browser = await chromium.launch(opt)
                break
            } catch {
                // try next
            }
        }
        if (!browser) {
            throw new Error('未检测到可用浏览器，请安装 Edge 或 Chrome')
        }
        const context = await browser.newContext()
        await context.addInitScript(() => {
            const initialSettings = {
                transport: 'backend',
                backend: {
                    url: 'http://localhost:3001',
                    provider: 'openai',
                    model: 'deepseek-chat',
                },
                showModelInTopbar: true,
            }
            localStorage.setItem('ai-chat-settings', JSON.stringify(initialSettings))
        })
        const page = await context.newPage()
        page.on('console', msg => console.log('PAGE LOG:', msg.text()))
        page.on('pageerror', err => console.log('PAGE ERROR:', err))

        // 统一模拟的后端目录与状态
        const mockProviders = [
            {
                id: 'openai',
                name: 'OpenAI 服务',
                defaultModel: 'deepseek-chat',
                models: ['deepseek-chat', 'gpt-4o', 'deepseek-reasoner'],
                configured: true,
            },
            {
                id: 'ollama',
                name: 'Ollama (本地)',
                defaultModel: 'qwen2.5:7b',
                models: ['qwen2.5:7b'],
                configured: true,
            },
            {
                id: 'anthropic',
                name: 'Claude 服务',
                defaultModel: 'claude-sonnet-4-6',
                models: ['claude-sonnet-4-6'],
                configured: true,
            },
        ]

        const capturedChatRequests: Array<{ url: string; body: any }> = []

        // 统一网络拦截
        await page.route('**/api/**', async (route) => {
            const url = route.request().url()

            if (url.includes('/api/auth/me')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ user: { username: 'testuser', mustChangePassword: false } }),
                })
            }

            if (url.includes('/api/providers')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ providers: mockProviders }),
                })
            }

            if (url.includes('/api/chat') || url.includes('/api/chat/stream')) {
                let parsedBody: any = {}
                try {
                    parsedBody = JSON.parse(route.request().postData() || '{}')
                } catch {
                    // ignore
                }
                capturedChatRequests.push({ url, body: parsedBody })

                return route.fulfill({
                    status: 200,
                    contentType: 'application/x-ndjson',
                    body: JSON.stringify({
                        message: { role: 'assistant', content: `Echo from ${parsedBody.model || 'unknown'}` },
                        done: true,
                    }) + '\n',
                })
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true }),
            })
        })

        // ─────────────────────────────────────────────────────────────
        // 断言 1: 登录后用户作用域目录自动重新加载，不卡在 idle
        // ─────────────────────────────────────────────────────────────
        console.log('-> 断言 1: 验证登录后目录自动重新加载并绑定有效模型...')
        await page.goto(appUrl)
        await page.waitForSelector('.topbar-model-text', { timeout: 10000 })
        const topbarTextInitial = await page.textContent('.topbar-model-text')
        assert.ok(topbarTextInitial && topbarTextInitial.includes('deepseek-chat'), `顶栏应展示有效模型，实际展示: ${topbarTextInitial}`)
        console.log(`   ✓ 页面加载后成功解析并展示当前模型: ${topbarTextInitial?.trim()}`)

        // ─────────────────────────────────────────────────────────────
        // 断言 2: 设置页模型切换独立处理，不误清空服务目录
        // ─────────────────────────────────────────────────────────────
        console.log('\n-> 断言 2: 验证设置页切换模型不会抹除服务卡片与候选选项...')
        // 打开设置面板
        await page.click('.settings-btn')
        await page.waitForSelector('#backend-model-select', { timeout: 5000 })

        // 验证初始服务卡片与模型下拉框
        const initialCardCount = await page.locator('.service-card').count()
        assert.ok(initialCardCount >= 3, `服务卡片数量应不少于 3，实际: ${initialCardCount}`)

        // 切换模型至 gpt-4o
        await page.selectOption('#backend-model-select', 'gpt-4o')
        await page.waitForTimeout(100)

        // 验证服务卡片未被清空，下拉选项依然完整
        const afterSwitchCardCount = await page.locator('.service-card').count()
        assert.equal(afterSwitchCardCount, initialCardCount, '切换模型后服务卡片绝不能被误清空')
        const selectOptions = await page.locator('#backend-model-select option').allTextContents()
        assert.ok(selectOptions.includes('deepseek-chat'), '模型下拉框应保留 deepseek-chat 候选')
        assert.ok(selectOptions.includes('gpt-4o'), '模型下拉框应包含 gpt-4o 候选')

        // 点击取消关闭设置面板
        await page.click('.btn-cancel')
        await page.waitForTimeout(100)
        console.log('   ✓ 设置页切换模型逻辑独立，服务卡片及各模型选项完好保留')

        // ─────────────────────────────────────────────────────────────
        // 断言 3: 顶栏展示已生效有效模型，失效已删除模型被正确剔除与修复
        // ─────────────────────────────────────────────────────────────
        console.log('\n-> 断言 3: 验证已失效/已删除模型不在顶栏候选列表出现，勾选状态对齐有效模型...')
        // 模拟本地持久化配置中包含一个后端已下线的 deleted-legacy-model
        await page.evaluate(() => {
            const raw = localStorage.getItem('ai-chat-settings')
            const obj = raw ? JSON.parse(raw) : {}
            obj.transport = 'backend'
            obj.backend = { ...obj.backend, provider: 'openai', model: 'deleted-legacy-model' }
            localStorage.setItem('ai-chat-settings', JSON.stringify(obj))
        })
        await page.reload()
        await page.waitForSelector('.topbar-model-text', { timeout: 10000 })

        // 顶栏应自动回退到 openai 的有效模型 (deepseek-chat)，不展示 deleted-legacy-model
        const restoredTopbarText = await page.textContent('.topbar-model-text')
        assert.ok(
            restoredTopbarText && !restoredTopbarText.includes('deleted-legacy-model'),
            `顶栏不应展示已删除模型，实际: ${restoredTopbarText}`
        )
        assert.ok(
            restoredTopbarText && restoredTopbarText.includes('deepseek-chat'),
            `顶栏应回退展示有效模型 deepseek-chat，实际: ${restoredTopbarText}`
        )

        // 打开顶栏下拉菜单
        await page.click('.topbar-model-btn')
        await page.waitForSelector('.topbar-model-dropdown', { timeout: 5000 })

        const dropdownItems = await page.locator('.dropdown-item-name').allTextContents()
        const hasDeletedModel = dropdownItems.some(name => name.includes('deleted-legacy-model'))
        assert.equal(hasDeletedModel, false, '顶栏下拉候选列表严禁插回已删除的失效模型')

        const activeItemText = await page.locator('.dropdown-item.active').textContent()
        assert.ok(
            activeItemText && activeItemText.includes('deepseek-chat'),
            `当前勾选的高亮模型必须为有效模型 deepseek-chat，实际: ${activeItemText}`
        )
        // 关闭下拉菜单
        await page.click('.topbar-left')
        console.log('   ✓ 顶栏已失效模型展示与候选彻底剔除，勾选项精准对齐')

        // ─────────────────────────────────────────────────────────────
        // 断言 4: 对比页两列分别选择不同模型，捕获的请求体准确对应两列模型
        // ─────────────────────────────────────────────────────────────
        console.log('\n-> 断言 4: 验证模型对比页多列独立发起对应模型请求...')
        // 切换至模型对比视图
        const compareNavButton = page.locator('.rail-button:has-text("模型对比")')
        await compareNavButton.click()
        await page.waitForSelector('#comparison-prompt', { timeout: 10000 })

        // 填写对比问题
        await page.fill('#comparison-prompt', '请对比快速排序与归并排序的复杂度')

        // 模型 1 配置：确保 transport 为 backend，model 为 deepseek-chat
        const model1Editor = page.locator('.runtime-editor').nth(0)
        await model1Editor.locator('input[placeholder*="qwen2.5:7b"]').fill('deepseek-chat')

        // 模型 2 配置：确保 transport 为 backend，model 为 deepseek-reasoner
        const model2Editor = page.locator('.runtime-editor').nth(1)
        await model2Editor.locator('input[placeholder*="qwen2.5:7b"]').fill('deepseek-reasoner')

        capturedChatRequests.length = 0

        // 点击开始对比
        await page.click('button.compare-primary:has-text("开始对比")')

        // 等待请求捕获
        await page.waitForTimeout(500)
        assert.ok(capturedChatRequests.length >= 2, `对比应至少发出 2 个模型请求，实际捕获: ${capturedChatRequests.length}`)

        const modelsRequested = capturedChatRequests.map(r => r.body.model || r.body.backendModel)
        assert.ok(modelsRequested.includes('deepseek-chat'), `请求必须包含 deepseek-chat，实际: ${modelsRequested}`)
        assert.ok(modelsRequested.includes('deepseek-reasoner'), `请求必须包含 deepseek-reasoner，实际: ${modelsRequested}`)

        console.log(`   ✓ 对比页成功捕获 2 个独立请求，模型分别为: ${modelsRequested.join(', ')}`)

        console.log('\n=== Playwright 页面端到端回归验证全部通过 (4/4) ===')
    } finally {
        if (browser) await browser.close()
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }
}

main().catch((err) => {
    console.error('Playwright 页面端到端回归验证失败:', err)
    process.exit(1)
})
