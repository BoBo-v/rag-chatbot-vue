import type { ComparisonRun } from '../types/model'

export interface CodeBlockInfo {
    language: string
    content: string
}

export interface CodeBlockStats {
    count: number
    primaryLanguage?: string
    languages: string[]
}

const FENCED_CODE_BLOCK_RE = /```([^\n\r`]*)[\r\n]+([\s\S]*?)```/g

function normalizeLanguage(rawLanguage: string): string {
    const language = rawLanguage.trim().split(/\s+/)[0]?.toLowerCase()
    return language || 'text'
}

export function extractCodeBlocks(markdown: string): CodeBlockInfo[] {
    const blocks: CodeBlockInfo[] = []

    for (const match of markdown.matchAll(FENCED_CODE_BLOCK_RE)) {
        blocks.push({
            language: normalizeLanguage(match[1] ?? ''),
            content: (match[2] ?? '').trim(),
        })
    }

    return blocks
}

export function getCodeBlockStats(run: ComparisonRun): CodeBlockStats {
    const blocks = extractCodeBlocks(run.content)
    const languageCounts = new Map<string, number>()

    for (const block of blocks) {
        languageCounts.set(block.language, (languageCounts.get(block.language) ?? 0) + 1)
    }

    const languages = [...languageCounts.keys()]
    const primaryLanguage = [...languageCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]

    return {
        count: blocks.length,
        primaryLanguage,
        languages,
    }
}
