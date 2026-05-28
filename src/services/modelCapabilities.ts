import type { ModelRuntimeConfig } from '../types/model'

const OLLAMA_VISION_MODELS = [
    'llava',
    'bakllava',
    'minicpm-v',
    'qwen2-vl',
    'qwen2.5-vl',
    'llama3.2-vision',
    'moondream',
    'cogvlm',
]

const OPENAI_VISION_MODELS = [
    'gpt-4o',
    'gpt-4.1',
    'gpt-4.5',
    'o3',
    'o4',
    'vision',
]

const CLAUDE_VISION_MODELS = [
    'claude-3',
    'claude-3-5',
    'claude-3-7',
    'claude-sonnet',
    'claude-opus',
    'claude-haiku',
]

function includesAny(value: string, keywords: string[]): boolean {
    const normalized = value.toLowerCase()
    return keywords.some(keyword => normalized.includes(keyword))
}

export function supportsVision(runtime: ModelRuntimeConfig): boolean {
    switch (runtime.provider) {
        case 'ollama':
            return includesAny(runtime.model, OLLAMA_VISION_MODELS)
        case 'openai':
            return includesAny(runtime.model, OPENAI_VISION_MODELS)
        case 'claude':
            return includesAny(runtime.model, CLAUDE_VISION_MODELS)
        default:
            return false
    }
}

export function getVisionUnsupportedRuntimeLabels(runtimes: ModelRuntimeConfig[]): string[] {
    return runtimes
        .filter(runtime => !supportsVision(runtime))
        .map(runtime => `${runtime.provider} / ${runtime.model || runtime.label}`)
}
