const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'you', 'your',
    '的', '了', '是', '我', '你', '他', '她', '它', '这个', '那个', '可以',
])

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
