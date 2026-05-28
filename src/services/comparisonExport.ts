import type { ComparisonRun, ComparisonSession, ModelRuntimeConfig } from '../types/model'

function formatTimestamp(timestamp?: number): string {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleString('zh-CN')
}

function formatLatency(latencyMs?: number): string {
    if (!latencyMs) return '-'
    if (latencyMs < 1000) return `${latencyMs} ms`
    return `${(latencyMs / 1000).toFixed(1)} s`
}

function formatModel(config: ModelRuntimeConfig): string {
    return `${config.provider} / ${config.model || config.label}`
}

function sanitizeRuntimeConfig(config: ModelRuntimeConfig): ModelRuntimeConfig {
    return {
        ...config,
        apiKey: undefined,
    }
}

function buildRunMarkdown(run: ComparisonRun, title: string): string {
    return [
        `## ${title}`,
        '',
        `- 模型：${formatModel(run.config)}`,
        `- 状态：${run.status}`,
        `- 开始时间：${formatTimestamp(run.startedAt)}`,
        `- 结束时间：${formatTimestamp(run.finishedAt)}`,
        `- 耗时：${formatLatency(run.latencyMs)}`,
        ...(run.errorMessage ? [`- 错误：${run.errorMessage}`] : []),
        ...(run.sourceRunIds?.length ? [`- 来源 run：${run.sourceRunIds.join(', ')}`] : []),
        '',
        run.content.trim() || '_暂无输出_',
    ].join('\n')
}

export function exportComparisonAsMarkdown(session: ComparisonSession): string {
    const runSections = session.runs.map((run, index) =>
        buildRunMarkdown(run, `回答 ${index + 1}`)
    )
    const summarySection = session.summaryRun
        ? ['---', '', buildRunMarkdown(session.summaryRun, '汇总答案')]
        : []

    return [
        '# 多模型对比记录',
        '',
        `- Session ID：${session.id}`,
        `- 创建时间：${formatTimestamp(session.createdAt)}`,
        `- 更新时间：${formatTimestamp(session.updatedAt)}`,
        `- Workflow Version：${session.workflowVersion}`,
        `- Prompt Version：${session.promptVersion}`,
        ...(session.summaryInstruction ? [`- 汇总要求：${session.summaryInstruction}`] : []),
        '',
        '## 原始问题',
        '',
        session.prompt,
        '',
        '---',
        '',
        ...runSections,
        ...summarySection,
        '',
    ].join('\n')
}

export function exportComparisonAsJson(session: ComparisonSession): string {
    const exportPayload: ComparisonSession = {
        ...session,
        runs: session.runs.map(run => ({
            ...run,
            config: sanitizeRuntimeConfig(run.config),
        })),
        summaryRun: session.summaryRun
            ? {
                ...session.summaryRun,
                config: sanitizeRuntimeConfig(session.summaryRun.config),
            }
            : undefined,
    }

    return JSON.stringify(exportPayload, null, 2)
}

export function buildComparisonExportFilename(
    session: ComparisonSession,
    extension: 'md' | 'json'
): string {
    const date = new Date(session.updatedAt || session.createdAt)
        .toISOString()
        .slice(0, 10)
    const promptSlug = session.prompt
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 32) || 'comparison'

    return `comparison-${date}-${promptSlug}.${extension}`
}
