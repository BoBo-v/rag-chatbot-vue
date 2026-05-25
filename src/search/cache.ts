export class LruCache<K, V> {
    private readonly values = new Map<K, V>()
    private readonly maxSize: number

    constructor(maxSize = 100) {
        this.maxSize = maxSize
    }

    get(key: K): V | undefined {
        const value = this.values.get(key)
        if (value === undefined) return undefined

        // LRU 的关键：读过的 key 变成“最新使用”，所以先删再插到 Map 末尾。
        this.values.delete(key)
        this.values.set(key, value)
        return value
    }

    set(key: K, value: V): void {
        if (this.values.has(key)) {
            this.values.delete(key)
        } else if (this.values.size >= this.maxSize) {
            // Map 的第一个 key 就是最久没有使用的 key。
            const oldest = this.values.keys().next().value as K | undefined
            if (oldest !== undefined) this.values.delete(oldest)
        }

        this.values.set(key, value)
    }

    clear(): void {
        this.values.clear()
    }
}
