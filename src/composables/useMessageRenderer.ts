import { renderMarkdown } from '../utils/markdown'
import type { Message } from '../types/chat'

export function useMessageRenderer() {
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
