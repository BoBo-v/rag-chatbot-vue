<template>
  <Teleport to="body">
    <div v-if="isPreviewOpen" class="preview-overlay" @click.self="closePreview">
      <div class="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <!-- 顶部操作栏 -->
        <header class="preview-header">
          <div class="preview-info">
            <span class="preview-badge" :class="{ interactive: allowScripts }">
              <ShieldCheck :size="15" aria-hidden="true" />
              <span>{{ allowScripts ? '受限沙箱交互 (隔离宿主凭据 · 限制外联)' : '默认安全静态预览 (禁止脚本 · 限制外联)' }}</span>
            </span>
            <span id="preview-title" class="preview-title">{{ previewTitle }}</span>
          </div>

          <!-- 视口宽度切换 -->
          <div class="viewport-controls" role="group" aria-label="视口切换">
            <button
              type="button"
              class="viewport-btn"
              :class="{ active: viewport === 'desktop' }"
              title="桌面端全宽"
              @click="viewport = 'desktop'"
            >
              <Monitor :size="16" aria-hidden="true" />
              <span>桌面</span>
            </button>
            <button
              type="button"
              class="viewport-btn"
              :class="{ active: viewport === 'tablet' }"
              title="平板端 (768px)"
              @click="viewport = 'tablet'"
            >
              <Tablet :size="16" aria-hidden="true" />
              <span>平板</span>
            </button>
            <button
              type="button"
              class="viewport-btn"
              :class="{ active: viewport === 'mobile' }"
              title="移动端 (375px)"
              @click="viewport = 'mobile'"
            >
              <Smartphone :size="16" aria-hidden="true" />
              <span>手机</span>
            </button>
          </div>

          <!-- 功能操作 -->
          <div class="preview-actions">
            <!-- 脚本运行开关 -->
            <button
              type="button"
              class="action-btn toggle-script-btn"
              :class="{ active: allowScripts }"
              :title="allowScripts ? '切换为静态无脚本模式' : '允许沙箱执行 JavaScript'"
              @click="toggleScripts"
            >
              <Play v-if="!allowScripts" :size="15" aria-hidden="true" />
              <Square v-else :size="15" aria-hidden="true" />
              <span>{{ allowScripts ? '停用脚本' : '运行交互' }}</span>
            </button>

            <!-- 刷新 -->
            <button
              type="button"
              class="action-btn icon-only"
              title="重新加载"
              aria-label="重新加载预览"
              @click="reloadFrame"
            >
              <RotateCw :size="16" aria-hidden="true" />
            </button>

            <!-- 复制源码 -->
            <button
              type="button"
              class="action-btn icon-only"
              title="复制代码"
              aria-label="复制代码"
              @click="copySourceCode"
            >
              <Check v-if="copied" :size="16" aria-hidden="true" />
              <Copy v-else :size="16" aria-hidden="true" />
            </button>

            <!-- 在安全新标签页打开 -->
            <button
              type="button"
              class="action-btn"
              title="在安全独立沙箱新标签页打开"
              @click="openInNewTab"
            >
              <ExternalLink :size="15" aria-hidden="true" />
              <span>新标签页</span>
            </button>

            <!-- 关闭 -->
            <button
              type="button"
              class="action-btn icon-only close-btn"
              title="关闭预览"
              aria-label="关闭预览"
              @click="closePreview"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>
        </header>

        <!-- 预览展示视口容器 -->
        <main class="preview-stage">
          <div class="iframe-container" :class="`viewport-${viewport}`">
            <!-- 严格沙箱限制：绝不配置 allow-same-origin 与 allow-modals -->
            <iframe
              ref="frameRef"
              :key="frameKey"
              class="preview-iframe"
              :sandbox="allowScripts ? 'allow-scripts' : ''"
              :srcdoc="compiledHtml"
              title="网页代码实时预览沙箱"
            ></iframe>
          </div>
        </main>

        <!-- 控制台输出栏（支持折叠展开） -->
        <footer v-if="allowScripts" class="preview-console">
          <div class="console-header" @click="consoleOpen = !consoleOpen">
            <div class="console-title">
              <Terminal :size="14" aria-hidden="true" />
              <span>沙箱控制台输出</span>
              <span class="console-count">({{ consoleLogs.length }})</span>
            </div>
            <div class="console-actions">
              <button
                v-if="consoleLogs.length > 0"
                type="button"
                class="console-clear-btn"
                @click.stop="consoleLogs = []"
              >
                清空
              </button>
              <ChevronUp v-if="!consoleOpen" :size="14" aria-hidden="true" />
              <ChevronDown v-else :size="14" aria-hidden="true" />
            </div>
          </div>
          <div v-show="consoleOpen" class="console-body">
            <div v-if="consoleLogs.length === 0" class="console-empty">
              控制台暂无日志输出。
            </div>
            <div
              v-for="(log, idx) in consoleLogs"
              :key="idx"
              class="console-line"
              :class="`log-${log.level}`"
            >
              <span class="log-tag">[{{ log.level }}]</span>
              <span class="log-text">{{ log.text }}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Monitor,
  Tablet,
  Smartphone,
  ShieldCheck,
  RotateCw,
  ExternalLink,
  Copy,
  Check,
  X,
  Play,
  Square,
  Terminal,
  ChevronUp,
  ChevronDown,
} from 'lucide-vue-next'
import { useWebPreview } from '../composables/useWebPreview'
import { buildWebPreviewDocument } from '../utils/webPreviewDocument'

const { isPreviewOpen, previewCode, previewTitle, closePreview } = useWebPreview()

type ViewportMode = 'desktop' | 'tablet' | 'mobile'
const viewport = ref<ViewportMode>('desktop')
const allowScripts = ref(false)
const copied = ref(false)
const consoleOpen = ref(false)
const frameRef = ref<HTMLIFrameElement | null>(null)
const frameKey = ref(0)
const previewId = ref(`preview-${Math.random().toString(36).slice(2, 10)}`)

interface ConsoleLog {
  level: 'info' | 'warn' | 'error'
  text: string
}
const consoleLogs = ref<ConsoleLog[]>([])

const compiledHtml = computed(() => {
  return buildWebPreviewDocument(previewCode.value || '', {
    allowScripts: allowScripts.value,
    previewId: previewId.value,
    injectConsoleBridge: true,
  })
})

function reloadFrame() {
  previewId.value = `preview-${Math.random().toString(36).slice(2, 10)}`
  consoleLogs.value = []
  frameKey.value++
}

function toggleScripts() {
  allowScripts.value = !allowScripts.value
  reloadFrame()
}

function copySourceCode() {
  if (!previewCode.value) return
  navigator.clipboard.writeText(previewCode.value).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}

function openInNewTab() {
  try {
    const token = 'prev_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    const payload = {
      code: previewCode.value || '',
      allowScripts: allowScripts.value,
      timestamp: Date.now(),
    }
    localStorage.setItem(token, JSON.stringify(payload))

    const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
    const targetUrl = `${baseUrl}/preview-isolated.html#token=${encodeURIComponent(token)}`
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  } catch (err) {
    console.error('新标签页打开失败', err)
  }
}

// 接收来自沙箱的控制台事件（严格校验来源窗口、标识与数据类型）
function handleMessage(event: MessageEvent) {
  if (!frameRef.value || event.source !== frameRef.value.contentWindow) return
  const data = event.data
  if (data?.type === 'SANDBOX_CONSOLE' && data?.previewId === previewId.value) {
    consoleLogs.value.push({
      level: data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'info',
      text: String(data.text || ''),
    })
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage)
})

// 当预览打开或代码变化时重置状态
watch(isPreviewOpen, (isOpen) => {
  if (isOpen) {
    allowScripts.value = false
    consoleLogs.value = []
    reloadFrame()
  }
})
</script>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background-color: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.preview-modal {
  background: var(--bg-surface, #1e1c29);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
  border-radius: 16px;
  width: 100%;
  max-width: 1200px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.preview-header {
  height: 52px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.preview-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.preview-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
  white-space: nowrap;
}

.preview-badge.interactive {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #ffffff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewport-controls {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  padding: 3px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.viewport-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.viewport-btn:hover {
  color: var(--text-primary, #ffffff);
}

.viewport-btn.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary, #ffffff);
  font-weight: 500;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #ffffff);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.action-btn.icon-only {
  width: 32px;
  padding: 0;
  justify-content: center;
}

.action-btn.toggle-script-btn.active {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.action-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.preview-stage {
  flex: 1;
  background: #0f172a;
  display: flex;
  justify-content: center;
  overflow: hidden;
  padding: 16px;
}

.iframe-container {
  height: 100%;
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.iframe-container.viewport-desktop {
  width: 100%;
}

.iframe-container.viewport-tablet {
  width: 768px;
}

.iframe-container.viewport-mobile {
  width: 375px;
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #ffffff;
}

.preview-console {
  border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  background: #090d16;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.console-header {
  height: 32px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  user-select: none;
}

.console-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.console-count {
  font-size: 11px;
  color: #64748b;
}

.console-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
}

.console-clear-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 11px;
  cursor: pointer;
}

.console-clear-btn:hover {
  color: #cbd5e1;
}

.console-body {
  max-height: 140px;
  overflow-y: auto;
  padding: 8px 14px;
  font-size: 12px;
  line-height: 1.6;
}

.console-empty {
  color: #475569;
  font-size: 12px;
  font-style: italic;
}

.console-line {
  display: flex;
  gap: 8px;
  word-break: break-all;
}

.console-line.log-info { color: #e2e8f0; }
.console-line.log-warn { color: #f59e0b; }
.console-line.log-error { color: #ef4444; }

.log-tag {
  color: #64748b;
  font-size: 11px;
}
</style>
