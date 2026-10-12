import { reactive, toRefs } from 'vue'
import { apiFetch } from '../services/api'

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
}

const state = reactive<AuthState>({
    isAuthenticated: false,
    user: null,
    mustChangePassword: false,
    isChecking: false,
    isAuthModalVisible: false,
    isChangePasswordModalVisible: false,
})

export function useAuthStore() {
    async function checkAuth(): Promise<boolean> {
        state.isChecking = true
        try {
            const res = await apiFetch('/api/auth/me')
            if (res.ok) {
                const data = await res.json()
                state.isAuthenticated = true
                state.user = data.user
                const mustChange = Boolean(data.user?.mustChangePassword ?? data.mustChangePassword)
                state.mustChangePassword = mustChange
                if (mustChange) {
                    state.isChangePasswordModalVisible = true
                }
                return true
            } else {
                state.isAuthenticated = false
                state.user = null
                state.mustChangePassword = false
                state.isChangePasswordModalVisible = false
                return false
            }
        } catch {
            state.isAuthenticated = false
            state.user = null
            state.mustChangePassword = false
            state.isChangePasswordModalVisible = false
            return false
        } finally {
            state.isChecking = false
        }
    }

    async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
        try {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            })

            const data = await res.json().catch(() => ({}))
            if (res.ok) {
                state.isAuthenticated = true
                state.user = data.user
                state.isAuthModalVisible = false
                const mustChange = Boolean(data.user?.mustChangePassword ?? data.mustChangePassword)
                state.mustChangePassword = mustChange
                if (mustChange) {
                    state.isChangePasswordModalVisible = true
                }
                return { ok: true }
            } else {
                return { ok: false, error: data.error || '登录失败，请检查用户名或密码。' }
            }
        } catch {
            return { ok: false, error: '网络请求异常，无法连接后端服务。' }
        }
    }

    async function changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
        try {
            const res = await apiFetch('/api/auth/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword }),
            })

            const data = await res.json().catch(() => ({}))
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
        try {
            const res = await apiFetch('/api/auth/logout', { method: 'POST' })
            if (res.ok) {
                state.isAuthenticated = false
                state.user = null
                state.mustChangePassword = false
                state.isAuthModalVisible = false
                state.isChangePasswordModalVisible = false
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
        state.isAuthModalVisible = true
    }

    function closeLoginModal(): void {
        state.isAuthModalVisible = false
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
        openLoginModal,
        closeLoginModal,
        openChangePasswordModal,
        closeChangePasswordModal,
    }
}
