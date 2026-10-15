import { settings } from '../stores/settings'
import { useAuthStore } from '../stores/auth'

const env = (import.meta as { env?: Record<string, any> }).env
const configuredBaseUrl = (env?.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''

function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, '')
    return trimmed.replace(/\/api$/i, '')
}

function resolveBrowserOrigin(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin
    }
    return ''
}

export function resolveTargetBaseUrl(baseUrlOverride?: string): string {
    const raw = baseUrlOverride !== undefined ? baseUrlOverride : settings.backend.url
    return normalizeBaseUrl(raw) || normalizeBaseUrl(configuredBaseUrl) || normalizeBaseUrl(resolveBrowserOrigin())
}

export function apiUrl(path: string, baseUrlOverride?: string): string {
    const baseUrl = resolveTargetBaseUrl(baseUrlOverride)
    if (!baseUrl) return path
    return `${baseUrl}/${path.replace(/^\/+/, '')}`
}

export interface ApiFetchOptions {
    baseUrl?: string
    skipAuthInterception?: boolean
}

export async function apiFetch(path: string, init?: RequestInit, options?: ApiFetchOptions): Promise<Response> {
    const headers = new Headers(init?.headers || {})
    if (!headers.has('X-Requested-With')) {
        headers.set('X-Requested-With', 'XMLHttpRequest')
    }

    const mergedInit: RequestInit = {
        ...init,
        credentials: 'include',
        headers,
    }

    const authStore = useAuthStore()
    const targetBaseUrl = resolveTargetBaseUrl(options?.baseUrl)
    const sessionVersionAtStart = authStore.sessionVersion.value

    const response = await fetch(apiUrl(path, options?.baseUrl), mergedInit)

    if (!options?.skipAuthInterception) {
        // 401 统一拦截防抖：排除登录接口本身、探活静默接口以及 Agent 密钥鉴权（Agent 独立弹窗录入）
        if (response.status === 401) {
            const cleanPath = path.split('?')[0]
            if (
                cleanPath !== '/api/auth/login'
                && cleanPath !== '/api/auth/me'
                && !cleanPath.startsWith('/api/agent')
            ) {
                const currentActiveBaseUrl = resolveTargetBaseUrl(undefined)
                if (targetBaseUrl === currentActiveBaseUrl && authStore.sessionVersion.value === sessionVersionAtStart) {
                    let isAgentUnauthorized = false
                    try {
                        const cloned = response.clone()
                        const data = await cloned.json().catch(() => null)
                        if (data?.code === 'AGENT_UNAUTHORIZED') {
                            isAgentUnauthorized = true
                        }
                    } catch {
                        // ignore
                    }

                    if (!isAgentUnauthorized) {
                        authStore.invalidateSession()
                        if (!authStore.isAuthModalVisible.value) {
                            authStore.openLoginModal()
                        }
                    }
                }
            }
        }

        // 403 强制首次改密全局拦截：使用 response.clone() 防止消费原始 body
        if (response.status === 403) {
            try {
                const cloned = response.clone()
                const data = await cloned.json().catch(() => null)
                if (data?.code === 'PASSWORD_CHANGE_REQUIRED') {
                    const authStore = useAuthStore()
                    authStore.mustChangePassword.value = true
                    authStore.openChangePasswordModal()
                }
            } catch {
                // 忽略非 JSON 响应解析失败
            }
        }
    }

    return response
}
