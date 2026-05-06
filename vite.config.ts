import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    base: mode === 'production' ? '/ai/' : '/',
    server: {
        host: '0.0.0.0',
    },
    plugins: [vue()],
}))
