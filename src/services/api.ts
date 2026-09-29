import { settings } from '../stores/settings'

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''

function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, '')
    return trimmed.replace(/\/api$/i, '')
}

export function apiUrl(path: string): string {
    const baseUrl = normalizeBaseUrl(settings.backend.url) || normalizeBaseUrl(configuredBaseUrl)
    if (!baseUrl) return path
    return `${baseUrl}/${path.replace(/^\/+/, '')}`
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(apiUrl(path), init)
}
