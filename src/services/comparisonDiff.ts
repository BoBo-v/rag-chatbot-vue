export type DiffLineType = 'same' | 'added' | 'removed'

export interface DiffLine {
    type: DiffLineType
    leftLineNumber?: number
    rightLineNumber?: number
    left?: string
    right?: string
}

function splitLines(value: string): string[] {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

export function createLineDiff(left: string, right: string): DiffLine[] {
    const leftLines = splitLines(left)
    const rightLines = splitLines(right)
    const rows = leftLines.length + 1
    const cols = rightLines.length + 1
    const lcs = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

    for (let i = leftLines.length - 1; i >= 0; i--) {
        for (let j = rightLines.length - 1; j >= 0; j--) {
            lcs[i][j] = leftLines[i] === rightLines[j]
                ? lcs[i + 1][j + 1] + 1
                : Math.max(lcs[i + 1][j], lcs[i][j + 1])
        }
    }

    const diff: DiffLine[] = []
    let i = 0
    let j = 0

    while (i < leftLines.length && j < rightLines.length) {
        if (leftLines[i] === rightLines[j]) {
            diff.push({
                type: 'same',
                leftLineNumber: i + 1,
                rightLineNumber: j + 1,
                left: leftLines[i],
                right: rightLines[j],
            })
            i++
            j++
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            diff.push({
                type: 'removed',
                leftLineNumber: i + 1,
                left: leftLines[i],
            })
            i++
        } else {
            diff.push({
                type: 'added',
                rightLineNumber: j + 1,
                right: rightLines[j],
            })
            j++
        }
    }

    while (i < leftLines.length) {
        diff.push({
            type: 'removed',
            leftLineNumber: i + 1,
            left: leftLines[i],
        })
        i++
    }

    while (j < rightLines.length) {
        diff.push({
            type: 'added',
            rightLineNumber: j + 1,
            right: rightLines[j],
        })
        j++
    }

    return diff
}
