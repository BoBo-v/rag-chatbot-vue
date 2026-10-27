import { driver, type Driver, type DriveStep } from 'driver.js'
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

function getResponsiveTourSteps(): DriveStep[] {
  if (typeof window === 'undefined') return []

  const isMobile = window.innerWidth <= 767
  const isSmallPhone = window.innerWidth <= 480

  const steps: DriveStep[] = []

  // 1. 核心工作区导航
  if (isMobile) {
    steps.push({
      element: '[data-tour="mobile-nav"]',
      popover: {
        title: '🛠️ 四大核心工作区',
        description: '系统整合了工单辅助决策、排障 Agent、模型对比与知识库评测。在底部栏可快速自由切换。',
        side: 'top',
        align: 'center',
      },
    })
  } else {
    steps.push({
      element: '[data-tour="rail-nav"]',
      popover: {
        title: '🛠️ 四大核心工作区',
        description: '系统整合了工单辅助决策、排障 Agent 自动化执行、多模型并发对比、以及本地知识库切片与检索评测。',
        side: 'right',
        align: 'start',
      },
    })
  }

  // 2. 连接与模型切换
  if (isSmallPhone) {
    steps.push({
      element: '[data-tour="mobile-settings"]',
      popover: {
        title: '⚙️ 模型连接与配置',
        description: '可在此配置本地 Ollama 或填写在线模型 Key，并在浏览器直连与后端代理模式间灵活切换。',
        side: 'top',
        align: 'end',
      },
    })
  } else {
    steps.push({
      element: '[data-tour="topbar-model"]',
      popover: {
        title: '⚡ 连接与模型切换',
        description: '支持浏览器直连（本地 Ollama / OpenAI / Claude）或后端代理模式，点击可快速查看就绪状态或一键切换。',
        side: 'bottom',
        align: 'start',
      },
    })
  }

  // 3. 零配置演示沙盒（PC 与移动端一致）
  steps.push({
    element: '[data-tour="demo-card"]',
    popover: {
      title: '✨ 零配置演示沙盒',
      description: '新用户首推入口！无需配置任何 API Key 或本地模型，即可体验完整的知识库切片检索、两段式分析与草稿采纳闭环。',
      side: 'bottom',
      align: 'center',
    },
  })

  // 4. 常见报障用例预设（PC 与移动端一致）
  steps.push({
    element: '[data-tour="empty-suggestions"]',
    popover: {
      title: '📋 常见报障用例预设',
      description: '内置预构建失败、偶发白屏拒答、本地代理 404 等常见工程化案例，点击可一键将报障内容填入输入框。',
      side: 'top',
      align: 'center',
    },
  })

  // 动态过滤：剔除所有在当前 DOM 中缺失或未显示 (offsetParent === null) 的步骤，防止异常渲染
  return steps.filter((step) => {
    if (typeof step.element === 'string') {
      const el = document.querySelector(step.element) as HTMLElement | null
      return !!el && el.offsetParent !== null
    }
    return true
  })
}

export function startFeatureTour(force = false): void {
  if (!force && isTourCompleted()) {
    return
  }

  // 检查目标节点是否存在且可见（若用户已进入演示沙盒或切走则不启动导览，避免遮罩错位）
  if (typeof document !== 'undefined') {
    const demoCard = document.querySelector('[data-tour="demo-card"]') as HTMLElement | null
    if (!demoCard || demoCard.offsetParent === null) {
      return
    }
  }

  const steps = getResponsiveTourSteps()
  if (steps.length === 0) {
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
    steps,
  })

  activeDriver.drive()
}

export function destroyTour(): void {
  if (activeDriver) {
    activeDriver.destroy()
    activeDriver = null
  }
}

// ── 开发与调试辅助（暴露全局对象，方便控制台随时调用） ─────────────────
if (typeof window !== 'undefined') {
  ;(window as any).__demo = {
    ...((window as any).__demo || {}),
    startTour: () => startFeatureTour(true),
    resetTour: () => {
      localStorage.removeItem(TOUR_STORAGE_KEY)
      localStorage.removeItem('ai_chat_checklist_dismissed')
      console.log('✅ [Demo] 引导与新手清单状态已重置，刷新页面即可模拟新用户重新触发导览！')
    },
  }
}
