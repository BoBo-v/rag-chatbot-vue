import { db, type DBComparisonRun, type DBComparisonSession } from '../db'
import { getSessionStats, type ComparisonSessionStats } from './comparisonStats'
import type { ComparisonRun, ComparisonSession, ModelRuntimeConfig } from '../types/model'
import type { FileAttachment, ImageAttachment } from '../types/chat'

export interface ComparisonSessionListItem {
    id: string
    prompt: string
    runCount: number
    stats: ComparisonSessionStats
    summaryRunId?: string
    createdAt: number
    updatedAt: number
}

function sanitizeRuntimeConfig(config: ModelRuntimeConfig): ModelRuntimeConfig {
    return {
        provider: config.provider,
        label: config.label,
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: undefined,
        systemPrompt: config.systemPrompt,
        maxContextTokens: config.maxContextTokens,
        responseTimeoutSeconds: config.responseTimeoutSeconds,
    }
}

function cloneImages(images?: ImageAttachment[]): ImageAttachment[] | undefined {
    return images?.map(image => ({
        base64: image.base64,
        mediaType: image.mediaType,
        name: image.name,
    }))
}

function cloneFiles(files?: FileAttachment[]): FileAttachment[] | undefined {
    return files?.map(file => ({
        name: file.name,
        content: file.content,
        size: file.size,
    }))
}

function toSessionRow(
    session: ComparisonSession,
    summaryInstruction?: string
): DBComparisonSession {
    return {
        id: session.id,
        conversationId: session.conversationId,
        prompt: session.prompt,
        images: cloneImages(session.images),
        files: cloneFiles(session.files),
        summaryRunId: session.summaryRun?.id,
        summaryInstruction: summaryInstruction ?? session.summaryInstruction,
        workflowVersion: session.workflowVersion,
        promptVersion: session.promptVersion,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
    }
}

function toRunRow(run: ComparisonRun, kind: DBComparisonRun['kind'], order: number): DBComparisonRun {
    return {
        id: run.id,
        sessionId: run.sessionId,
        kind,
        order,
        config: sanitizeRuntimeConfig(run.config),
        content: run.content,
        status: run.status,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        latencyMs: run.latencyMs,
        sourceRunIds: run.sourceRunIds ? [...run.sourceRunIds] : undefined,
    }
}

function normalizeRestoredRun(row: DBComparisonRun): ComparisonRun {
    const status = row.status === 'loading' || row.status === 'streaming'
        ? 'aborted'
        : row.status

    return {
        id: row.id,
        sessionId: row.sessionId,
        config: row.config,
        content: row.content,
        status,
        errorMessage: row.errorMessage,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        latencyMs: row.latencyMs,
        sourceRunIds: row.sourceRunIds,
    }
}

export async function saveComparisonSession(
    session: ComparisonSession,
    summaryInstruction?: string
): Promise<void> {
    if (summaryInstruction !== undefined) {
        session.summaryInstruction = summaryInstruction
    }
    const rows = [
        ...session.runs.map((run, index) => toRunRow(run, 'answer', index)),
        ...(session.summaryRun ? [toRunRow(session.summaryRun, 'summary', session.runs.length)] : []),
    ]

    await db.transaction('rw', db.comparisonSessions, db.comparisonRuns, async () => {
        await db.comparisonSessions.put(toSessionRow(session, summaryInstruction))
        if (rows.length > 0) {
            await db.comparisonRuns.bulkPut(rows)
        }
    })
}

export async function loadComparisonSession(id: string): Promise<ComparisonSession | null> {
    const sessionRow = await db.comparisonSessions.get(id)
    if (!sessionRow) return null

    const runRows = await db.comparisonRuns
        .where('sessionId')
        .equals(id)
        .sortBy('order')

    const answerRuns = runRows
        .filter(row => row.kind === 'answer')
        .map(normalizeRestoredRun)
    const summaryRow = runRows.find(row => row.kind === 'summary')

    return {
        id: sessionRow.id,
        conversationId: sessionRow.conversationId,
        prompt: sessionRow.prompt,
        images: sessionRow.images,
        files: sessionRow.files,
        runs: answerRuns,
        summaryRun: summaryRow ? normalizeRestoredRun(summaryRow) : undefined,
        summaryInstruction: sessionRow.summaryInstruction,
        workflowVersion: sessionRow.workflowVersion,
        promptVersion: sessionRow.promptVersion,
        createdAt: sessionRow.createdAt,
        updatedAt: sessionRow.updatedAt,
    }
}

export async function listComparisonSessions(): Promise<ComparisonSessionListItem[]> {
    const sessions = await db.comparisonSessions.orderBy('updatedAt').reverse().toArray()

    return Promise.all(sessions.map(async session => {
        const runRows = await db.comparisonRuns.where('sessionId').equals(session.id).toArray()
        const answerRuns = runRows
            .filter(row => row.kind === 'answer')
            .map(normalizeRestoredRun)
        return {
            id: session.id,
            prompt: session.prompt,
            runCount: answerRuns.length,
            stats: getSessionStats(answerRuns),
            summaryRunId: session.summaryRunId,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
        }
    }))
}

export async function deleteComparisonSession(id: string): Promise<void> {
    await db.transaction('rw', db.comparisonSessions, db.comparisonRuns, async () => {
        await db.comparisonRuns.where('sessionId').equals(id).delete()
        await db.comparisonSessions.delete(id)
    })
}
