import { ref, computed, onBeforeUnmount } from 'vue'
import type { DemoScenarioId, PlaybackStage } from './types'
import type { Message, RagContextInfo } from '../types/chat'
import { getDemoScenario, allDemoScenarios } from './catalog'
import {
  createDemoUserMessage,
  createDemoAssistantMessage,
  createDemoRagContext,
  buildFullAssistantContent,
} from './adapters'
import { DemoPlaybackController } from './playback'
import { useToast } from '../composables/useToast'

export function useDemoSession() {
  const toast = useToast()
  const controller = new DemoPlaybackController()

  const currentScenarioId = ref<DemoScenarioId>('vite-proxy-404')
  const currentScenario = computed(() => getDemoScenario(currentScenarioId.value))

  const inputPrompt = ref<string>(currentScenario.value.ticketMarkdown)
  const stage = ref<PlaybackStage>('idle')
  const messages = ref<Message[]>([])
  const activeRagContext = ref<RagContextInfo | undefined>(undefined)
  const editedDraft = ref<string>('')
  const isEvidenceExpanded = ref<boolean>(false)
  const isEscalated = ref<boolean>(false)
  const isConfirmed = ref<boolean>(false)
  const copiedField = ref<'draft' | 'all' | null>(null)
  const copyFailedDraft = ref<string | null>(null)

  let copyTimer: ReturnType<typeof setTimeout> | null = null

  async function startPlayback(customPrompt?: string): Promise<void> {
    const scenario = currentScenario.value
    const seq = controller.nextSequence()

    stage.value = 'presenting_ticket'
    isEvidenceExpanded.value = false
    isEscalated.value = false
    isConfirmed.value = false
    copiedField.value = null
    copyFailedDraft.value = null

    // 1. 用户提报工单（使用输入框现有内容或案例默认报障）
    const promptText = (customPrompt ?? inputPrompt.value).trim() || scenario.ticketMarkdown
    inputPrompt.value = promptText

    const userMsg = createDemoUserMessage(scenario)
    userMsg.content = promptText
    messages.value = [userMsg]

    // 2. 占位 Loading
    const assistantMsg = createDemoAssistantMessage(scenario, 'loading', '')
    messages.value.push(assistantMsg)

    // 3. 模拟 RAG 检索中状态 (等待 500ms)
    stage.value = 'simulating_rag'
    activeRagContext.value = createDemoRagContext(scenario, 'retrieving')
    assistantMsg.ragContext = activeRagContext.value

    const ragDelayOk = await controller.delay(500, seq)
    if (!ragDelayOk) return

    // 4. 检索命中并呈现依据
    activeRagContext.value = createDemoRagContext(scenario, 'hit')
    assistantMsg.ragContext = activeRagContext.value

    // 5. 流式输出分析区与回复草稿
    const fullContent = buildFullAssistantContent(scenario)
    stage.value = 'streaming_analysis'
    assistantMsg.status = 'streaming'
    assistantMsg.content = ''

    const streamOk = await controller.streamText(
      fullContent,
      seq,
      (chunk) => {
        assistantMsg.content = chunk
      },
      { minChunkSize: 1, maxChunkSize: 3, intervalMs: 16, punctuationPauses: true }
    )

    if (!streamOk) return

    assistantMsg.status = 'done'
    editedDraft.value = scenario.customerReplyDraft
    stage.value = 'completed'
  }

  function skipToFinish(): void {
    controller.cancel()
    const scenario = currentScenario.value

    const userMsg = createDemoUserMessage(scenario)
    userMsg.content = inputPrompt.value || scenario.ticketMarkdown
    const ragContext = createDemoRagContext(scenario, 'hit')
    const assistantMsg = createDemoAssistantMessage(
      scenario,
      'done',
      buildFullAssistantContent(scenario),
      ragContext
    )

    messages.value = [userMsg, assistantMsg]
    activeRagContext.value = ragContext
    editedDraft.value = scenario.customerReplyDraft
    stage.value = 'completed'
    toast.show('已跳过动画，呈现完整推理分析结果', 'success')
  }

  function replay(): void {
    void startPlayback()
  }

  function switchScenario(id: DemoScenarioId, autoSend = true): void {
    currentScenarioId.value = id
    inputPrompt.value = currentScenario.value.ticketMarkdown
    if (autoSend) {
      void startPlayback()
    } else {
      controller.cancel()
      messages.value = []
      activeRagContext.value = undefined
      stage.value = 'idle'
    }
  }

  async function adoptAndCopy(): Promise<void> {
    const textToCopy = editedDraft.value.trim() || currentScenario.value.customerReplyDraft.trim()
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        throw new Error('Clipboard API not available')
      }
      copiedField.value = 'draft'
      if (copyTimer) clearTimeout(copyTimer)
      copyTimer = setTimeout(() => {
        copiedField.value = null
      }, 2500)
      toast.show('已采纳并复制客户草稿（不包含内部分析与检索分）', 'success')
    } catch {
      copyFailedDraft.value = textToCopy
      toast.show('浏览器剪贴板权限受限，已提供手动复制弹窗', 'warning')
    }
  }

  function toggleEvidence(): void {
    isEvidenceExpanded.value = !isEvidenceExpanded.value
    if (isEvidenceExpanded.value) {
      toast.show('已展开知识库依据卡片，可查阅 chunk 片段与综合分', 'success')
    }
  }

  function toggleEscalate(): void {
    isEscalated.value = !isEscalated.value
    if (isEscalated.value) {
      isConfirmed.value = false
      toast.show('已模拟标记【转二线研发】状态', 'warning')
    } else {
      toast.show('已取消转二线标记', 'success')
    }
  }

  function toggleConfirm(): void {
    isConfirmed.value = !isConfirmed.value
    if (isConfirmed.value) {
      isEscalated.value = false
      toast.show('已模拟标记【方案已确认闭环】', 'success')
    } else {
      toast.show('已取消闭环标记', 'success')
    }
  }

  function reset(): void {
    controller.cancel()
    if (copyTimer) clearTimeout(copyTimer)
    messages.value = []
    activeRagContext.value = undefined
    editedDraft.value = ''
    stage.value = 'idle'
    isEvidenceExpanded.value = false
    isEscalated.value = false
    isConfirmed.value = false
    copiedField.value = null
    copyFailedDraft.value = null
    inputPrompt.value = currentScenario.value.ticketMarkdown
  }

  onBeforeUnmount(() => {
    reset()
  })

  return {
    currentScenarioId,
    currentScenario,
    allScenarios: allDemoScenarios,
    inputPrompt,
    stage,
    messages,
    activeRagContext,
    editedDraft,
    isEvidenceExpanded,
    isEscalated,
    isConfirmed,
    copiedField,
    copyFailedDraft,
    startPlayback,
    skipToFinish,
    replay,
    switchScenario,
    adoptAndCopy,
    toggleEvidence,
    toggleEscalate,
    toggleConfirm,
    reset,
  }
}
