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

// 纯度量数值正则：严格限制为数值 + 单位（px, em, ex, %, rem, pt），绝不允许 url/expression/calc/quotes
const SAFE_DIMENSION_VALUE_REGEX = /^[-+]?[0-9]*\.?[0-9]+(px|em|ex|%|rem|pt)?$/i

function sanitizeInlineStyle(element: Element): void {
  const rawStyle = element.getAttribute('style')
  if (!rawStyle) return

  // 严格策略：仅当元素本身具有 katex 相关类名或位于 .katex 容器内时，才允许保留度量布局样式
  const isKatexNode = element.classList.contains('katex') ||
    element.classList.contains('strut') ||
    element.classList.contains('vlist') ||
    element.classList.contains('svg-align') ||
    element.classList.contains('pstrut') ||
    element.classList.contains('hide-tail') ||
    Boolean(element.closest('.katex'))

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
      const allTokensSafe = tokens.length > 0 && tokens.every(token => SAFE_DIMENSION_VALUE_REGEX.test(token))
      if (allTokensSafe) {
        safeDeclarations.push(`${prop}:${tokens.join(' ')}`)
      }
    }
  }

  if (safeDeclarations.length > 0) {
    element.setAttribute('style', safeDeclarations.join(';'))
  } else {
    element.removeAttribute('style')
  }
}

let isHookRegistered = false

function ensurePurifyHooks(purify: typeof DOMPurify) {
  if (isHookRegistered) return
  isHookRegistered = true

  purify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return

    // 1. 链接标签加固：强制外部安全链接并校验安全协议
    if (node.tagName.toLowerCase() === 'a') {
      const href = node.getAttribute('href') || ''
      if (/^\s*(javascript|data|vbscript):/i.test(href)) {
        node.removeAttribute('href')
      } else {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }

    // 2. 表单元素控制：仅保留禁用的复选框（Markdown 任务列表），移除其他输入框
    if (node.tagName.toLowerCase() === 'input') {
      if (node.getAttribute('type') === 'checkbox') {
        node.setAttribute('disabled', 'true')
      } else {
        node.parentElement?.removeChild(node)
        return
      }
    }

    // 3. 严格样式过滤（拦截普通标签 style，仅放行 KaTeX 度量属性）
    sanitizeInlineStyle(node)
  })

  purify.addHook('afterSanitizeElements', (node) => {
    if (!(node instanceof Element)) return

    // 4. 防伪造控件绑定：仅当代码块外层包裹器结构合法且完整时，赋予 trusted 标记
    if (node.classList.contains('code-block-wrapper')) {
      const hasHeader = Boolean(node.querySelector('.code-block-header .code-block-actions'))
      const hasCode = Boolean(node.querySelector('pre.hljs code'))
      if (hasHeader && hasCode) {
        node.setAttribute('data-engine', 'trusted-code-block')
      } else {
        node.removeAttribute('data-engine')
      }
    }
  })
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ''
  ensurePurifyHooks(DOMPurify)

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'del', 's', 'sub', 'sup', 'mark',
      'blockquote', 'code', 'pre',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img', 'span', 'div',
      'button', 'input',
      // KaTeX 所需 SVG 与矢量子标签
      'svg', 'path', 'line',
    ],
    ALLOWED_ATTR: [
      'class', 'id', 'title', 'alt', 'src', 'href',
      'type', 'checked', 'disabled',
      'aria-hidden', 'aria-label', 'role',
      // SVG 属性
      'viewBox', 'preserveAspectRatio', 'd', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'xmlns',
      'style', // 允许 style 属性进入 Hook，由 Hook 执行严格的安全度量过滤
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
  })
}
