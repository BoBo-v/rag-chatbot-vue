import { ref } from 'vue'
import type { FileAttachment, ImageAttachment } from '../types/chat'
import type { ToastType } from './useToast'

type ToastLike = {
    show: (message: string, type?: ToastType, duration?: number) => void
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

const TEXT_EXTENSIONS = [
    '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.toml',
    '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
    '.py', '.go', '.rs', '.java', '.kt', '.c', '.cpp', '.h', '.hpp', '.cs',
    '.rb', '.php', '.swift', '.sh', '.bash', '.zsh', '.bat', '.ps1',
    '.html', '.css', '.scss', '.less', '.sass',
    '.sql', '.graphql', '.proto',
    '.env', '.ini', '.conf', '.cfg', '.log',
]

const MAX_FILE_SIZE = 5 * 1024 * 1024

export function useAttachments(toast: ToastLike) {
    const pendingImages = ref<ImageAttachment[]>([])
    const pendingFiles = ref<FileAttachment[]>([])

    function addImages(files: File[]) {
        for (const file of files) {
            if (!IMAGE_TYPES.includes(file.type as ImageAttachment['mediaType'])) {
                toast.show(`不支持的图片格式: ${file.name}`, 'warning')
                continue
            }
            if (file.size > MAX_IMAGE_SIZE) {
                toast.show(`图片过大(>10MB): ${file.name}`, 'warning')
                continue
            }
            const reader = new FileReader()
            reader.onload = () => {
                const exists = pendingImages.value.some(img => img.name === file.name)
                if (exists) return
                const dataUrl = reader.result as string
                const base64 = dataUrl.split(',')[1]
                pendingImages.value.push({
                    base64,
                    mediaType: file.type as ImageAttachment['mediaType'],
                    name: file.name,
                })
            }
            reader.readAsDataURL(file)
        }
    }

    function removeImage(index: number) {
        pendingImages.value.splice(index, 1)
    }

    function addFiles(files: File[]) {
        for (const file of files) {
            const ext = '.' + file.name.split('.').pop()?.toLowerCase()
            if (!TEXT_EXTENSIONS.includes(ext)) {
                toast.show(`不支持的文件类型: ${file.name}，仅支持文本/代码文件`, 'warning')
                continue
            }
            if (file.size > MAX_FILE_SIZE) {
                toast.show(`文件过大(>5MB): ${file.name}`, 'warning')
                continue
            }
            if (pendingFiles.value.some(item => item.name === file.name && item.size === file.size)) {
                continue
            }
            const reader = new FileReader()
            reader.onload = () => {
                pendingFiles.value.push({
                    name: file.name,
                    content: reader.result as string,
                    size: file.size,
                })
            }
            reader.readAsText(file)
        }
    }

    function removeFile(index: number) {
        pendingFiles.value.splice(index, 1)
    }

    function clearAttachments() {
        pendingImages.value = []
        pendingFiles.value = []
    }

    return {
        pendingImages,
        pendingFiles,
        addImages,
        removeImage,
        addFiles,
        removeFile,
        clearAttachments,
    }
}
