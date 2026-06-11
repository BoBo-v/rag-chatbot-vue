import katex from 'katex'
import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'

function isEscaped(src: string, pos: number): boolean {
    let backslashes = 0
    for (let i = pos - 1; i >= 0 && src[i] === '\\'; i--) {
        backslashes++
    }
    return backslashes % 2 === 1
}

function findClosingDelimiter(src: string, start: number, delimiter: '$' | '$$'): number {
    let pos = start
    while (pos < src.length) {
        const found = src.indexOf(delimiter, pos)
        if (found === -1) return -1
        if (!isEscaped(src, found)) return found
        pos = found + delimiter.length
    }
    return -1
}

function renderMath(content: string, displayMode: boolean): string {
    try {
        return katex.renderToString(content, {
            displayMode,
            throwOnError: false,
            strict: false,
            trust: false,
            output: 'html',
        })
    } catch {
        return content
    }
}

function inlineMath(state: StateInline, silent: boolean): boolean {
    if (state.src[state.pos] !== '$') return false
    if (isEscaped(state.src, state.pos)) return false

    const isDisplay = state.src[state.pos + 1] === '$'
    const delimiter = isDisplay ? '$$' : '$'
    const close = findClosingDelimiter(state.src, state.pos + delimiter.length, delimiter)
    if (close === -1) return false

    const content = state.src.slice(state.pos + delimiter.length, close).trim()
    if (!content) return false

    if (!silent) {
        const token = state.push(isDisplay ? 'math_display_inline' : 'math_inline', 'math', 0)
        token.content = content
        token.markup = delimiter
    }
    state.pos = close + delimiter.length
    return true
}

function blockMath(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
): boolean {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]
    const line = state.src.slice(start, max)

    if (!line.startsWith('$$')) return false
    if (silent) return true

    const firstLineContent = line.slice(2)
    const lines: string[] = []
    let nextLine = startLine + 1

    const sameLineClose = findClosingDelimiter(firstLineContent, 0, '$$')
    if (sameLineClose >= 0) {
        lines.push(firstLineContent.slice(0, sameLineClose))
    } else {
        if (firstLineContent.trim()) lines.push(firstLineContent)
        for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
            const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
            const lineEnd = state.eMarks[nextLine]
            const currentLine = state.src.slice(lineStart, lineEnd)
            const close = findClosingDelimiter(currentLine, 0, '$$')
            if (close >= 0) {
                lines.push(currentLine.slice(0, close))
                nextLine++
                break
            }
            lines.push(currentLine)
        }
    }

    const token = state.push('math_block', 'math', 0)
    token.block = true
    token.content = lines.join('\n').trim()
    token.markup = '$$'
    token.map = [startLine, nextLine]

    state.line = nextLine
    return true
}

export function mathPlugin(md: MarkdownIt): void {
    md.inline.ruler.before('escape', 'math_inline', inlineMath)
    md.block.ruler.before('fence', 'math_block', blockMath, {
        alt: ['paragraph', 'reference', 'blockquote', 'list'],
    })

    md.renderer.rules.math_inline = (tokens, idx) =>
        renderMath(tokens[idx].content, false)
    md.renderer.rules.math_display_inline = (tokens, idx) =>
        `<span class="math-inline-display">${renderMath(tokens[idx].content, true)}</span>`
    md.renderer.rules.math_block = (tokens, idx) =>
        `<div class="math-block">${renderMath(tokens[idx].content, true)}</div>\n`
}
