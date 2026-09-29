const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''

export function apiUrl(path: string): string {
    const baseUrl = configuredBaseUrl.replace(/\/+$/, '')
    if (!baseUrl) return path
    return `${baseUrl}/${path.replace(/^\/+/, '')}`
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(apiUrl(path), init)
}
