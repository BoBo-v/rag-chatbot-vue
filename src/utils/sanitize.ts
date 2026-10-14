import DOMPurify from 'dompurify'

// 纯度量样式白名单属性（KaTeX HTML 布局必需）
const ALLOWED_KATEX_STYLE_PROPERTIES = new Set([
  'height',
  'width',
  'min-width',
  'max-width',
  'vertical-align',
  'top',
  'bottom',
  'left',
  'right',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'border-width',
  'border-top-width',
  'border-bottom-width',
  'border-left-width',
  'border-right-width',
])

// KaTeX 公式安全颜色属性
const ALLOWED_KATEX_COLOR_PROPERTIES = new Set([
  'color',
  'border-color',
  'background-color',
])

// 纯度量数值正则：严格限制为数值 + 单位（px, em, ex, %, rem, pt），绝不允许 url/expression/calc/quotes
const SAFE_DIMENSION_VALUE_REGEX = /^[-+]?[0-9]*\.?[0-9]+(px|em|ex|%|rem|pt)?$/i

// 安全颜色正则：支持十六进制(#rgb/#rrggbb/#rrggbbaa)、rgb/rgba/hsl/hsla 以及标准英文字名，杜绝 url/expression/javascript
const SAFE_COLOR_REGEX = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+\s*)?\)|hsla?\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i

function sanitizeInlineStyle(element: any): void {
  const rawStyle = element.getAttribute?.('style')
  if (!rawStyle) return

  // 严格策略：仅当元素本身具有 katex 相关类名或位于 .katex 容器内时，才允许保留度量布局样式与公式颜色
  const classList = element.classList
  const hasKatexClass = classList && (
    classList.contains('katex') ||
    classList.contains('strut') ||
    classList.contains('vlist') ||
    classList.contains('svg-align') ||
    classList.contains('pstrut') ||
    classList.contains('hide-tail')
  )
  const isInsideKatex = typeof element.closest === 'function' ? Boolean(element.closest('.katex')) : false
  const isKatexNode = hasKatexClass || isInsideKatex

  if (!isKatexNode) {
    element.removeAttribute('style')
    return
  }

  // 拆分与过滤样式声明
  const declarations = rawStyle.split(';')
  const safeDeclarations: string[] = []

  for (const decl of declarations) {
    const trimmed = decl.trim()
    if (!trimmed) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const prop = trimmed.slice(0, colonIndex).trim().toLowerCase()
    const val = trimmed.slice(colonIndex + 1).trim()

    if (ALLOWED_KATEX_STYLE_PROPERTIES.has(prop)) {
      const tokens = val.split(/\s+/).filter(Boolean)
      const allTokensSafe = tokens.length > 0 && tokens.every((token: string) => SAFE_DIMENSION_VALUE_REGEX.test(token))
      if (allTokensSafe) {
        safeDeclarations.push(`${prop}:${tokens.join(' ')}`)
      }
    } else if (ALLOWED_KATEX_COLOR_PROPERTIES.has(prop)) {
      if (SAFE_COLOR_REGEX.test(val)) {
        safeDeclarations.push(`${prop}:${val}`)
      }
    }
  }

  if (safeDeclarations.length > 0) {
    element.setAttribute('style', safeDeclarations.join(';'))
  } else {
    element.removeAttribute('style')
  }
}

function setupPurifyHooks(purify: any): void {
  if (!purify?.addHook) return

  purify.addHook('afterSanitizeAttributes', (node: any) => {
    if (!node || typeof node !== 'object' || node.nodeType !== 1) return

    // 0. 防伪造：清除用户输入中假冒的代码块包装与控制按钮 class，确保只有渲染器在净化后注入的结构生效
    const forgedClasses = [
      'code-block-wrapper',
      'code-block-header',
      'code-block-actions',
      'code-action-btn',
      'code-copy-btn',
      'code-wrap-btn',
      'code-preview-btn',
    ]
    if (node.classList) {
      for (const cls of forgedClasses) {
        if (node.classList.contains(cls)) {
          node.classList.remove(cls)
        }
      }
      if (node.classList.length === 0 && node.hasAttribute('class')) {
        node.removeAttribute('class')
      }
    }

    // 1. 链接标签加固：强制外部安全链接并校验安全协议
    if (node.tagName && node.tagName.toLowerCase() === 'a') {
      const href = node.getAttribute('href') || ''
      if (/^\s*(javascript|data|vbscript):/i.test(href)) {
        node.removeAttribute('href')
      } else {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }

    // 2. 表单元素控制：仅保留禁用的复选框（Markdown 任务列表），移除其他输入框
    if (node.tagName && node.tagName.toLowerCase() === 'input') {
      if (node.getAttribute('type') === 'checkbox') {
        node.setAttribute('disabled', 'true')
      } else {
        node.parentElement?.removeChild(node)
        return
      }
    }

    // 3. 严格样式过滤（拦截普通标签 style，仅放行 KaTeX 度量属性与公式颜色）
    sanitizeInlineStyle(node)
  })
}

// 基于 WeakMap 管理 DOMPurify 实例缓存，支持多窗口隔离与连续调用复用
const purifyInstanceCache = new WeakMap<object, any>()

function getPurifyInstance(): any {
  let targetWindow: any = null
  if (typeof window !== 'undefined') {
    targetWindow = window
  } else if (typeof globalThis !== 'undefined' && (globalThis as any).window) {
    targetWindow = (globalThis as any).window
  }

  if (!targetWindow || typeof targetWindow !== 'object') {
    return null
  }

  const cached = purifyInstanceCache.get(targetWindow)
  if (cached) {
    return cached
  }

  const purify = typeof DOMPurify === 'function' ? (DOMPurify as any)(targetWindow) : DOMPurify
  if (purify) {
    setupPurifyHooks(purify)
    purifyInstanceCache.set(targetWindow, purify)
  }
  return purify
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ''
  const purify = getPurifyInstance()
  if (!purify) {
    return escapeHtml(dirty)
  }

  return purify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'del', 's', 'sub', 'sup', 'mark',
      'blockquote', 'code', 'pre',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img', 'span', 'div',
      'input',
      // KaTeX 所需 SVG 与矢量子标签
      'svg', 'path', 'line',
    ],
    ALLOWED_ATTR: [
      'class', 'id', 'title', 'alt', 'src', 'href',
      'type', 'checked', 'disabled',
      'aria-hidden', 'aria-label', 'role',
      // SVG 属性（包含 \cancel{x} 所需的 x1/y1/x2/y2）
      'viewBox', 'preserveAspectRatio', 'd', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'xmlns',
      'x1', 'y1', 'x2', 'y2',
      'style', // 允许 style 属性进入 Hook，由 Hook 执行严格的安全度量与公式颜色过滤
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
  })
}
