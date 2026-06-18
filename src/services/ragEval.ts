import type { KnowledgeSearchResult } from './knowledge'

export type RagEvalMatchMode = 'auto' | 'any' | 'all' | 'file' | 'keyword'
export type RagEvalStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error'

export interface RagEvalCase {
    id: string
    question: string
    expectedFiles: string[]
    expectedKeywords: string[]
    matchMode: RagEvalMatchMode
    topK?: number
    minScore?: number
    fileId?: string
    notes?: string
}

export interface RagEvalResultMatch {
    result: KnowledgeSearchResult
    rank: number
    fileMatched: boolean
    keywordMatched: boolean
    matchedFiles: string[]
    matchedKeywords: string[]
    passed: boolean
}

export interface RagEvalRunResult {
    caseId: string
    status: RagEvalStatus
    passed: boolean
    top1Hit: boolean
    topKHit: boolean
    bestScore?: number
    expectedRank?: number
    failureReason: string
    results: RagEvalResultMatch[]
    error?: string
    durationMs?: number
}

export interface RagEvalSummary {
    total: number
    completed: number
    passed: number
    failed: number
    passRate: number
    top1HitRate: number
    topKHitRate: number
    averageBestScore?: number
    averageExpectedRank?: number
    noResultCount: number
    lowScoreCount: number
}

export const RAG_EVAL_STORAGE_KEY = 'ai-chat-rag-eval-cases'
export const DEFAULT_RAG_EVAL_TOP_K = 5
export const DEFAULT_RAG_EVAL_MIN_SCORE = 0.2
export const DEFAULT_RAG_EVAL_MATCH_MODE: RagEvalMatchMode = 'any'

const MATCH_MODES: RagEvalMatchMode[] = ['auto', 'any', 'all', 'file', 'keyword']

export function createRagEvalCase(): RagEvalCase {
    return {
        id: createId(),
        question: '',
        expectedFiles: [],
        expectedKeywords: [],
        matchMode: DEFAULT_RAG_EVAL_MATCH_MODE,
        topK: DEFAULT_RAG_EVAL_TOP_K,
        minScore: DEFAULT_RAG_EVAL_MIN_SCORE,
        notes: '',
    }
}

export function normalizeRagEvalCases(value: unknown): RagEvalCase[] {
    if (!Array.isArray(value)) throw new Error('JSON 根节点必须是数组')
    return value.map((item, index) => normalizeRagEvalCase(item, index))
}

export function evaluateRagSearchResults(
    testCase: RagEvalCase,
    results: KnowledgeSearchResult[]
): RagEvalRunResult {
    const startedAt = performance.now()
    const effectiveMinScore = normalizeMinScore(testCase.minScore)
    const resultMatches = results.map((result, index) => {
        const fileMatch = matchExpectedFiles(result.filename, testCase.expectedFiles)
        const keywordMatch = matchExpectedKeywords(result.text, testCase.expectedKeywords)
        const passed = isResultPassed({
            mode: testCase.matchMode,
            hasFiles: testCase.expectedFiles.length > 0,
            hasKeywords: testCase.expectedKeywords.length > 0,
            fileMatched: fileMatch.matched,
            keywordMatched: keywordMatch.matched,
        })
        return {
            result,
            rank: index + 1,
            fileMatched: fileMatch.matched,
            keywordMatched: keywordMatch.matched,
            matchedFiles: fileMatch.matchedValues,
            matchedKeywords: keywordMatch.matchedValues,
            passed,
        }
    })
    const firstPassed = resultMatches.find(item => item.passed)
    const bestScore = results[0]?.score
    const noExpectations = testCase.expectedFiles.length === 0 && testCase.expectedKeywords.length === 0
    const passed = Boolean(firstPassed) && !noExpectations

    return {
        caseId: testCase.id,
        status: passed ? 'passed' : 'failed',
        passed,
        top1Hit: resultMatches[0]?.passed ?? false,
        topKHit: Boolean(firstPassed),
        bestScore,
        expectedRank: firstPassed?.rank,
        failureReason: getFailureReason({
            noExpectations,
            results,
            firstPassed,
            bestScore,
            minScore: effectiveMinScore,
        }),
        results: resultMatches,
        durationMs: Math.round(performance.now() - startedAt),
    }
}

export function createErrorRunResult(testCase: RagEvalCase, error: unknown): RagEvalRunResult {
    return {
        caseId: testCase.id,
        status: 'error',
        passed: false,
        top1Hit: false,
        topKHit: false,
        failureReason: error instanceof Error ? error.message : '检索失败',
        results: [],
        error: error instanceof Error ? error.message : '检索失败',
    }
}

export function summarizeRagEvalResults(
    cases: RagEvalCase[],
    resultMap: Record<string, RagEvalRunResult | undefined>
): RagEvalSummary {
    const completedResults = cases
        .map(testCase => resultMap[testCase.id])
        .filter((result): result is RagEvalRunResult => {
            if (!result) return false
            return result.status !== 'idle' && result.status !== 'running'
        })
    const scoreResults = completedResults.filter(result => result.bestScore !== undefined)
    const rankResults = completedResults.filter(result => result.expectedRank !== undefined)
    const passed = completedResults.filter(result => result.passed).length
    const top1Hits = completedResults.filter(result => result.top1Hit).length
    const topKHits = completedResults.filter(result => result.topKHit).length

    return {
        total: cases.length,
        completed: completedResults.length,
        passed,
        failed: completedResults.length - passed,
        passRate: rate(passed, completedResults.length),
        top1HitRate: rate(top1Hits, completedResults.length),
        topKHitRate: rate(topKHits, completedResults.length),
        averageBestScore: average(scoreResults.map(result => result.bestScore as number)),
        averageExpectedRank: average(rankResults.map(result => result.expectedRank as number)),
        noResultCount: completedResults.filter(result => result.results.length === 0).length,
        lowScoreCount: completedResults.filter(result => isLowScore(result, findCase(cases, result.caseId))).length,
    }
}

export function serializeRagEvalCases(cases: RagEvalCase[]): string {
    return JSON.stringify(cases, null, 2)
}

export function buildRagEvalReport(cases: RagEvalCase[], resultMap: Record<string, RagEvalRunResult | undefined>): string {
    const summary = summarizeRagEvalResults(cases, resultMap)
    return JSON.stringify({
        exportedAt: new Date().toISOString(),
        summary,
        cases: cases.map(testCase => ({
            ...testCase,
            runResult: resultMap[testCase.id] ?? null,
        })),
    }, null, 2)
}

function normalizeRagEvalCase(value: unknown, index: number): RagEvalCase {
    if (!value || typeof value !== 'object') throw new Error(`第 ${index + 1} 条用例不是对象`)
    const raw = value as Record<string, unknown>
    const question = typeof raw.question === 'string' ? raw.question : ''
    if (!question.trim()) throw new Error(`第 ${index + 1} 条用例缺少 question`)

    return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createId(),
        question,
        expectedFiles: normalizeStringList(raw.expectedFiles),
        expectedKeywords: normalizeStringList(raw.expectedKeywords),
        matchMode: normalizeMatchMode(raw.matchMode),
        topK: normalizeTopK(raw.topK),
        minScore: normalizeMinScore(raw.minScore),
        fileId: typeof raw.fileId === 'string' && raw.fileId.trim() ? raw.fileId.trim() : undefined,
        notes: typeof raw.notes === 'string' ? raw.notes : '',
    }
}

function normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .filter((item): item is string => typeof item === 'string')
            .map(item => item.trim())
            .filter(Boolean)
    }
    if (typeof value === 'string') {
        return splitList(value)
    }
    return []
}

function normalizeMatchMode(value: unknown): RagEvalMatchMode {
    return typeof value === 'string' && MATCH_MODES.includes(value as RagEvalMatchMode)
        ? value as RagEvalMatchMode
        : DEFAULT_RAG_EVAL_MATCH_MODE
}

export function normalizeTopK(value: unknown): number {
    return clampNumber(typeof value === 'number' ? value : Number(value), 1, 20, DEFAULT_RAG_EVAL_TOP_K)
}

export function normalizeMinScore(value: unknown): number {
    return clampNumber(typeof value === 'number' ? value : Number(value), 0, 1, DEFAULT_RAG_EVAL_MIN_SCORE)
}

export function splitList(value: string): string[] {
    return value
        .split(/[\n,，]/)
        .map(item => item.trim())
        .filter(Boolean)
}

function matchExpectedFiles(filename: string, expectedFiles: string[]) {
    const actual = filename.toLowerCase()
    const matchedValues = expectedFiles.filter(file => actual.includes(file.toLowerCase()))
    return {
        matched: expectedFiles.length > 0 && matchedValues.length > 0,
        matchedValues,
    }
}

function matchExpectedKeywords(text: string, expectedKeywords: string[]) {
    const actual = text.toLowerCase()
    const matchedValues = expectedKeywords.filter(keyword => actual.includes(keyword.toLowerCase()))
    return {
        matched: expectedKeywords.length > 0 && matchedValues.length > 0,
        matchedValues,
    }
}

function isResultPassed(options: {
    mode: RagEvalMatchMode
    hasFiles: boolean
    hasKeywords: boolean
    fileMatched: boolean
    keywordMatched: boolean
}): boolean {
    if (!options.hasFiles && !options.hasKeywords) return false
    const mode = options.mode === 'auto'
        ? getAutoMode(options.hasFiles, options.hasKeywords)
        : options.mode

    if (mode === 'file') return options.fileMatched
    if (mode === 'keyword') return options.keywordMatched
    if (mode === 'all') {
        return (!options.hasFiles || options.fileMatched) && (!options.hasKeywords || options.keywordMatched)
    }
    return options.fileMatched || options.keywordMatched
}

function getAutoMode(hasFiles: boolean, hasKeywords: boolean): RagEvalMatchMode {
    if (hasFiles && hasKeywords) return 'all'
    if (hasFiles) return 'file'
    if (hasKeywords) return 'keyword'
    return 'all'
}

function getFailureReason(options: {
    noExpectations: boolean
    results: KnowledgeSearchResult[]
    firstPassed?: RagEvalResultMatch
    bestScore?: number
    minScore: number
}): string {
    if (options.noExpectations) return '缺少期望文件或关键词'
    if (options.firstPassed) return ''
    if (options.results.length === 0) return '没有任何检索结果'
    if (options.bestScore !== undefined && options.bestScore < options.minScore) return '最高分低于阈值'
    return '结果未命中期望文件或关键词'
}

function isLowScore(result: RagEvalRunResult, testCase?: RagEvalCase): boolean {
    if (result.bestScore === undefined || !testCase) return false
    return result.bestScore < normalizeMinScore(testCase.minScore)
}

function findCase(cases: RagEvalCase[], caseId: string): RagEvalCase | undefined {
    return cases.find(testCase => testCase.id === caseId)
}

function average(values: number[]): number | undefined {
    if (values.length === 0) return undefined
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function rate(part: number, total: number): number {
    if (total === 0) return 0
    return part / total
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, value))
}

function createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return Math.random().toString(36).slice(2)
}
