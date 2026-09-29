import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import { mathPlugin } from './math'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'

// Markdown 渲染器：把消息文本转成 HTML，再由 Vue 的 v-html 显示。
// 这里还负责给代码块加语言标签、折行与复制操作按钮以及 highlight.js 高亮。
const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
    highlight: function (str: string, lang: string): string {
        // markdown-it 的 highlight 回调只处理代码块内部。
        // 外层 wrapper/header 自定义拼装，提供语言标签、换行切换和一键复制代码。
        const langLabel = lang ? `<span class="code-lang">${md.utils.escapeHtml(lang)}</span>` : '<span class="code-lang">code</span>'
        const actions = `<div class="code-block-actions"><button type="button" class="code-action-btn code-wrap-btn" title="切换自动换行">换行</button><button type="button" class="code-action-btn code-copy-btn" title="复制代码">复制</button></div>`
        const header = `<div class="code-block-header">${langLabel}${actions}</div>`

        if (lang && hljs.getLanguage(lang)) {
            try {
                const highlighted = hljs.highlight(str, { language: lang }).value
                return `<div class="code-block-wrapper">${header}<pre class="hljs"><code>${highlighted}</code></pre></div>`
            } catch {}
        }

        const escaped: string = md.utils.escapeHtml(str)
        return `<div class="code-block-wrapper">${header}<pre class="hljs"><code>${escaped}</code></pre></div>`
    },
})

md.use(taskLists, { enabled: true, label: true })
md.use(mathPlugin)

export function renderMarkdown(text: string): string {
    return md.render(text)
}
