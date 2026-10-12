import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import { mathPlugin } from './math'
import { sanitizeHtml } from './sanitize'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'

export interface TrustedCodeBlock {
    id: string
    code: string
    lang: string
}

// 内存安全存储：由 Markdown 渲染器实际维护的代码块记录表（容量上限保护）
const MAX_TRUSTED_BLOCKS = 1000
const trustedCodeBlocks = new Map<string, TrustedCodeBlock>()

export function registerTrustedCodeBlock(code: string, lang: string): string {
    const id = 'tcb_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    if (trustedCodeBlocks.size >= MAX_TRUSTED_BLOCKS) {
        const firstKey = trustedCodeBlocks.keys().next().value
        if (firstKey) trustedCodeBlocks.delete(firstKey)
    }
    trustedCodeBlocks.set(id, { id, code, lang })
    return id
}

export function getTrustedCodeBlock(id: string): TrustedCodeBlock | undefined {
    return trustedCodeBlocks.get(id)
}

// Markdown 渲染器：把消息文本转成 HTML，再由 Vue 的 v-html 显示。
// 这里还负责给代码块加语言标签、折行与复制操作按钮以及 highlight.js 高亮。
const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
    highlight: function (str: string, lang: string): string {
        // 注册到受信代码块表，生成不可伪造的 DOM ID 凭证
        const blockId = registerTrustedCodeBlock(str, lang)
        const langLabel = lang ? `<span class="code-lang">${md.utils.escapeHtml(lang)}</span>` : '<span class="code-lang">code</span>'
        const normalizedLang = (lang || '').toLowerCase()
        const isWebCode = ['html', 'htm', 'svg'].includes(normalizedLang)
        const previewBtn = isWebCode ? '<button type="button" class="code-action-btn code-preview-btn" title="在安全沙箱中预览网页">预览网页</button>' : ''
        const actions = `<div class="code-block-actions">${previewBtn}<button type="button" class="code-action-btn code-wrap-btn" title="切换自动换行">换行</button><button type="button" class="code-action-btn code-copy-btn" title="复制代码">复制</button></div>`
        const header = `<div class="code-block-header">${langLabel}${actions}</div>`

        if (lang && hljs.getLanguage(lang)) {
            try {
                const highlighted = hljs.highlight(str, { language: lang }).value
                return `<div class="code-block-wrapper" id="${blockId}">${header}<pre class="hljs"><code>${highlighted}</code></pre></div>`
            } catch {}
        }

        const escaped: string = md.utils.escapeHtml(str)
        return `<div class="code-block-wrapper" id="${blockId}">${header}<pre class="hljs"><code>${escaped}</code></pre></div>`
    },
})

md.use(taskLists, { enabled: true, label: true })
md.use(mathPlugin)

export function renderMarkdown(text: string): string {
    const rawHtml = md.render(text)
    return sanitizeHtml(rawHtml)
}
