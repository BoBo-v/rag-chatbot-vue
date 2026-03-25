<template>
  <div class="chat">
    <button @click="handleSend">发送测试</button>

    <div v-for="msg in messages" :key="msg.id">
      {{ msg.role }}: {{ msg.content }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { useChat } from '../stores/chat'
import {generateStream} from '../services/ollama'

const { messages,
  addMessage,
  createAssistantMessage,
  appendToMessage,
    finishMessage
} = useChat()
async function handleSend() {
  addMessage({
    id: crypto.randomUUID(),
    role: 'user',
    content: '你好',
    status: 'done'
  })
  //ai占位消息
  const aiMsg = createAssistantMessage()
  //模拟流式输出
   await generateStream('你好',(chunk)=>{
    appendToMessage(aiMsg.id, chunk)
  }, () => {
     finishMessage(aiMsg.id)
   })



}
</script>
<style scoped>
.chat {
  height: 100vh;
}
</style>