import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import { mathPlugin } from './math'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'

// Markdown 渲染器：把消息文本转成 HTML，再由 Vue 的 v-html 显示。
// 这里还负责给代码块加语言标签、复制按钮和 highlight.js 高亮。
const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
    highlight: function (str: string, lang: string): string {
        // markdown-it 的 highlight 回调只处理代码块内部。
        // 外层 wrapper/header 是我们自己拼出来的，用于显示复制按钮。
        const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ''
        const copyBtn = `<button class="code-copy-btn" title="复制代码">复制</button>`
        const header = `<div class="code-block-header">${langLabel}${copyBtn}</div>`

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
