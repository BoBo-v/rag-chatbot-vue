import assert from 'node:assert/strict'
import {
    resolveTargetBaseUrl,
} from '../src/services/api'
import {
    getBackendProvidersCatalog,
    getCachedBackendProvidersCatalog,
    resetBackendProvidersCatalog,
    buildCatalogCacheKey,
    type BackendChatProvider,
} from '../src/services/knowledge'
import {
    resolveActiveConnection,
    directToBackendProvider,
    backendToDirectProvider,
} from '../src/services/activeConnection'
import {
    createRuntimeFromSettings,
} from '../src/services/runtime'
import {
    createBackendChatRun,
    cancelBackendChatRun,
    getBackendChatRun,
} from '../src/services/providers/backendChatRun'
import type { AppSettings } from '../src/stores/settings'

console.log('=== 开始执行第一批专项验证：统一元数据与连接解析状态 ===\n')

// ── 辅助工具：模拟 fetch 分发器 ──
type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>
let currentFetchHandler: FetchHandler | null = null

const originalFetch = globalThis.fetch
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    if (currentFetchHandler) {
        return currentFetchHandler(url, init)
    }
    return originalFetch(input, init)
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

// ── 测试用 settings 工厂 ──
function createMockSettings(overrides: Partial<AppSettings> = {}): AppSettings {
    return {
        theme: 'system',
        systemPrompt: 'You are an AI assistant',
        maxContextTokens: 4096,
        responseTimeoutSeconds: 60,
        showModelInTopbar: true,
        transport: 'backend',
        provider: 'ollama',
        ragMode: 'auto',
        ollama: { url: 'http://localhost:11434', model: 'qwen2.5:7b' },
        openai: { baseUrl: 'https://api.openai.com', apiKey: 'sk-direct', model: 'gpt-4o' },
        claude: { apiKey: 'sk-ant-direct', model: 'claude-sonnet-4-6' },
        backend: { url: 'http://127.0.0.1:3000', provider: 'ollama', model: 'qwen2.5:7b' },
        ...overrides,
    }
}

async function runTests() {
    // 0. Provider 命名空间双向转换验证
    assert.equal(directToBackendProvider('claude'), 'anthropic')
    assert.equal(directToBackendProvider('openai'), 'openai')
    assert.equal(directToBackendProvider('ollama'), 'ollama')
    assert.equal(backendToDirectProvider('anthropic'), 'claude')
    assert.equal(backendToDirectProvider('openai'), 'openai')
    assert.equal(backendToDirectProvider('ollama'), 'ollama')
    assert.equal(resolveTargetBaseUrl('http://test-server:3000/api/'), 'http://test-server:3000')
    assert.ok(buildCatalogCacheKey('http://test-server:3000').includes('http://test-server:3000'))
    console.log('✓ [Provider 命名空间] 双向映射函数准确对应直连与后端 ID')

    // ── 断言 1：A、B 两个地址并发发起拉取且逆序返回，各自缓存 Key 均独立且正确更新，互不影响 ──
    {
        console.log('\n[断言 1] 测试并发 A、B 逆序返回与缓存键隔离...')
        resetBackendProvidersCatalog()

        const urlA = 'http://backend-server-a:3000'
        const urlB = 'http://backend-server-b:3000'

        let resolveA!: (value: Response) => void
        const promiseA = new Promise<Response>(r => { resolveA = r })

        let resolveB!: (value: Response) => void
        const promiseB = new Promise<Response>(r => { resolveB = r })

        currentFetchHandler = async (url) => {
            if (url.startsWith(urlA)) return promiseA
            if (url.startsWith(urlB)) return promiseB
            return jsonResponse({ providers: [] })
        }

        const taskA = getBackendProvidersCatalog({ baseUrl: urlA, forceRefresh: true })
        const taskB = getBackendProvidersCatalog({ baseUrl: urlB, forceRefresh: true })

        // 逆序完成：B 先返回，A 后返回
        resolveB(jsonResponse({
            providers: [{ id: 'anthropic', name: 'Claude on B', configured: true, defaultModel: 'claude-3-5' }],
        }))

        const catalogB = await taskB
        assert.equal(catalogB.state, 'success')
        assert.equal(catalogB.baseUrl, urlB)
        assert.equal(catalogB.providers[0].name, 'Claude on B')

        // 此时 A 仍在进行中，缓存中只有 B 成功
        const cachedB = getCachedBackendProvidersCatalog(urlB)
        assert.equal(cachedB?.state, 'success')
        assert.equal(cachedB?.providers[0].name, 'Claude on B')

        resolveA(jsonResponse({
            providers: [{ id: 'ollama', name: 'Ollama on A', configured: true, defaultModel: 'qwen2.5:7b' }],
        }))

        const catalogA = await taskA
        assert.equal(catalogA.state, 'success')
        assert.equal(catalogA.baseUrl, urlA)
        assert.equal(catalogA.providers[0].name, 'Ollama on A')

        // 验证两者互不影响
        assert.equal(getCachedBackendProvidersCatalog(urlA)?.providers[0].name, 'Ollama on A')
        assert.equal(getCachedBackendProvidersCatalog(urlB)?.providers[0].name, 'Claude on B')
        console.log('✓ [断言 1 通过] A、B 并发逆序返回，各作用域缓存独立正确更新')
    }

    // ── 断言 2：同一地址旧响应绝不覆盖新响应；用户登出后迟到的响应绝不重新写入缓存 ──
    {
        console.log('\n[断言 2] 测试旧响应防覆盖与登出/会话重置后迟到响应防污染...')
        resetBackendProvidersCatalog()
        const testUrl = 'http://anti-race-host:3000'

        let resolveOldReq!: (value: Response) => void
        const oldReqPromise = new Promise<Response>(r => { resolveOldReq = r })

        let resolveNewReq!: (value: Response) => void
        const newReqPromise = new Promise<Response>(r => { resolveNewReq = r })

        let reqCount = 0
        currentFetchHandler = async (url) => {
            if (url.startsWith(testUrl)) {
                reqCount++
                if (reqCount === 1) return oldReqPromise
                if (reqCount === 2) return newReqPromise
            }
            return jsonResponse({ providers: [] })
        }

        // 发起请求 1
        const promise1 = getBackendProvidersCatalog({ baseUrl: testUrl, forceRefresh: true }).catch(err => err)
        // 发起请求 2 (forceRefresh 递增 seq)
        const promise2 = getBackendProvidersCatalog({ baseUrl: testUrl, forceRefresh: true })

        // 请求 2 先返回最新数据
        resolveNewReq(jsonResponse({
            providers: [{ id: 'openai', name: 'Latest OpenAI', configured: true, defaultModel: 'gpt-4o-latest' }],
        }))
        const cat2 = await promise2
        assert.equal(cat2.state, 'success')
        assert.equal(cat2.providers[0].name, 'Latest OpenAI')

        // 请求 1 迟到返回旧数据
        resolveOldReq(jsonResponse({
            providers: [{ id: 'openai', name: 'Stale Old OpenAI', configured: true, defaultModel: 'gpt-3.5-turbo' }],
        }))
        await promise1

        // 缓存中必须依然是请求 2 的数据，绝不可被请求 1 覆盖！
        const finalCached = getCachedBackendProvidersCatalog(testUrl)
        assert.equal(finalCached?.providers[0].name, 'Latest OpenAI')
        assert.notEqual(finalCached?.providers[0].name, 'Stale Old OpenAI')

        // 登出/重置测试
        let resolveLogoutReq!: (value: Response) => void
        const logoutReqPromise = new Promise<Response>(r => { resolveLogoutReq = r })
        currentFetchHandler = async () => logoutReqPromise

        const promise3 = getBackendProvidersCatalog({ baseUrl: testUrl, forceRefresh: true }).catch(err => err)
        // 模拟用户登出 / sessionVersion 递增并清空缓存
        resetBackendProvidersCatalog()
        assert.equal(getCachedBackendProvidersCatalog(testUrl), undefined)

        // 迟到返回
        resolveLogoutReq(jsonResponse({
            providers: [{ id: 'ollama', name: 'Logout Ghost Data', configured: true, defaultModel: 'test' }],
        }))
        await promise3

        // 缓存中绝不能重新写入已被注销的脏数据
        assert.equal(getCachedBackendProvidersCatalog(testUrl), undefined)
        console.log('✓ [断言 2 通过] 旧请求绝不覆盖新请求，登出后迟到响应绝不回写缓存')
    }

    // ── 断言 3：后端默认模型已被服务端删除时，自动回退到服务端公布的有效候选首项；无可用候选时禁止发送 ──
    {
        console.log('\n[断言 3] 测试服务端删除 defaultModel 时的非猜测回退与空候选拦截...')
        const baseSettings = createMockSettings({
            transport: 'backend',
            backend: { url: 'http://backend:3000', provider: 'openai', model: 'user-old-choice' },
        })

        // 情形 A：用户选的模型和服务端 defaultModel 均被删除，但 models 包含有效候选
        const catalogWithDeletedDefault: BackendChatProvider[] = [{
            id: 'openai',
            name: 'OpenAI Server',
            configured: true,
            defaultModel: 'deleted-gpt-model', // defaultModel 不在 models 里
            models: ['gpt-4o-active', 'gpt-4o-mini'],
        }]

        const connA = resolveActiveConnection(baseSettings, catalogWithDeletedDefault)
        assert.equal(connA.isConfigured, true)
        // 必须回退到公布有效候选首项 gpt-4o-active，绝不猜 qwen2.5:7b 或保留已失效的 deleted-gpt-model
        assert.equal(connA.model, 'gpt-4o-active')
        assert.equal(connA.error, undefined)

        // 情形 B：服务端 models 明确为空数组（无可用候选）
        const catalogEmptyModels: BackendChatProvider[] = [{
            id: 'openai',
            name: 'OpenAI Server',
            configured: true,
            defaultModel: 'any',
            models: [],
        }]
        const connB = resolveActiveConnection(baseSettings, catalogEmptyModels)
        assert.equal(connB.isConfigured, false)
        assert.equal(connB.model, '')
        assert.ok(connB.error?.includes('无可用模型候选'))

        // 情形 C：后端 Provider 未在目录中配置（比如选了 anthropic 但后端只有 ollama）
        const catalogOnlyOllama: BackendChatProvider[] = [{
            id: 'ollama',
            name: 'Ollama Server',
            configured: true,
            defaultModel: 'qwen2.5:7b',
            models: ['qwen2.5:7b'],
        }]
        const connC = resolveActiveConnection({
            ...baseSettings,
            backend: { url: 'http://backend:3000', provider: 'anthropic', model: 'claude-3-5' },
        }, catalogOnlyOllama)
        assert.equal(connC.isConfigured, false)
        assert.equal(connC.model, '')
        assert.ok(connC.error?.includes('后端未配置厂商'))
        console.log('✓ [断言 3 通过] 自动回退有效候选首项，空候选明确禁止发送，绝不跨厂商硬编码猜模型')
    }

    // ── 断言 4：任务生成中切换顶栏连接、页面刷新后恢复任务、恢复后点击停止，全流程请求均准确打向原 Fastify 后端 ──
    {
        console.log('\n[断言 4] 测试任务全链路 baseUrl 准确绑定原 Fastify 后端...')
        const fastifyOrigin1 = 'http://fastify-host-alpha:3001'
        const fastifyOrigin2 = 'http://fastify-host-beta:3002'

        const requestedUrls: string[] = []
        const createMockSnapshot = (status: any = 'running') => ({
            runId: 'run-123',
            runType: 'chat' as const,
            conversationId: '1',
            turnId: 'turn-1',
            sourceUserMessageId: 'user-1',
            assistantMessageId: 'ai-1',
            status,
            provider: 'ollama',
            model: 'qwen2.5:7b',
            regeneratedFromRunId: null,
            outputText: 'Hello',
            lastSequence: 1,
            errorCode: null,
            errorMessage: null,
            createdAt: new Date().toISOString(),
            startedAt: null,
            finishedAt: null,
            cancelRequestedAt: null,
        })

        currentFetchHandler = async (url, init) => {
            requestedUrls.push(`${init?.method || 'GET'} ${url}`)
            if (url.includes('/api/chat/runs') && init?.method === 'POST') {
                return jsonResponse({
                    created: true,
                    run: createMockSnapshot('running'),
                })
            }
            if (url.includes('/api/chat/runs/run-123') && init?.method === 'DELETE') {
                return jsonResponse({
                    run: createMockSnapshot('cancelled'),
                })
            }
            if (url.includes('/api/chat/runs/run-123')) {
                return jsonResponse({
                    run: createMockSnapshot('running'),
                })
            }
            return jsonResponse({})
        }

        const settingsInitial = createMockSettings({
            backend: { url: fastifyOrigin1, provider: 'ollama', model: 'qwen2.5:7b' },
        })
        const runtime = createRuntimeFromSettings(settingsInitial)
        assert.equal(runtime.baseUrl, fastifyOrigin1)

        // 1. 创建任务：使用 runtime.baseUrl
        const created = await createBackendChatRun({
            messages: [],
            userText: 'hello',
            runtime,
            conversationId: 1,
            turnId: 'turn-1',
            sourceUserMessageId: 'user-1',
            assistantMessageId: 'ai-1',
            baseUrl: runtime.baseUrl,
        })
        assert.equal(created.run.runId, 'run-123')
        assert.ok(requestedUrls[0].startsWith(`POST ${fastifyOrigin1}/api/chat/runs`))

        // 2. 模拟用户在顶栏切换为 fastifyOrigin2
        const settingsSwitched = createMockSettings({
            backend: { url: fastifyOrigin2, provider: 'openai', model: 'gpt-4o' },
        })
        // 运行时切换不会污染已有任务
        assert.equal(createRuntimeFromSettings(settingsSwitched).baseUrl, fastifyOrigin2)

        // 3. 恢复已有任务：使用原消息中持久化的 generationBaseUrl (fastifyOrigin1)
        const persistedGenerationBaseUrl = fastifyOrigin1
        const snapshot = await getBackendChatRun('run-123', { baseUrl: persistedGenerationBaseUrl })
        assert.equal(snapshot.runId, 'run-123')
        assert.ok(requestedUrls[1].startsWith(`GET ${fastifyOrigin1}/api/chat/runs/run-123`))

        // 4. 用户点击停止生成：使用原 fastifyOrigin1
        await cancelBackendChatRun('run-123', { baseUrl: persistedGenerationBaseUrl })
        assert.ok(requestedUrls[2].startsWith(`DELETE ${fastifyOrigin1}/api/chat/runs/run-123`))

        // 检查没有一个请求被误发向 fastifyOrigin2 或上游 deepseek/openai 域名
        for (const req of requestedUrls) {
            assert.ok(req.includes(fastifyOrigin1), `所有请求必须精准打向原 Fastify 地址: ${req}`)
            assert.ok(!req.includes(fastifyOrigin2), `不得打向切换后的新地址: ${req}`)
        }
        console.log('✓ [断言 4 通过] 建单、恢复、停止全流程请求均精准打向原 Fastify 后端')
    }

    // ── 断言 5：顶栏连接与模型切换不会修改正在后台执行任务的 Provider、模型或目标地址 ──
    {
        console.log('\n[断言 5] 测试已创建 Runtime 配置的不可变性...')
        const liveSettings = createMockSettings({
            backend: { url: 'http://original-fastify:3000', provider: 'ollama', model: 'qwen2.5:7b' },
        })

        const activeRuntime = createRuntimeFromSettings(liveSettings)
        assert.equal(Object.isFrozen(activeRuntime), true, 'Runtime 配置必须是 Object.freeze 不可变对象')

        // 尝试就地篡改属性应当在严格模式抛出异常或静默失败
        assert.throws(() => {
            ;(activeRuntime as any).model = 'hacked-model'
        }, /Cannot assign to read only property|Cannot set property/)

        // 模拟顶栏在用户操作下变更全局设置
        liveSettings.backend.url = 'http://brand-new-host:9999'
        liveSettings.backend.provider = 'openai'
        liveSettings.backend.model = 'gpt-4o-latest'

        // 检查原任务持有的 activeRuntime 绝不受影响
        assert.equal(activeRuntime.baseUrl, 'http://original-fastify:3000')
        assert.equal(activeRuntime.provider, 'ollama')
        assert.equal(activeRuntime.model, 'qwen2.5:7b')
        console.log('✓ [断言 5 通过] 顶栏与全局设置变更完全不影响已创建后台任务的不可变快照')
    }

    console.log('\n🎉 第一批 5 项关键断言与架构约束全部通过！')
}

runTests().catch(err => {
    console.error('❌ 第一批专项验证失败:', err)
    process.exit(1)
})
