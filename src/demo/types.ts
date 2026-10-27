import type { Message, RagContextInfo } from '../types/chat'

export type DemoScenarioId = 'vite-proxy-404' | 'production-blank-screen'

export type PlaybackStage =
  | 'idle'
  | 'presenting_ticket'
  | 'simulating_rag'
  | 'streaming_analysis'
  | 'streaming_reply'
  | 'completed'
  | 'paused'

export interface DemoKnowledgeChunk {
  chunkId: string
  documentId: string
  documentTitle: string
  chunkIndex: number
  text: string
  score: number
  vectorScore: number
  keywordScore: number
}

export interface DemoScenarioDefinition {
  id: DemoScenarioId
  schemaVersion: '1.0'
  title: string
  summary: string
  badgeLabel: string
  ticketMarkdown: string
  analysisMarkdown: string
  customerReplyDraft: string
  knowledgeChunks: DemoKnowledgeChunk[]
  evidenceSufficient: boolean
}

export interface DemoSessionState {
  currentScenarioId: DemoScenarioId
  stage: PlaybackStage
  runSequence: number
  messages: Message[]
  activeRagContext?: RagContextInfo
  editedDraft: string
  isEvidenceExpanded: boolean
  isEscalated: boolean
  isConfirmed: boolean
  copiedField: 'draft' | 'all' | null
}
