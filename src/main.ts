import { createApp } from 'vue'
import '@bobocn/element/style.css'
import './styles/tokens.css'
import './styles/markdown.css'
import './style.css'
import App from './App.vue'

// 应用入口：Vite 会先加载这个文件，再把 Vue 根组件挂载到 index.html 的 #app 节点。
// 全局 CSS 放在这里引入，是为了让整个应用都能共享主题变量、Markdown 样式和基础布局样式。
createApp(App).mount('#app')
