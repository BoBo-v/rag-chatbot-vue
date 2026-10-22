import { reactive } from 'vue'
import type { AppSettings, BackendRagMode } from '../stores/settings'
import type { ModelRuntimeConfig } from '../types/model'
import { resolveTargetBaseUrl } from './api'
import { normalizeOpenAIBaseUrl } from './providers/openai'

export type DirectProviderType = 'ollama' | 'openai' | 'claude'
export type BackendProviderType = 'ollama' | 'openai' | 'anthropic'

export interface DirectDraftState {
  ollama: { baseUrl: string; model: string }
  openai: { baseUrl: string; model: string; apiKey?: string }
  claude: { model: string; apiKey?: string }
}

export interface BackendDraftState {
  baseUrl: string
  provider: BackendProviderType
  model: string
  backendRagMode?: BackendRagMode
}

export interface CompareEditorDraft {
  transport: 'direct' | 'backend'
  directProvider: DirectProviderType
  direct: DirectDraftState
  backend: BackendDraftState
  provider: DirectProviderType | BackendProviderType
  model: string
  baseUrl?: string
  apiKey?: string
  label: string
}

export function createCompareEditorDraft(settings: AppSettings): CompareEditorDraft {
  const isBackend = settings.transport === 'backend'
  const initialDirectProvider: DirectProviderType =
    settings.provider === 'claude' || settings.provider === 'openai' || settings.provider === 'ollama'
      ? settings.provider
      : 'ollama'
  const rawBackendProvider = settings.backend?.provider as string | undefined
  const initialBackendProvider: BackendProviderType =
    (rawBackendProvider === 'claude' ? 'anthropic' : (rawBackendProvider || 'ollama')) as BackendProviderType

  const draft = reactive({
    transport: (isBackend ? 'backend' : 'direct') as 'direct' | 'backend',
    directProvider: initialDirectProvider,
    direct: {
      ollama: {
        baseUrl: settings.ollama?.url || 'http://localhost:11434',
        model: settings.ollama?.model || '',
      },
      openai: {
        baseUrl: settings.openai?.baseUrl || '',
        model: settings.openai?.model || '',
        apiKey: settings.openai?.apiKey || '',
      },
      claude: {
        model: settings.claude?.model || '',
        apiKey: settings.claude?.apiKey || '',
      },
    },
    backend: {
      baseUrl: settings.backend?.url ?? '',
      provider: initialBackendProvider,
      model: settings.backend?.model || '',
      backendRagMode: settings.ragMode ?? 'off',
    },
    get provider(): DirectProviderType | BackendProviderType {
      if (this.transport === 'backend') {
        return this.backend.provider
      }
      return this.directProvider
    },
    set provider(value: string) {
      if (this.transport === 'backend') {
        this.backend.provider = (value === 'claude' ? 'anthropic' : value) as BackendProviderType
      } else {
        this.directProvider = (value === 'anthropic' ? 'claude' : value) as DirectProviderType
      }
    },
    get model(): string {
      if (this.transport === 'backend') {
        return this.backend.model
      }
      if (this.directProvider === 'ollama') return this.direct.ollama.model
      if (this.directProvider === 'openai') return this.direct.openai.model
      return this.direct.claude.model
    },
    set model(value: string) {
      if (this.transport === 'backend') {
        this.backend.model = value
      } else if (this.directProvider === 'ollama') {
        this.direct.ollama.model = value
      } else if (this.directProvider === 'openai') {
        this.direct.openai.model = value
      } else {
        this.direct.claude.model = value
      }
    },
    get baseUrl(): string | undefined {
      if (this.transport === 'backend') {
        return this.backend.baseUrl
      }
      if (this.directProvider === 'ollama') return this.direct.ollama.baseUrl
      if (this.directProvider === 'openai') return this.direct.openai.baseUrl
      return undefined
    },
    set baseUrl(value: string | undefined) {
      if (this.transport === 'backend') {
        this.backend.baseUrl = value || ''
      } else if (this.directProvider === 'ollama') {
        this.direct.ollama.baseUrl = value || ''
      } else if (this.directProvider === 'openai') {
        this.direct.openai.baseUrl = value || ''
      }
    },
    get apiKey(): string | undefined {
      if (this.transport === 'backend') {
        return undefined
      }
      if (this.directProvider === 'openai') return this.direct.openai.apiKey
      if (this.directProvider === 'claude') return this.direct.claude.apiKey
      return undefined
    },
    set apiKey(value: string | undefined) {
      if (this.transport === 'direct') {
        if (this.directProvider === 'openai') {
          this.direct.openai.apiKey = value || ''
        } else if (this.directProvider === 'claude') {
          this.direct.claude.apiKey = value || ''
        }
      }
    },
    get label(): string {
      return `${this.transport === 'backend' ? '后端' : '直连'} · ${this.provider} - ${this.model}`
    },
  })

  return draft as CompareEditorDraft
}

export function syncDraftFromSettings(draft: CompareEditorDraft, settings: AppSettings): void {
  const isBackend = settings.transport === 'backend'
  draft.transport = isBackend ? 'backend' : 'direct'
  draft.directProvider =
    settings.provider === 'claude' || settings.provider === 'openai' || settings.provider === 'ollama'
      ? settings.provider
      : 'ollama'
  draft.direct.ollama.baseUrl = settings.ollama?.url || 'http://localhost:11434'
  draft.direct.ollama.model = settings.ollama?.model || ''
  draft.direct.openai.baseUrl = settings.openai?.baseUrl || ''
  draft.direct.openai.model = settings.openai?.model || ''
  draft.direct.openai.apiKey = settings.openai?.apiKey || ''
  draft.direct.claude.model = settings.claude?.model || ''
  draft.direct.claude.apiKey = settings.claude?.apiKey || ''
  draft.backend.baseUrl = settings.backend?.url ?? ''
  const rawBackendProvider = settings.backend?.provider as string | undefined
  draft.backend.provider = (rawBackendProvider === 'claude' ? 'anthropic' : (rawBackendProvider || 'ollama')) as BackendProviderType
  draft.backend.model = settings.backend?.model || ''
  draft.backend.backendRagMode = settings.ragMode ?? 'off'
}

export function normalizeCompareDraft(draft: CompareEditorDraft): void {
  if (draft.transport === 'backend') {
    if ((draft.backend.provider as string) === 'claude') {
      draft.backend.provider = 'anthropic'
    } else if (draft.backend.provider !== 'openai' && draft.backend.provider !== 'anthropic') {
      draft.backend.provider = 'ollama'
    }
  } else {
    if ((draft.directProvider as string) === 'anthropic') {
      draft.directProvider = 'claude'
    } else if (draft.directProvider !== 'openai' && draft.directProvider !== 'claude') {
      draft.directProvider = 'ollama'
    }
  }
}

export function buildRuntimeFromDraft(draft: CompareEditorDraft, settings: AppSettings): ModelRuntimeConfig {
  if (draft.transport === 'backend') {
    const rawProvider = (draft.backend.provider as string) === 'claude' ? 'anthropic' : draft.backend.provider
    const provider: 'ollama' | 'openai' | 'anthropic' =
      rawProvider === 'openai' || rawProvider === 'anthropic' ? rawProvider : 'ollama'
    const normalizedUrl = resolveTargetBaseUrl(draft.backend.baseUrl)
    return {
      transport: 'backend',
      provider,
      model: draft.backend.model,
      baseUrl: normalizedUrl,
      apiKey: undefined,
      label: `后端 · ${provider} - ${draft.backend.model}`,
      systemPrompt: settings.systemPrompt,
      maxContextTokens: settings.maxContextTokens,
      responseTimeoutSeconds: settings.responseTimeoutSeconds,
      backendRagMode: draft.backend.backendRagMode ?? settings.ragMode ?? 'off',
      backendProvider: provider,
      backendModel: draft.backend.model,
    }
  } else {
    const rawProvider = (draft.directProvider as string) === 'anthropic' ? 'claude' : draft.directProvider
    const provider: 'ollama' | 'openai' | 'claude' =
      rawProvider === 'openai' || rawProvider === 'claude' ? rawProvider : 'ollama'
    let baseUrl: string | undefined
    let apiKey: string | undefined
    let model: string

    if (provider === 'ollama') {
      baseUrl = (draft.direct.ollama.baseUrl.trim() || 'http://localhost:11434').replace(/\/+$/, '')
      apiKey = undefined
      model = draft.direct.ollama.model
    } else if (provider === 'openai') {
      baseUrl = normalizeOpenAIBaseUrl(draft.direct.openai.baseUrl)
      apiKey = draft.direct.openai.apiKey ?? settings.openai?.apiKey
      model = draft.direct.openai.model
    } else {
      baseUrl = undefined
      apiKey = draft.direct.claude.apiKey ?? settings.claude?.apiKey
      model = draft.direct.claude.model
    }

    return {
      transport: 'direct',
      provider,
      model,
      baseUrl,
      apiKey,
      label: `直连 · ${provider} - ${model}`,
      systemPrompt: settings.systemPrompt,
      maxContextTokens: settings.maxContextTokens,
      responseTimeoutSeconds: settings.responseTimeoutSeconds,
      backendRagMode: undefined,
      backendProvider: undefined,
      backendModel: undefined,
    }
  }
}
