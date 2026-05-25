import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    // 生产环境部署在 /ai/ 子路径下，开发环境使用根路径 /。
    base: mode === 'production' ? '/ai/' : '/',
    server: {
        // 允许局域网设备访问开发服务器。只本机开发时可以改成 127.0.0.1。
        host: '0.0.0.0',
    },
    plugins: [vue()],
}))
