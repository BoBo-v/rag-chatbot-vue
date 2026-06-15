import { ref } from 'vue'

interface ConfirmOptions {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
}

interface ConfirmState extends Required<ConfirmOptions> {
    open: boolean
}

const state = ref<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    danger: false,
})

let resolver: ((value: boolean) => void) | null = null

function close(value: boolean) {
    state.value.open = false
    resolver?.(value)
    resolver = null
}

export function useConfirm() {
    function confirm(options: ConfirmOptions): Promise<boolean> {
        if (resolver) close(false)

        state.value = {
            open: true,
            title: options.title,
            message: options.message,
            confirmText: options.confirmText ?? '确认',
            cancelText: options.cancelText ?? '取消',
            danger: options.danger ?? false,
        }

        return new Promise(resolve => {
            resolver = resolve
        })
    }

    return {
        confirm,
        confirmState: state,
        resolveConfirm: close,
    }
}
