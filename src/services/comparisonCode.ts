import type { ComparisonRun } from '../types/model'

export interface CodeBlockInfo {
    language: string
    content: string
}

export interface RunCodeBlockInfo extends CodeBlockInfo {
    runId: string
    modelName: string
    blockIndex: number
}

export interface CodeComparisonCandidate {
    language: string
    blocks: RunCodeBlockInfo[]
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

export function getCodeComparisonCandidates(runs: ComparisonRun[]): CodeComparisonCandidate[] {
    const blocksByLanguage = new Map<string, RunCodeBlockInfo[]>()

    for (const run of runs) {
        const blocks = extractCodeBlocks(run.content)
        blocks.forEach((block, index) => {
            const enrichedBlock: RunCodeBlockInfo = {
                ...block,
                runId: run.id,
                modelName: `${run.config.provider} / ${run.config.model || run.config.label}`,
                blockIndex: index,
            }
            const languageBlocks = blocksByLanguage.get(block.language) ?? []
            languageBlocks.push(enrichedBlock)
            blocksByLanguage.set(block.language, languageBlocks)
        })
    }

    return [...blocksByLanguage.entries()]
        .map(([language, blocks]) => ({ language, blocks }))
        .filter(candidate => new Set(candidate.blocks.map(block => block.runId)).size >= 2)
        .sort((a, b) => b.blocks.length - a.blocks.length || a.language.localeCompare(b.language))
}
