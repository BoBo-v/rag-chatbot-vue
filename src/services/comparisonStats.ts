import type { ComparisonRun, ComparisonRunStatus } from '../types/model'

export interface ComparisonRunStats {
    characterCount: number
    wordCount: number
}

export interface ComparisonSessionStats {
    total: number
    done: number
    error: number
    aborted: number
    running: number
    averageLatencyMs?: number
}

export function getRunStats(run: ComparisonRun): ComparisonRunStats {
    const content = run.content.trim()
    const words = content.match(/[\p{L}\p{N}_]+/gu) ?? []

    return {
        characterCount: [...content].length,
        wordCount: words.length,
    }
}

export function isRunningStatus(status: ComparisonRunStatus): boolean {
    return status === 'loading' || status === 'streaming'
}

export function getSessionStats(runs: ComparisonRun[]): ComparisonSessionStats {
    const latencyRuns = runs.filter(run => typeof run.latencyMs === 'number')
    const totalLatency = latencyRuns.reduce((sum, run) => sum + (run.latencyMs ?? 0), 0)

    return {
        total: runs.length,
        done: runs.filter(run => run.status === 'done').length,
        error: runs.filter(run => run.status === 'error').length,
        aborted: runs.filter(run => run.status === 'aborted').length,
        running: runs.filter(run => isRunningStatus(run.status)).length,
        averageLatencyMs: latencyRuns.length > 0
            ? Math.round(totalLatency / latencyRuns.length)
            : undefined,
    }
}

export function formatLatency(latencyMs?: number): string {
    if (!latencyMs) return '-'
    if (latencyMs < 1000) return `${latencyMs} ms`
    return `${(latencyMs / 1000).toFixed(1)} s`
}
