import { parse, serialize, defaultTreeAdapter as adapter } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

export interface WebPreviewDocumentOptions {
  allowScripts: boolean
  previewId?: string
  injectConsoleBridge?: boolean
}

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']
type ParentNode = DefaultTreeAdapterMap['parentNode']

/**
 * 递归移除 DOM 树中用户自带的任何 CSP、refresh 重定向或其它危险 <meta> 标签，防止策略被抢占或自动跳转逃逸
 */
function stripDisallowedMetaTags(node: Node): void {
  const children = [...(adapter.getChildNodes(node as ParentNode) || [])]
  for (const child of children) {
    if (adapter.isElementNode(child)) {
      if (adapter.getTagName(child).toLowerCase() === 'meta') {
        const attrs = adapter.getAttrList(child)
        const isDisallowed = attrs.some((a) => {
          if (a.name.toLowerCase() !== 'http-equiv') return false
          const val = a.value.trim().toLowerCase()
          return val === 'content-security-policy' || val === 'refresh' || val === 'set-cookie'
        })
        if (isDisallowed) {
          adapter.detachNode(child)
          continue
        }
      }
      stripDisallowedMetaTags(child)
    }
  }
}

/**
 * 移除 head 中已有的所有 charset 或 content-type meta 标签，避免多重声明或编码冲突
 */
function stripExistingCharsetMetaTags(headElement: Element): void {
  const children = [...(adapter.getChildNodes(headElement) || [])]
  for (const child of children) {
    if (adapter.isElementNode(child) && adapter.getTagName(child).toLowerCase() === 'meta') {
      const attrs = adapter.getAttrList(child)
      const isCharset = attrs.some((a) => a.name.toLowerCase() === 'charset')
      const isHttpEquivContentType = attrs.some(
        (a) =>
          a.name.toLowerCase() === 'http-equiv' &&
          a.value.trim().toLowerCase() === 'content-type'
      )
      if (isCharset || isHttpEquivContentType) {
        adapter.detachNode(child)
      }
    }
  }
}

/**
 * 遍历并处理超链接 <a> 标签：
 * - 允许页内锚点跳转（以 # 开头的链接，如 href="#section"）
 * - 拦截并阻止所有外部导航（如 http://, https://, //）和危险伪协议（javascript:, data: 等）
 * - 移除非法链接的 target 属性，避免在新窗口或顶层弹出不受控页面
 */
function sanitizeAnchors(node: Node): void {
  const children = [...(adapter.getChildNodes(node as ParentNode) || [])]
  for (const child of children) {
    if (adapter.isElementNode(child)) {
      if (adapter.getTagName(child).toLowerCase() === 'a') {
        const attrs = adapter.getAttrList(child)
        const hrefAttr = attrs.find((a) => a.name.toLowerCase() === 'href')
        if (hrefAttr) {
          const val = hrefAttr.value.trim()
          if (!val.startsWith('#')) {
            // 移除非页内锚点跳转，阻止外部导航
            const targetIdx = attrs.findIndex((a) => a.name.toLowerCase() === 'target')
            if (targetIdx !== -1) {
              attrs.splice(targetIdx, 1)
            }
            hrefAttr.value = '#blocked'
            attrs.push({ name: 'data-blocked-url', value: val })
            attrs.push({ name: 'title', value: `已拦截外部跳转: ${val}` })
          }
        }
      }
      sanitizeAnchors(child)
    }
  }
}

/**
 * 在静态无脚本模式下，清理所有内联事件处理器属性（如 onclick, onload, onerror），
 * 确保即使在缺少 CSP 限制的环境下，也绝不触发任何内联 JavaScript 执行。
 */
function stripInlineEventHandlers(node: Node): void {
  const children = [...(adapter.getChildNodes(node as ParentNode) || [])]
  for (const child of children) {
    if (adapter.isElementNode(child)) {
      const attrs = adapter.getAttrList(child)
      for (let i = attrs.length - 1; i >= 0; i--) {
        if (/^on[a-z]+/i.test(attrs[i].name)) {
          attrs.splice(i, 1)
        }
      }
      stripInlineEventHandlers(child)
    }
  }
}

/**
 * 生成控制台日志拦截脚本，将 iframe 沙箱内的输出安全桥接到父页面
 */
function createConsoleBridgeScript(previewId: string): string {
  const safePid = JSON.stringify(previewId)
  return `(function() {
  var pid = ${safePid};
  function post(level, args) {
    try {
      var arr = [];
      for (var i = 0; i < args.length; i++) {
        var a = args[i];
        arr.push(typeof a === 'object' ? JSON.stringify(a) : String(a));
      }
      window.parent.postMessage({ type: 'SANDBOX_CONSOLE', previewId: pid, level: level, text: arr.join(' ') }, '*');
    } catch(e) {}
  }
  var oldLog = console.log, oldWarn = console.warn, oldErr = console.error;
  console.log = function() { post('info', arguments); if (oldLog) oldLog.apply(console, arguments); };
  console.warn = function() { post('warn', arguments); if (oldWarn) oldWarn.apply(console, arguments); };
  console.error = function() { post('error', arguments); if (oldErr) oldErr.apply(console, arguments); };
})();`
}

/**
 * 生成导航防护脚本：禁止 window.open 弹窗逃逸，并在交互运行模式下拦截外部跳转，仅允许页内锚点跳转
 */
function createNavigationGuardScript(): string {
  return `(function() {
  try {
    window.open = function() { console.warn('沙箱环境已拦截 window.open 调用'); return null; };
    document.addEventListener('click', function(e) {
      var target = e.target;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }
      if (target && target.tagName === 'A') {
        var href = target.getAttribute('href') || '';
        if (!href.startsWith('#')) {
          e.preventDefault();
          e.stopPropagation();
          console.warn('沙箱环境已拦截外部链接跳转: ' + href);
        }
      }
    }, true);
  } catch(e) {}
})();`
}

/**
 * 基于 parse5 AST 构建具备强隔离安全策略的独立预览文档
 * - 避免正则或字符串替换对 JS/CSS 字符串字面量中 HTML 标签的误删
 * - 强制注入严格的 CSP（完全封堵外部网络请求，图片严格限制于 data: 与 blob:）
 * - 强制将 <meta charset="UTF-8"> 与严格 CSP 置于 <head> 最前列，绝对优先于所有不可信用户标签与脚本
 * - 剥离 refresh meta 自动重定向，并对超链接执行页内锚点白名单限制
 */
export function buildWebPreviewDocument(
  userCode: string,
  options: WebPreviewDocumentOptions
): string {
  const rawCode = userCode || ''
  const document = parse(rawCode)

  // 1. 递归移除所有用户自行注入的 CSP、refresh 等危险 meta 标签
  stripDisallowedMetaTags(document)

  // 2. 遍历并处理超链接，阻止非页内锚点跳转
  sanitizeAnchors(document)

  // 3. 在静态无脚本模式下，清理所有内联事件监听器
  if (!options.allowScripts) {
    stripInlineEventHandlers(document)
  }

  // 4. 确保标准文档模式 (DOCTYPE)
  const hasDoctype = document.childNodes.some(
    (n) => adapter.isDocumentTypeNode(n) || n.nodeName === '#documentType'
  )
  if (!hasDoctype) {
    const doctypeNode: DefaultTreeAdapterMap['childNode'] = {
      nodeName: '#documentType',
      name: 'html',
      publicId: '',
      systemId: '',
      parentNode: null,
    }
    const firstDocChild = adapter.getFirstChild(document)
    if (firstDocChild) {
      adapter.insertBefore(document, doctypeNode, firstDocChild)
    } else {
      adapter.appendChild(document, doctypeNode)
    }
  }

  // 5. 查找或创建 <html> 与 <head>
  const htmlElement = document.childNodes.find(
    (n): n is Element => adapter.isElementNode(n) && adapter.getTagName(n).toLowerCase() === 'html'
  )

  if (!htmlElement) {
    return serialize(document)
  }

  let headElement = adapter.getChildNodes(htmlElement).find(
    (n): n is Element => adapter.isElementNode(n) && adapter.getTagName(n).toLowerCase() === 'head'
  )

  if (!headElement) {
    headElement = adapter.createElement('head', htmlElement.namespaceURI, [])
    const firstHtmlChild = adapter.getFirstChild(htmlElement)
    if (firstHtmlChild) {
      adapter.insertBefore(htmlElement, headElement, firstHtmlChild)
    } else {
      adapter.appendChild(htmlElement, headElement)
    }
  }

  // 6. 清理用户已存在的冲突或旧 charset/content-type meta 标签
  stripExistingCharsetMetaTags(headElement)

  // 7. 严格限制的 CSP：封堵任何外部请求与图片信标外发（img-src 严格限定于 data: 与 blob:，base-uri 限定 none）
  const scriptPolicy = options.allowScripts ? "script-src 'unsafe-inline';" : "script-src 'none';"
  const cspContent = `default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; font-src data:; style-src 'unsafe-inline'; ${scriptPolicy} img-src data: blob:; media-src data: blob:;`

  const canonicalCharsetMeta = adapter.createElement('meta', htmlElement.namespaceURI, [
    { name: 'charset', value: 'UTF-8' },
  ])

  const cspMeta = adapter.createElement('meta', htmlElement.namespaceURI, [
    { name: 'http-equiv', value: 'Content-Security-Policy' },
    { name: 'content', value: cspContent },
  ])

  let bridgeElement: Element | null = null
  if (options.allowScripts && options.injectConsoleBridge && options.previewId) {
    const bridgeScript = createConsoleBridgeScript(options.previewId)
    bridgeElement = adapter.createElement('script', htmlElement.namespaceURI, [])
    adapter.appendChild(bridgeElement, adapter.createTextNode(bridgeScript))
  }

  let guardElement: Element | null = null
  if (options.allowScripts) {
    const guardScript = createNavigationGuardScript()
    guardElement = adapter.createElement('script', htmlElement.namespaceURI, [])
    adapter.appendChild(guardElement, adapter.createTextNode(guardScript))
  }

  // 8. 强制前置：安全节点必须严格排在 <head> 最前列，用户所有外部资源、脚本、样式及其他标签排在安全节点之后
  const originalFirstChild = adapter.getFirstChild(headElement)
  if (originalFirstChild) {
    adapter.insertBefore(headElement, canonicalCharsetMeta, originalFirstChild)
    adapter.insertBefore(headElement, cspMeta, originalFirstChild)
    if (bridgeElement) {
      adapter.insertBefore(headElement, bridgeElement, originalFirstChild)
    }
    if (guardElement) {
      adapter.insertBefore(headElement, guardElement, originalFirstChild)
    }
  } else {
    adapter.appendChild(headElement, canonicalCharsetMeta)
    adapter.appendChild(headElement, cspMeta)
    if (bridgeElement) {
      adapter.appendChild(headElement, bridgeElement)
    }
    if (guardElement) {
      adapter.appendChild(headElement, guardElement)
    }
  }

  return serialize(document)
}
