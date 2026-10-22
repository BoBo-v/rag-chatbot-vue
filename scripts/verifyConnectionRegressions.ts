import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { settings } from '../src/stores/settings'
import { useAuthStore } from '../src/stores/auth'
import { resolveTargetBaseUrl } from '../src/services/api'
import { buildRuntimeFromDraft, createCompareEditorDraft, syncDraftFromSettings } from '../src/services/comparisonDraft'
import { readOllamaNdjsonStream } from '../src/services/providers/ollama'
import { parseSSE, openAIDisplayEndpoint } from '../src/services/providers/openai'
import { generateStreamWithContext } from '../src/services/stream'
import type { ModelRuntimeConfig } from '../src/types/model'

const encoder = new TextEncoder()
const originalFetch = globalThis.fetch
const originalSettings = JSON.parse(JSON.stringify(settings)) as typeof settings
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
if (!originalStorage) {
    const stored = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
    })
}

function bodyFromParts(parts: string[], onCancel?: () => void): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            for (const part of parts) controller.enqueue(encoder.encode(part))
            controller.close()
        },
        cancel: onCancel,
    })
}

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(r => { resolve = r })
    return { promise, resolve }
}

function runtime(provider: ModelRuntimeConfig['provider'], transport: ModelRuntimeConfig['transport'] = 'direct'): ModelRuntimeConfig {
    return {
        transport, provider, model: 'test-model', baseUrl: 'https://provider.example.test',
        apiKey: 'test-key', label: 'Regression test', systemPrompt: '', maxContextTokens: 4096,
        responseTimeoutSeconds: 5,
    }
}

function verifyDraftUrls() {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', {
        configurable: true, value: { location: { origin: 'https://chat.example.test' } },
    })
    try {
        settings.backend.url = 'https://saved-backend.example.test'
        const draft = createCompareEditorDraft({ ...settings, backend: { ...settings.backend, url: '' } })
        assert.equal(draft.backend.baseUrl, '')
        draft.transport = 'backend'
        assert.equal(buildRuntimeFromDraft(draft, settings).baseUrl, resolveTargetBaseUrl(''))
        assert.equal(buildRuntimeFromDraft(draft, settings).baseUrl, 'https://chat.example.test')
        syncDraftFromSettings(draft, { ...settings, backend: { ...settings.backend, url: '' } })
        assert.equal(draft.backend.baseUrl, '')

        draft.transport = 'direct'
        draft.directProvider = 'openai'
        draft.direct.openai.baseUrl = ''
        assert.equal(buildRuntimeFromDraft(draft, settings).baseUrl, 'https://api.openai.com')
        for (const base of ['https://gateway.example.test/api', 'https://gateway.example.test/api/v1/']) {
            draft.direct.openai.baseUrl = base
            const target = buildRuntimeFromDraft(draft, settings).baseUrl
            assert.equal(target, 'https://gateway.example.test/api')
            assert.equal(openAIDisplayEndpoint(target, '/v1/chat/completions'), 'https://gateway.example.test/api/v1/chat/completions')
        }
        draft.directProvider = 'ollama'
        draft.direct.ollama.baseUrl = ''
        assert.equal(buildRuntimeFromDraft(draft, settings).baseUrl, 'http://localhost:11434')
        draft.direct.ollama.baseUrl = 'https://ollama.example.test/api/'
        assert.equal(buildRuntimeFromDraft(draft, settings).baseUrl, 'https://ollama.example.test/api')
    } finally {
        if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
        else Reflect.deleteProperty(globalThis, 'window')
    }
    console.log('✓ Comparison URL defaults and gateway prefixes')
}

async function verifyNdjson() {
    for (const [source, expectedError] of [
        ['{"error":"model out of memory","done":true}\n', /out of memory/],
        ['{"message":{"content":"partial"}}\n', /before done:true/],
        ['invalid json\n', /JSON/],
        ['', /before done:true/],
    ] as const) {
        let done = 0
        await assert.rejects(readOllamaNdjsonStream(new Response(source), () => {}, () => { done++ }), expectedError)
        assert.equal(done, 0, 'An error or premature EOF must not mark the message done')
    }
    let text = ''
    let done = 0
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode('{"message":{"content":"hello"}}\n{"done":true}\n'))
            // A terminal frame must finish even if the server keeps the socket open.
        },
        cancel() { cancelled = true },
    })
    await readOllamaNdjsonStream(new Response(body), chunk => { text += chunk }, () => { done++ })
    assert.equal(text, 'hello')
    assert.equal(done, 1)
    assert.equal(cancelled, true)
    await readOllamaNdjsonStream(new Response('{"done":true}'), () => {}, () => {})

    const callbackError = new Error('callback failure')
    await assert.rejects(readOllamaNdjsonStream(new Response('{"message":{"content":"hi"}}\n'), () => { throw callbackError }, () => {}), error => error === callbackError)
    console.log('✓ NDJSON error frames, premature EOF, final frame and callback errors')
}

async function verifySse() {
    const source = 'event: content_block_delta\r\ndata: {"delta":\r\ndata: {"text":"你好"}}\r\n\r\nevent: message_stop\r\ndata: {}'
    const bytes = encoder.encode(source)
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
            controller.close()
        },
    })
    const events: Array<[string, string]> = []
    await parseSSE(body, undefined, (event, data) => { events.push([event, data]) })
    assert.deepEqual(events, [
        ['content_block_delta', '{"delta":\n{"text":"你好"}}'],
        ['message_stop', '{}'],
    ])

    let controller!: ReadableStreamDefaultController<Uint8Array>
    const gated = new ReadableStream<Uint8Array>({ start(c) { controller = c } })
    let calls = 0
    const reading = parseSSE(gated, undefined, () => { calls++ })
    controller.enqueue(encoder.encode('event: delta\ndata: hello\n'))
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(calls, 0, 'Dispatch must wait for an event boundary')
    controller.enqueue(encoder.encode('\n'))
    controller.close()
    await reading
    assert.equal(calls, 1)

    const abort = new AbortController()
    abort.abort()
    await parseSSE(bodyFromParts(['event: delta\ndata: stale\n\n']), abort.signal, () => { assert.fail('Aborted data must not dispatch') })
    console.log('✓ SSE split event/data, split UTF-8/CRLF, multiline data, EOF and cancellation')
}

async function verifyAdapters() {
    for (const [provider, payload, error] of [
        ['openai', 'data: {"error":{"message":"quota exhausted"}}\n\n', /quota exhausted/],
        ['openai', 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', /before completion/],
        ['claude', 'event: error\ndata: {"error":{"message":"overloaded"}}\n\n', /overloaded/],
        ['claude', 'event: message_delta\ndata: {"delta":{"stop_reason":"end_turn"}}\n\n', /before message_stop/],
    ] as const) {
        let done = 0
        globalThis.fetch = async () => new Response(payload)
        await assert.rejects(generateStreamWithContext({ messages: [], userText: 'hi', runtime: runtime(provider), onChunk: () => {}, onDone: () => { done++ } }), error)
        assert.equal(done, 0)
    }
    for (const provider of ['openai', 'claude'] as const) {
        const payload = provider === 'openai'
            ? 'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":"length"}]}\n\n'
            : 'event: content_block_delta\ndata: {"delta":{"text":"hello"}}\n\nevent: message_stop\ndata: {}\n\n'
        let cancelled = false
        globalThis.fetch = async () => new Response(new ReadableStream({
            start(controller) {
                // Split event and data across actual network reads.
                for (const line of payload.split('\n')) controller.enqueue(encoder.encode(line + '\n'))
            },
            cancel() { cancelled = true },
        }))
        let text = ''
        let done = 0
        await generateStreamWithContext({ messages: [], userText: 'hi', runtime: runtime(provider), onChunk: chunk => { text += chunk }, onDone: () => { done++ } })
        assert.equal(text, 'hello')
        assert.equal(done, 1)
        assert.equal(cancelled, true)
    }
    console.log('✓ OpenAI/Claude real adapters reject errors and truncation, accept terminal frames')
}

async function verifyAuthMutations() {
    const auth = useAuthStore()
    settings.backend.url = 'https://backend-a.example.test'
    globalThis.fetch = async () => Response.json({ user: { username: 'alice' } })
    assert.equal((await auth.login('alice', 'secret')).ok, true)

    const pending = deferred<Response>()
    globalThis.fetch = () => pending.promise
    const oldLogout = auth.logout()
    const secondLogoutResponse = deferred<Response>()
    globalThis.fetch = () => secondLogoutResponse.promise
    const secondLogout = auth.logout()
    secondLogoutResponse.resolve(new Response('{}'))
    assert.equal((await secondLogout).ok, true)
    globalThis.fetch = async () => Response.json({ user: { username: 'bob' } })
    assert.equal((await auth.login('bob', 'secret')).ok, true)
    const bobVersion = auth.sessionVersion.value
    pending.resolve(new Response('{}'))
    assert.equal((await oldLogout).ok, false)
    assert.equal(auth.user.value?.username, 'bob')
    assert.equal(auth.sessionVersion.value, bobVersion)

    const passwordResponse = deferred<Response>()
    globalThis.fetch = () => passwordResponse.promise
    const stalePasswordChange = auth.changePassword('old-password', 'new-password')
    globalThis.fetch = async () => Response.json({ user: { username: 'bob', mustChangePassword: true } })
    assert.equal((await auth.login('bob', 'secret')).ok, true)
    passwordResponse.resolve(new Response('{}'))
    assert.equal((await stalePasswordChange).ok, false)
    assert.equal(auth.mustChangePassword.value, true)

    const old = deferred<Response>()
    globalThis.fetch = () => old.promise
    const logoutA = auth.logout()
    settings.backend.url = 'https://backend-b.example.test'
    old.resolve(new Response('{}'))
    assert.equal((await logoutA).ok, false)
    assert.equal(auth.user.value?.username, 'bob')

    const loginResponse = deferred<Response>()
    globalThis.fetch = () => loginResponse.promise
    const staleLogin = auth.login('carol', 'secret')
    globalThis.fetch = async () => Response.json({ user: { username: 'dave' } })
    assert.equal((await auth.login('dave', 'secret')).ok, true)
    loginResponse.resolve(Response.json({ user: { username: 'carol' } }))
    assert.equal((await staleLogin).ok, false)
    assert.equal(auth.user.value?.username, 'dave')
    assert.equal((await auth.logout()).ok, true)
    assert.equal(auth.isAuthenticated.value, false)
    console.log('✓ Late logout/login responses cannot overwrite a new session or backend scope')
}

async function verifyTimeouts() {
    const observations: Array<{ signal: AbortSignal; cancelled: boolean }> = []
    const pendingFetch: typeof globalThis.fetch = async (_input, init) => {
        const observation = { signal: init!.signal!, cancelled: false }
        observations.push(observation)
        return new Response(new ReadableStream<Uint8Array>({ cancel() { observation.cancelled = true } }))
    }
    globalThis.fetch = pendingFetch
    const timeouts = Promise.all([
        runtime('ollama'), runtime('openai'), runtime('claude'), runtime('ollama', 'backend'),
    ].map(async config => {
        let done = 0
        await assert.rejects(generateStreamWithContext({
            messages: [], userText: 'hi', runtime: config,
            onChunk: () => assert.fail('No text was sent'), onDone: () => { done++ },
        }), error => error instanceof DOMException && error.name === 'TimeoutError')
        assert.equal(done, 0)
    }))
    // A stream that has emitted text may legitimately outlive the first-token limit.
    let slowSignal: AbortSignal | null = null
    globalThis.fetch = async (_input, init) => {
        slowSignal = init!.signal!
        let timer: ReturnType<typeof setTimeout>
        return new Response(new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode('{"message":{"content":"first token"}}\n'))
                timer = setTimeout(() => {
                    controller.enqueue(encoder.encode('{"done":true}\n'))
                    controller.close()
                }, 5100)
            },
            cancel() { clearTimeout(timer) },
        }))
    }
    let slowDone = 0
    const slowStream = generateStreamWithContext({
        messages: [], userText: 'hi', runtime: runtime('ollama'),
        onChunk: chunk => assert.equal(chunk, 'first token'), onDone: () => { slowDone++ },
    })
    await Promise.all([timeouts, slowStream])
    assert.equal(slowDone, 1)
    assert.equal((slowSignal as AbortSignal | null)?.aborted, false)
    assert.equal(observations.length, 4)
    assert.ok(observations.every(item => item.signal.aborted && item.cancelled))

    globalThis.fetch = pendingFetch
    const stop = new AbortController()
    let done = 0
    const generating = generateStreamWithContext({ messages: [], userText: 'hi', runtime: runtime('ollama'), signal: stop.signal, onChunk: () => {}, onDone: () => { done++ } })
    stop.abort()
    await generating
    assert.equal(done, 0, 'User cancellation must settle without declaring success')
    console.log('✓ First-token timeout fails and cancels all four adapters; user stop settles separately')
}

async function main() {
    try {
        verifyDraftUrls()
        await verifyNdjson()
        await verifySse()
        await verifyAdapters()
        await verifyAuthMutations()
        await verifyTimeouts()
        console.log('Connection regression verification passed')
    } finally {
        globalThis.fetch = originalFetch
        Object.assign(settings, originalSettings)
        await nextTick()
        if (!originalStorage) Reflect.deleteProperty(globalThis, 'localStorage')
    }
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
