import type { DemoScenarioDefinition } from '../../types'
import { blankScreenKnowledgeChunks } from './knowledge'
import ticketMarkdown from './ticket.md?raw'
import analysisMarkdown from './analysis.md?raw'
import replyMarkdown from './reply.md?raw'

export const blankScreenScenario: DemoScenarioDefinition = {
  id: 'production-blank-screen',
  schemaVersion: '1.0',
  title: '【证据不足拒答】生产应用偶现白屏',
  summary: '典型边界防御案例：展示知识库低分时触发安全边界、追问信息清单与转二线流程',
  badgeLabel: '证据不足 · 建议转二线',
  ticketMarkdown,
  analysisMarkdown,
  customerReplyDraft: replyMarkdown,
  knowledgeChunks: blankScreenKnowledgeChunks,
  evidenceSufficient: false,
}
