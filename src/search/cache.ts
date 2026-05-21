export class LruCache<K, V> {
    private readonly values = new Map<K, V>()
    private readonly maxSize: number

    constructor(maxSize = 100) {
        this.maxSize = maxSize
    }

    get(key: K): V | undefined {
        const value = this.values.get(key)
        if (value === undefined) return undefined

        this.values.delete(key)
        this.values.set(key, value)
        return value
    }

    set(key: K, value: V): void {
        if (this.values.has(key)) {
            this.values.delete(key)
        } else if (this.values.size >= this.maxSize) {
            const oldest = this.values.keys().next().value as K | undefined
            if (oldest !== undefined) this.values.delete(oldest)
        }

        this.values.set(key, value)
    }

    clear(): void {
        this.values.clear()
    }
}
