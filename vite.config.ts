import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const openAIProxyPrefix = '/__ai_proxy/openai'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    // 生产环境部署在 /ai/ 子路径下，开发环境使用根路径 /。
    base: mode === 'production' ? '/ai/' : '/',
    server: {
        // 允许局域网设备访问开发服务器。只本机开发时可以改成 127.0.0.1。
        host: '0.0.0.0',
    },
    plugins: [
        {
            name: 'openai-compatible-dev-proxy',
            configureServer(server) {
                server.middlewares.use(openAIProxyPrefix, async (req, res) => {
                    try {
                        // 前端请求本地同源地址，真实厂商根地址通过 baseUrl 参数传进来。
                        const incomingUrl = new URL(req.url ?? '/', 'http://localhost')
                        const rawBaseUrl = incomingUrl.searchParams.get('baseUrl')

                        if (!rawBaseUrl) {
                            res.statusCode = 400
                            res.end('Missing baseUrl')
                            return
                        }

                        const baseUrl = new URL(rawBaseUrl)
                        if (!['http:', 'https:'].includes(baseUrl.protocol)) {
                            res.statusCode = 400
                            res.end('Invalid baseUrl protocol')
                            return
                        }

                        const basePath = baseUrl.pathname.replace(/\/+$/, '')
                        const targetPath = incomingUrl.pathname.replace(/\/+$/, '')
                        const targetUrl = new URL(`${basePath}${targetPath}`, baseUrl)

                        // 除 baseUrl 以外的查询参数继续转发给厂商。
                        incomingUrl.searchParams.forEach((value, key) => {
                            if (key !== 'baseUrl') targetUrl.searchParams.append(key, value)
                        })

                        // host/connection 是当前本地连接的头，转发到上游容易造成协议或域名不匹配。
                        const headers = new Headers(req.headers as Record<string, string>)
                        headers.delete('host')
                        headers.delete('connection')

                        const proxyResponse = await fetch(targetUrl, {
                            method: req.method,
                            headers,
                            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
                            duplex: 'half',
                        } as RequestInit & { duplex: 'half' })

                        res.statusCode = proxyResponse.status
                        proxyResponse.headers.forEach((value, key) => {
                            const lowerKey = key.toLowerCase()
                            // 这些头由 Node 响应流重新计算，直接透传可能导致客户端解码或长度不一致。
                            if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(lowerKey)) {
                                res.setHeader(key, value)
                            }
                        })

                        if (!proxyResponse.body) {
                            res.end()
                            return
                        }

                        for await (const chunk of proxyResponse.body as any) {
                            res.write(chunk)
                        }
                        res.end()
                    } catch (error) {
                        console.error('OpenAI-compatible dev proxy failed:', error)
                        res.statusCode = 502
                        res.end('OpenAI-compatible dev proxy failed')
                    }
                })
            },
        },
        vue(),
    ],
}))
