export interface PlaybackOptions {
  minChunkSize?: number
  maxChunkSize?: number
  intervalMs?: number
  /**
   * 是否启用标点符号自然停顿（拟真打字节奏）
   * 当 intervalMs >= 10 且未显式关闭时默认启用
   */
  punctuationPauses?: boolean
}

/**
 * 可取消、基于 RAF/定时器的高可靠流式播放调度器
 */
export class DemoPlaybackController {
  private activeSequence = 0
  private currentRafId: number | null = null
  private currentTimer: ReturnType<typeof setTimeout> | null = null
  private isPaused = false
  private pausedResumeCallback: (() => void) | null = null

  /**
   * 生成新的有效运行序列号，同时废弃所有历史异步帧与定时器
   */
  public nextSequence(): number {
    this.cancel()
    return this.activeSequence
  }

  public get currentSequence(): number {
    return this.activeSequence
  }

  /**
   * 立即作废当前所有动画帧与延迟任务
   */
  public cancel(): void {
    this.activeSequence += 1
    this.isPaused = false
    this.pausedResumeCallback = null

    if (this.currentRafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.currentRafId)
      }
      this.currentRafId = null
    }

    if (this.currentTimer !== null) {
      clearTimeout(this.currentTimer)
      this.currentTimer = null
    }
  }

  /**
   * 模拟延迟（如检索知识库过程）
   */
  public delay(ms: number, sequence: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (sequence !== this.activeSequence) {
        resolve(false)
        return
      }

      this.currentTimer = setTimeout(() => {
        this.currentTimer = null
        if (sequence === this.activeSequence && !this.isPaused) {
          resolve(true)
        } else {
          resolve(false)
        }
      }, ms)
    })
  }

  /**
   * 逐字/逐块流式推演文本，模拟真实大模型 Token 吐字节奏与标点停顿
   */
  public async streamText(
    text: string,
    sequence: number,
    onChunk: (accumulated: string) => void,
    options: PlaybackOptions = {}
  ): Promise<boolean> {
    const minChunk = options.minChunkSize ?? 1
    const maxChunk = options.maxChunkSize ?? 3
    const interval = options.intervalMs ?? 16
    const enablePunctuation = options.punctuationPauses ?? (interval >= 10)

    let cursor = 0
    const total = text.length

    while (cursor < total) {
      if (sequence !== this.activeSequence) {
        return false
      }

      if (this.isPaused) {
        await new Promise<void>((resolve) => {
          this.pausedResumeCallback = resolve
        })
        if (sequence !== this.activeSequence) {
          return false
        }
      }

      // 动态步长模拟真实 LLM Token 吐字感
      const step = Math.min(
        total - cursor,
        Math.floor(Math.random() * (maxChunk - minChunk + 1)) + minChunk
      )
      cursor += step
      onChunk(text.slice(0, cursor))

      if (cursor >= total) {
        break
      }

      // 计算当前吐字延迟：根据标点符号与格式呈现真实打字停顿
      let delay = interval
      if (enablePunctuation) {
        const lastChar = text[cursor - 1]
        const nextChar = text[cursor]
        const prevTwo = cursor >= 2 ? text.slice(cursor - 2, cursor) : ''

        // 句末标点或双换行（段落分隔）：停顿 ~70-100ms
        if (
          prevTwo === '\n\n' ||
          lastChar === '。' ||
          lastChar === '！' ||
          lastChar === '？' ||
          lastChar === '!' ||
          lastChar === '?'
        ) {
          delay = Math.max(interval, 75 + Math.floor(Math.random() * 25))
        }
        // 逗号、顿号、分号、冒号：停顿 ~38-58ms
        else if (
          lastChar === '，' ||
          lastChar === '、' ||
          lastChar === '；' ||
          lastChar === ';' ||
          lastChar === ',' ||
          (lastChar === '：' && nextChar !== '\n') ||
          (lastChar === ':' && nextChar === ' ')
        ) {
          delay = Math.max(interval, 40 + Math.floor(Math.random() * 18))
        }
        // 单换行：停顿 ~45-65ms
        else if (lastChar === '\n') {
          delay = Math.max(interval, 46 + Math.floor(Math.random() * 20))
        }
        // 常规字符：自然微抖动（±3ms）
        else {
          delay = Math.max(8, interval + Math.floor(Math.random() * 6) - 2)
        }
      }

      await new Promise<void>((resolve) => {
        this.currentTimer = setTimeout(() => {
          this.currentTimer = null
          resolve()
        }, delay)
      })
    }

    return sequence === this.activeSequence
  }

  public pause(): void {
    this.isPaused = true
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false
      if (this.pausedResumeCallback) {
        const cb = this.pausedResumeCallback
        this.pausedResumeCallback = null
        cb()
      }
    }
  }
}
