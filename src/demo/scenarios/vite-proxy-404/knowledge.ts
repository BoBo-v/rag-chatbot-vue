import type { DemoKnowledgeChunk } from '../../types'

export const viteProxyKnowledgeChunks: DemoKnowledgeChunk[] = [
  {
    chunkId: 'doc-vite-server-proxy-c1',
    documentId: 'kb-vite-official-manual',
    documentTitle: 'Vite 官方文档 · 开发服务器与网络代理配置.md',
    chunkIndex: 1,
    score: 0.92,
    vectorScore: 0.89,
    keywordScore: 0.95,
    text: `### server.proxy 路径重写与常见 404 故障排查
在 Vite 开发服务器中配置反向代理时，若目标后端服务的接口不带前缀（例如后端只暴露了 /v1/user，而前端统一发起了 /api/v1/user），必须在 proxy 规则中显式配置 rewrite 函数：
\`\`\`typescript
proxy: {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\\/api/, '')
  }
}
\`\`\`
若未配置 rewrite，Vite 会原样转发完整路径（即向后端请求 http://localhost:8080/api/v1/user），通常会导致后端网关或控制器返回 404 Not Found。`
  },
  {
    chunkId: 'doc-vite-server-proxy-c2',
    documentId: 'kb-gateway-rules-v2',
    documentTitle: '前端工程化网关与跨域联调白皮书 v2.4.md',
    chunkIndex: 3,
    score: 0.74,
    vectorScore: 0.71,
    keywordScore: 0.77,
    text: `### 开发环境代理与后端路由对齐自检项
1. 确认后端 Controller 映射路径是否包含代理前缀；
2. 确认 changeOrigin 是否设置为 true，防止 Spring Boot 或 Express 依据 Host 头过滤非法请求；
3. 检查后端服务是否监听在 IPv6 (::1) 而代理指向了 IPv4 (127.0.0.1)。`
  }
]
