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

    // 代码块操作按钮由 Markdown 渲染出来的 HTML 生成。
    // 因此使用事件委托：点击聊天区域时判断是复制操作还是折行切换操作。
    function handleCodeBlockCopy(e: MouseEvent) {
        const target = e.target as HTMLElement

        // 处理复制按钮
        const copyBtn = target.closest('.code-copy-btn') as HTMLElement | null
        if (copyBtn) {
            const code = copyBtn.closest('.code-block-wrapper')?.querySelector('code')?.textContent ?? ''
            navigator.clipboard.writeText(code).then(() => {
                copyBtn.textContent = '已复制 ✓'
                copyBtn.classList.add('copied')
                setTimeout(() => {
                    copyBtn.textContent = '复制'
                    copyBtn.classList.remove('copied')
                }, 2000)
            })
            return
        }

        // 处理代码块换行/滚动切换按钮
        const wrapBtn = target.closest('.code-wrap-btn') as HTMLElement | null
        if (wrapBtn) {
            const wrapper = wrapBtn.closest('.code-block-wrapper')
            const pre = wrapper?.querySelector('pre')
            if (pre) {
                const isWrapped = pre.classList.toggle('wrap-text')
                wrapBtn.textContent = isWrapped ? '滚动' : '换行'
                wrapBtn.title = isWrapped ? '切换回横向滚动' : '切换自动折行'
                wrapBtn.classList.toggle('active', isWrapped)
            }
        }
    }

    return { renderContent, handleCodeBlockCopy }
}
