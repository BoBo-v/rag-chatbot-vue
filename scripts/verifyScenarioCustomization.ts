import assert from 'node:assert/strict'
import {
    DEFAULT_GENERAL_PROMPT,
    switchScenario,
    type AppSettings,
} from '../src/stores/settings'
import {
    buildRuntimeFromDraft,
    createCompareEditorDraft,
} from '../src/services/comparisonDraft'

console.log('=== 开始执行场景与提示词隔离专项测试 ===\n')

// 测试 1: 双套提示词切换与独立记忆
console.log('-> 断言 1: 验证工单与通用问答提示词独立记忆与无损切换...')
const testSettings: AppSettings = {
    transport: 'direct',
    provider: 'ollama',
    theme: 'light',
    systemPrompt: '自定义的工单专属 SOP 提示词 #999',
    ticketPrompt: '自定义的工单专属 SOP 提示词 #999',
    generalPrompt: DEFAULT_GENERAL_PROMPT,
    maxContextTokens: 128000,
    responseTimeoutSeconds: 30,
    showModelInTopbar: true,
    ragMode: 'auto',
    scenario: 'ticket',
    backend: { url: '', provider: 'ollama', model: 'qwen2.5:7b' },
    ollama: { url: 'http://localhost:11434', model: 'qwen2.5:7b' },
    openai: { apiKey: '', baseUrl: '', model: '' },
    claude: { apiKey: '', model: '' },
}

// 切换到通用模式
switchScenario(testSettings, 'general')
assert.equal(testSettings.scenario, 'general')
assert.equal(testSettings.systemPrompt, DEFAULT_GENERAL_PROMPT)
assert.equal(testSettings.ticketPrompt, '自定义的工单专属 SOP 提示词 #999', '切换后工单提示词必须完好保留')

// 用户在通用模式下定制提示词
testSettings.systemPrompt = '自定义的企业通用知识库问答助手提示词 #888'

// 切换回工单模式
switchScenario(testSettings, 'ticket')
assert.equal(testSettings.scenario, 'ticket')
assert.equal(testSettings.systemPrompt, '自定义的工单专属 SOP 提示词 #999', '切回工单时必须恢复先前的工单自定义提示词')
assert.equal(testSettings.generalPrompt, '自定义的企业通用知识库问答助手提示词 #888', '通用模式下的自定义提示词必须被无损暂存')

// 再次切到通用模式
switchScenario(testSettings, 'general')
assert.equal(testSettings.scenario, 'general')
assert.equal(testSettings.systemPrompt, '自定义的企业通用知识库问答助手提示词 #888', '再次切到通用时必须恢复通用的自定义提示词')
console.log('   ✓ 工单与通用提示词独立隔离，切换时不丢失各自定制内容')

// 测试 2: 多模型对比页 buildRuntimeFromDraft 透传 scenario
console.log('\n-> 断言 2: 验证对比页 buildRuntimeFromDraft 正确透传 scenario...')
const compareDraft = createCompareEditorDraft(testSettings)

compareDraft.transport = 'backend'
const backendRuntimeGeneral = buildRuntimeFromDraft(compareDraft, { ...testSettings, scenario: 'general' })
assert.equal(backendRuntimeGeneral.scenario, 'general', '后端模式下必须透传 scenario: general')

const backendRuntimeTicket = buildRuntimeFromDraft(compareDraft, { ...testSettings, scenario: 'ticket' })
assert.equal(backendRuntimeTicket.scenario, 'ticket', '后端模式下必须透传 scenario: ticket')

compareDraft.transport = 'direct'
const directRuntimeGeneral = buildRuntimeFromDraft(compareDraft, { ...testSettings, scenario: 'general' })
assert.equal(directRuntimeGeneral.scenario, 'general', '直连模式下必须透传 scenario: general')

console.log('   ✓ 对比页直连与后端均精准透传 scenario')

console.log('\n=== 场景专项测试全部通过 ===\n')
