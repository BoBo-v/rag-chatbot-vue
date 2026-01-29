import { ref } from 'vue';
import { ElNotification } from 'element-plus';

class InquiryWebSocket {
    constructor() {
        this.ws = null;
        this.isConnected = ref(false);
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.listeners = new Map();
        this.heartbeatTimer = null;
    }

    // 连接
    connect() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('未登录，不连接 WebSocket');
            return;
        }

        // 已连接则跳过
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws/inquiry';
        this.ws = new WebSocket(`${wsUrl}?token=${token}`);

        this.ws.onopen = () => {
            console.log('WebSocket 连接成功');
            this.isConnected.value = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) {
                console.error('消息解析失败:', e);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket 连接关闭');
            this.isConnected.value = false;
            this.stopHeartbeat();
            this.tryReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
        };
    }

    // 处理消息
    handleMessage(data) {
        const { type, payload } = data;

        // 心跳响应
        if (type === 'PONG') {
            return;
        }

        // 询报价更新通知
        if (type === 'INQUIRY_UPDATE') {
            this.showNotification(payload);
            this.emit('inquiry-update', payload);
        }
    }

    // 显示通知
    showNotification(payload) {
        const { operator, action, model } = payload;

        // 获取当前用户，不提示自己的操作
        const currentUser = localStorage.getItem('username');
        if (operator === currentUser) {
            return;
        }

        let actionText = '';
        let notifyType = 'info';

        switch (action) {
            case 'create':
                actionText = '新增了询价';
                notifyType = 'success';
                break;
            case 'purchase':
                actionText = '完成了采购报价';
                notifyType = 'warning';
                break;
            case 'sales':
                actionText = '完成了销售报价';
                notifyType = 'success';
                break;
            case 'update':
                actionText = '更新了询价';
                notifyType = 'info';
                break;
            case 'delete':
                actionText = '删除了询价';
                notifyType = 'error';
                break;
            default:
                actionText = '更新了询报价';
        }

        ElNotification({
            title: '询报价动态',
            message: `${operator} ${actionText}${model ? `【${model}】` : ''}`,
            type: notifyType,
            duration: 5000,
            position: 'top-right',
        });
    }

    // 心跳保活
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'PING' }));
            }
        }, 30000); // 30秒一次心跳
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    // 重连
    tryReconnect() {
        const token = localStorage.getItem('token');
        if (!token) return; // 未登录不重连

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connect(), this.reconnectInterval);
        } else {
            console.log('重连次数已达上限');
        }
    }

    // 监听事件
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);

        // 返回取消监听的函数
        return () => {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    // 触发事件
    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
    }

    // 断开连接
    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected.value = false;
        this.reconnectAttempts = this.maxReconnectAttempts; // 阻止重连
    }
}

// 单例导出
export const inquiryWS = new InquiryWebSocket();