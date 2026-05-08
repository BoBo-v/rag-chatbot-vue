import { renderMarkdown } from './markdown'

type FormatterConfig = {
    parser: string
    plugins: object[]
}

async function loadFormatterConfig(lang: string): Promise<FormatterConfig | null> {
    switch (lang.toLowerCase()) {
        case 'js':
        case 'javascript': {
            const [babel, estree] = await Promise.all([
                import('prettier/plugins/babel'),
                import('prettier/plugins/estree'),
            ])
            return { parser: 'babel', plugins: [babel, estree] }
        }
        case 'ts':
        case 'typescript': {
            const [typescript, estree] = await Promise.all([
                import('prettier/plugins/typescript'),
                import('prettier/plugins/estree'),
            ])
            return { parser: 'typescript', plugins: [typescript, estree] }
        }
        case 'css': {
            const postcss = await import('prettier/plugins/postcss')
            return { parser: 'css', plugins: [postcss] }
        }
        case 'html': {
            const html = await import('prettier/plugins/html')
            return { parser: 'html', plugins: [html] }
        }
        default:
            return null
    }
}

async function formatCode(str: string, lang: string): Promise<string> {
    const config = await loadFormatterConfig(lang)
    if (!config) return str

    try {
        const prettier = await import('prettier/standalone')
        return await prettier.format(str, {
            parser: config.parser,
            plugins: config.plugins,
            printWidth: 80,
            tabWidth: 2,
            semi: true,
            singleQuote: true,
        })
    } catch {
        return str
    }
}

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

export async function renderMarkdownAsync(text: string): Promise<string> {
    const formatted = await formatCodeBlocks(text)
    return renderMarkdown(formatted)
}
