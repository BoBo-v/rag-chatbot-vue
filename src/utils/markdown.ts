import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.css'

const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true,
    highlight: function (str: string, lang: string): string {
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

export function renderMarkdown(text: string): string {
    return md.render(text)
}
