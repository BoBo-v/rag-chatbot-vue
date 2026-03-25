import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
    server: {
        host: '0.0.0.0', // 监听所有地址，包括局域网 IP
        // open: true,   // 运行时是否自动在浏览器打开（可选）
    },
  plugins: [vue()],
})
