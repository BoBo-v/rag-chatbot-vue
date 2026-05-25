import { ref } from 'vue'

// Toast 是右上角/页面上的短暂提示，比如错误、成功、警告。
export type ToastType = 'error' | 'success' | 'warning'

export interface ToastItem {
    id: number
    type: ToastType
    message: string
}

const toasts = ref<ToastItem[]>([])
let nextId = 0

export function useToast() {
    // 新增一条 toast，并在 duration 毫秒后自动关闭。
    function show(message: string, type: ToastType = 'error', duration = 4000) {
        const id = nextId++
        toasts.value.push({ id, type, message })
        setTimeout(() => dismiss(id), duration)
    }

    // 用户点击 toast 或自动过期时，根据 id 从列表里移除。
    function dismiss(id: number) {
        const idx = toasts.value.findIndex(t => t.id === id)
        if (idx !== -1) toasts.value.splice(idx, 1)
    }

    return { toasts, show, dismiss }
}
