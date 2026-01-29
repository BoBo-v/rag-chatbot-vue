<template>
  <div v-if="isDev" class="ws-test-panel">
    <div class="panel-header" @click="isExpanded = !isExpanded">
      <span>🔧 WebSocket 测试面板</span>
      <span>{{ isExpanded ? '收起' : '展开' }}</span>
    </div>

    <div v-show="isExpanded" class="panel-body">
      <div class="status">
        连接状态:
        <el-tag :type="inquiryWS.isConnected.value ? 'success' : 'danger'">
          {{ inquiryWS.isConnected.value ? '已连接' : '未连接' }}
        </el-tag>
      </div>

      <div class="buttons">
        <el-button size="small" @click="inquiryWS.connect()">
          模拟连接
        </el-button>
        <el-button size="small" @click="inquiryWS.disconnect()">
          模拟断开
        </el-button>
      </div>

      <el-divider>模拟消息</el-divider>

      <div class="buttons">
        <el-button size="small" type="success" @click="mockCreate">
          新增询价
        </el-button>
        <el-button size="small" type="warning" @click="mockPurchase">
          采购报价
        </el-button>
        <el-button size="small" type="primary" @click="mockSales">
          销售报价
        </el-button>
        <el-button size="small" type="danger" @click="mockDelete">
          删除询价
        </el-button>
      </div>

      <div class="buttons" style="margin-top: 10px;">
        <el-button size="small" type="info" @click="mockSelfAction">
          自己的操作（不应弹窗）
        </el-button>
      </div>

      <el-divider>事件日志</el-divider>

      <div class="logs">
        <div v-for="(log, index) in logs" :key="index" class="log-item">
          <span class="time">{{ log.time }}</span>
          <span :class="'action-' + log.action">{{ log.message }}</span>
        </div>
        <div v-if="logs.length === 0" class="no-logs">暂无日志</div>
      </div>

      <el-button size="small" @click="logs = []" style="margin-top: 10px;">
        清空日志
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import {
  inquiryWS,
  mockCreate,
  mockPurchase,
  mockSales,
  mockDelete,
  mockSelfAction
} from '../../utils/websockt-mock.js';

const isDev = import.meta.env.DEV;
const isExpanded = ref(false);
const logs = ref([]);

let unsubscribe = null;

const addLog = (action, message) => {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  logs.value.unshift({ time, action, message });

  // 只保留最近 20 条
  if (logs.value.length > 20) {
    logs.value.pop();
  }
};

onMounted(() => {
  // 监听事件并记录日志
  unsubscribe = inquiryWS.on('inquiry-update', (payload) => {
    addLog(payload.action, `${payload.operator} - ${payload.action} - ${payload.model}`);
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<style scoped>
.ws-test-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  font-size: 12px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: #409eff;
  color: #fff;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  font-weight: bold;
}

.panel-body {
  padding: 15px;
  max-height: 400px;
  overflow-y: auto;
}

.status {
  margin-bottom: 10px;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.logs {
  max-height: 150px;
  overflow-y: auto;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 8px;
}

.log-item {
  padding: 4px 0;
  border-bottom: 1px dashed #e4e7ed;
  display: flex;
  gap: 8px;
}

.log-item:last-child {
  border-bottom: none;
}

.time {
  color: #909399;
  flex-shrink: 0;
}

.action-create { color: #67c23a; }
.action-purchase { color: #e6a23c; }
.action-sales { color: #409eff; }
.action-delete { color: #f56c6c; }
.action-update { color: #909399; }

.no-logs {
  color: #909399;
  text-align: center;
  padding: 10px;
}
</style>