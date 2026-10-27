import { reactive, toRefs } from 'vue'
import { apiFetch, resolveTargetBaseUrl, isAuthScopeValid } from '../services/api'
import { resetBackendProvidersCatalog } from '../services/knowledge'

export interface AuthUser {
    username: string
    mustChangePassword?: boolean
}

interface AuthState {
    isAuthenticated: boolean
    user: AuthUser | null
    mustChangePassword: boolean
    isChecking: boolean
    isAuthModalVisible: boolean
    isChangePasswordModalVisible: boolean
    sessionVersion: number
    isLoginModalSuppressed: boolean
}

const state = reactive<AuthState>({
    isAuthenticated: false,
    user: null,
    mustChangePassword: false,
    isChecking: false,
    isAuthModalVisible: false,
    isChangePasswordModalVisible: false,
    sessionVersion: 1,
    isLoginModalSuppressed: false,
})

let activeProbeSeq = 0
let activeMutationSeq = 0

export function useAuthStore() {
    function beginMutation() {
        const targetBaseUrl = resolveTargetBaseUrl(undefined)
        const sessionVersionAtStart = state.sessionVersion
        const mutationSeq = ++activeMutationSeq
        // An older identity probe must not commit while a login/logout is pending.
        activeProbeSeq++
        state.isChecking = false
        return {
            targetBaseUrl,
            isCurrent: () => mutationSeq === activeMutationSeq
                && isAuthScopeValid(targetBaseUrl, sessionVersionAtStart),
        }
    }

    function invalidateSession(): void {
        activeMutationSeq++
        activeProbeSeq++
        state.isChecking = false
        const wasAuthenticated = state.isAuthenticated || state.user !== null
        state.isAuthenticated = false
        state.user = null
        state.mustChangePassword = false
        state.isChangePasswordModalVisible = false
        if (wasAuthenticated) {
            state.sessionVersion++
            resetBackendProvidersCatalog()
        }
    }

    async function checkAuth(): Promise<boolean> {
        const targetBaseUrl = resolveTargetBaseUrl(undefined)
        const sessionVersionAtStart = state.sessionVersion
        const probeSeq = ++activeProbeSeq

        state.isChecking = true
        try {
            const res = await apiFetch('/api/auth/me', undefined, {
                baseUrl: targetBaseUrl,
                skipAuthInterception: true,
            })
            if (res.ok) {
                const data = await res.json()
                if (!isAuthScopeValid(targetBaseUrl, sessionVersionAtStart) || probeSeq !== activeProbeSeq) {
                    return state.isAuthenticated
                }

                const newUser = data.user
                const wasAuthenticated = state.isAuthenticated
                const oldUsername = state.user?.username
                const identityChanged = !wasAuthenticated || (newUser && newUser.username !== oldUsername)
                if (identityChanged) {
                    state.sessionVersion++
                }
                state.isAuthenticated = true
                state.user = newUser
                const mustChange = Boolean(data.user?.mustChangePassword ?? data.mustChangePassword)
                state.mustChangePassword = mustChange
                if (mustChange) {
                    state.isChangePasswordModalVisible = true
                }
                return true
            } else {
                if (isAuthScopeValid(targetBaseUrl, sessionVersionAtStart) && probeSeq === activeProbeSeq) {
                    invalidateSession()
                    return false
                }
                return state.isAuthenticated
            }
        } catch {
            if (isAuthScopeValid(targetBaseUrl, sessionVersionAtStart) && probeSeq === activeProbeSeq) {
                invalidateSession()
                return false
            }
            return state.isAuthenticated
        } finally {
            if (probeSeq === activeProbeSeq) {
                state.isChecking = false
            }
        }
    }

    async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
        const mutation = beginMutation()
        try {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            }, { baseUrl: mutation.targetBaseUrl })

            const data = await res.json().catch(() => ({}))
            if (!mutation.isCurrent()) return { ok: false, error: '登录请求已过期，请重新登录。' }
            if (res.ok) {
                activeProbeSeq++
                state.isChecking = false
                state.sessionVersion++
                resetBackendProvidersCatalog()
                state.isAuthenticated = true
                state.user = data.user
                state.isAuthModalVisible = false
                const mustChange = Boolean(data.user?.mustChangePassword ?? data.mustChangePassword)
                state.mustChangePassword = mustChange
                state.isChangePasswordModalVisible = mustChange
                return { ok: true }
            } else {
                return { ok: false, error: data.error || '登录失败，请检查用户名或密码。' }
            }
        } catch {
            return { ok: false, error: '网络请求异常，无法连接后端服务。' }
        }
    }

    async function changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
        const mutation = beginMutation()
        try {
            const res = await apiFetch('/api/auth/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword }),
            }, { baseUrl: mutation.targetBaseUrl })

            const data = await res.json().catch(() => ({}))
            if (!mutation.isCurrent()) return { ok: false, error: '修改密码请求已过期，请重试。' }
            if (res.ok) {
                state.mustChangePassword = false
                state.isChangePasswordModalVisible = false
                if (state.user) {
                    state.user.mustChangePassword = false
                }
                return { ok: true }
            } else {
                return { ok: false, error: data.error || '修改密码失败，请核对输入。' }
            }
        } catch {
            return { ok: false, error: '网络异常，修改密码请求未送达后端。' }
        }
    }

    async function logout(): Promise<{ ok: boolean; error?: string }> {
        const mutation = beginMutation()
        try {
            const res = await apiFetch('/api/auth/logout', { method: 'POST' }, { baseUrl: mutation.targetBaseUrl })
            if (res.ok) {
                if (!mutation.isCurrent()) return { ok: false, error: '退出请求已过期，当前会话保持不变。' }
                invalidateSession()
                state.isAuthModalVisible = false
                return { ok: true }
            } else {
                const data = await res.json().catch(() => ({}))
                const err = data.error || '退出登录失败，服务端未能成功撤销会话。'
                return { ok: false, error: err }
            }
        } catch {
            return { ok: false, error: '网络异常，退出登录失败，会话仍有效。' }
        }
    }

    function openLoginModal(): void {
        if (state.isLoginModalSuppressed) return
        state.isAuthModalVisible = true
    }

    function closeLoginModal(): void {
        state.isAuthModalVisible = false
    }

    function setLoginModalSuppressed(suppressed: boolean): void {
        state.isLoginModalSuppressed = suppressed
        if (suppressed) {
            state.isAuthModalVisible = false
        }
    }

    function openChangePasswordModal(): void {
        state.isChangePasswordModalVisible = true
    }

    function closeChangePasswordModal(): void {
        if (state.mustChangePassword) return
        state.isChangePasswordModalVisible = false
    }

    return {
        ...toRefs(state),
        checkAuth,
        login,
        logout,
        changePassword,
        invalidateSession,
        openLoginModal,
        closeLoginModal,
        setLoginModalSuppressed,
        openChangePasswordModal,
        closeChangePasswordModal,
    }
}
