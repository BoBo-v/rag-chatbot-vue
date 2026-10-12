import { settings } from '../stores/settings'
import { useAuthStore } from '../stores/auth'

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

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers || {})
    if (!headers.has('X-Requested-With')) {
        headers.set('X-Requested-With', 'XMLHttpRequest')
    }

    const mergedInit: RequestInit = {
        ...init,
        credentials: 'include',
        headers,
    }

    const response = await fetch(apiUrl(path), mergedInit)

    // 401 统一拦截防抖：排除登录接口本身与探活静默接口
    if (response.status === 401) {
        const cleanPath = path.split('?')[0]
        if (cleanPath !== '/api/auth/login' && cleanPath !== '/api/auth/me') {
            const authStore = useAuthStore()
            authStore.isAuthenticated.value = false
            authStore.user.value = null
            if (!authStore.isAuthModalVisible.value) {
                authStore.openLoginModal()
            }
        }
    }

    return response
}
