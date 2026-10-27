import type { DemoScenarioDefinition } from '../../types'
import { viteProxyKnowledgeChunks } from './knowledge'
import ticketMarkdown from './ticket.md?raw'
import analysisMarkdown from './analysis.md?raw'
import replyMarkdown from './reply.md?raw'

export const viteProxyScenario: DemoScenarioDefinition = {
  id: 'vite-proxy-404',
  schemaVersion: '1.0',
  title: '【配置排错】Vite dev server 代理 404',
  summary: '典型充分证据案例：展示知识库高分命中、两段式分析与一键采纳闭环流程',
  badgeLabel: '证据充分 · 可采纳闭环',
  ticketMarkdown,
  analysisMarkdown,
  customerReplyDraft: replyMarkdown,
  knowledgeChunks: viteProxyKnowledgeChunks,
  evidenceSufficient: true,
}
