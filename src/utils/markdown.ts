import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import * as prettier from 'prettier'
import parserBabel from 'prettier/plugins/babel'
import parserEstree from 'prettier/plugins/estree'
import parserCss from 'prettier/plugins/postcss'
import parserHtml from 'prettier/plugins/html'
import parserTs from 'prettier/plugins/typescript'

// 语言 → prettier parser 映射
const parserMap: Record<string, { parser: string; plugins: any[] }> = {
    js:         { parser: 'babel',      plugins: [parserBabel, parserEstree] },
    javascript: { parser: 'babel',      plugins: [parserBabel, parserEstree] },
    ts:         { parser: 'typescript', plugins: [parserTs, parserEstree] },
    typescript: { parser: 'typescript', plugins: [parserTs, parserEstree] },
    css:        { parser: 'css',        plugins: [parserCss] },
    html:       { parser: 'html',       plugins: [parserHtml] },
}

async function formatCode(str: string, lang: string): Promise<string> {
    const config = parserMap[lang.toLowerCase()]
    if (!config) return str  // 不支持的语言直接原样返回
    try {
        return await prettier.format(str, {
            parser: config.parser,
            plugins: config.plugins,
            printWidth: 80,
            tabWidth: 2,
            semi: true,
            singleQuote: true,
        })
    } catch {
        return str  // 格式化失败（如不完整代码）原样返回
    }
}

const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
        const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ''
        const copyBtn = `<button class="code-copy-btn" title="复制代码">复制</button>`
        const header = `<div class="code-block-header">${langLabel}${copyBtn}</div>`

        if (lang && hljs.getLanguage(lang)) {
            try {
                const highlighted = hljs.highlight(str, { language: lang }).value
                return `<div class="code-block-wrapper">${header}<pre class="hljs"><code>${highlighted}</code></pre></div>`
            } catch {}
        }

        const escaped = md.utils.escapeHtml(str)
        return `<div class="code-block-wrapper">${header}<pre class="hljs"><code>${escaped}</code></pre></div>`
    }
})

// 异步版本，流式输出完成后调用
export async function renderMarkdownAsync(text: string): Promise<string> {
    // 提取并格式化所有代码块，再交给 md.render
    const formatted = await formatCodeBlocks(text)
    return md.render(formatted)
}

// 同步版本，流式过程中用（不格式化，只高亮）
export function renderMarkdown(text: string): string {
    return md.render(text)
}

// 把 markdown 里所有 ```lang ... ``` 代码块格式化
async function formatCodeBlocks(text: string): Promise<string> {
    const fence = /```(\w+)\n([\s\S]*?)```/g
    const jobs: Array<{ full: string; lang: string; code: string }> = []

    let match
    while ((match = fence.exec(text)) !== null) {
        jobs.push({ full: match[0], lang: match[1], code: match[2] })
    }

    for (const job of jobs) {
        const formatted = await formatCode(job.code, job.lang)
        text = text.replace(job.full, `\`\`\`${job.lang}\n${formatted}\`\`\``)
    }
    return text
}