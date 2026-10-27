import type { DemoKnowledgeChunk, DemoScenarioDefinition } from './types'
import type { Message, RagCitation, RagContextInfo } from '../types/chat'

/**
 * 将场景切片转为 UI 组件直接消费的 RagContextInfo
 */
export function createDemoRagContext(
  scenario: DemoScenarioDefinition,
  retrievalState: 'retrieving' | 'hit' | 'none'
): RagContextInfo {
  if (retrievalState === 'retrieving') {
    return {
      mode: 'auto',
      enabled: true,
      results: [],
    }
  }

  if (retrievalState === 'none' || scenario.knowledgeChunks.length === 0) {
    return {
      mode: 'auto',
      enabled: false,
      results: [],
    }
  }

  const results: RagCitation[] = scenario.knowledgeChunks.map((chunk: DemoKnowledgeChunk) => ({
    fileId: chunk.documentId,
    filename: chunk.documentTitle,
    chunkIndex: chunk.chunkIndex,
    score: chunk.score,
    vectorScore: chunk.vectorScore,
    keywordScore: chunk.keywordScore,
    text: chunk.text,
  }))

  return {
    mode: 'auto',
    enabled: true,
    results,
  }
}

/**
 * 创建用户提报工单消息
 */
export function createDemoUserMessage(scenario: DemoScenarioDefinition): Message {
  return {
    id: `demo-user-${scenario.id}`,
    role: 'user',
    content: scenario.ticketMarkdown,
    status: 'done',
    time: '刚刚',
  }
}

/**
 * 创建演示助手消息
 */
export function createDemoAssistantMessage(
  scenario: DemoScenarioDefinition,
  status: Message['status'] = 'loading',
  content = '',
  ragContext?: RagContextInfo
): Message {
  return {
    id: `demo-assistant-${scenario.id}`,
    role: 'assistant',
    content,
    status,
    time: '刚刚',
    ragContext,
  }
}

/**
 * 拼装完整的助手回复正文（内部分析区 + 客户草稿）
 */
export function buildFullAssistantContent(scenario: DemoScenarioDefinition): string {
  return `${scenario.analysisMarkdown.trim()}\n\n---\n\n${scenario.customerReplyDraft.trim()}`
}
