import { renderMarkdown, getTrustedCodeBlock } from '../utils/markdown'
import { sanitizeHtml } from '../utils/sanitize'
import { useWebPreview } from './useWebPreview'
import type { Message } from '../types/chat'

// 针对已完成的静态消息（用户历史提问、完成的AI回复），使用内存缓存避免反复全量跑 markdown-it + katex 解析
const renderCache = new Map<string, string>()

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
            return sanitizeHtml(msg.formattedContent)
        }


        const isStatic = msg.status === 'done' || msg.status === 'aborted' || msg.status === 'error'
        if (isStatic) {
            const cached = renderCache.get(msg.id)
            if (cached !== undefined && renderCache.get(`${msg.id}:raw`) === msg.content) {
                return cached
            }
        }

        const rendered = renderMarkdown(msg.content)
        if (msg.status === 'streaming') {
            const cursor = '<span class="cursor-blink">▋</span>'
            const lastClose = rendered.lastIndexOf('</')
            if (lastClose === -1) return rendered + cursor
            return rendered.slice(0, lastClose) + cursor + rendered.slice(lastClose)
        }

        if (isStatic) {
            if (renderCache.size > 800) {
                renderCache.clear()
            }
            renderCache.set(msg.id, rendered)
            renderCache.set(`${msg.id}:raw`, msg.content)
        }

        return rendered
    }

    // 代码块操作按钮由 Markdown 渲染出来的 HTML 生成。
    // 因此使用事件委托：基于渲染器记录表校验可信凭证并绑定动作。
    function handleCodeBlockCopy(e: MouseEvent) {
        const target = e.target as HTMLElement

        // 统一寻找代码块外层包裹容器并校验其是否在渲染器受信记录表中
        const wrapper = target.closest('.code-block-wrapper') as HTMLElement | null
        if (!wrapper || !wrapper.id) return

        const trustedBlock = getTrustedCodeBlock(wrapper.id)
        if (!trustedBlock) {
            // 非渲染器登记的仿冒代码块，直接拒绝响应
            return
        }

        // 处理网页预览按钮
        const previewBtn = target.closest('.code-preview-btn') as HTMLElement | null
        if (previewBtn) {
            const { openPreview } = useWebPreview()
            openPreview(trustedBlock.code)
            return
        }

        // 处理复制按钮
        const copyBtn = target.closest('.code-copy-btn') as HTMLElement | null
        if (copyBtn) {
            navigator.clipboard.writeText(trustedBlock.code).then(() => {
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
            const pre = wrapper.querySelector('pre')
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

