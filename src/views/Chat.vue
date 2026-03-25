<template>
  <div class="">
    <div class="chat" ref="containerRef">
      <div v-for="msg in messages" :key="msg.id">
        {{ msg.role }}: {{ msg.content }}
      </div>
    </div>
    <div class="input-wrapper">
      <input :disabled="isStreaming" type="text" v-model="inputValue" placeholder="请输入...">
    </div>
    <button :disabled="isStreaming" @click="handleSend">发送测试</button>

  </div>
</template>
<script setup lang="ts">
import { ref ,nextTick } from 'vue'
import { useChat } from '../stores/chat'
import {generateStream} from '../services/ollama'

const { messages,
  addMessage,
  createAssistantMessage,
  appendToMessage,
    finishMessage
} = useChat()
let inputValue = ref<string>('')
const isStreaming = ref<boolean>(false)
const containerRef = ref<HTMLDivElement | null>(null)

console.log("containerRef",containerRef)
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
  //流式输出返回数据
   await generateStream(inputValue.value,async (chunk)=>{
    appendToMessage(aiMsg.id, chunk)
     scheduleScroll()
   }, () => {
     finishMessage(aiMsg.id)
   })
  //赋值后清空
  isStreaming.value = false
  inputValue.value=""
}

let isScrolling = false
/**
 * 调度滚动到底部，防止在滚动过程中重复触发
 * 使用 requestAnimationFrame 确保在下一帧渲染时执行滚动
 */
function scheduleScroll() {
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
}
</style>