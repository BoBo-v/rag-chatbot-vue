import { ref } from 'vue'

const isPreviewOpen = ref(false)
const previewCode = ref('')
const previewTitle = ref('网页实时预览')

export function useWebPreview() {
    function openPreview(code: string, title = '网页实时预览') {
        previewCode.value = code
        previewTitle.value = title
        isPreviewOpen.value = true
    }

    function closePreview() {
        isPreviewOpen.value = false
    }

    return {
        isPreviewOpen,
        previewCode,
        previewTitle,
        openPreview,
        closePreview,
    }
}
