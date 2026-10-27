export const ticketMarkdown = `【客户报障工单 #2048】
产品/组件：Vite 5.1.4 / 前端工程服务
问题描述：本地执行 npm run dev 启动开发服务器后，前端通过 fetch('/api/v1/user') 请求后端接口始终报 404 Not Found。已确认后端直接通过 http://localhost:8080/v1/user 可以正常返回 JSON 数据。
环境信息：Node 18.18.0, Vite 5.1.4, Windows 11, Chrome 122
配置代码片段：
\`\`\`typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
\`\`\`
排查请求：请基于知识库定位代理配置常见陷阱与解决步骤，并输出可直接发送给客户的回复草稿。`
