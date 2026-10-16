import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')

console.log('=== 开始执行页面端到端回归验证 (Playwright) ===\n')

const defaultMockProviders = [
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

async function setupRouteMocking(
    page: Page,
    options: {
        providers?: any[]
        onChatRequest?: (body: any, url: string) => void
        onTestRequest?: (body: any, url: string) => void
    } = {}
) {
    const providersList = options.providers ?? defaultMockProviders

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
                body: JSON.stringify({ providers: providersList }),
            })
        }

        if (url.includes('/api/chat/test')) {
            let parsedBody: any = {}
            try {
                parsedBody = JSON.parse(route.request().postData() || '{}')
            } catch {}
            if (options.onTestRequest) {
                options.onTestRequest(parsedBody, url)
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/x-ndjson',
                body: JSON.stringify({ message: { role: 'assistant', content: 'test-token' }, done: false }) + '\n',
            })
        }

        if (url.includes('/api/chat/context')) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ enabled: false, results: [] }),
            })
        }

        if (url.includes('/api/chat/runs')) {
            let parsedBody: any = {}
            try {
                parsedBody = JSON.parse(route.request().postData() || '{}')
            } catch {}
            if (options.onChatRequest) {
                options.onChatRequest(parsedBody, url)
            }
            const runId = 'mock-run-' + Math.random().toString(36).slice(2)
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    created: true,
                    run: {
                        runId,
                        runType: 'chat',
                        conversationId: String(parsedBody.conversationId || '1'),
                        turnId: parsedBody.turnId || 'turn-1',
                        sourceUserMessageId: parsedBody.sourceUserMessageId || 'user-1',
                        assistantMessageId: parsedBody.assistantMessageId || 'asst-1',
                        status: 'completed',
                        provider: parsedBody.provider || 'openai',
                        model: parsedBody.model || 'deepseek-chat',
                        regeneratedFromRunId: null,
                        outputText: `Echo from ${parsedBody.model || 'unknown'}`,
                        lastSequence: 1,
                        errorCode: null,
                        errorMessage: null,
                        createdAt: new Date().toISOString(),
                        startedAt: new Date().toISOString(),
                        finishedAt: new Date().toISOString(),
                        cancelRequestedAt: null,
                    },
                }),
            })
        }

        if (url.includes('/api/chat')) {
            let parsedBody: any = {}
            try {
                parsedBody = JSON.parse(route.request().postData() || '{}')
            } catch {}
            if (options.onChatRequest) {
                options.onChatRequest(parsedBody, url)
            }
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
}

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

        // ─────────────────────────────────────────────────────────────
        // 断言 1: 登录后用户作用域目录自动重新加载，不卡在 idle
        // ─────────────────────────────────────────────────────────────
        {
            console.log('-> 断言 1: 验证登录后目录自动重新加载并绑定有效模型...')
            const context: BrowserContext = await browser.newContext()
            await context.addInitScript(() => {
                localStorage.setItem('ai-chat-settings', JSON.stringify({
                    transport: 'backend',
                    backend: {
                        url: 'http://localhost:3001',
                        provider: 'openai',
                        model: 'deepseek-chat',
                    },
                    showModelInTopbar: true,
                }))
            })
            const page = await context.newPage()
            await setupRouteMocking(page)

            await page.goto(appUrl)
            await page.waitForSelector('.topbar-model-text', { timeout: 10000 })
            const topbarTextInitial = await page.textContent('.topbar-model-text')
            assert.ok(topbarTextInitial && topbarTextInitial.includes('deepseek-chat'), `顶栏应展示有效模型，实际展示: ${topbarTextInitial}`)
            console.log(`   ✓ 页面加载后成功解析并展示当前模型: ${topbarTextInitial?.trim()}`)
            await context.close()
        }

        // ─────────────────────────────────────────────────────────────
        // 断言 2: 设置页只允许选择有效模型，切换模型不误清空服务目录
        // ─────────────────────────────────────────────────────────────
        {
            console.log('\n-> 断言 2: 验证设置页切换模型不会抹除服务卡片与候选选项...')
            const context = await browser.newContext()
            await context.addInitScript(() => {
                localStorage.setItem('ai-chat-settings', JSON.stringify({
                    transport: 'backend',
                    backend: {
                        url: 'http://localhost:3001',
                        provider: 'openai',
                        model: 'deepseek-chat',
                    },
                    showModelInTopbar: true,
                }))
            })
            const page = await context.newPage()
            await setupRouteMocking(page)

            await page.goto(appUrl)
            await page.waitForSelector('.settings-btn', { timeout: 10000 })
            await page.click('.settings-btn')
            await page.waitForSelector('#backend-model-select', { timeout: 5000 })

            const initialCardCount = await page.locator('.service-card').count()
            assert.ok(initialCardCount >= 3, `服务卡片数量应不少于 3，实际: ${initialCardCount}`)

            // 切换模型至 gpt-4o
            await page.selectOption('#backend-model-select', 'gpt-4o')
            await page.waitForFunction(() => {
                const sel = document.querySelector('#backend-model-select') as HTMLSelectElement
                return sel && sel.value === 'gpt-4o'
            })

            const afterSwitchCardCount = await page.locator('.service-card').count()
            assert.equal(afterSwitchCardCount, initialCardCount, '切换模型后服务卡片绝不能被误清空')
            const selectOptions = await page.locator('#backend-model-select option').allTextContents()
            assert.ok(selectOptions.includes('deepseek-chat'), '模型下拉框应保留 deepseek-chat 候选')
            assert.ok(selectOptions.includes('gpt-4o'), '模型下拉框应包含 gpt-4o 候选')

            await page.click('.btn-cancel')
            await page.waitForSelector('.settings-modal', { state: 'hidden', timeout: 5000 })
            console.log('   ✓ 设置页切换模型逻辑独立，服务卡片及各模型选项完好保留')
            await context.close()
        }

        // ─────────────────────────────────────────────────────────────
        // 断言 3: 已失效/已删除模型自动回退，真实发送后端聊天断言请求体
        // ─────────────────────────────────────────────────────────────
        {
            console.log('\n-> 断言 3: 验证已删除模型 (deleted-legacy-model) 自动回退且真实发送聊天生效...')
            const context = await browser.newContext()
            // 独立 Context 写入 deleted-legacy-model
            await context.addInitScript(() => {
                localStorage.setItem('ai-chat-settings', JSON.stringify({
                    transport: 'backend',
                    backend: {
                        url: 'http://localhost:3001',
                        provider: 'openai',
                        model: 'deleted-legacy-model',
                    },
                    showModelInTopbar: true,
                }))
            })
            const page = await context.newPage()

            const capturedChatBodies: any[] = []
            await setupRouteMocking(page, {
                onChatRequest: (body) => {
                    capturedChatBodies.push(body)
                },
            })

            await page.goto(appUrl)
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
            await page.click('.topbar-left')

            // 打开设置面板检查模型下拉框是否也已自动回退
            await page.click('.settings-btn')
            await page.waitForSelector('#backend-model-select', { timeout: 5000 })
            const settingsSelectedModel = await page.locator('#backend-model-select').inputValue()
            assert.equal(settingsSelectedModel, 'deepseek-chat', '设置页中也必须自动收敛为有效模型 deepseek-chat')
            const settingsOptions = await page.locator('#backend-model-select option').allTextContents()
            assert.ok(!settingsOptions.includes('deleted-legacy-model'), '设置页下拉候选不得插回已删除模型')
            await page.click('.btn-save')
            await page.waitForSelector('.settings-overlay', { state: 'hidden', timeout: 5000 })

            // 真实发送后端聊天，拦截并断言请求体 model 为回退后的新模型
            await page.waitForSelector('textarea.input-field', { timeout: 5000 })
            await page.fill('textarea.input-field', '测试已删除模型回退')
            const sendButton = page.locator('.send-btn')
            await page.waitForFunction(() => {
                const btn = document.querySelector('.send-btn') as HTMLButtonElement
                return btn && !btn.disabled
            })

            const chatResponsePromise = page.waitForResponse(res => res.url().includes('/api/chat'))
            await sendButton.click()
            await chatResponsePromise

            assert.ok(capturedChatBodies.length >= 1, '必须触发真实聊天请求')
            const lastChat = capturedChatBodies[capturedChatBodies.length - 1]
            assert.equal(lastChat.model, 'deepseek-chat', '真实发送的请求体 model 必须为回退后的 deepseek-chat')
            console.log(`   ✓ 顶栏与设置页准确收敛至有效模型，真实请求体 model: ${lastChat.model}`)
            await context.close()
        }

        // ─────────────────────────────────────────────────────────────
        // 断言 4: 对比页直连与后端草稿互切保持，且发送两列请求体对应草稿
        // ─────────────────────────────────────────────────────────────
        {
            console.log('\n-> 断言 4: 验证对比页直连与后端草稿互切保持与两列请求体映射...')
            const context = await browser.newContext()
            await context.addInitScript(() => {
                localStorage.setItem('ai-chat-settings', JSON.stringify({
                    transport: 'backend',
                    backend: {
                        url: 'http://localhost:3001',
                        provider: 'openai',
                        model: 'deepseek-chat',
                    },
                    showModelInTopbar: true,
                }))
            })
            const page = await context.newPage()

            const capturedCompareRequests: Array<{ url: string; body: any }> = []
            await setupRouteMocking(page, {
                onChatRequest: (body, url) => {
                    capturedCompareRequests.push({ url, body })
                },
            })

            await page.goto(appUrl)
            const compareNavButton = page.locator('.rail-button:has-text("模型对比")')
            await compareNavButton.click()
            await page.waitForSelector('#comparison-prompt', { timeout: 10000 })

            const model1Editor = page.locator('.runtime-editor').nth(0)
            const transportSelect1 = model1Editor.locator('select.field-input').nth(0)

            // 1. 测试草稿互切保持：从后端切到直连并修改直连参数
            await transportSelect1.selectOption('direct')
            await page.waitForFunction(() => {
                const editors = document.querySelectorAll('.runtime-editor')
                const sel = editors[0]?.querySelectorAll('select.field-input')[0] as HTMLSelectElement
                return sel && sel.value === 'direct'
            })

            const modelInput1 = model1Editor.locator('input[placeholder*="qwen2.5:7b"]')
            await modelInput1.fill('temp-direct-model-a')

            // 切回后端，验证恢复原后端模型
            await transportSelect1.selectOption('backend')
            await page.waitForFunction(() => {
                const editors = document.querySelectorAll('.runtime-editor')
                const sel = editors[0]?.querySelectorAll('select.field-input')[0] as HTMLSelectElement
                return sel && sel.value === 'backend'
            })
            const restoredBackendModel = await modelInput1.inputValue()
            assert.equal(restoredBackendModel, 'deepseek-chat', '切回后端必须完整恢复原后端模型')

            // 再切回直连，验证恢复 temp-direct-model-a
            await transportSelect1.selectOption('direct')
            await page.waitForFunction(() => {
                const editors = document.querySelectorAll('.runtime-editor')
                const sel = editors[0]?.querySelectorAll('select.field-input')[0] as HTMLSelectElement
                return sel && sel.value === 'direct'
            })
            const restoredDirectModel = await modelInput1.inputValue()
            assert.equal(restoredDirectModel, 'temp-direct-model-a', '切回直连必须恢复用户编辑的直连模型')

            // 切回后端以进行对比测试
            await transportSelect1.selectOption('backend')
            await page.waitForFunction(() => {
                const editors = document.querySelectorAll('.runtime-editor')
                const sel = editors[0]?.querySelectorAll('select.field-input')[0] as HTMLSelectElement
                return sel && sel.value === 'backend'
            })

            // 配置两列模型进行对比：模型 1 为 deepseek-chat，模型 2 为 deepseek-reasoner
            await model1Editor.locator('input[placeholder*="qwen2.5:7b"]').fill('deepseek-chat')
            const model2Editor = page.locator('.runtime-editor').nth(1)
            await model2Editor.locator('input[placeholder*="qwen2.5:7b"]').fill('deepseek-reasoner')

            await page.fill('#comparison-prompt', '请对比快速排序与归并排序的复杂度')

            capturedCompareRequests.length = 0

            const chatResponsePromise = page.waitForResponse(res => res.url().includes('/api/chat'))
            await page.click('button.compare-primary:has-text("开始对比")')
            await chatResponsePromise

            // 等待两个模型请求全部完成
            await page.waitForFunction(() => {
                const cards = document.querySelectorAll('.comparison-workspace .run-grid article')
                return cards.length >= 2
            }, { timeout: 10000 })

            assert.ok(capturedCompareRequests.length >= 2, `对比应至少发出 2 个模型请求，实际捕获: ${capturedCompareRequests.length}`)
            const modelsRequested = capturedCompareRequests.map(r => r.body.model || r.body.backendModel)
            assert.ok(modelsRequested.includes('deepseek-chat'), `请求必须包含 deepseek-chat，实际: ${modelsRequested}`)
            assert.ok(modelsRequested.includes('deepseek-reasoner'), `请求必须包含 deepseek-reasoner，实际: ${modelsRequested}`)

            console.log(`   ✓ 对比页草稿互切完整保持，两列请求准确对应草稿模型: ${modelsRequested.join(', ')}`)
            await context.close()
        }

        // ─────────────────────────────────────────────────────────────
        // 断言 5: 构造空模型服务，设置页测试按钮禁用或拦截，未向后端发送 /api/chat/test
        // ─────────────────────────────────────────────────────────────
        {
            console.log('\n-> 断言 5: 构造空模型服务，验证设置页测试按钮禁用/拦截防护...')
            const context = await browser.newContext()
            await context.addInitScript(() => {
                localStorage.setItem('ai-chat-settings', JSON.stringify({
                    transport: 'backend',
                    backend: {
                        url: 'http://localhost:3001',
                        provider: 'openai',
                        model: '',
                    },
                    showModelInTopbar: true,
                }))
            })
            const page = await context.newPage()

            let testApiCalled = false
            const emptyProviders = [
                {
                    id: 'openai',
                    name: 'OpenAI (空模型列表)',
                    defaultModel: '',
                    models: [],
                    configured: true,
                },
                {
                    id: 'ollama',
                    name: 'Ollama',
                    defaultModel: 'qwen2.5:7b',
                    models: ['qwen2.5:7b'],
                    configured: true,
                },
            ]

            await setupRouteMocking(page, {
                providers: emptyProviders,
                onTestRequest: () => {
                    testApiCalled = true
                },
            })

            await page.goto(appUrl)
            await page.waitForSelector('.settings-btn', { timeout: 10000 })
            await page.click('.settings-btn')
            await page.waitForSelector('#backend-model-select', { timeout: 5000 })

            // 确认当前选中的是 openai (空模型服务)
            await page.waitForSelector('.btn-test-model', { timeout: 5000 })
            const testButton = page.locator('.btn-test-model')

            const isDisabled = await testButton.isDisabled()
            assert.equal(isDisabled, true, '当厂商无可用模型时，测试按钮必须处于 disabled 状态')

            const title = await testButton.getAttribute('title')
            assert.ok(title && (title.includes('当前没有有效模型') || title.includes('服务')), `测试按钮提示应提示无有效模型，实际: ${title}`)

            // 尝试通过 DOM click 触发（绕过 disabled）
            await testButton.click({ force: true })
            await page.waitForTimeout(100)

            assert.equal(testApiCalled, false, '空模型时严禁向后端发送 /api/chat/test 请求')

            // 验证页面状态流提示友好拦截
            const flowText = await page.locator('.test-flow-text').textContent()
            assert.ok(
                flowText && (flowText.includes('当前没有有效模型') || flowText.includes('有') || flowText.includes('设置已保存')),
                `状态栏应显示正常状态或拦截提示，实际: ${flowText}`
            )

            console.log('   ✓ 空模型服务测试按钮准确处于禁用状态，拦截逻辑有效阻止无效网络请求')
            await context.close()
        }

        console.log('\n=== Playwright 页面端到端回归验证全部通过 (5/5) ===')
    } finally {
        if (browser) await browser.close()
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }
}

main().catch((err) => {
    console.error('Playwright 页面端到端回归验证失败:', err)
    process.exit(1)
})
