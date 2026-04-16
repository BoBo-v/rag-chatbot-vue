<template>
  <Teleport to="body">
    <div class="settings-overlay" @click.self="$emit('close')">
      <div class="settings-panel">

        <div class="settings-header">
          <span class="settings-title">设置</span>
          <button class="settings-close" @click="$emit('close')">✕</button>
        </div>

        <div class="settings-body">

          <!-- Ollama 地址 -->
          <div class="settings-group">
            <label class="settings-label">Ollama 服务地址</label>
            <input
              class="settings-input"
              v-model="draft.ollamaUrl"
              placeholder="http://localhost:11434"
              spellcheck="false"
            />
          </div>

          <!-- 模型选择 -->
          <div class="settings-group">
            <div class="settings-label-row">
              <label class="settings-label">模型</label>
              <button class="btn-refresh" :class="{ loading: loadingModels }" @click="loadModels">
                {{ loadingModels ? '获取中...' : '刷新列表' }}
              </button>
            </div>
            <select v-if="modelList.length > 0" class="settings-input settings-select" v-model="draft.model">
              <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
            </select>
            <input
              v-else
              class="settings-input"
              v-model="draft.model"
              placeholder="例如：qwen2.5:7b"
              spellcheck="false"
            />
            <span v-if="modelError" class="settings-hint error">{{ modelError }}</span>
            <span v-else class="settings-hint">点击「刷新列表」从 Ollama 拉取已安装模型</span>
          </div>

          <!-- 系统提示词 -->
          <div class="settings-group">
            <label class="settings-label">系统提示词</label>
            <textarea
              class="settings-input settings-textarea"
              v-model="draft.systemPrompt"
              placeholder="输入系统提示词..."
              rows="4"
            ></textarea>
          </div>

          <!-- 上下文长度 -->
          <div class="settings-group">
            <div class="settings-label-row">
              <label class="settings-label">上下文长度（Token 估算上限）</label>
              <span class="settings-token-val">{{ draft.maxContextTokens }}</span>
            </div>
            <input
              class="settings-slider"
              type="range"
              min="500"
              max="8000"
              step="500"
              v-model.number="draft.maxContextTokens"
            />
            <div class="settings-slider-labels">
              <span>500</span>
              <span>8000</span>
            </div>
          </div>

        </div>

        <div class="settings-footer">
          <button class="btn-cancel" @click="$emit('close')">取消</button>
          <button class="btn-save" @click="save">保存</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { settings } from '../stores/settings'
import { fetchOllamaModels } from '../services/ollama'

defineEmits<{ close: [] }>()

// 编辑草稿，不直接修改 settings，点保存后才写入
const draft = reactive({ ...settings })

const modelList = ref<string[]>([])
const loadingModels = ref(false)
const modelError = ref('')

async function loadModels() {
  loadingModels.value = true
  modelError.value = ''
  const list = await fetchOllamaModels()
  if (list.length === 0) {
    modelError.value = '未能获取模型列表，请确认 Ollama 服务已启动'
  } else {
    modelList.value = list
    // 如果当前模型不在列表里就选第一个
    if (!list.includes(draft.model)) draft.model = list[0]
  }
  loadingModels.value = false
}

function save() {
  Object.assign(settings, draft)
}

onMounted(loadModels)
</script>
