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

interface RenderEnv {
    blocks?: Map<string, CodeBlockEntry>
    safePrefix?: string
    blockIndex?: number
}

const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
})

md.use(taskLists, { enabled: true, label: true })
md.use(mathPlugin)

// 重写 fence 规则：直接由 fence 输出单层 pre/code 占位，避免默认规则双层嵌套
md.renderer.rules.fence = (tokens, idx, _options, env, _slf): string => {
    const token = tokens[idx]
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
    const lang = info ? info.split(/\s+/)[0] : ''
    const normalizedLang = (lang || '').trim()
    const str = token.content

    const renderEnv = (env || {}) as RenderEnv
    if (!renderEnv.blocks) {
        renderEnv.blocks = new Map<string, CodeBlockEntry>()
    }
    if (!renderEnv.safePrefix) {
        renderEnv.safePrefix = `cb_${Math.random().toString(36).slice(2, 10)}_`
    }
    renderEnv.blockIndex = (renderEnv.blockIndex ?? 0) + 1
    const blockId = `${renderEnv.safePrefix}${renderEnv.blockIndex}`

    renderEnv.blocks.set(blockId, {
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

    // 输出干净且唯一的占位结构，无伪造类名，包含单层 pre.hljs > code
    return `<div id="${blockId}"><pre class="hljs"><code>${codeHtml}</code></pre></div>\n`
}

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
    const safePrefix = generateSecurePrefix(ownerMessageId)

    const env: RenderEnv = {
        blocks,
        safePrefix,
        blockIndex: 0,
    }

    const rawHtml = md.render(source || '', env)
    const sanitizedHtml = sanitizeHtml(rawHtml)

    // DOMPurify 净化后，针对本次登记的受信任代码块精确组装包装层与工具栏
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
        const firstIdx = finalHtml.indexOf(targetOpenTag)
        const lastIdx = finalHtml.lastIndexOf(targetOpenTag)
        if (firstIdx !== -1 && firstIdx === lastIdx) {
            const replacement = `<div class="code-block-wrapper" id="${blockId}">${header}`
            finalHtml = finalHtml.slice(0, firstIdx) + replacement + finalHtml.slice(firstIdx + targetOpenTag.length)
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
