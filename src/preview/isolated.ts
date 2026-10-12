import { buildWebPreviewDocument } from '../utils/webPreviewDocument'

let rawCode = ''
let allowScripts = false

export function renderCode(code: string, scriptsEnabled: boolean): void {
  rawCode = code
  allowScripts = scriptsEnabled
  const iframe = document.getElementById('sandbox-frame') as HTMLIFrameElement | null
  const toggleBtn = document.getElementById('toggle-script-btn') as HTMLButtonElement | null

  if (!iframe) return

  if (scriptsEnabled) {
    iframe.setAttribute('sandbox', 'allow-scripts')
    if (toggleBtn) {
      toggleBtn.textContent = '交互脚本: 已启用'
      toggleBtn.classList.add('active-toggle')
    }
  } else {
    iframe.setAttribute('sandbox', '')
    if (toggleBtn) {
      toggleBtn.textContent = '交互脚本: 已关闭'
      toggleBtn.classList.remove('active-toggle')
    }
  }

  iframe.srcdoc = buildWebPreviewDocument(code, {
    allowScripts: scriptsEnabled,
    injectConsoleBridge: false,
  })
}

export function toggleScripts(): void {
  renderCode(rawCode, !allowScripts)
}

export function reloadPreview(): void {
  if (rawCode) {
    renderCode(rawCode, allowScripts)
  }
}

function initIsolatedPreview(): void {
  const toggleBtn = document.getElementById('toggle-script-btn')
  const reloadBtn = document.getElementById('reload-btn')
  const closeBtn = document.getElementById('close-btn')

  toggleBtn?.addEventListener('click', toggleScripts)
  reloadBtn?.addEventListener('click', reloadPreview)
  closeBtn?.addEventListener('click', () => window.close())

  try {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const token = hashParams.get('token')
    let payload: { code?: string; allowScripts?: boolean } | null = null

    if (token) {
      const stored = localStorage.getItem(token)
      if (stored) {
        try {
          payload = JSON.parse(stored)
        } catch {
          // ignore parse error
        }
        // 阅后即焚：消费后立即销毁
        localStorage.removeItem(token)
      }
    }

    // 清理超过 10 分钟未被消费的陈旧预览标记
    const now = Date.now()
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('prev_')) {
        try {
          const item = JSON.parse(localStorage.getItem(key) || '{}')
          if (item.timestamp && now - item.timestamp > 600_000) {
            localStorage.removeItem(key)
          }
        } catch {
          // ignore
        }
      }
    }

    if (payload && typeof payload.code === 'string') {
      renderCode(payload.code, payload.allowScripts === true)
    } else {
      renderCode(
        '<div style="font-family:sans-serif;padding:24px;color:#64748b;">未检测到有效的一次性预览源码凭证，请返回主页面重新点击“新标签页打开”。</div>',
        false
      )
    }
  } catch (err) {
    console.error('无法读取预览代码', err)
    renderCode(
      '<div style="font-family:sans-serif;padding:24px;color:#ef4444;">预览数据读取失败。</div>',
      false
    )
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIsolatedPreview)
} else {
  initIsolatedPreview()
}
