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

    await db.transaction('rw', db.agentSessions, db.agentMessages, async () => {
        await db.agentSessions.add(row)
        await db.agentMessages.add(messageRow)
    })

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
    await db.transaction('rw', db.agentSessions, db.agentMessages, async () => {
        const updated = await db.agentSessions.update(sessionId, {
            ...runtime,
            updatedAt: message.createdAt,
        })
        if (updated === 0) throw new Error(`Agent session not found: ${sessionId}`)
        await db.agentMessages.put(toMessageRow(sessionId, message))
    })
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

function toMessageRow(sessionId: string, message: AgentStoredMessage): DBAgentMessage {
    return {
        id: message.id,
        sessionId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        ...(message.execution ? { execution: message.execution } : {}),
    }
}

function toStoredMessage(row: DBAgentMessage): AgentStoredMessage {
    return {
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt,
        ...(row.execution ? { execution: row.execution } : {}),
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
