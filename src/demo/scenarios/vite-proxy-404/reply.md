### ✉️ 客户回复草稿（可一键采纳发送给客户）

【客户回复草稿】
您好，感谢您的反馈！针对您在 Vite 开发环境中配置反向代理后访问接口报 404 的问题，经核实排查，主要原因是 Vite 代理默认会携带 `/api` 前缀向后端转发，而您的后端实际路由为 `/v1/user`，缺少了路径剥离规则。

建议您在 `vite.config.ts` 中为该代理规则添加 `rewrite` 处理函数，参考修改如下：

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // 添加以下重写规则，将前端的 /api 前缀剥离后再转发给后端
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
```

修改完成后，请重启本地开发服务器（`Ctrl + C` 后重新执行 `npm run dev`）再次测试。如果仍有问题，请随时与我们联系！
