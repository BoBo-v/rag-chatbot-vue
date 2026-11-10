import type { KnowledgeSearchResult } from './knowledge'
import { apiFetch } from './api'

export type RagEvalMatchMode = 'auto' | 'any' | 'all' | 'file' | 'keyword'
export type RagEvalStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error'

export interface RagEvalCase {
    id: string
    question: string
    expectedFiles: string[]
    expectedKeywords: string[]
    matchMode: RagEvalMatchMode
    expectedNoResults?: boolean
    topK?: number
    minScore?: number
    fileId?: string
    notes?: string
    // 融合后端评测字段
    category?: 'SINGLE_HOP' | 'MULTI_HOP' | 'COLLOQUIAL' | 'NEGATIVE' | 'ADVERSARIAL' | string
    name?: string
    scenario?: 'ticket' | 'general'
    expectedEvidenceStatus?: 'SUFFICIENT' | 'LOW_EVIDENCE' | 'NO_EVIDENCE'
    expectedHandoff?: boolean
    groundTruth?: string
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
    // 融合后端生成与合规度量字段
    generatedAnswer?: string
    faithfulnessScore?: number
    unsupportedStatements?: string[]
    policyCompliance?: {
        passed: boolean
        violations: string[]
    }
    mrr?: number
    actualEvidenceStatus?: string
}

export interface RagEvalSummary {
    total: number
    completed: number
    passed: number
    failed: number
    passRate: number
    top1HitRate: number
    topKHitRate: number
    negativeRejectionRate: number
    falseRecallRate: number
    averageBestScore?: number
    averageExpectedRank?: number
    noResultCount: number
    lowScoreCount: number
    // 融合核心可靠性大盘
    averageFaithfulness?: number
    policyComplianceRate?: number
    averageMrr?: number
}

export const RAG_EVAL_STORAGE_KEY = 'ai-chat-rag-eval-cases'
export const DEFAULT_RAG_EVAL_TOP_K = 5
export const DEFAULT_RAG_EVAL_MIN_SCORE = 0.55
export const DEFAULT_RAG_EVAL_MATCH_MODE: RagEvalMatchMode = 'auto'

const MATCH_MODES: RagEvalMatchMode[] = ['auto', 'any', 'all', 'file', 'keyword']

export function createRagEvalCase(): RagEvalCase {
    return {
        id: createId(),
        question: '',
        expectedFiles: [],
        expectedKeywords: [],
        matchMode: DEFAULT_RAG_EVAL_MATCH_MODE,
        expectedNoResults: false,
        topK: DEFAULT_RAG_EVAL_TOP_K,
        minScore: DEFAULT_RAG_EVAL_MIN_SCORE,
        notes: '',
        category: 'SINGLE_HOP',
        scenario: 'ticket',
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
        const passed = testCase.expectedNoResults ? false : isResultPassed({
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
    const passed = testCase.expectedNoResults
        ? results.length === 0
        : Boolean(firstPassed) && !noExpectations

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
            expectedNoResults: Boolean(testCase.expectedNoResults),
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
        failureReason: error instanceof Error ? error.message : '评测异常',
        results: [],
        error: error instanceof Error ? error.message : '评测异常',
    }
}

export function summarizeRagEvalResults(
    cases: RagEvalCase[],
    resultMap: Record<string, RagEvalRunResult | undefined>
): RagEvalSummary {
    const completedEntries = cases
        .map(testCase => ({ testCase, result: resultMap[testCase.id] }))
        .filter((entry): entry is { testCase: RagEvalCase; result: RagEvalRunResult } => {
            if (!entry.result) return false
            return entry.result.status !== 'idle' && entry.result.status !== 'running'
        })
    const completedResults = completedEntries.map(entry => entry.result)
    const positiveResults = completedEntries
        .filter(entry => !entry.testCase.expectedNoResults)
        .map(entry => entry.result)
    const negativeResults = completedEntries
        .filter(entry => entry.testCase.expectedNoResults)
        .map(entry => entry.result)
    const scoreResults = completedResults.filter(result => result.bestScore !== undefined)
    const rankResults = completedResults.filter(result => result.expectedRank !== undefined)
    const faithfulnessResults = completedResults.filter(result => result.faithfulnessScore !== undefined)
    const complianceResults = completedResults.filter(result => result.policyCompliance !== undefined)
    const mrrResults = completedResults.filter(result => result.mrr !== undefined)

    const passed = completedResults.filter(result => result.passed).length
    const top1Hits = positiveResults.filter(result => result.top1Hit).length
    const topKHits = positiveResults.filter(result => result.topKHit).length
    const negativeRejections = negativeResults.filter(result => result.passed).length
    const falseRecalls = negativeResults.filter(result => result.results.length > 0).length

    const avgFaithfulness = faithfulnessResults.length > 0
        ? average(faithfulnessResults.map(r => r.faithfulnessScore as number))
        : undefined
    const policyComplianceRate = complianceResults.length > 0
        ? rate(complianceResults.filter(r => r.policyCompliance?.passed).length, complianceResults.length)
        : undefined
    const avgMrr = mrrResults.length > 0
        ? average(mrrResults.map(r => r.mrr as number))
        : undefined

    return {
        total: cases.length,
        completed: completedResults.length,
        passed,
        failed: completedResults.length - passed,
        passRate: rate(passed, completedResults.length),
        top1HitRate: rate(top1Hits, positiveResults.length),
        topKHitRate: rate(topKHits, positiveResults.length),
        negativeRejectionRate: rate(negativeRejections, negativeResults.length),
        falseRecallRate: rate(falseRecalls, negativeResults.length),
        averageBestScore: average(scoreResults.map(result => result.bestScore as number)),
        averageExpectedRank: average(rankResults.map(result => result.expectedRank as number)),
        noResultCount: completedResults.filter(result => result.results.length === 0).length,
        lowScoreCount: completedResults.filter(result => isLowScore(result, findCase(cases, result.caseId))).length,
        averageFaithfulness: avgFaithfulness,
        policyComplianceRate,
        averageMrr: avgMrr,
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

// =============================
// 后端评测 API 对接与格式转换
// =============================

export interface BackendSyntheticCase {
    id: string
    category: string
    name: string
    query: string
    targetFileNames?: string[]
    targetKeywords?: string[]
    groundTruth?: string
    expectedEvidenceStatus?: 'SUFFICIENT' | 'LOW_EVIDENCE' | 'NO_EVIDENCE'
    expectedHandoff?: boolean
    scenario?: 'ticket' | 'general'
    description?: string
}

export interface BackendEvalRunResponse {
    ok: boolean
    report: {
        timestamp: string
        totalCases: number
        passedCases: number
        overallPassRate: number
        retrieval: {
            averageHitRate: number
            averageMrr: number
            averageLatencyMs: number
        }
        generation: {
            averageFaithfulness: number
            policyComplianceRate: number
            totalHallucinationsFound: number
        }
    }
    results: Array<{
        testCaseId: string
        name: string
        category: string
        query: string
        retrieval: {
            hitRate: number
            mrr: number
            bestScore: number | null
            actualEvidenceStatus: 'SUFFICIENT' | 'LOW_EVIDENCE' | 'NO_EVIDENCE'
            topKFilenames: string[]
            latencyMs: number
        }
        generation: {
            faithfulnessScore: number
            statementsCount: number
            verifiedCount: number
            unsupportedStatements: string[]
            answerRelevanceScore: number
            policyCompliance: {
                passed: boolean
                violations: string[]
            }
        }
        overallPass: boolean
        verdictSummary: string
        generatedAnswer?: string
        contextSnippets?: Array<{ filename: string; text: string; score: number }>
    }>
    markdownReport?: string
}

export async function fetchSyntheticCases(options: {
    fileId?: string
    limitPerCategory?: number
    randomSeed?: number
} = {}): Promise<RagEvalCase[]> {
    const res = await apiFetch('/api/eval/rag/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
            fileId: options.fileId || undefined,
            limitPerCategory: options.limitPerCategory ?? 2,
            randomSeed: options.randomSeed ?? Date.now(),
        }),
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || `自动出题失败 (${res.status})`)
    }
    const data = await res.json() as { ok: boolean; cases: BackendSyntheticCase[] }
    return (data.cases || []).map(convertBackendCaseToFrontend)
}

export async function fetchSampledLogs(options: { limit?: number } = {}): Promise<RagEvalCase[]> {
    const limit = options.limit ?? 10
    const res = await apiFetch(`/api/eval/rag/sampled-logs?limit=${limit}`)
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || `难例采样失败 (${res.status})`)
    }
    const data = await res.json() as { ok: boolean; cases: BackendSyntheticCase[] }
    return (data.cases || []).map(convertBackendCaseToFrontend)
}

export async function runBackendRagEval(cases: RagEvalCase[]): Promise<BackendEvalRunResponse> {
    const payload = cases.map(convertFrontendCaseToBackend)
    const res = await apiFetch('/api/eval/rag/run', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ cases: payload }),
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.error || `运行评测失败 (${res.status})`)
    }
    return res.json()
}

export async function fetchLatestEvalReport(): Promise<{ exists: boolean; reportMarkdown: string }> {
    const res = await apiFetch('/api/eval/rag/latest-report')
    if (!res.ok) {
        throw new Error(`获取诊断报告失败 (${res.status})`)
    }
    const data = await res.json() as { ok: boolean; exists: boolean; reportMarkdown: string }
    return {
        exists: Boolean(data.exists),
        reportMarkdown: data.reportMarkdown || '',
    }
}

export function convertBackendCaseToFrontend(backendCase: BackendSyntheticCase): RagEvalCase {
    const isNegative = backendCase.category === 'NEGATIVE'
    return {
        id: backendCase.id || createId(),
        name: backendCase.name || '',
        category: backendCase.category || 'SINGLE_HOP',
        question: backendCase.query,
        expectedFiles: backendCase.targetFileNames || [],
        expectedKeywords: backendCase.targetKeywords || [],
        matchMode: 'auto',
        expectedNoResults: isNegative || backendCase.expectedEvidenceStatus === 'NO_EVIDENCE',
        topK: DEFAULT_RAG_EVAL_TOP_K,
        minScore: DEFAULT_RAG_EVAL_MIN_SCORE,
        scenario: backendCase.scenario || 'ticket',
        expectedEvidenceStatus: backendCase.expectedEvidenceStatus,
        expectedHandoff: backendCase.expectedHandoff,
        groundTruth: backendCase.groundTruth,
        notes: backendCase.description || '',
    }
}

export function convertFrontendCaseToBackend(frontendCase: RagEvalCase): BackendSyntheticCase {
    return {
        id: frontendCase.id,
        category: frontendCase.category || (frontendCase.expectedNoResults ? 'NEGATIVE' : 'SINGLE_HOP'),
        name: frontendCase.name || (frontendCase.question.slice(0, 24) || '自定义测试用例'),
        query: frontendCase.question,
        targetFileNames: frontendCase.expectedFiles.length > 0 ? frontendCase.expectedFiles : undefined,
        targetKeywords: frontendCase.expectedKeywords.length > 0 ? frontendCase.expectedKeywords : undefined,
        groundTruth: frontendCase.groundTruth,
        expectedEvidenceStatus: frontendCase.expectedEvidenceStatus ?? (frontendCase.expectedNoResults ? 'NO_EVIDENCE' : 'SUFFICIENT'),
        expectedHandoff: frontendCase.expectedHandoff,
        scenario: frontendCase.scenario || 'ticket',
        description: frontendCase.notes,
    }
}

export function mergeBackendResultIntoRunResult(
    testCase: RagEvalCase,
    backendItem: BackendEvalRunResponse['results'][0]
): RagEvalRunResult {
    const resultMatches: RagEvalResultMatch[] = (backendItem.contextSnippets || []).map((snippet, idx) => {
        const fileMatch = matchExpectedFiles(snippet.filename, testCase.expectedFiles)
        const keywordMatch = matchExpectedKeywords(snippet.text, testCase.expectedKeywords)
        return {
            result: {
                id: `chunk-${idx}`,
                fileId: `file-${idx}`,
                filename: snippet.filename,
                chunkIndex: idx,
                score: snippet.score,
                vectorScore: snippet.score,
                keywordScore: snippet.score,
                text: snippet.text,
            },
            rank: idx + 1,
            fileMatched: fileMatch.matched,
            keywordMatched: keywordMatch.matched,
            matchedFiles: fileMatch.matchedValues,
            matchedKeywords: keywordMatch.matchedValues,
            passed: fileMatch.matched || keywordMatch.matched,
        }
    })

    return {
        caseId: testCase.id,
        status: backendItem.overallPass ? 'passed' : 'failed',
        passed: backendItem.overallPass,
        top1Hit: backendItem.retrieval.hitRate >= 1.0,
        topKHit: backendItem.retrieval.hitRate >= 1.0,
        bestScore: backendItem.retrieval.bestScore ?? undefined,
        expectedRank: backendItem.retrieval.mrr > 0 ? Math.round(1 / backendItem.retrieval.mrr) : undefined,
        failureReason: backendItem.verdictSummary === 'PASS' ? '' : backendItem.verdictSummary,
        results: resultMatches,
        durationMs: Math.round(backendItem.retrieval.latencyMs),
        generatedAnswer: backendItem.generatedAnswer,
        faithfulnessScore: backendItem.generation.faithfulnessScore,
        unsupportedStatements: backendItem.generation.unsupportedStatements,
        policyCompliance: backendItem.generation.policyCompliance,
        mrr: backendItem.retrieval.mrr,
        actualEvidenceStatus: backendItem.retrieval.actualEvidenceStatus,
    }
}

function normalizeRagEvalCase(value: unknown, index: number): RagEvalCase {
    if (!value || typeof value !== 'object') throw new Error(`第 ${index + 1} 条用例不是对象`)
    const raw = value as Record<string, unknown>
    const question = typeof raw.question === 'string' ? raw.question : (typeof raw.query === 'string' ? raw.query : '')
    if (!question.trim()) throw new Error(`第 ${index + 1} 条用例缺少 question`)

    return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createId(),
        name: typeof raw.name === 'string' ? raw.name : undefined,
        category: typeof raw.category === 'string' ? raw.category : 'SINGLE_HOP',
        scenario: raw.scenario === 'general' ? 'general' : 'ticket',
        question,
        expectedFiles: normalizeStringList(raw.expectedFiles || raw.targetFileNames),
        expectedKeywords: normalizeStringList(raw.expectedKeywords || raw.targetKeywords),
        matchMode: normalizeMatchMode(raw.matchMode),
        expectedNoResults: raw.expectedNoResults === true || raw.category === 'NEGATIVE' || raw.expectedEvidenceStatus === 'NO_EVIDENCE',
        topK: normalizeTopK(raw.topK),
        minScore: normalizeMinScore(raw.minScore),
        fileId: typeof raw.fileId === 'string' && raw.fileId.trim() ? raw.fileId.trim() : undefined,
        notes: typeof raw.notes === 'string' ? raw.notes : (typeof raw.description === 'string' ? raw.description : ''),
        expectedEvidenceStatus: typeof raw.expectedEvidenceStatus === 'string' ? raw.expectedEvidenceStatus as any : undefined,
        expectedHandoff: typeof raw.expectedHandoff === 'boolean' ? raw.expectedHandoff : undefined,
        groundTruth: typeof raw.groundTruth === 'string' ? raw.groundTruth : undefined,
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
    expectedNoResults: boolean
    results: KnowledgeSearchResult[]
    firstPassed?: RagEvalResultMatch
    bestScore?: number
    minScore: number
}): string {
    if (options.expectedNoResults) {
        return options.results.length === 0 ? '' : '期望无结果，但检索到了内容'
    }
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
