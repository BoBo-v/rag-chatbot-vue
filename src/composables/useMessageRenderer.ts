import { renderMarkdownDocument, type CodeBlockEntry } from '../utils/markdown'
import { useWebPreview } from './useWebPreview'
import type { Message } from '../types/chat'

interface MessageRenderSnapshot {
    html: string
    blocks: Map<string, CodeBlockEntry>
    rawContent: string
}

// 内存中按消息生命周期维护的渲染快照表，随消息更新而更新，避免全局 FIFO 淘汰
const messageSnapshots = new Map<string, MessageRenderSnapshot>()

export function useMessageRenderer() {
    function renderContent(msg: Message): string {
        if (msg.status === 'loading') {
            return '<div class="thinking-dots"><span></span><span></span><span></span></div>'
        }
        if (msg.status === 'error' && !msg.content) {
            return ''
        }

        const rawText = msg.formattedMarkdown || msg.content || ''
        const isStatic = msg.status === 'done' || msg.status === 'aborted' || msg.status === 'error'

        if (isStatic) {
            const cached = messageSnapshots.get(msg.id)
            if (cached && cached.rawContent === rawText) {
                return cached.html
            }
        }

        const result = renderMarkdownDocument(rawText, msg.id)
        let htmlOutput = result.html

        if (msg.status === 'streaming') {
            const cursor = '<span class="cursor-blink">▋</span>'
            const lastClose = htmlOutput.lastIndexOf('</')
            if (lastClose === -1) {
                htmlOutput = htmlOutput + cursor
            } else {
                htmlOutput = htmlOutput.slice(0, lastClose) + cursor + htmlOutput.slice(lastClose)
            }
        }

        messageSnapshots.set(msg.id, {
            html: result.html,
            blocks: result.blocks,
            rawContent: rawText,
        })

        return htmlOutput
    }

    function getCodeBlockFromSnapshot(blockId: string, ownerMessageId?: string): CodeBlockEntry | undefined {
        if (!ownerMessageId) return undefined
        const snapshot = messageSnapshots.get(ownerMessageId)
        return snapshot?.blocks.get(blockId)
    }

    function releaseMessage(id: string): void {
        messageSnapshots.delete(id)
    }

    function retainMessages(ids: string[]): void {
        const idSet = new Set(ids)
        for (const key of messageSnapshots.keys()) {
            if (!idSet.has(key)) {
                messageSnapshots.delete(key)
            }
        }
    }

    function clearSnapshots(): void {
        messageSnapshots.clear()
    }

    function handleCodeBlockAction(e: MouseEvent, ownerMessageId?: string): void {
        if (!ownerMessageId) return
        const target = e.target as HTMLElement

        // 统一寻找代码块外层包裹容器并严格校验其是否在对应消息的 blocks 记录中
        const wrapper = target.closest('.code-block-wrapper') as HTMLElement | null
        if (!wrapper || !wrapper.id) return

        const block = getCodeBlockFromSnapshot(wrapper.id, ownerMessageId)
        if (!block) {
            // 非当前消息登记的受信代码块，拒绝响应
            return
        }

        // 处理网页沙箱预览
        const previewBtn = target.closest('.code-preview-btn') as HTMLElement | null
        if (previewBtn) {
            const { openPreview } = useWebPreview()
            openPreview(block.code)
            return
        }

        // 处理复制代码
        const copyBtn = target.closest('.code-copy-btn') as HTMLElement | null
        if (copyBtn) {
            navigator.clipboard.writeText(block.code).then(() => {
                copyBtn.textContent = '已复制 ✓'
                copyBtn.classList.add('copied')
                setTimeout(() => {
                    copyBtn.textContent = '复制'
                    copyBtn.classList.remove('copied')
                }, 2000)
            })
            return
        }

        // 处理代码块自动折行 / 滚动切换
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

    return {
        renderContent,
        handleCodeBlockAction,
        handleCodeBlockCopy: handleCodeBlockAction, // 兼容现有别名
        releaseMessage,
        retainMessages,
        clearSnapshots,
    }
}
