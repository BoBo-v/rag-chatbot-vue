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
import { generateText } from '../services/ollama'

const { messages,
  addMessage,
  createAssistantMessage,
  appendToMessage,
} = useChat()
async function handleSend() {
  addMessage({
    id: "assistant-"+Date.now().toString(),
    role: 'user',
    content: '你好',
    status: 'done'
  })
  //ai占位消息
  const aiMsg = createAssistantMessage()
  //模拟流式输出
   await generateText('你好',(chunk)=>{
    appendToMessage(aiMsg.id, chunk)
  })



}
</script>
<style scoped>
.chat {
  height: 100vh;
}
</style>