const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'you', 'your',
    '的', '了', '是', '我', '你', '他', '她', '它', '这个', '那个', '可以',
])

// 把一段文本切成可搜索的词。
// 英文按空格和标点切分；中文没有天然空格，所以用二字滑窗做简单分词。
export function tokenize(text: string): string[] {
    const normalized = text
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()

    if (!normalized) return []

    const terms: string[] = []
    for (const token of normalized.split(/\s+/)) {
        if (token.length <= 1 || STOP_WORDS.has(token)) continue

        if (/[\u4e00-\u9fff]/u.test(token)) {
            // 例如“搜索功能”会切成“搜索”“索功”“功能”，这样用户搜其中一段也能命中。
            terms.push(...tokenizeChinese(token))
            continue
        }

        terms.push(token)
    }

    return terms
}

function tokenizeChinese(token: string): string[] {
    if (token.length <= 2) return STOP_WORDS.has(token) ? [] : [token]

    const terms: string[] = []
    for (let i = 0; i < token.length - 1; i++) {
        const term = token.slice(i, i + 2)
        if (!STOP_WORDS.has(term)) terms.push(term)
    }
    return terms
}

export function countTerms(terms: string[]): Map<string, { tf: number; positions: number[] }> {
    // tf 是词频，positions 记录词出现的位置，后续可以用于更精细的排序和摘要。
    const counts = new Map<string, { tf: number; positions: number[] }>()
    terms.forEach((term, position) => {
        const stat = counts.get(term)
        if (stat) {
            stat.tf += 1
            stat.positions.push(position)
        } else {
            counts.set(term, { tf: 1, positions: [position] })
        }
    })
    return counts
}
