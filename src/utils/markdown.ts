import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import { mathPlugin } from './math'
import { sanitizeHtml } from './sanitize'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'

export interface CodeBlockEntry {
    id: string
    code: string
    lang: string
}

export interface MarkdownRenderResult {
    html: string
    blocks: Map<string, CodeBlockEntry>
}

// 兼容旧接口定义
export interface TrustedCodeBlock extends CodeBlockEntry {}

const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
})

md.use(taskLists, { enabled: true, label: true })
md.use(mathPlugin)

export function renderMarkdownDocument(source: string, ownerMessageId?: string): MarkdownRenderResult {
    const blocks = new Map<string, CodeBlockEntry>()
    let blockIndex = 0

    // 生成当前渲染周期专用的前缀，避免与其他消息 ID 碰撞
    const safePrefix = ownerMessageId
        ? `cb_${ownerMessageId.replace(/[^a-zA-Z0-9_-]/g, '_')}_`
        : `cb_${Math.random().toString(36).slice(2, 9)}_`

    md.options.highlight = (str: string, lang: string): string => {
        blockIndex++
        const blockId = `${safePrefix}${blockIndex}`
        const normalizedLang = (lang || '').trim()
        blocks.set(blockId, {
            id: blockId,
            code: str,
            lang: normalizedLang,
        })

        let codeHtml = ''
        if (normalizedLang && hljs.getLanguage(normalizedLang)) {
            try {
                codeHtml = hljs.highlight(str, { language: normalizedLang }).value
            } catch {
                codeHtml = md.utils.escapeHtml(str)
            }
        } else {
            codeHtml = md.utils.escapeHtml(str)
        }

        // 输出纯净 wrapper 容器与代码，控制按钮稍后在 DOMPurify 净化后精准安全注入
        return `<div class="code-block-wrapper" id="${blockId}"><pre class="hljs"><code>${codeHtml}</code></pre></div>`
    }

    const rawHtml = md.render(source || '')
    const sanitizedHtml = sanitizeHtml(rawHtml)

    // DOMPurify 净化完毕后，仅在经由本次渲染登记的受信代码块容器中注入控制按钮
    // 这样既防止任何未授权的伪造代码块按钮，又避免按钮被 DOMPurify 误杀或属性丢失
    let finalHtml = sanitizedHtml
    for (const [blockId, block] of blocks.entries()) {
        const langLabel = block.lang
            ? `<span class="code-lang">${md.utils.escapeHtml(block.lang)}</span>`
            : '<span class="code-lang">code</span>'
        const isWebCode = ['html', 'htm', 'svg'].includes(block.lang.toLowerCase())
        const previewBtn = isWebCode
            ? '<button type="button" class="code-action-btn code-preview-btn" title="在安全沙箱中预览网页">预览网页</button>'
            : ''
        const actions = `<div class="code-block-actions">${previewBtn}<button type="button" class="code-action-btn code-wrap-btn" title="切换自动换行">换行</button><button type="button" class="code-action-btn code-copy-btn" title="复制代码">复制</button></div>`
        const header = `<div class="code-block-header">${langLabel}${actions}</div>`

        const targetOpenTag = `<div class="code-block-wrapper" id="${blockId}">`
        const targetIndex = finalHtml.indexOf(targetOpenTag)
        if (targetIndex !== -1) {
            const insertPos = targetIndex + targetOpenTag.length
            finalHtml = finalHtml.slice(0, insertPos) + header + finalHtml.slice(insertPos)
        }
    }

    return {
        html: finalHtml,
        blocks,
    }
}

export function renderMarkdown(source: string): string {
    return renderMarkdownDocument(source).html
}

// 兼容旧导出
export function getTrustedCodeBlock(_id: string): TrustedCodeBlock | undefined {
    return undefined
}
