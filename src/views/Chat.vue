<template>
  <div class="">
    <div class="chat" ref="containerRef">
      <div v-for="msg in messages" :key="msg.id">
        {{ msg.role }}: {{ msg.content }}
      </div>
      <div v-if="unreadCount > 0" class="unread" @click="scrollToBottom" >
        ⬇ 有新消息{{unreadCount}}
      </div>
    </div>
    <div class="input-wrapper">
      <input :disabled="isStreaming" type="text" v-model="inputValue" placeholder="请输入...">
    </div>
    <button :disabled="isStreaming" @click="handleSend">发送测试</button>

  </div>
</template>
<script setup lang="ts">
import { ref ,nextTick,onMounted, onUnmounted } from 'vue'
import { useChat } from '../stores/chat'
import {generateStream} from '../services/ollama'

const { messages,
  addMessage,
  createAssistantMessage,
  appendToMessage,
    finishMessage
} = useChat()
let inputValue = ref<string>('')
let userAtBottom = true//是否在底部
const isStreaming = ref<boolean>(false)
const containerRef = ref<HTMLDivElement | null>(null)

/**
 * 新消息提示
 * */
const unreadCount = ref(0)
//点击回到底部
async function scrollToBottom() {
  await nextTick()

  const el = containerRef.value
  if (!el) return

  el.scrollTop = el.scrollHeight

  unreadCount.value = 0
  userAtBottom = true
}
/**
 * 处理发送消息的逻辑
 * 添加用户消息并调用 AI 生成流式响应，实时更新助手消息内容
 */
async function handleSend() {
  if(!inputValue.value)return 0
  isStreaming.value = true
  addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    content: inputValue.value,
    status: 'done'
  })

  //ai占位消息
  const aiMsg = createAssistantMessage()
  try{ //用try处理如果网络错误会导致后续逻辑永远不会执行
    //流式输出返回数据
    await generateStream(inputValue.value,async (chunk)=>{
      appendToMessage(aiMsg.id, chunk)
      //根据内容长度判断是否滚动
      //if(shouldScroll(aiMsg.content)) scheduleScroll()
      //appendToMessage自己处理是否有内容
      if (!userAtBottom) {
        unreadCount.value++
      }
      scheduleScroll()
    }, () => {
      finishMessage(aiMsg.id)
    })
  }finally {
    //赋值后清空
    isStreaming.value = false
    inputValue.value=""
  }
}

/**
* 处理滚动
* */
function handleScroll() {
  const atBottom = isAtBottom()
  userAtBottom = atBottom

  if (atBottom) {
    unreadCount.value = 0
  }
}
function isAtBottom() {
  const el = containerRef.value
  if (!el) return false

  return el.scrollHeight - el.scrollTop - el.clientHeight < 20
}
onMounted(() => {
  containerRef.value?.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('scroll', handleScroll)
})

let isScrolling = false
/**
 * 调度滚动到底部，防止在滚动过程中重复触发
 * 使用 requestAnimationFrame 确保在下一帧渲染时执行滚动
 */
function scheduleScroll() {
  if (!userAtBottom) return
  if (isScrolling) return

  isScrolling = true

  requestAnimationFrame(async () => {
    await nextTick()

    const el = containerRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }

    isScrolling = false
  })
}
</script>
<style scoped>
.chat {
  /*height: 100vh;*/
  height:600px;
  overflow-y: auto;
  /* 3. 让滚动平滑一点 (这会让你的 scheduleScroll 看起来更顺滑) */
  scroll-behavior: smooth;
  width: 100vh;
  position: relative;
}
.unread {
  position: absolute;
  bottom: 40px;
  right: 45%;
  background-color: #ffdd00;
  color: white;
  padding: 5px;
  border-radius: 5px;
}
</style>