import assert from 'node:assert/strict'
import {
    getBackendProvidersCatalog,
    getSharedBackendProvidersCatalog,
    resetBackendProvidersCatalog,
} from '../src/services/knowledge'
import {
    resolveActiveConnection,
} from '../src/services/activeConnection'
import {
    testConnection,
} from '../src/services/connectionTester'
import {
    buildBackendChatBody,
    backendChatStream,
    fetchBackendChatContext,
} from '../src/services/providers/backendChat'
import {
    createRuntimeFromSettings,
} from '../src/services/runtime'
import type { ModelRuntimeConfig } from '../src/types/model'
import { settings, type AppSettings } from '../src/stores/settings'

console.log('=== 开始执行第四批专项验证：隔离草稿测试副作用与竞态覆盖 ===\n')

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

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

function ndjsonResponse(lines: unknown[], status = 200): Response {
    const text = lines.map(line => JSON.stringify(line)).join('\n') + '\n'
    return new Response(text, {
        status,
        headers: { 'Content-Type': 'application/x-ndjson' },
    })
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

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

async function main() {
    // ─────────────────────────────────────────────────────────────
    // 断言 1: 草稿修改不污染当前生效连接与顶栏状态
    // ─────────────────────────────────────────────────────────────
    console.log('-> 断言 1: 草稿隔离（未保存时 resolveActiveConnection 保持原状态）')
    // 初始化 settings
    settings.transport = 'backend'
    settings.backend.url = 'http://saved-backend:3000'
    settings.backend.provider = 'ollama'
    settings.backend.model = 'saved-ollama-model'

    const activeBefore = resolveActiveConnection(settings, {
        state: 'success',
        baseUrl: 'http://saved-backend:3000',
        providers: [{
            id: 'ollama',
            name: 'Ollama',
            defaultModel: 'saved-ollama-model',
            configured: true,
            models: ['saved-ollama-model'],
        }],
    })
    assert.equal(activeBefore.baseUrl, 'http://saved-backend:3000')
    assert.equal(activeBefore.model, 'saved-ollama-model')

    // 模拟设置面板创建 draft 并进行编辑
    const draft = JSON.parse(JSON.stringify(settings)) as AppSettings
    draft.backend.url = 'http://draft-url:9999'
    draft.backend.model = 'draft-model-x'
    draft.transport = 'direct'
    draft.provider = 'openai'
    draft.openai.model = 'gpt-4o-draft'

    // 再次调用 resolveActiveConnection，确认生效配置不受任何 draft 编辑影响
    const activeWhileEditing = resolveActiveConnection(settings, {
        state: 'success',
        baseUrl: 'http://saved-backend:3000',
        providers: [{
            id: 'ollama',
            name: 'Ollama',
            defaultModel: 'saved-ollama-model',
            configured: true,
            models: ['saved-ollama-model'],
        }],
    })
    assert.equal(activeWhileEditing.baseUrl, 'http://saved-backend:3000', '草稿编辑期间活动 baseUrl 必须保持不变')
    assert.equal(activeWhileEditing.model, 'saved-ollama-model', '草稿编辑期间活动模型必须保持不变')
    assert.equal(activeWhileEditing.transport, 'backend', '草稿编辑期间活动传输模式必须保持不变')
    console.log('   ✓ 草稿修改完全隔离，未保存时不改变全局生效连接状态')

    // ─────────────────────────────────────────────────────────────
    // 断言 2: 草稿目录加载的竞态与过期丢弃保护
    // ─────────────────────────────────────────────────────────────
    console.log('\n-> 断言 2: 目录竞态保护（旧请求不可覆盖新请求，支持显式强制刷新）')
    resetBackendProvidersCatalog()

    let callCount = 0
    const fetchSignals: AbortSignal[] = []

    currentFetchHandler = async (url: string, init?: RequestInit) => {
        if (url.includes('/api/providers')) {
            const reqIndex = ++callCount
            if (init?.signal) fetchSignals.push(init.signal)

            if (reqIndex === 1) {
                // 第 1 次请求：模拟网络慢，延迟 80ms 返回旧数据
                await sleep(80)
                return jsonResponse({
                    providers: [{
                        id: 'ollama',
                        name: 'Ollama Old',
                        defaultModel: 'old-model',
                        configured: true,
                        models: ['old-model'],
                    }],
                })
            } else {
                // 第 2 次请求：立即返回新数据
                return jsonResponse({
                    providers: [{
                        id: 'openai',
                        name: 'OpenAI New',
                        defaultModel: 'new-model',
                        configured: true,
                        models: ['new-model'],
                    }],
                })
            }
        }
        return jsonResponse({})
    }

    // 触发请求 1 (慢请求)
    const p1 = getBackendProvidersCatalog({
        baseUrl: 'http://same-server:3000',
        forceRefresh: true,
        skipAuthInterception: true,
    })

    // 10ms 后用户切换或强制刷新触发请求 2 (快请求)
    await sleep(10)
    const p2 = getBackendProvidersCatalog({
        baseUrl: 'http://same-server:3000',
        forceRefresh: true,
        skipAuthInterception: true,
    })

    const r2 = await p2
    assert.equal(r2.state, 'success')
    assert.equal(r2.providers[0].id, 'openai', '快请求结果必须成功写入')

    // 等待慢请求完成或被拒绝
    try {
        await p1
    } catch (err: any) {
        assert.ok(
            err.name === 'AbortError' || err.message === 'CATALOG_REQUEST_SUPERSEDED',
            '被覆盖的慢请求必须抛出 AbortError 或 CATALOG_REQUEST_SUPERSEDED'
        )
    }

    // 验证旧请求没有覆盖新请求的缓存结果
    const finalCatalog = await getBackendProvidersCatalog({
        baseUrl: 'http://same-server:3000',
    })
    assert.equal(finalCatalog.providers[0].id, 'openai', '旧请求绝不能覆盖新请求的最终缓存')

    // 验证共享响应式目录状态同步
    const shared = getSharedBackendProvidersCatalog('http://same-server:3000')
    assert.equal(shared.state, 'success')
    assert.equal(shared.providers[0].id, 'openai')

    // 验证未加载的地址 B 立即返回 idle 且无模型，绝不残留地址 A 的缓存
    const unreachedB = getSharedBackendProvidersCatalog('http://unreachable-b:9999')
    assert.equal(unreachedB.state, 'idle')
    assert.equal(unreachedB.providers.length, 0)

    console.log('   ✓ 慢请求被正确中止，共享目录实时响应且各地址严格隔离')

    // ─────────────────────────────────────────────────────────────
    // 断言 3: 草稿测试使用指定参数发起且支持中途取消
    // ─────────────────────────────────────────────────────────────
    console.log('\n-> 断言 3: 草稿连接测试参数隔离与取消链路')

    let lastTestReqBody: any = null
    let lastTestBaseUrl = ''

function abortableSleep(ms: number, signal?: AbortSignal | null): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(new DOMException('This operation was aborted', 'AbortError'))
        }
        const timer = setTimeout(resolve, ms)
        signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new DOMException('This operation was aborted', 'AbortError'))
        }, { once: true })
    })
}

    currentFetchHandler = async (url: string, init?: RequestInit) => {
        if (url.includes('/api/chat/test')) {
            lastTestBaseUrl = url
            lastTestReqBody = JSON.parse(String(init?.body || '{}'))

            // 模拟流式生成，延迟返回并监听信号
            await abortableSleep(300, init?.signal)
            return ndjsonResponse([
                { message: { role: 'assistant', content: 'draft-token' }, done: false },
            ])
        }
        return jsonResponse({})
    }

    const abortCtrl = new AbortController()
    const testPromise = testConnection({
        transport: 'backend',
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        baseUrl: 'http://test-draft-backend:8888',
        timeoutMs: 5000,
        signal: abortCtrl.signal,
    })

    // 50ms 后主动取消测试
    await sleep(50)
    abortCtrl.abort()

    const testResult = await testPromise
    assert.equal(testResult.ok, false, '被主动取消的测试必须返回 ok: false')
    assert.equal(testResult.reason, 'aborted', '失败原因必须为 aborted')
    assert.equal(lastTestReqBody.provider, 'anthropic', '测试请求必须准确发送草稿中指定的 provider')
    assert.equal(lastTestReqBody.model, 'claude-3-7-sonnet', '测试请求必须准确发送草稿中指定的 model')
    assert.ok(lastTestBaseUrl.includes('test-draft-backend:8888'), '测试请求必须请求草稿指定的 baseUrl')
    console.log('   ✓ 草稿测试准确请求目标地址，中途取消正常生效')

    // ─────────────────────────────────────────────────────────────
    // 断言 4: 快速校验前置拦截（无需发起无效网络请求）
    // ─────────────────────────────────────────────────────────────
    console.log('\n-> 断言 4: 前置缺失校验防护')
    const directNoKeyResult = await testConnection({
        transport: 'direct',
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: '   ', // 空 API Key
    })
    assert.equal(directNoKeyResult.ok, false)
    assert.equal(directNoKeyResult.reason, 'http_error')
    assert.match(String(directNoKeyResult.error), /请先填写 API Key/, '缺少 API Key 时应直接返回友好提示')
    // ─────────────────────────────────────────────────────────────
    // 断言 5: 对比页编辑的厂商与模型进入实际请求、Claude 映射 anthropic、使用快照地址
    // ─────────────────────────────────────────────────────────────
    console.log('\n-> 断言 5: 对比页编辑模型映射、后端 Claude 映射与快照地址隔离')

    const capturedRequests: Array<{ url: string; body: any }> = []
    currentFetchHandler = async (url: string, init?: RequestInit) => {
        const bodyText = String(init?.body || '{}')
        let parsed = {}
        try { parsed = JSON.parse(bodyText) } catch {}
        capturedRequests.push({ url, body: parsed })
        if (url.includes('/api/chat/context')) {
            return jsonResponse({ enabled: false, results: [] })
        }
        if (url.includes('/api/chat')) {
            return ndjsonResponse([
                { message: { role: 'assistant', content: 'mock answer' }, done: true }
            ])
        }
        return jsonResponse({})
    }

    // 1. 测试两个对比项分别选择 deepseek-chat 与 deepseek-reasoner
    const runtime1: ModelRuntimeConfig = {
        transport: 'backend',
        provider: 'openai',
        model: 'deepseek-chat',
        baseUrl: 'http://fastify-host-a:3001',
        label: '',
        systemPrompt: '',
        maxContextTokens: 4096,
        responseTimeoutSeconds: 30,
    }
    const runtime2: ModelRuntimeConfig = {
        transport: 'backend',
        provider: 'openai',
        model: 'deepseek-reasoner',
        baseUrl: 'http://fastify-host-a:3001',
        label: '',
        systemPrompt: '',
        maxContextTokens: 4096,
        responseTimeoutSeconds: 30,
    }

    const body1 = buildBackendChatBody([], 'test 1', runtime1)
    const body2 = buildBackendChatBody([], 'test 2', runtime2)
    assert.equal(body1.provider, 'openai')
    assert.equal(body1.model, 'deepseek-chat', '对比项 1 必须使用编辑后的 deepseek-chat')
    assert.equal(body2.provider, 'openai')
    assert.equal(body2.model, 'deepseek-reasoner', '对比项 2 必须使用编辑后的 deepseek-reasoner')

    // 2. 测试后端 Claude 发出 provider: "anthropic"，不得误回退为 ollama
    const runtimeClaude: ModelRuntimeConfig = {
        transport: 'backend',
        provider: 'claude',
        model: 'claude-3-7-sonnet',
        baseUrl: 'http://fastify-host-a:3001',
        label: '',
        systemPrompt: '',
        maxContextTokens: 4096,
        responseTimeoutSeconds: 30,
    }
    const bodyClaude = buildBackendChatBody([], 'test claude', runtimeClaude)
    assert.equal(bodyClaude.provider, 'anthropic', '后端 Claude 在请求体中必须严格映射为 anthropic')
    assert.equal(bodyClaude.model, 'claude-3-7-sonnet')

    // 3. 测试快照地址 A 固化后，全局设置改为 B，执行聊天与 RAG context 仍发往 A
    capturedRequests.length = 0
    settings.backend.url = 'http://fastify-host-b:9999' // 篡改全局设置

    await fetchBackendChatContext([], 'hello', runtime1)
    assert.equal(capturedRequests.length, 1)
    assert.ok(capturedRequests[0].url.startsWith('http://fastify-host-a:3001'), 'RAG context 必须使用快照地址 A')

    await backendChatStream([], 'hello', runtime1, () => {}, () => {})
    assert.equal(capturedRequests.length, 2)
    assert.ok(capturedRequests[1].url.startsWith('http://fastify-host-a:3001'), 'chat stream 必须使用快照地址 A')
    assert.equal(capturedRequests[1].body.model, 'deepseek-chat')

    // 4. 新建的任务读取新设置 B
    const newRuntime = createRuntimeFromSettings(settings)
    assert.equal(newRuntime.baseUrl, 'http://fastify-host-b:9999', '新建任务使用新全局地址 B')

    console.log('   ✓ 对比页编辑模型精准生效，Claude 准确映射 anthropic，快照地址物理隔离')

    console.log('\n=== 第四批专项验证全部通过 (5/5) ===')
}

main().catch(err => {
    console.error('第四批专项验证失败:', err)
    process.exit(1)
})
