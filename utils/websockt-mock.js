import { ref } from 'vue';
import { ElNotification } from 'element-plus';

class MockInquiryWebSocket {
    constructor() {
        this.isConnected = ref(false);
        this.listeners = new Map();
    }

    // 模拟连接
    connect() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('[Mock] 未登录，不连接');
            return;
        }

        console.log('[Mock] WebSocket 模拟连接成功');
        this.isConnected.value = true;

        // 模拟连接成功通知
        ElNotification({
            title: '系统提示',
            message: 'WebSocket 模拟连接成功',
            type: 'success',
            duration: 2000,
        });
    }

    // 模拟接收消息（供测试调用）
    mockReceiveMessage(data) {
        console.log('[Mock] 收到模拟消息:', data);
        this.handleMessage(data);
    }

    // 处理消息
    handleMessage(data) {
        const { type, payload } = data;

        if (type === 'INQUIRY_UPDATE') {
            this.showNotification(payload);
            this.emit('inquiry-update', payload);
        }
    }

    // 显示通知
    showNotification(payload) {
        const { operator, action, model } = payload;

        const currentUser = localStorage.getItem('username');
        if (operator === currentUser) {
            console.log('[Mock] 自己的操作，不提示');
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

    // 监听事件
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);

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
        console.log('[Mock] WebSocket 模拟断开');
        this.isConnected.value = false;
    }
}

export const inquiryWS = new MockInquiryWebSocket();

// ========== 测试辅助方法 ==========

// 模拟其他用户新增询价
export const mockCreate = () => {
    inquiryWS.mockReceiveMessage({
        type: 'INQUIRY_UPDATE',
        payload: {
            action: 'create',
            operator: '张三',
            model: 'TEST-MODEL-001',
            inquiryId: Date.now()
        }
    });
};

// 模拟其他用户采购报价
export const mockPurchase = () => {
    inquiryWS.mockReceiveMessage({
        type: 'INQUIRY_UPDATE',
        payload: {
            action: 'purchase',
            operator: '李四',
            model: 'TEST-MODEL-002',
            inquiryId: Date.now()
        }
    });
};

// 模拟其他用户销售报价
export const mockSales = () => {
    inquiryWS.mockReceiveMessage({
        type: 'INQUIRY_UPDATE',
        payload: {
            action: 'sales',
            operator: '王五',
            model: 'TEST-MODEL-003',
            inquiryId: Date.now()
        }
    });
};

// 模拟其他用户删除
export const mockDelete = () => {
    inquiryWS.mockReceiveMessage({
        type: 'INQUIRY_UPDATE',
        payload: {
            action: 'delete',
            operator: '赵六',
            model: 'TEST-MODEL-004',
            inquiryId: Date.now()
        }
    });
};

// 模拟自己的操作（不应该弹出通知）
export const mockSelfAction = () => {
    const currentUser = localStorage.getItem('username') || 'admin';
    inquiryWS.mockReceiveMessage({
        type: 'INQUIRY_UPDATE',
        payload: {
            action: 'create',
            operator: currentUser,  // 自己
            model: 'SELF-MODEL',
            inquiryId: Date.now()
        }
    });
};