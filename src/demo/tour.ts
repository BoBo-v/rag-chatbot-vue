import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'

const TOUR_STORAGE_KEY = 'ai_chat_feature_tour_v1'

export function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === 'completed'
  } catch {
    return false
  }
}

export function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, 'completed')
  } catch {
    // Ignore storage errors
  }
}

let activeDriver: Driver | null = null

export function startFeatureTour(force = false): void {
  if (!force && isTourCompleted()) {
    return
  }

  if (activeDriver) {
    activeDriver.destroy()
    activeDriver = null
  }

  activeDriver = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成体验',
    onDestroyStarted: () => {
      markTourCompleted()
      activeDriver?.destroy()
      activeDriver = null
    },
    steps: [
      {
        element: '[data-tour="rail-nav"]',
        popover: {
          title: '🛠️ 四大核心工作区',
          description: '系统整合了工单辅助决策、排障 Agent 自动化执行、多模型并发对比、以及本地知识库切片与检索评测。',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="topbar-model"]',
        popover: {
          title: '⚡ 连接与模型切换',
          description: '支持浏览器直连（本地 Ollama / OpenAI / Claude）或后端代理模式，点击可快速查看就绪状态或一键切换。',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-tour="demo-card"]',
        popover: {
          title: '✨ 零配置演示沙盒',
          description: '新用户首推入口！无需配置任何 API Key 或本地模型，即可体验完整的知识库切片检索、两段式分析与草稿采纳闭环。',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '[data-tour="empty-suggestions"]',
        popover: {
          title: '📋 常见报障用例预设',
          description: '内置预构建失败、偶发白屏拒答、本地代理 404 等常见工程化案例，点击可一键将报障内容填入输入框。',
          side: 'top',
          align: 'center',
        },
      },
    ],
  })

  activeDriver.drive()
}

export function destroyTour(): void {
  if (activeDriver) {
    activeDriver.destroy()
    activeDriver = null
  }
}
