import { db, type DBAgentMessage, type DBAgentSession, type DBAgentStoredExecution, type DBAgentRunSummary } from '../db'
import { isAgentProfileId, isAgentProviderId, type AgentProfileId, type AgentProviderId, type AgentRequestMessage } from './agent'

export type AgentStoredExecution = DBAgentStoredExecution
export type AgentRunSummary = DBAgentRunSummary

export interface AgentSessionRuntime {
    agentProfile: AgentProfileId
    provider: AgentProviderId
    model: string
}

export interface AgentStoredMessage extends AgentRequestMessage {
    id: string
    createdAt: number
    execution?: AgentStoredExecution
}

export interface AgentSessionListItem extends AgentSessionRuntime {
    id: string
    title: string
    messageCount: number
    createdAt: number
    updatedAt: number
}

export interface AgentStoredSession extends AgentSessionListItem {
    messages: AgentStoredMessage[]
}

export async function createAgentSession(
    runtime: AgentSessionRuntime,
    firstMessage: AgentStoredMessage
): Promise<AgentStoredSession> {
    const id = crypto.randomUUID()
    const row: DBAgentSession = {
        id,
        title: createAgentSessionTitle(firstMessage.content),
        ...runtime,
        createdAt: firstMessage.createdAt,
        updatedAt: firstMessage.createdAt,
    }
    const messageRow = toMessageRow(id, firstMessage)

    try {
        await db.transaction('rw', db.agentSessions, db.agentMessages, async () => {
            await db.agentSessions.add(row)
            await db.agentMessages.add(messageRow)
        })
    } catch (primaryError) {
        console.warn('[agentPersistence] 创建会话主路径写入失败，执行降级写入:', primaryError)
        const fallbackRow: DBAgentMessage = {
            id: firstMessage.id,
            sessionId: id,
            role: firstMessage.role,
            content: firstMessage.content,
            createdAt: firstMessage.createdAt,
        }
        await db.transaction('rw', db.agentSessions, db.agentMessages, async () => {
            await db.agentSessions.add(row)
            await db.agentMessages.add(fallbackRow)
        })
    }

    return {
        ...row,
        agentProfile: isAgentProfileId(row.agentProfile) ? row.agentProfile : 'troubleshoot-v1',
        provider: isAgentProviderId(row.provider) ? row.provider : 'ollama',
        messageCount: 1,
        messages: [{ ...firstMessage }],
    }
}

export async function appendAgentMessage(
    sessionId: string,
    runtime: AgentSessionRuntime,
    message: AgentStoredMessage
): Promise<void> {
    const messageRow = toMessageRow(sessionId, message)
    try {
        await db.transaction('rw', db.agentSessions, db.agentMessages, async () => {
            const updated = await db.agentSessions.update(sessionId, {
                ...runtime,
                updatedAt: message.createdAt,
            })
            if (updated === 0) throw new Error(`Agent session not found: ${sessionId}`)
            await db.agentMessages.put(messageRow)
        })
    } catch (primaryError) {
        console.warn('[agentPersistence] 带 execution 写入失败，尝试纯文本降级写入:', primaryError)
        const fallbackRow: DBAgentMessage = {
            id: message.id,
            sessionId,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
        }
        await db.transaction('rw', db.agentSessions, db.agentMessages, async () => {
            const updated = await db.agentSessions.update(sessionId, {
                ...runtime,
                updatedAt: message.createdAt,
            })
            if (updated === 0) throw new Error(`Agent session not found: ${sessionId}`)
            await db.agentMessages.put(fallbackRow)
        })
    }
}

export async function loadAgentSession(id: string): Promise<AgentStoredSession | null> {
    const row = await db.agentSessions.get(id)
    if (!row) return null

    const messageRows = await db.agentMessages.where('sessionId').equals(id).sortBy('createdAt')
    return {
        ...toSessionListItem(row, messageRows.length),
        messages: messageRows.map(toStoredMessage),
    }
}

export async function listAgentSessions(): Promise<AgentSessionListItem[]> {
    const rows = await db.agentSessions.orderBy('updatedAt').reverse().toArray()
    return Promise.all(rows.map(async row => toSessionListItem(
        row,
        await db.agentMessages.where('sessionId').equals(row.id).count()
    )))
}

export async function deleteAgentSession(id: string): Promise<void> {
    await db.transaction('rw', db.agentSessions, db.agentMessages, async () => {
        await db.agentMessages.where('sessionId').equals(id).delete()
        await db.agentSessions.delete(id)
    })
}

function createAgentSessionTitle(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim()
    return normalized.slice(0, 40) || '新 Agent 会话'
}

function sanitizeExecution(execution?: AgentStoredExecution): DBAgentStoredExecution | undefined {
    if (!execution) return undefined
    try {
        const raw = JSON.parse(JSON.stringify(execution))
        return {
            agentRunId: typeof raw.agentRunId === 'string' ? raw.agentRunId : undefined,
            requestId: typeof raw.requestId === 'string' ? raw.requestId : undefined,
            status: ['completed', 'failed', 'cancelled'].includes(raw.status) ? raw.status : 'completed',
            currentStep: typeof raw.currentStep === 'number' && Number.isFinite(raw.currentStep) ? raw.currentStep : 1,
            events: Array.isArray(raw.events) ? raw.events : [],
            summary: raw.summary && typeof raw.summary === 'object' ? raw.summary : null,
            errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : undefined,
            errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : undefined,
            createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
        }
    } catch (err) {
        console.warn('[agentPersistence] 无法完整序列化 execution，降级保留基础状态:', err)
        return {
            status: execution.status || 'completed',
            currentStep: execution.currentStep || 1,
            events: [],
            createdAt: execution.createdAt || Date.now(),
        }
    }
}

function toMessageRow(sessionId: string, message: AgentStoredMessage): DBAgentMessage {
    const cleanExecution = sanitizeExecution(message.execution)
    return {
        id: message.id,
        sessionId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        ...(cleanExecution ? { execution: cleanExecution } : {}),
    }
}

function toStoredMessage(row: DBAgentMessage): AgentStoredMessage {
    let execution: AgentStoredExecution | undefined = undefined
    if (row.execution) {
        try {
            execution = {
                agentRunId: row.execution.agentRunId,
                requestId: row.execution.requestId,
                status: row.execution.status || 'completed',
                currentStep: row.execution.currentStep || 1,
                events: Array.isArray(row.execution.events) ? row.execution.events : [],
                summary: row.execution.summary || null,
                errorCode: row.execution.errorCode,
                errorMessage: row.execution.errorMessage,
                createdAt: row.execution.createdAt || row.createdAt,
            }
        } catch {
            execution = undefined
        }
    }
    return {
        id: row.id,
        role: row.role,
        content: row.content || '',
        createdAt: row.createdAt || Date.now(),
        ...(execution ? { execution } : {}),
    }
}

function toSessionListItem(row: DBAgentSession, messageCount: number): AgentSessionListItem {
    return {
        id: row.id,
        title: row.title,
        agentProfile: isAgentProfileId(row.agentProfile) ? row.agentProfile : 'troubleshoot-v1',
        provider: isAgentProviderId(row.provider) ? row.provider : 'ollama',
        model: row.model,
        messageCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
}
