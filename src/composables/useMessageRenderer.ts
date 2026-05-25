import { renderMarkdown } from '../utils/markdown'
import type { Message } from '../types/chat'

// 消息渲染相关逻辑集中在这里，避免 StyleChat.vue 同时承担 UI 和 Markdown 处理。
export function useMessageRenderer() {
    // 根据消息状态决定显示什么 HTML：
    // loading 显示三点动画；streaming 在 Markdown 后插入光标；done/error 渲染实际内容。
    function renderContent(msg: Message) {
        if (msg.status === 'loading') {
            return '<div class="thinking-dots"><span></span><span></span><span></span></div>'
        }
        if (msg.status === 'error' && !msg.content) {
            return ''
        }
        if (msg.formattedContent) {
            return msg.formattedContent
        }
        const rendered = renderMarkdown(msg.content)
        if (msg.status === 'streaming') {
            const cursor = '<span class="cursor-blink">▋</span>'
            const lastClose = rendered.lastIndexOf('</')
            if (lastClose === -1) return rendered + cursor
            return rendered.slice(0, lastClose) + cursor + rendered.slice(lastClose)
        }
        return rendered
    }

    // 代码块复制按钮是 Markdown 渲染出来的 HTML，不是 Vue 模板里的按钮。
    // 因此用事件委托：点击聊天区域时向上查找 .code-copy-btn。
    function handleCodeBlockCopy(e: MouseEvent) {
        const btn = (e.target as HTMLElement).closest('.code-copy-btn') as HTMLElement | null
        if (!btn) return
        const code = btn.closest('.code-block-wrapper')?.querySelector('code')?.textContent ?? ''
        navigator.clipboard.writeText(code).then(() => {
            btn.textContent = '已复制 ✓'
            btn.classList.add('copied')
            setTimeout(() => {
                btn.textContent = '复制'
                btn.classList.remove('copied')
            }, 2000)
        })
    }

    return { renderContent, handleCodeBlockCopy }
}
