import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import { mathPlugin } from './math'
import { sanitizeHtml } from './sanitize'

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

function generateSecurePrefix(ownerMessageId?: string): string {
    const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : Math.random().toString(36).slice(2, 10)
    return ownerMessageId
        ? `cb_${ownerMessageId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${randomSuffix}_`
        : `cb_${randomSuffix}_`
}

export function renderMarkdownDocument(source: string, ownerMessageId?: string): MarkdownRenderResult {
    const blocks = new Map<string, CodeBlockEntry>()
    let blockIndex = 0

    // 生成当前渲染周期不可伪造的专有随机前缀
    const safePrefix = generateSecurePrefix(ownerMessageId)

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

        // 先输出干净的占位容器，无 code-block-wrapper 样式类，防止被混淆
        return `<div id="${blockId}"><pre class="hljs"><code>${codeHtml}</code></pre></div>`
    }

    const rawHtml = md.render(source || '')
    const sanitizedHtml = sanitizeHtml(rawHtml)

    // DOMPurify 净化完毕后，仅在经由本次渲染登记的受信容器中赋权 wrapper 类名并注入操作按钮
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

        const targetOpenTag = `<div id="${blockId}">`
        const targetIndex = finalHtml.indexOf(targetOpenTag)
        if (targetIndex !== -1) {
            const replacement = `<div class="code-block-wrapper" id="${blockId}">${header}`
            finalHtml = finalHtml.slice(0, targetIndex) + replacement + finalHtml.slice(targetIndex + targetOpenTag.length)
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
