import { ref } from 'vue'

export type ToastType = 'error' | 'success' | 'warning'

export interface ToastItem {
    id: number
    type: ToastType
    message: string
}

const toasts = ref<ToastItem[]>([])
let nextId = 0

export function useToast() {
    function show(message: string, type: ToastType = 'error', duration = 4000) {
        const id = nextId++
        toasts.value.push({ id, type, message })
        setTimeout(() => dismiss(id), duration)
    }

    function dismiss(id: number) {
        const idx = toasts.value.findIndex(t => t.id === id)
        if (idx !== -1) toasts.value.splice(idx, 1)
    }

    return { toasts, show, dismiss }
}
