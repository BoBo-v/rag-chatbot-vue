export interface PlaybackOptions {
  minChunkSize?: number
  maxChunkSize?: number
  intervalMs?: number
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
   * 逐字/逐块流式推演文本
   */
  public async streamText(
    text: string,
    sequence: number,
    onChunk: (accumulated: string) => void,
    options: PlaybackOptions = {}
  ): Promise<boolean> {
    const minChunk = options.minChunkSize ?? 1
    const maxChunk = options.maxChunkSize ?? 3
    const interval = options.intervalMs ?? 20

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

      await new Promise<void>((resolve) => {
        this.currentTimer = setTimeout(() => {
          this.currentTimer = null
          resolve()
        }, interval)
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
