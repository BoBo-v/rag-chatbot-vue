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
    freezeRuntime,
} from '../src/services/runtime'
import {
    createBackendChatRun,
    cancelBackendChatRun,
    getBackendChatRun,
} from '../src/services/providers/backendChatRun'
import { settings, type AppSettings } from '../src/stores/settings'
import { useAuthStore } from '../src/stores/auth'

console.log('=== 开始执行第一批专项验证：统一元数据与连接解析状态 ===\n')

if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>()
    ;(globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size },
    }
}

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

        // 情形 D：未提供目录时，绝不凭已保存模型名称判定后端连接可用
        const connD = resolveActiveConnection(baseSettings, undefined)
        assert.equal(connD.isConfigured, false)
        assert.equal(connD.error, '后端服务目录未就绪')

        // 情形 E：目录地址与当前设置不匹配
        const connE = resolveActiveConnection(baseSettings, {
            state: 'success',
            baseUrl: 'http://another-host:9999',
            providers: catalogOnlyOllama,
        })
        assert.equal(connE.isConfigured, false)
        assert.equal(connE.error, '目录地址与当前配置不一致')

        console.log('✓ [断言 3 通过] 自动回退有效候选首项，空候选/未就绪/地址不一致明确判定不可用，绝不硬编码盲猜')
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
        console.log('\n[断言 5] 测试已创建 Runtime 配置的不可变性与对比页草稿隔离...')
        const liveSettings = createMockSettings({
            backend: { url: 'http://original-fastify:3000', provider: 'ollama', model: 'qwen2.5:7b' },
        })
        const catalogReady = {
            state: 'success' as const,
            baseUrl: 'http://original-fastify:3000',
            providers: [{
                id: 'ollama' as const,
                name: 'Ollama',
                configured: true,
                defaultModel: 'qwen2.5:7b',
                models: ['qwen2.5:7b'],
            }],
        }

        // 1. 验证工厂函数返回普通可变草稿（解耦 CompareChat.vue，使其可以正常响应式编辑）
        const editableDraft = createRuntimeFromSettings(liveSettings, catalogReady)
        assert.equal(Object.isFrozen(editableDraft), false, 'createRuntimeFromSettings 返回值必须是普通可变对象')
        editableDraft.model = 'custom-model'
        assert.equal(editableDraft.model, 'custom-model', '对比页草稿必须允许自由编辑与重置')

        // 2. 验证发起请求时通过 freezeRuntime 生成不可变快照
        const activeRuntime = freezeRuntime(editableDraft)
        assert.equal(Object.isFrozen(activeRuntime), true, 'Runtime 执行快照必须是 Object.freeze 不可变对象')

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
        assert.equal(activeRuntime.model, 'custom-model')
        console.log('✓ [断言 5 通过] 对比页草稿可自由编辑，请求快照不可变，顶栏全局变更不污染在途任务')
    }

    // ── 断言 6：取消同地址目录刷新时恢复旧成功目录；checkAuth 仅在身份恢复或变更时递增会话版本 ──
    {
            console.log('\n[断言 6] 测试取消刷新后成功目录状态恢复，以及 checkAuth 会话版本防抖...')
            resetBackendProvidersCatalog()
            const testUrl = 'http://restore-test:3000'
            const catalogData: BackendChatProvider[] = [
                { id: 'ollama', name: 'Ollama', defaultModel: 'qwen2.5:7b', configured: true, models: ['qwen2.5:7b'] }
            ]

            currentFetchHandler = async () => jsonResponse({ providers: catalogData })

            // 1. 首次成功加载
            const firstSuccess = await getBackendProvidersCatalog({ baseUrl: testUrl, forceRefresh: true })
            assert.equal(firstSuccess.state, 'success')
            assert.equal(firstSuccess.providers.length, 1)

            // 2. 第二次带 cancel 的刷新模拟（如设置面板打开后又快速关闭）
            const abortCtrl = new AbortController()
            currentFetchHandler = async (_url, init) => {
                return new Promise<Response>((_, reject) => {
                    const onAbort = () => {
                        const err = new Error('Aborted')
                        err.name = 'AbortError'
                        reject(err)
                    }
                    if (init?.signal?.aborted) return onAbort()
                    init?.signal?.addEventListener('abort', onAbort)
                })
            }
            const pendingPromise = getBackendProvidersCatalog({ baseUrl: testUrl, forceRefresh: true, signal: abortCtrl.signal })
            abortCtrl.abort()

            await pendingPromise.catch(() => undefined)

            // 验证：取消后目录状态不是 idle，而是恢复此前的 success 目录！
            const cached = getCachedBackendProvidersCatalog(testUrl)
            assert.equal(cached?.state, 'success', '取消同地址刷新后必须恢复此前的成功目录状态，防止停在 idle')
            assert.equal(cached?.providers.length, 1)

            // 3. 测试 checkAuth 会话版本控制
            const { useAuthStore } = await import('../src/stores/auth')
            const authStore = useAuthStore()
            const initialVersion = authStore.sessionVersion.value

            // 模拟首次未登录探测失败：未登录时不应产生无限自增
            currentFetchHandler = async (url) => {
                if (url.includes('/api/auth/me')) return jsonResponse({ error: 'unauthorized' }, 401)
                return jsonResponse({})
            }
            const check1 = await authStore.checkAuth()
            assert.equal(check1, false)
            assert.equal(authStore.isAuthenticated.value, false)

            // 模拟成功恢复登录身份：从未登录恢复到已登录，必须递增 sessionVersion
            currentFetchHandler = async (url) => {
                if (url.includes('/api/auth/me')) return jsonResponse({ user: { username: 'alice' } }, 200)
                return jsonResponse({})
            }
            const check2 = await authStore.checkAuth()
            assert.equal(check2, true)
            assert.equal(authStore.isAuthenticated.value, true)
            assert.equal(authStore.sessionVersion.value > initialVersion, true, '从未登录恢复已登录必须更新 sessionVersion')

            // 同一身份的普通重复检查：不递增 sessionVersion
            const versionAfterLogin = authStore.sessionVersion.value
            const check3 = await authStore.checkAuth()
            assert.equal(check3, true)
            assert.equal(authStore.sessionVersion.value, versionAfterLogin, '同一身份的重复探活不得递增 sessionVersion')

            console.log('✓ [断言 6 通过] 取消刷新成功恢复旧目录，checkAuth 身份恢复递增版本而重复探活防抖')
        }

        // ── 断言 7：401 与 403 响应体异步延迟到达时，作用域与会话版本保护生效 ──
        {
            console.log('\n[断言 7] 测试 401/403 异步解析间隙作用域校验与新会话防污染...')
            const { apiFetch, isAuthScopeValid } = await import('../src/services/api')
            const { useAuthStore } = await import('../src/stores/auth')
            const authStore = useAuthStore()

            // 1. 初始化有效登录会话
            currentFetchHandler = async (url) => {
                if (url.includes('/api/auth/me')) return jsonResponse({ user: { username: 'bob' } }, 200)
                return jsonResponse({})
            }
            await authStore.checkAuth()
            assert.equal(authStore.isAuthenticated.value, true)
            const sessionAtBob = authStore.sessionVersion.value
            assert.equal(isAuthScopeValid(resolveTargetBaseUrl(settings.backend?.url), sessionAtBob), true)

            // 2. 模拟请求返回 401，但在解析 body 的异步间隙中，用户完成了新登录（版本自增）
            let delayResolveBody!: (value: any) => void
            const delayBodyPromise = new Promise(r => { delayResolveBody = r })

            // 构造一个延迟返回 json 的 Response
            const delayed401Response = new Response(new ReadableStream({
                async start(controller) {
                    await delayBodyPromise
                    controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: 'token expired' })))
                    controller.close()
                }
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            })

            currentFetchHandler = async (url) => {
                if (url.includes('/api/chat/delayed-401')) {
                    return delayed401Response
                }
                if (url.includes('/api/auth/login')) {
                    return jsonResponse({ user: { username: 'carol' } }, 200)
                }
                return jsonResponse({})
            }

            // 发起 delayed-401 请求
            const delayedReqPromise = apiFetch('/api/chat/delayed-401')

            // 在 body 返回前，用户在弹窗完成了新登录（变成 carol，sessionVersion++）
            await authStore.login('carol', 'secret')
            assert.equal(authStore.isAuthenticated.value, true)
            assert.equal(authStore.user.value?.username, 'carol')
            assert.notEqual(authStore.sessionVersion.value, sessionAtBob)

            // 此时放行 delayed-401 的 body
            delayResolveBody(true)
            const delayedRes = await delayedReqPromise

            // 校验：旧请求正常返回给调用方，但绝没有把 carol 踢下线或弹登录框！
            assert.equal(delayedRes.status, 401)
            assert.equal(authStore.isAuthenticated.value, true, '旧 401 迟到响应不得将新建立的 carol 会话置为未登录')
            assert.equal(authStore.user.value?.username, 'carol')
            assert.equal(authStore.isAuthModalVisible.value, false, '旧 401 迟到响应不得打开登录弹窗')

            // 3. 当前有效会话真实的 401 请求：必须正常触发 invalidateSession 与 openLoginModal
            currentFetchHandler = async (url) => {
                if (url.includes('/api/chat/real-401')) {
                    return jsonResponse({ error: 'session invalid' }, 401)
                }
                return jsonResponse({})
            }
            await apiFetch('/api/chat/real-401')
            assert.equal(authStore.isAuthenticated.value, false, '当前有效会话的真实 401 必须正常注销会话')
            assert.equal(authStore.isAuthModalVisible.value, true, '当前有效会话的真实 401 必须正常打开登录弹窗')

            console.log('✓ [断言 7 通过] 异步间隙旧 401 迟到响应防污染成功，当前有效会话 401 正常响应')
        }

        // ── 断言 8：checkAuth() 迟到响应、地址漂移、网络异常与逆序完成提交守卫 ──
        {
            console.log('\n[断言 8] 测试 checkAuth() 迟到响应防污染与逆序提交守卫...')
            const authStore = useAuthStore()

            // 1. 旧 /api/auth/me 延迟返回 401，不能退出刚建立的新登录
            settings.backend.url = 'http://auth-server:3000'
            let delayedAuthMeResolve!: (v: Response) => void
            const delayedAuthMePromise = new Promise<Response>(r => { delayedAuthMeResolve = r })

            currentFetchHandler = async (url) => {
                if (url.includes('/api/auth/me')) {
                    return delayedAuthMePromise
                }
                if (url.includes('/api/auth/login')) {
                    return jsonResponse({ user: { username: 'alice', mustChangePassword: false } }, 200)
                }
                return jsonResponse({})
            }

            // 发起 probe 1 (慢请求)
            const probe1Promise = authStore.checkAuth()

            // 用户在弹窗完成新登录 (变成 alice, sessionVersion 递增)
            await authStore.login('alice', 'password123')
            assert.equal(authStore.isAuthenticated.value, true)
            assert.equal(authStore.user.value?.username, 'alice')

            // 此时 probe 1 返回 401
            delayedAuthMeResolve(jsonResponse({ error: 'unauthorized' }, 401))
            const probe1Result = await probe1Promise

            assert.equal(probe1Result, true, '旧 probe 迟到返回 401，返回值应保持当前有效登录状态')
            assert.equal(authStore.isAuthenticated.value, true, '旧 401 绝不能踢掉刚登录的 alice')
            assert.equal(authStore.user.value?.username, 'alice')

            // 2. 旧地址延迟返回 200，不能覆盖新地址的用户或弹出强制改密窗口
            let delayedOldHostResolve!: (v: Response) => void
            const delayedOldHostPromise = new Promise<Response>(r => { delayedOldHostResolve = r })

            currentFetchHandler = async (url) => {
                if (url.startsWith('http://old-host:3000') && url.includes('/api/auth/me')) {
                    return delayedOldHostPromise
                }
                if (url.startsWith('http://new-host:3000') && url.includes('/api/auth/me')) {
                    return jsonResponse({ user: { username: 'new-user', mustChangePassword: false } }, 200)
                }
                return jsonResponse({})
            }

            settings.backend.url = 'http://old-host:3000'
            const oldHostProbe = authStore.checkAuth()

            // 用户切换至 new-host 并成功完成探测
            settings.backend.url = 'http://new-host:3000'
            const newHostProbe = await authStore.checkAuth()
            assert.equal(newHostProbe, true)
            assert.equal(authStore.user.value?.username, 'new-user')
            assert.equal(authStore.mustChangePassword.value, false)

            // 旧地址 delayedOldHost 返回 200，且声称需要强制改密
            delayedOldHostResolve(jsonResponse({ user: { username: 'old-user', mustChangePassword: true } }, 200))
            const oldHostResult = await oldHostProbe
            assert.equal(oldHostResult, true)
            assert.equal(authStore.user.value?.username, 'new-user', '旧地址迟到 200 绝不能覆盖新地址用户')
            assert.equal(authStore.mustChangePassword.value, false, '旧地址迟到 200 绝不能触发强制改密弹窗')
            assert.equal(authStore.isChangePasswordModalVisible.value, false)

            // 3. 旧探测发生网络异常，不能清除新会话
            let delayedErrorResolve!: (v: any) => void
            const delayedErrorPromise = new Promise<Response>((_, reject) => { delayedErrorResolve = reject })

            currentFetchHandler = async (url) => {
                if (url.includes('/api/auth/me')) {
                    return delayedErrorPromise
                }
                return jsonResponse({})
            }

            const errorProbe = authStore.checkAuth()
            // 在探测完成前，用户已成功登录
            const sessionBefore = authStore.sessionVersion.value
            authStore.user.value = { username: 'stable-user' }
            authStore.isAuthenticated.value = true
            authStore.sessionVersion.value = sessionBefore + 1

            // 旧探测网络崩溃
            delayedErrorResolve(new Error('Network error'))
            const errorResult = await errorProbe
            assert.equal(errorResult, true)
            assert.equal(authStore.isAuthenticated.value, true, '旧探测网络异常绝不能清除新会话')
            assert.equal(authStore.user.value?.username, 'stable-user')

            // 4. 两次探测逆序完成，只提交最新结果
            let resolveFirstProbe!: (v: Response) => void
            const firstProbeNetwork = new Promise<Response>(r => { resolveFirstProbe = r })

            let callNum = 0
            currentFetchHandler = async (url) => {
                if (url.includes('/api/auth/me')) {
                    callNum++
                    if (callNum === 1) return firstProbeNetwork
                    return jsonResponse({ user: { username: 'second-user' } }, 200)
                }
                return jsonResponse({})
            }

            const p1 = authStore.checkAuth()
            const p2 = authStore.checkAuth()
            const r2 = await p2
            assert.equal(r2, true)
            assert.equal(authStore.user.value?.username, 'second-user')

            // 逆序返回 p1 (first-user)
            resolveFirstProbe(jsonResponse({ user: { username: 'first-user' } }, 200))
            const r1 = await p1
            assert.equal(r1, true)
            assert.equal(authStore.user.value?.username, 'second-user', '逆序到达的旧结果绝不能覆盖最新探测结果')

            // 5. 当前有效探测失败时，仍正常清除失效身份
            currentFetchHandler = async (url) => {
                if (url.includes('/api/auth/me')) {
                    return jsonResponse({ error: 'unauthorized' }, 401)
                }
                return jsonResponse({})
            }
            const validFailProbe = await authStore.checkAuth()
            assert.equal(validFailProbe, false)
            assert.equal(authStore.isAuthenticated.value, false, '当前有效探测 401 必须正常注销身份')
            assert.equal(authStore.user.value, null)

            console.log('✓ [断言 8 通过] checkAuth 迟到响应、地址漂移、网络异常与逆序提交守卫全部生效')
        }

        console.log('\n🎉 全部 8 项关键断言与架构约束全部通过！')
    }

runTests().catch(err => {
    console.error('❌ 第一批专项验证失败:', err)
    process.exit(1)
})
