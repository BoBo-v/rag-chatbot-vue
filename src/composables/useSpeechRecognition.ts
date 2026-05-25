import { ref } from 'vue'

// 浏览器语音识别 API 不是标准化程度很高的 API，不同浏览器名字不同。
// Chrome 系浏览器通常暴露 webkitSpeechRecognition。
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

// 把浏览器语音识别封装成 Vue composable，页面只需要关心“是否正在听”和 start/stop。
export function useSpeechRecognition() {
    const isListening = ref(false)
    const isSupported = !!SpeechRecognition

    let recognition: any = null

    function start(onResult: (text: string) => void, onError?: (msg: string) => void) {
        if (!isSupported) {
            onError?.('当前浏览器不支持语音识别，请使用 Chrome')
            return
        }
        if (isListening.value) {
            stop()
            return
        }

        recognition = new SpeechRecognition()
        // 中文识别；interimResults 允许实时拿到尚未最终确认的临时文本。
        recognition.lang = 'zh-CN'
        recognition.interimResults = true
        recognition.continuous = true

        let finalTranscript = ''

        recognition.onresult = (e: any) => {
            let interim = ''
            // finalTranscript 保存已经确认的文字；interim 保存当前这轮临时识别结果。
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const transcript = e.results[i][0].transcript
                if (e.results[i].isFinal) {
                    finalTranscript += transcript
                } else {
                    interim += transcript
                }
            }
            onResult(finalTranscript + interim)
        }

        recognition.onstart = () => {
            isListening.value = true
            finalTranscript = ''
        }

        recognition.onend = () => {
            isListening.value = false
            recognition = null
        }

        recognition.onerror = (e: any) => {
            isListening.value = false
            recognition = null
            if (e.error === 'not-allowed') {
                onError?.('麦克风权限被拒绝，请在浏览器设置中允许')
            } else if (e.error === 'no-speech') {
                // 没有检测到语音，静默处理
            } else if (e.error !== 'aborted') {
                onError?.(`语音识别错误: ${e.error}`)
            }
        }

        recognition.start()
    }

    function stop() {
        if (recognition) {
            recognition.stop()
        }
    }

    return {
        isListening,
        isSupported,
        start,
        stop,
    }
}
