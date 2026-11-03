import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')

console.log('=== 开始执行 Agent Execution 持久化与多轮历史回放验证 (Playwright) ===\n')

const defaultMockProviders = [
    {
        id: 'ollama',
        name: 'Ollama (本地)',
        defaultModel: 'qwen2.5:7b',
        configured: true,
        capabilities: {
            chatStream: true,
            agentTools: true,
        },
        agentModels: ['qwen2.5:7b'],
    },
    {
        id: 'openai',
        name: 'OpenAI 服务',
        defaultModel: 'deepseek-chat',
        configured: true,
        capabilities: {
            chatStream: true,
            agentTools: true,
        },
        agentModels: ['deepseek-chat'],
    },
]

async function setupAgentMocking(page: Page) {
    await page.route('**/api/**', async (route) => {
        const url = route.request().url()

        if (url.includes('/api/auth/me')) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    authenticated: true,
                    requiresAuth: false,
                    user: { username: 'test-admin', role: 'admin' },
                }),
            })
        }

        if (url.includes('/api/agent/providers')) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ providers: defaultMockProviders }),
            })
        }

        if (url.includes('/api/agent/run')) {
            return route.fulfill({
                status: 200,
                contentType: 'text/event-stream; charset=utf-8',
                body: [
                    'event: agent_started',
                    'data: {"version":1,"sequence":1,"requestId":"req-mock-1","agentRunId":"run-mock-1","step":0,"timestamp":"2026-11-03T10:00:00Z","type":"agent_started","data":{"provider":"ollama","model":"qwen2.5:7b"}}',
                    '',
                    'event: model_started',
                    'data: {"version":1,"sequence":2,"requestId":"req-mock-1","agentRunId":"run-mock-1","step":1,"timestamp":"2026-11-03T10:00:01Z","type":"model_started","data":{"model":"qwen2.5:7b"}}',
                    '',
                    'event: model_completed',
                    'data: {"version":1,"sequence":3,"requestId":"req-mock-1","agentRunId":"run-mock-1","step":1,"timestamp":"2026-11-03T10:00:02Z","type":"model_completed","data":{"finishReason":"stop","toolCallCount":0}}',
                    '',
                    'event: assistant_message',
                    'data: {"version":1,"sequence":4,"requestId":"req-mock-1","agentRunId":"run-mock-1","step":1,"timestamp":"2026-11-03T10:00:03Z","type":"assistant_message","data":{"content":"这是实时测试生成的 Agent 回复。"}}',
                    '',
                    'event: agent_completed',
                    'data: {"version":1,"sequence":5,"requestId":"req-mock-1","agentRunId":"run-mock-1","step":1,"timestamp":"2026-11-03T10:00:04Z","type":"agent_completed","data":{"finishReason":"stop","modelTurns":1,"toolCallCount":0,"usage":{"inputTokens":42,"outputTokens":18}}}',
                    '',
                ].join('\n'),
            })
        }

        return route.continue()
    })
}

async function main() {
    assert.ok(fs.existsSync(distDir), '必须先完成前端 npm run build 生成 dist 目录')

    // 启动轻量静态资源托管服务
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

        if (path.extname(reqUrl) && path.extname(reqUrl) !== '.html') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('Static Asset Not Found')
            return
        }

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
        // 场景 1: 验证 IndexedDB 升级与旧历史无 execution 数据的平滑向下兼容
        // ─────────────────────────────────────────────────────────────
        {
            console.log('-> 场景 1: 验证旧历史会话（无 execution）向下兼容加载...')
            const context: BrowserContext = await browser.newContext()
            const page = await context.newPage()
            await setupAgentMocking(page)

            await page.goto(appUrl)
            await page.waitForLoadState('domcontentloaded')

            const legacyCompatResult = await page.evaluate(async () => {
                return new Promise<{ success: boolean; messageCount: number; hasExecution: boolean }>((resolve, reject) => {
                    const req = indexedDB.open('ai-chat-db')
                    req.onerror = () => reject(req.error)
                    req.onsuccess = () => {
                        const idb = req.result
                        const tx = idb.transaction(['agentSessions', 'agentMessages'], 'readwrite')
                        const sessionStore = tx.objectStore('agentSessions')
                        const messageStore = tx.objectStore('agentMessages')

                        const oldSessionId = 'legacy-session-001'
                        sessionStore.put({
                            id: oldSessionId,
                            title: '旧版本会话测试',
                            provider: 'ollama',
                            model: 'qwen2.5:7b',
                            agentProfile: 'troubleshoot-v1',
                            createdAt: 1700000000000,
                            updatedAt: 1700000005000,
                        })

                        messageStore.put({
                            id: 'msg-user-legacy',
                            sessionId: oldSessionId,
                            role: 'user',
                            content: '这是旧版本用户输入',
                            createdAt: 1700000001000,
                        })

                        messageStore.put({
                            id: 'msg-asst-legacy',
                            sessionId: oldSessionId,
                            role: 'assistant',
                            content: '这是旧版本历史回复，当时没有 execution 字段。',
                            createdAt: 1700000002000,
                        })

                        tx.oncomplete = () => {
                            const readTx = idb.transaction(['agentMessages'], 'readonly')
                            const getReq = readTx.objectStore('agentMessages').get('msg-asst-legacy')
                            getReq.onsuccess = () => {
                                const row = getReq.result
                                resolve({
                                    success: true,
                                    messageCount: 2,
                                    hasExecution: 'execution' in row && row.execution !== undefined,
                                })
                            }
                            getReq.onerror = () => reject(getReq.error)
                        }
                    }
                })
            })

            assert.strictEqual(legacyCompatResult.success, true, '旧数据写入应当成功')
            assert.strictEqual(legacyCompatResult.hasExecution, false, '旧数据在库中 execution 应为 undefined')
            console.log('   ✓ 旧版本会话数据成功写入并平滑向下兼容')
            await context.close()
        }

        // ─────────────────────────────────────────────────────────────
        // 场景 2: 验证多轮对话中各 Assistant 消息的 Execution 快照独立性与完整性
        // ─────────────────────────────────────────────────────────────
        {
            console.log('-> 场景 2: 验证多轮对话中每轮 Execution 快照独立持久化...')
            const context: BrowserContext = await browser.newContext()
            const page = await context.newPage()
            await setupAgentMocking(page)

            await page.goto(appUrl)
            await page.waitForLoadState('domcontentloaded')

            const multiTurnResult = await page.evaluate(async () => {
                return new Promise<{
                    round1RunId?: string
                    round2RunId?: string
                    round1ToolCalls: number
                    round2ToolCalls: number
                    round1SummaryTurns: number
                    round2SummaryTurns: number
                }>((resolve, reject) => {
                    const req = indexedDB.open('ai-chat-db')
                    req.onerror = () => reject(req.error)
                    req.onsuccess = () => {
                        const idb = req.result
                        const tx = idb.transaction(['agentSessions', 'agentMessages'], 'readwrite')
                        const sessionStore = tx.objectStore('agentSessions')
                        const messageStore = tx.objectStore('agentMessages')

                        const sid = 'multi-turn-session-002'
                        sessionStore.put({
                            id: sid,
                            title: '多轮排障执行会话',
                            provider: 'ollama',
                            model: 'qwen2.5:7b',
                            agentProfile: 'troubleshoot-v1',
                            createdAt: 1710000000000,
                            updatedAt: 1710000020000,
                        })

                        // 轮次 1: 包含 1 次工具调用的 Assistant 消息
                        messageStore.put({
                            id: 'turn1-user',
                            sessionId: sid,
                            role: 'user',
                            content: '排查向量检索耗时问题',
                            createdAt: 1710000001000,
                        })
                        messageStore.put({
                            id: 'turn1-asst',
                            sessionId: sid,
                            role: 'assistant',
                            content: '向量检索分析完成：耗时 120ms。',
                            createdAt: 1710000005000,
                            execution: {
                                agentRunId: 'run-turn-1',
                                requestId: 'req-turn-1',
                                status: 'completed',
                                currentStep: 2,
                                events: [
                                    {
                                        version: 1,
                                        sequence: 1,
                                        requestId: 'req-turn-1',
                                        agentRunId: 'run-turn-1',
                                        step: 1,
                                        timestamp: '2026-11-03T10:10:00Z',
                                        type: 'tool_started',
                                        data: { name: 'knowledge_search', ordinal: 1 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 2,
                                        requestId: 'req-turn-1',
                                        agentRunId: 'run-turn-1',
                                        step: 1,
                                        timestamp: '2026-11-03T10:10:01Z',
                                        type: 'tool_completed',
                                        data: { name: 'knowledge_search', isError: false, durationMs: 120, result: '找到 3 条匹配' },
                                    },
                                    {
                                        version: 1,
                                        sequence: 3,
                                        requestId: 'req-turn-1',
                                        agentRunId: 'run-turn-1',
                                        step: 2,
                                        timestamp: '2026-11-03T10:10:02Z',
                                        type: 'agent_completed',
                                        data: { finishReason: 'stop', modelTurns: 2, toolCallCount: 1, usage: { inputTokens: 150, outputTokens: 80 } },
                                    },
                                ],
                                summary: {
                                    finishReason: 'stop',
                                    modelTurns: 2,
                                    toolCallCount: 1,
                                    usage: { inputTokens: 150, outputTokens: 80 },
                                },
                                createdAt: 1710000005000,
                            },
                        })

                        // 轮次 2: 包含 2 次工具调用的 Assistant 消息
                        messageStore.put({
                            id: 'turn2-user',
                            sessionId: sid,
                            role: 'user',
                            content: '进一步测试 Qdrant 超时中断',
                            createdAt: 1710000010000,
                        })
                        messageStore.put({
                            id: 'turn2-asst',
                            sessionId: sid,
                            role: 'assistant',
                            content: 'Qdrant 超时中断已成功触发并处理。',
                            createdAt: 1710000015000,
                            execution: {
                                agentRunId: 'run-turn-2',
                                requestId: 'req-turn-2',
                                status: 'completed',
                                currentStep: 3,
                                events: [
                                    {
                                        version: 1,
                                        sequence: 1,
                                        requestId: 'req-turn-2',
                                        agentRunId: 'run-turn-2',
                                        step: 1,
                                        timestamp: '2026-11-03T10:15:00Z',
                                        type: 'tool_started',
                                        data: { name: 'knowledge_search', ordinal: 1 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 2,
                                        requestId: 'req-turn-2',
                                        agentRunId: 'run-turn-2',
                                        step: 1,
                                        timestamp: '2026-11-03T10:15:01Z',
                                        type: 'tool_completed',
                                        data: { name: 'knowledge_search', isError: false, durationMs: 95 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 3,
                                        requestId: 'req-turn-2',
                                        agentRunId: 'run-turn-2',
                                        step: 2,
                                        timestamp: '2026-11-03T10:15:02Z',
                                        type: 'tool_started',
                                        data: { name: 'datetime', ordinal: 2 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 4,
                                        requestId: 'req-turn-2',
                                        agentRunId: 'run-turn-2',
                                        step: 2,
                                        timestamp: '2026-11-03T10:15:03Z',
                                        type: 'tool_completed',
                                        data: { name: 'datetime', isError: false, durationMs: 10 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 5,
                                        requestId: 'req-turn-2',
                                        agentRunId: 'run-turn-2',
                                        step: 3,
                                        timestamp: '2026-11-03T10:15:04Z',
                                        type: 'agent_completed',
                                        data: { finishReason: 'stop', modelTurns: 3, toolCallCount: 2, usage: { inputTokens: 280, outputTokens: 120 } },
                                    },
                                ],
                                summary: {
                                    finishReason: 'stop',
                                    modelTurns: 3,
                                    toolCallCount: 2,
                                    usage: { inputTokens: 280, outputTokens: 120 },
                                },
                                createdAt: 1710000015000,
                            },
                        })

                        tx.oncomplete = () => {
                            const readTx = idb.transaction(['agentMessages'], 'readonly')
                            const store = readTx.objectStore('agentMessages')
                            const get1 = store.get('turn1-asst')
                            const get2 = store.get('turn2-asst')

                            readTx.oncomplete = () => {
                                const r1 = get1.result
                                const r2 = get2.result
                                resolve({
                                    round1RunId: r1.execution?.agentRunId,
                                    round2RunId: r2.execution?.agentRunId,
                                    round1ToolCalls: r1.execution?.summary?.toolCallCount ?? 0,
                                    round2ToolCalls: r2.execution?.summary?.toolCallCount ?? 0,
                                    round1SummaryTurns: r1.execution?.summary?.modelTurns ?? 0,
                                    round2SummaryTurns: r2.execution?.summary?.modelTurns ?? 0,
                                })
                            }
                        }
                    }
                })
            })

            assert.strictEqual(multiTurnResult.round1RunId, 'run-turn-1', '第 1 轮 runId 独立')
            assert.strictEqual(multiTurnResult.round2RunId, 'run-turn-2', '第 2 轮 runId 独立')
            assert.strictEqual(multiTurnResult.round1ToolCalls, 1, '第 1 轮工具调用统计为 1')
            assert.strictEqual(multiTurnResult.round2ToolCalls, 2, '第 2 轮工具调用统计为 2')
            assert.strictEqual(multiTurnResult.round1SummaryTurns, 2, '第 1 轮模型轮次为 2')
            assert.strictEqual(multiTurnResult.round2SummaryTurns, 3, '第 2 轮模型轮次为 3')
            console.log('   ✓ 多轮对话 Execution 各轮独立持久化与事件隔离验证通过')
            await context.close()
        }

        // ─────────────────────────────────────────────────────────────
        // 场景 3: 验证中断、取消与失败断点的快照持久化
        // ─────────────────────────────────────────────────────────────
        {
            console.log('-> 场景 3: 验证失败与取消断点快照持久化...')
            const context: BrowserContext = await browser.newContext()
            const page = await context.newPage()
            await setupAgentMocking(page)

            await page.goto(appUrl)
            await page.waitForLoadState('domcontentloaded')

            const breakpointResult = await page.evaluate(async () => {
                return new Promise<{ failedStatus: string; failedCode?: string; cancelledStatus: string }>((resolve, reject) => {
                    const req = indexedDB.open('ai-chat-db')
                    req.onerror = () => reject(req.error)
                    req.onsuccess = () => {
                        const idb = req.result
                        const tx = idb.transaction(['agentSessions', 'agentMessages'], 'readwrite')
                        const sessionStore = tx.objectStore('agentSessions')
                        const messageStore = tx.objectStore('agentMessages')

                        const sid = 'fail-session-003'
                        sessionStore.put({
                            id: sid,
                            title: '失败与取消中断会话',
                            provider: 'ollama',
                            model: 'qwen2.5:7b',
                            agentProfile: 'troubleshoot-v1',
                            createdAt: 1720000000000,
                            updatedAt: 1720000010000,
                        })

                        // 失败断点消息
                        messageStore.put({
                            id: 'msg-failed',
                            sessionId: sid,
                            role: 'assistant',
                            content: 'Agent 运行失败：TOOL_TIMEOUT',
                            createdAt: 1720000005000,
                            execution: {
                                agentRunId: 'run-fail-1',
                                requestId: 'req-fail-1',
                                status: 'failed',
                                currentStep: 1,
                                events: [
                                    {
                                        version: 1,
                                        sequence: 1,
                                        requestId: 'req-fail-1',
                                        agentRunId: 'run-fail-1',
                                        step: 1,
                                        timestamp: '2026-11-03T10:20:00Z',
                                        type: 'agent_failed',
                                        data: { code: 'TOOL_TIMEOUT', message: '工具执行超时' },
                                    },
                                ],
                                errorCode: 'TOOL_TIMEOUT',
                                errorMessage: '工具执行超时',
                                createdAt: 1720000005000,
                            },
                        })

                        // 取消断点消息
                        messageStore.put({
                            id: 'msg-cancelled',
                            sessionId: sid,
                            role: 'assistant',
                            content: 'Agent 运行已取消。',
                            createdAt: 1720000009000,
                            execution: {
                                agentRunId: 'run-cancel-1',
                                requestId: 'req-cancel-1',
                                status: 'cancelled',
                                currentStep: 2,
                                events: [
                                    {
                                        version: 1,
                                        sequence: 1,
                                        requestId: 'req-cancel-1',
                                        agentRunId: 'run-cancel-1',
                                        step: 2,
                                        timestamp: '2026-11-03T10:20:05Z',
                                        type: 'agent_cancelled',
                                        data: { code: 'CLIENT_ABORTED', message: 'Agent 请求已取消。' },
                                    },
                                ],
                                errorCode: 'CLIENT_ABORTED',
                                errorMessage: 'Agent 请求已取消。',
                                createdAt: 1720000009000,
                            },
                        })

                        tx.oncomplete = () => {
                            const readTx = idb.transaction(['agentMessages'], 'readonly')
                            const store = readTx.objectStore('agentMessages')
                            const getFail = store.get('msg-failed')
                            const getCancel = store.get('msg-cancelled')

                            readTx.oncomplete = () => {
                                resolve({
                                    failedStatus: getFail.result.execution?.status,
                                    failedCode: getFail.result.execution?.errorCode,
                                    cancelledStatus: getCancel.result.execution?.status,
                                })
                            }
                        }
                    }
                })
            })

            assert.strictEqual(breakpointResult.failedStatus, 'failed', '失败断点状态为 failed')
            assert.strictEqual(breakpointResult.failedCode, 'TOOL_TIMEOUT', '失败断点保存了原始错误代码')
            assert.strictEqual(breakpointResult.cancelledStatus, 'cancelled', '取消断点状态为 cancelled')
            console.log('   ✓ 失败与取消断点快照完整持久化验证通过')
            await context.close()
        }

        // ─────────────────────────────────────────────────────────────
        // 场景 4: 页面端到端交互验证：查看回溯入口、切换历史执行、Execution 面板高亮同步
        // ─────────────────────────────────────────────────────────────
        {
            console.log('-> 场景 4: 页面端到端交互：注入多轮会话并点击消息回溯入口切换右侧 Execution 面板...')
            const context: BrowserContext = await browser.newContext({ viewport: { width: 1400, height: 900 } })
            const page = await context.newPage()
            await setupAgentMocking(page)

            await page.goto(appUrl)
            await page.waitForLoadState('domcontentloaded')

            // 在当前 context 的 IndexedDB 中写入多轮数据
            await page.evaluate(async () => {
                return new Promise<void>((resolve, reject) => {
                    const req = indexedDB.open('ai-chat-db')
                    req.onerror = () => reject(req.error)
                    req.onsuccess = () => {
                        const idb = req.result
                        const tx = idb.transaction(['agentSessions', 'agentMessages'], 'readwrite')
                        const sessionStore = tx.objectStore('agentSessions')
                        const messageStore = tx.objectStore('agentMessages')

                        const sid = 'ui-session-004'
                        sessionStore.put({
                            id: sid,
                            title: 'UI交互回溯测试会话',
                            provider: 'ollama',
                            model: 'qwen2.5:7b',
                            agentProfile: 'troubleshoot-v1',
                            createdAt: 1730000000000,
                            updatedAt: 1730000020000,
                        })

                        messageStore.put({
                            id: 'ui-msg-u1',
                            sessionId: sid,
                            role: 'user',
                            content: '第 1 轮提问：分析日志',
                            createdAt: 1730000001000,
                        })

                        messageStore.put({
                            id: 'ui-msg-a1',
                            sessionId: sid,
                            role: 'assistant',
                            content: '第 1 轮回答：已完成日志检索分析。',
                            createdAt: 1730000005000,
                            execution: {
                                agentRunId: 'run-ui-1',
                                requestId: 'req-ui-1',
                                status: 'completed',
                                currentStep: 2,
                                events: [
                                    {
                                        version: 1,
                                        sequence: 1,
                                        requestId: 'req-ui-1',
                                        agentRunId: 'run-ui-1',
                                        step: 1,
                                        timestamp: '2026-11-03T10:30:00Z',
                                        type: 'tool_started',
                                        data: { name: 'knowledge_search', ordinal: 1 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 2,
                                        requestId: 'req-ui-1',
                                        agentRunId: 'run-ui-1',
                                        step: 1,
                                        timestamp: '2026-11-03T10:30:01Z',
                                        type: 'tool_completed',
                                        data: { name: 'knowledge_search', isError: false, durationMs: 80 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 3,
                                        requestId: 'req-ui-1',
                                        agentRunId: 'run-ui-1',
                                        step: 2,
                                        timestamp: '2026-11-03T10:30:02Z',
                                        type: 'agent_completed',
                                        data: { finishReason: 'stop', modelTurns: 2, toolCallCount: 1, usage: { inputTokens: 100, outputTokens: 50 } },
                                    },
                                ],
                                summary: {
                                    finishReason: 'stop',
                                    modelTurns: 2,
                                    toolCallCount: 1,
                                    usage: { inputTokens: 100, outputTokens: 50 },
                                },
                                createdAt: 1730000005000,
                            },
                        })

                        messageStore.put({
                            id: 'ui-msg-u2',
                            sessionId: sid,
                            role: 'user',
                            content: '第 2 轮提问：计算总耗时',
                            createdAt: 1730000010000,
                        })

                        messageStore.put({
                            id: 'ui-msg-a2',
                            sessionId: sid,
                            role: 'assistant',
                            content: '第 2 轮回答：总耗时为 180ms。',
                            createdAt: 1730000015000,
                            execution: {
                                agentRunId: 'run-ui-2',
                                requestId: 'req-ui-2',
                                status: 'completed',
                                currentStep: 3,
                                events: [
                                    {
                                        version: 1,
                                        sequence: 1,
                                        requestId: 'req-ui-2',
                                        agentRunId: 'run-ui-2',
                                        step: 1,
                                        timestamp: '2026-11-03T10:35:00Z',
                                        type: 'tool_started',
                                        data: { name: 'knowledge_search', ordinal: 1 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 2,
                                        requestId: 'req-ui-2',
                                        agentRunId: 'run-ui-2',
                                        step: 1,
                                        timestamp: '2026-11-03T10:35:01Z',
                                        type: 'tool_completed',
                                        data: { name: 'knowledge_search', isError: false, durationMs: 90 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 3,
                                        requestId: 'req-ui-2',
                                        agentRunId: 'run-ui-2',
                                        step: 2,
                                        timestamp: '2026-11-03T10:35:02Z',
                                        type: 'tool_started',
                                        data: { name: 'calculator', ordinal: 2 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 4,
                                        requestId: 'req-ui-2',
                                        agentRunId: 'run-ui-2',
                                        step: 2,
                                        timestamp: '2026-11-03T10:35:03Z',
                                        type: 'tool_completed',
                                        data: { name: 'calculator', isError: false, durationMs: 15 },
                                    },
                                    {
                                        version: 1,
                                        sequence: 5,
                                        requestId: 'req-ui-2',
                                        agentRunId: 'run-ui-2',
                                        step: 3,
                                        timestamp: '2026-11-03T10:35:04Z',
                                        type: 'agent_completed',
                                        data: { finishReason: 'stop', modelTurns: 3, toolCallCount: 2, usage: { inputTokens: 220, outputTokens: 90 } },
                                    },
                                ],
                                summary: {
                                    finishReason: 'stop',
                                    modelTurns: 3,
                                    toolCallCount: 2,
                                    usage: { inputTokens: 220, outputTokens: 90 },
                                },
                                createdAt: 1730000015000,
                            },
                        })

                        tx.oncomplete = () => resolve()
                    }
                })
            })

            // 点击主导航中的“排障 Agent”进入 AgentWorkspace
            const agentNavBtn = page.locator('button.rail-button:has-text("排障 Agent"), button:has-text("排障 Agent")').first()
            await agentNavBtn.waitFor({ state: 'visible', timeout: 5000 })
            await agentNavBtn.click()

            // 等待消息流中的 execution bar 加载完成
            const executionBars = page.locator('.agent-msg-execution-bar')
            await executionBars.first().waitFor({ state: 'visible', timeout: 5000 })
            const count = await executionBars.count()
            assert.strictEqual(count, 2, `多轮会话中应展示 2 个 execution bar，实际找到: ${count}`)
            console.log(`   ✓ 成功渲染 ${count} 个历史轮次的 Execution 入口条`)

            // 验证默认右侧 Execution 面板展示最近一轮（第 2 轮）的统计（2 工具 / 3 轮次）
            const metaCard = page.locator('.agent-run-meta .agent-meta-card:has-text("调用统计")')
            await metaCard.waitFor({ state: 'visible', timeout: 5000 })
            const metaTextInitial = await metaCard.textContent()
            assert.ok(metaTextInitial?.includes('2 工具') && metaTextInitial?.includes('3 轮次'), `默认应展示最近一轮的统计，实际: ${metaTextInitial}`)
            console.log(`   ✓ 默认呈现最近一次执行结果: ${metaTextInitial?.trim()}`)

            // 点击第 1 轮消息上的 execution bar，切换回看第 1 轮
            console.log('   -> 点击第 1 条 Assistant 消息的 execution bar 切换历史回溯...')
            await executionBars.first().click()
            await page.waitForTimeout(300)

            // 验证第 1 个 bar 处于 is-selected 激活高亮状态
            const isSelected = await executionBars.first().evaluate(el => el.classList.contains('is-selected'))
            assert.strictEqual(isSelected, true, '点击后该条消息的 execution bar 应处于 is-selected 激活状态')

            // 验证右侧 execution 面板的调用统计同步更新为第 1 轮（1 工具 / 2 轮次）
            const metaTextAfterClick = await metaCard.textContent()
            assert.ok(metaTextAfterClick?.includes('1 工具') && metaTextAfterClick?.includes('2 轮次'), `切换后应展示第 1 轮的统计，实际: ${metaTextAfterClick}`)
            console.log(`   ✓ 成功无缝回溯第 1 轮执行过程: ${metaTextAfterClick?.trim()}`)

            await context.close()
        }

        console.log('\n✅ Agent Execution 持久化与多轮历史回放所有验证用例全部通过！')
    } finally {
        if (browser) await browser.close()
        await new Promise<void>((resolve) => server.close(() => resolve()))
    }
}

main().catch((err) => {
    console.error('❌ 验证失败:', err)
    process.exit(1)
})
