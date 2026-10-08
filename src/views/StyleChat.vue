<template>
  <div class="chat-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">

    <!-- ── 动态背景 ── -->
    <div class="bg-canvas">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
      <div class="orb orb-4"></div>
      <div class="noise"></div>
    </div>

    <!-- ── 侧边栏 ── -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <span class="sidebar-title">工单记录</span>
        <button class="new-chat-btn" type="button" title="新建工单" aria-label="新建工单" @click="handleNewConversation">
          <Plus :size="17" aria-hidden="true" />
        </button>
      </div>
      <div class="sidebar-body">
        <button class="new-chat-big-btn" @click="handleNewConversation">
          <MessageSquarePlus class="new-chat-icon" :size="17" aria-hidden="true" />
          新建工单
        </button>
        <div class="sidebar-search">
          <Search class="sidebar-search-icon" :size="16" aria-hidden="true" />
          <input
              v-model="conversationSearchDraft"
              class="sidebar-search-input"
              type="search"
              placeholder="搜索历史工单..."
              aria-label="搜索历史工单"
          />
          <button
              v-if="conversationSearchDraft"
              class="sidebar-search-clear"
              type="button"
              aria-label="清空搜索"
              @click="conversationSearchDraft = ''"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </div>

        <div v-if="isSearchMode" class="search-results">
          <div class="conv-group-label search-label">
            搜索结果
            <span v-if="isSearchLoading" class="search-status">搜索中...</span>
            <span v-else class="search-status">{{ searchResults.length }} 条</span>
          </div>
          <div
              v-for="result in searchResults"
              :key="`${result.conversationId}-${result.messageId}`"
              class="search-result-item"
              :class="{ active: result.conversationId === currentId }"
              @click="handleSearchResultClick(result.conversationId)"
          >
            <div class="search-result-title">{{ result.title }}</div>
            <div class="search-result-snippet">{{ result.snippet || '无内容预览' }}</div>
          </div>
          <div v-if="searchError" class="conv-empty search-empty">
            <div>{{ searchError }}</div>
            <button
                type="button"
                class="search-retry-btn"
                :disabled="isSearchLoading"
                @click="retrySearch"
            >
              重试
            </button>
          </div>
          <div v-else-if="!isSearchLoading && searchResults.length === 0" class="conv-empty search-empty">
            没有匹配的工单记录
          </div>
        </div>

        <template v-else>
          <template v-for="group in groupedConversations" :key="group.label">
            <div class="conv-group-label">{{ group.label }}</div>
            <div
                v-for="conv in group.items"
                :key="conv.id"
                class="conv-item"
                :class="{ active: conv.id === currentId, editing: editingConvId === conv.id }"
                @click="handleSelectConversation(conv.id)"
            >
              <template v-if="editingConvId === conv.id">
                <input
                    ref="renameInputRef"
                    v-model="editingTitleDraft"
                    class="conv-rename-input"
                    type="text"
                    maxlength="60"
                    @click.stop
                    @keydown.enter.prevent="saveRenameConversation(conv.id)"
                    @keydown.esc="cancelRenameConversation"
                    @blur="saveRenameConversation(conv.id)"
                />
                <button
                    class="conv-action-btn"
                    type="button"
                    title="保存"
                    aria-label="保存标题"
                    @click.stop="saveRenameConversation(conv.id)"
                >
                  <Check :size="13" aria-hidden="true" />
                </button>
              </template>
              <template v-else>
                <span
                    class="conv-title"
                    :title="conv.title"
                    @dblclick.stop="startRenameConversation(conv.id, conv.title)"
                >{{ conv.title }}</span>
                <div class="conv-actions">
                  <button
                      class="conv-action-btn"
                      type="button"
                      title="重命名"
                      aria-label="重命名对话"
                      @click.stop="startRenameConversation(conv.id, conv.title)"
                  >
                    <Pencil :size="13" aria-hidden="true" />
                  </button>
                  <button
                      class="conv-action-btn conv-del"
                      type="button"
                      title="删除"
                      aria-label="删除对话"
                      @click.stop="handleDeleteConversation(conv.id)"
                  >
                    <Trash2 :size="13" aria-hidden="true" />
                  </button>
                </div>
              </template>
            </div>
          </template>
          <div v-if="conversations.length === 0" class="conv-empty">暂无历史工单</div>
        </template>
      </div>
    </aside>

    <!-- 移动端遮罩 -->
    <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

    <!-- ── 主内容区 ── -->
    <div class="main-content">

      <!-- ── 顶栏 ── -->
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="menu-btn"
            type="button"
            :aria-label="isSidebarCollapsed ? '展开工单列表' : '收起工单列表'"
            :title="isSidebarCollapsed ? '展开工单列表 (Ctrl+[)' : '收起工单列表 (Ctrl+[)'"
            @click="toggleSidebar"
          >
            <PanelLeftClose v-if="!isSidebarCollapsed" :size="18" aria-hidden="true" />
            <PanelLeft v-else :size="18" aria-hidden="true" />
          </button>
          <div class="topbar-logo">
            <img class="logo-mark" src="/favicon.svg" alt="" aria-hidden="true" />
            <span class="logo-text">技术支持工单决策台</span>
            <!-- 顶栏快速切换模型下拉 -->
            <div v-if="currentSettings.showModelInTopbar" class="topbar-model-wrapper">
              <button
                type="button"
                class="topbar-model-btn"
                :title="`当前模型：${currentModelName} · 点击快速切换`"
                @click.stop="modelDropdownOpen = !modelDropdownOpen"
              >
                <Bot :size="13" aria-hidden="true" />
                <span class="topbar-model-text">{{ currentModelName }}</span>
                <ChevronDown :size="12" class="topbar-model-chevron" :class="{ open: modelDropdownOpen }" aria-hidden="true" />
              </button>
              <div v-if="modelDropdownOpen" class="topbar-model-dropdown" role="menu">
                <div class="dropdown-header">
                  <span>{{ currentSettings.transport === 'backend' ? '后端代理厂商' : currentSettings.provider.toUpperCase() }} 模型</span>
                  <button type="button" class="dropdown-settings-link" @click="modelDropdownOpen = false; settingsOpen = true">详细设置</button>
                </div>
                <div class="dropdown-list">
                  <button
                    v-for="m in quickModels"
                    :key="m"
                    type="button"
                    class="dropdown-item"
                    :class="{ active: isCurrentModel(m) }"
                    @click="selectQuickModel(m)"
                  >
                    <Check v-if="isCurrentModel(m)" :size="13" />
                    <span v-else class="item-spacer"></span>
                    <span class="dropdown-item-name">{{ m }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="topbar-right">
          <div
              class="transport-status"
              :class="currentSettings.transport === 'backend' ? 'is-backend' : 'is-direct'"
              role="status"
              :aria-label="currentSettings.transport === 'backend'
                ? '后端代理模式，回答支持后台生成和恢复'
                : '直连模式，生成时切换会话会中断回答'"
              :title="currentSettings.transport === 'backend'
                ? '回答由后端任务持续生成，切换会话后可以回来恢复'
                : '模型由当前页面直接连接，生成时切换会话会中断回答'"
          >
            <Server v-if="currentSettings.transport === 'backend'" :size="14" aria-hidden="true" />
            <Cable v-else :size="14" aria-hidden="true" />
            <span class="transport-label">
              {{ currentSettings.transport === 'backend' ? '后端代理' : '直连模式' }}
            </span>
<!--            <span class="transport-detail">-->
<!--              {{ currentSettings.transport === 'backend' ? '可后台恢复' : (isStreaming ? '切换会中断' : '仅当前页面') }}-->
<!--            </span>-->
          </div>
          <div class="topbar-status" :class="{ active: isStreaming }">
            <span class="status-dot"></span>
            <span>{{ isStreaming ? 'Thinking...' : 'Ready' }}</span>
          </div>
          <button class="settings-btn" type="button" title="设置" aria-label="打开聊天设置" @click="settingsOpen = true">
            <Settings2 :size="17" aria-hidden="true" />
          </button>
        </div>
      </header>

      <!-- ── 消息区 ── -->
      <div ref="containerRef" class="chat" @click="handleCodeBlockCopy">
        <div class="messages-inner">

          <!-- 空状态 -->
          <div v-if="messages.length === 0" class="empty-state">
            <div class="empty-icon"><Sparkles :size="26" aria-hidden="true" /></div>
            <h2 class="empty-title">技术支持工单决策台</h2>
            <p class="empty-desc">选择预设工单用例或直接粘贴客户报障信息进行检索诊断与草稿生成</p>
            <div class="empty-suggestions">
              <button
                v-for="s in suggestionPrompts"
                :key="s.title"
                type="button"
                class="suggestion-card"
                @click="applySuggestion(s.prompt)"
              >
                <div class="suggestion-header">
                  <component :is="s.icon" :size="15" class="suggestion-icon" aria-hidden="true" />
                  <span class="suggestion-title">{{ s.title }}</span>
                </div>
                <p class="suggestion-snippet">{{ s.desc }}</p>
              </button>
            </div>
          </div>

          <!-- 消息列表 -->
          <div
              v-for="msg in messages"
              :key="msg.id"
              class="msg-row"
              :class="msg.role"
          >
            <div
                v-if="msg.role === 'assistant'"
                class="msg-avatar ai-avatar"
            ><img src="/favicon.svg" alt="AI" /></div>
            <div v-if="msg.role === 'user'" class="msg-avatar user-avatar">U</div>
            <div class="msg-col">
              <div
class="msg-bubble"
                   :class="[msg.role, {
                     'is-loading':   msg.status === 'loading',
                     'is-streaming': msg.status === 'streaming',
                     'is-error':     msg.status === 'error',
                     'is-aborted':   msg.status === 'aborted',
                   }]"
              >
                <div v-if="msg.files?.length" class="msg-files">
                  <div v-for="(file, idx) in msg.files" :key="idx" class="msg-file-chip">
                    <FileText class="file-icon" :size="14" aria-hidden="true" />
                    <span class="file-name">{{ file.name }}</span>
                    <span class="file-size">{{ formatFileSize(file.size) }}</span>
                  </div>
                </div>
                <div v-if="msg.images?.length" class="msg-images">
                  <img
v-for="(img, idx) in msg.images" :key="idx"
                       :src="`data:${img.mediaType};base64,${img.base64}`"
                       :alt="img.name"
                       class="msg-image"
                       @click="openImagePreview(`data:${img.mediaType};base64,${img.base64}`)"
                  />
                </div>
                <div class="msg-content markdown-body" v-html="renderContent(msg)"></div>
                <template v-if="msg.status === 'aborted'">
                  <div class="abort-divider"></div>
                  <div class="abort-truncate-row">
                    <div class="abort-truncate-dash"></div>
                    生成中断
                  </div>
                </template>
                <template v-if="msg.status === 'error'">
                  <div class="error-divider"></div>
                  <div class="error-info-row">
                    <span class="error-icon">!</span>
                    <span class="error-text">{{ msg.errorMessage || '生成失败' }}</span>
                  </div>
                </template>
              </div>
              <!-- RAG 引用文档展示 -->
              <RagCitations
                v-if="msg.role === 'assistant' && msg.ragContext"
                :context="msg.ragContext"
              />
              <div v-if="msg.status === 'aborted'" class="abort-badge-row">
                <div class="badge-aborted">
                  <div class="abort-dot"></div>
                  已停止
                </div>
                <button v-if="msg.canContinue !== false" class="btn-continue" :disabled="isStreaming" @click="handleContinue(msg.id)">
                  ↻ 继续生成
                </button>
              </div>
              <div v-if="msg.status === 'error'" class="error-badge-row">
                <div class="badge-error">
                  <div class="error-dot"></div>
                  发送失败
                </div>
                <button class="btn-retry" :disabled="isStreaming" @click="handleRetry(msg.id)">
                  ↻ 重试
                </button>
              </div>
              <!-- 消息快捷操作栏（工单排障操作设计） -->
              <div class="msg-actions-bar" :class="msg.role">
                <template v-if="msg.role === 'user'">
                  <button
                    type="button"
                    class="msg-action-btn"
                    data-tooltip="编辑报障信息"
                    aria-label="编辑报障信息"
                    @click="handleEditPrompt(msg.content)"
                  >
                    <Pencil :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="msg-action-btn"
                    :class="{ copied: copiedUserMsgId === msg.id }"
                    :data-tooltip="copiedUserMsgId === msg.id ? '已复制报障' : '复制报障内容'"
                    :aria-label="copiedUserMsgId === msg.id ? '已复制报障' : '复制报障内容'"
                    @click="handleCopyUserMessage(msg.id, msg.content)"
                  >
                    <Check v-if="copiedUserMsgId === msg.id" :size="14" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                </template>
                <template v-else-if="msg.role === 'assistant' && msg.status !== 'loading' && msg.status !== 'error'">
                  <!-- 工单处置状态徽章（若已转人工或方案已确认） -->
                  <span v-if="escalatedMsgIds.has(msg.id)" class="ticket-status-badge badge-escalated">
                    <Headphones :size="12" aria-hidden="true" /> 已转二线人工
                  </span>
                  <span v-if="confirmedMsgIds.has(msg.id)" class="ticket-status-badge badge-confirmed">
                    <CheckCheck :size="12" aria-hidden="true" /> 方案已确认闭环
                  </span>

                  <!-- 采纳草稿并复制回复 -->
                  <button
                    type="button"
                    class="msg-action-btn btn-adopt-draft"
                    :class="{ copied: copiedMsgId === msg.id }"
                    :data-tooltip="copiedMsgId === msg.id ? '已采纳并复制' : '采纳草稿并复制回复'"
                    :aria-label="copiedMsgId === msg.id ? '已采纳并复制' : '采纳草稿并复制回复'"
                    @click="handleAdoptAndCopyDraft(msg.id, msg.content)"
                  >
                    <Check v-if="copiedMsgId === msg.id" :size="14" :stroke-width="2" aria-hidden="true" />
                    <ClipboardCheck v-else :size="14" :stroke-width="1.75" aria-hidden="true" />
                    <span class="action-btn-text">采纳草稿并复制回复</span>
                  </button>

                  <!-- 编辑草稿 -->
                  <button
                    type="button"
                    class="msg-action-btn"
                    data-tooltip="载入草稿到输入框编辑"
                    aria-label="编辑客户回复草稿"
                    @click="handleEditDraft(msg.content)"
                  >
                    <Pencil :size="14" :stroke-width="1.75" aria-hidden="true" />
                    <span class="action-btn-text-sub">编辑</span>
                  </button>

                  <!-- 查看证据 -->
                  <button
                    type="button"
                    class="msg-action-btn"
                    :class="{ 'has-evidence': msg.ragContext?.results?.length }"
                    :data-tooltip="msg.ragContext?.results?.length ? `查看 ${msg.ragContext.results.length} 条检索依据` : '当前回答未命中知识库'"
                    aria-label="查看证据"
                    @click="handleViewEvidence(msg)"
                  >
                    <FileSearch :size="14" :stroke-width="1.75" aria-hidden="true" />
                    <span class="action-btn-text-sub">查看证据</span>
                  </button>

                  <!-- 转人工 -->
                  <button
                    type="button"
                    class="msg-action-btn btn-action-escalate"
                    :class="{ active: escalatedMsgIds.has(msg.id) }"
                    :data-tooltip="escalatedMsgIds.has(msg.id) ? '已标记为转二线研发' : '标记转二线研发人工接管'"
                    aria-label="转人工接管"
                    @click="handleEscalateTicket(msg.id)"
                  >
                    <Headphones :size="14" :stroke-width="1.75" aria-hidden="true" />
                    <span class="action-btn-text-sub">转人工</span>
                  </button>

                  <!-- 标记为已确认 -->
                  <button
                    type="button"
                    class="msg-action-btn btn-action-confirm"
                    :class="{ active: confirmedMsgIds.has(msg.id) }"
                    :data-tooltip="confirmedMsgIds.has(msg.id) ? '已标记为解决方案闭环' : '标记为已确认解决并闭环'"
                    aria-label="标记为已确认"
                    @click="handleConfirmResolution(msg.id)"
                  >
                    <CheckCheck :size="14" :stroke-width="1.75" aria-hidden="true" />
                    <span class="action-btn-text-sub">标记已确认</span>
                  </button>

                  <!-- 重新生成 -->
                  <button
                    v-if="msg.status === 'done'"
                    type="button"
                    class="msg-action-btn"
                    :disabled="isStreaming"
                    data-tooltip="重新排障与生成"
                    aria-label="重新排障与生成"
                    @click="handleRegenerate(msg.id)"
                  >
                    <RotateCcw :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>

                  <!-- 复制完整排障分析 -->
                  <button
                    type="button"
                    class="msg-action-btn"
                    :class="{ copied: copiedFullMsgId === msg.id }"
                    :data-tooltip="copiedFullMsgId === msg.id ? '已复制完整分析' : '复制完整排障分析(含内部分析)'"
                    aria-label="复制完整排障分析"
                    @click="handleCopyFullMessage(msg.id, msg.content)"
                  >
                    <Check v-if="copiedFullMsgId === msg.id" :size="14" :stroke-width="2" aria-hidden="true" />
                    <Copy v-else :size="14" :stroke-width="1.75" aria-hidden="true" />
                  </button>
                </template>
              </div>
            </div>
          </div>

        </div>

        <!-- 新消息提示 -->
        <transition name="fade-up">
          <div v-if="unreadCount > 0" class="unread-badge" @click="scrollToBottom">
            ↓ 有新消息
          </div>
        </transition>
      </div>

      <!-- ── 输入区 ── -->
      <div class="input-area">
        <!-- 文件预览 -->
        <div v-if="pendingFiles.length > 0" class="file-preview-bar">
          <div v-for="(file, idx) in pendingFiles" :key="idx" class="file-preview-item">
            <FileText class="file-icon" :size="14" aria-hidden="true" />
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">{{ formatFileSize(file.size) }}</span>
            <button class="file-remove-btn" type="button" aria-label="移除文件" @click="removeFile(idx)">
              <X :size="12" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div v-if="isKnowledgeUploading" class="knowledge-upload-progress">
          <div class="knowledge-upload-progress-row">
            <span>{{ knowledgeUploadLabel }}</span>
            <strong>{{ Math.round(knowledgeUploadPercent) }}%</strong>
          </div>
          <div class="knowledge-upload-progress-track">
            <div class="knowledge-upload-progress-bar" :style="{ width: knowledgeUploadPercent + '%' }"></div>
          </div>
        </div>
        <!-- 图片预览 -->
        <div v-if="pendingImages.length > 0" class="image-preview-bar">
          <div v-for="(img, idx) in pendingImages" :key="idx" class="image-preview-item">
            <img :src="`data:${img.mediaType};base64,${img.base64}`" :alt="img.name" />
            <button class="image-remove-btn" type="button" aria-label="移除图片" @click="removeImage(idx)">
              <X :size="12" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
            class="input-box"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="handleDrop">
          <input
              ref="imageInputRef"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              @change="handleImageSelect"
          />
          <input
              ref="fileInputRef"
              type="file"
              accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.toml,.js,.ts,.jsx,.tsx,.vue,.svelte,.py,.go,.rs,.java,.kt,.c,.cpp,.h,.hpp,.cs,.rb,.php,.swift,.sh,.bash,.zsh,.bat,.ps1,.html,.css,.scss,.less,.sass,.sql,.graphql,.proto,.env,.ini,.conf,.cfg,.log"
              multiple
              hidden
              @change="handleFileSelect"
          />
          <input
              ref="knowledgeInputRef"
              type="file"
              accept=".txt,.md,.pdf"
              multiple
              hidden
              @change="handleKnowledgeFileSelect"
          />
          <textarea
              ref="textareaRef"
              v-model="inputValue"
              class="input-field"
              :placeholder="isStreaming ? '正在检索排障并生成回复中，可在此准备下一条工单信息...' : '描述客户报障现象、报错日志、复现步骤或贴入工单 (按 ↑ 可恢复上一条)...'"
              rows="1"
              @keydown.enter.exact.prevent="handleKeyEnter"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @keydown.up="handleKeyUp"
              @input="autoResize"
              @paste="handlePaste"
          ></textarea>
          <div class="input-toolbar">
            <div class="toolbar-left">
              <button class="tool-btn" title="上传图片" @click="imageInputRef?.click()">
                <ImageIcon :size="18" aria-hidden="true" />
              </button>
              <button class="tool-btn" title="上传文件" @click="fileInputRef?.click()">
                <FileText :size="18" aria-hidden="true" />
              </button>
              <button
                  class="tool-btn knowledge-upload-btn"
                  :class="{ uploading: isKnowledgeUploading }"
                  :disabled="isKnowledgeUploading"
                  :title="isKnowledgeUploading ? '知识库上传中' : '上传到知识库'"
                  @click="knowledgeInputRef?.click()"
              >
                <span v-if="isKnowledgeUploading" class="upload-spinner"></span>
                <BookUp2 v-else :size="18" aria-hidden="true" />
              </button>
              <button
v-if="speechSupported"
                      class="tool-btn voice-btn"
                      :class="{ 'is-listening': isListening }"
                      :title="isListening ? '停止语音输入' : '语音输入'"
                      @click="toggleVoice">
                <Mic :size="18" aria-hidden="true" />
              </button>
            </div>
            <div class="toolbar-right">
              <button v-if="isStreaming" class="stop-btn" type="button" aria-label="停止生成" @click="handleStop">
                <Square :size="15" :fill="'currentColor'" aria-hidden="true" />
              </button>
              <button
                  v-else
                  class="send-btn"
                  :class="{ ready: inputValue.trim() || pendingImages.length > 0 || pendingFiles.length > 0 }"
                  :disabled="!inputValue.trim() && pendingImages.length === 0 && pendingFiles.length === 0"
                  @click="handleSend"
              ><Send :size="17" aria-hidden="true" /></button>
            </div>
          </div>
        </div>
        <div class="input-hint">
          <template v-if="isStreaming">
            正在检索知识库并生成排障建议 · 可在此预先键入下一条工单信息或点击右下角停止
          </template>
          <template v-else>
            <span class="hint-key">Enter</span> 提交排障 · <span class="hint-key">Shift</span> + <span class="hint-key">Enter</span> 换行 · 纸夹添加日志附件，书本上传至技术知识库
          </template>
        </div>
      </div>

    </div><!-- /main-content -->

    <!-- ── Toast 通知 ── -->
    <transition-group name="toast-slide" tag="div" class="toast-container">
      <div
          v-for="t in toast.toasts.value"
          :key="t.id"
          class="toast-item"
          :class="t.type"
          :role="t.type === 'error' ? 'alert' : 'status'"
          aria-live="polite"
          @click="toast.dismiss(t.id)"
      >
        <span class="toast-icon" aria-hidden="true">
          <CircleAlert v-if="t.type === 'error'" :size="16" />
          <TriangleAlert v-else-if="t.type === 'warning'" :size="16" />
          <CircleCheck v-else :size="16" />
        </span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </transition-group>

  </div>

  <!-- ── 图片大图预览 ── -->
  <teleport to="body">
    <div v-if="previewImageSrc" class="image-lightbox" @click="previewImageSrc = ''">
      <img :src="previewImageSrc" alt="preview" />
    </div>
  </teleport>

  <!-- ── 设置面板 ── -->
  <SettingsPanel v-if="settingsOpen" @close="settingsOpen = false" />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BookUp2,
  Bot,
  Cable,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Code2,
  Copy,
  FileSearch,
  FileText,
  Headphones,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Server,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-vue-next'
import { useChatView } from '../composables/useChatView'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { useConversationSearch } from '../composables/useConversationSearch'
import { useMessageRenderer } from '../composables/useMessageRenderer'
import { useConversationGroups } from '../composables/useConversationGroups'
import { persistSettings, settings as currentSettings } from '../stores/settings'
import { getClaudeModels } from '../services/providers/claude'
import { uploadKnowledgeFile } from '../services/knowledge'
import type { UploadProgress } from '../services/knowledge'
import SettingsPanel from '../components/SettingsPanel.vue'
import RagCitations from '../components/RagCitations.vue'

// StyleChat 是主聊天页面组件。
// 模板负责布局和绑定事件；具体业务逻辑尽量放在 composable 里，避免单文件过大。

const {
  messages,
  inputValue,
  isStreaming,
  unreadCount,
  containerRef,
  sidebarOpen,
  conversations,
  currentId,
  toast,
  pendingImages,
  pendingFiles,
  handleStop,
  handleSend,
  handleContinue,
  handleRetry,
  handleRegenerate: handleRegenerateMessage,
  scrollToBottom,
  handleSelectConversation,
  handleNewConversation,
  handleDeleteConversation,
  handleRenameConversation,
  addImages,
  removeImage,
  addFiles,
  removeFile,
} = useChatView()
void containerRef

// 三个 composable 分别负责：消息 Markdown 渲染、侧边栏会话分组、侧边栏搜索。
const { renderContent, handleCodeBlockCopy } = useMessageRenderer()
const { groupedConversations, currentModelName } = useConversationGroups(conversations)
const {
  conversationSearchDraft,
  isSearchLoading,
  searchError,
  searchResults,
  isSearchMode,
  handleSearchResultClick,
  retrySearch,
} = useConversationSearch({
  onSelect: handleSelectConversation,
})

// ── 语音输入 ──────────────────────────────────────
const { isListening, isSupported: speechSupported, start: startSpeech, stop: stopSpeech } = useSpeechRecognition()

let voicePrefixText = ''

function toggleVoice() {
  if (isListening.value) {
    stopSpeech()
    voicePrefixText = ''
  } else {
    const existing = inputValue.value
    voicePrefixText = existing ? (existing.endsWith('\n') || existing.endsWith(' ') ? existing : existing + ' ') : ''
    startSpeech(
        (text) => {
          inputValue.value = voicePrefixText + text
          nextTick(() => {
            autoResize()
          })
        },
        (err) => {
          voicePrefixText = ''
          toast.show(err, 'warning')
        }
    )
  }
}

// ── 设置面板 ──────────────────────────────────────
const settingsOpen = ref(false)
const previewImageSrc = ref('')
const dragOver = ref(false)

// 点击聊天里的图片时，把 data URL 存到 previewImageSrc，模板中的 lightbox 会显示大图。
function openImagePreview(src: string) {
  previewImageSrc.value = src
}

// ── 会话重命名 ────────────────────────────────────
const editingConvId = ref<number | null>(null)
const editingTitleDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function startRenameConversation(id: number, currentTitle: string) {
  editingConvId.value = id
  editingTitleDraft.value = currentTitle
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

async function saveRenameConversation(id: number) {
  if (editingConvId.value !== id) return
  const newTitle = editingTitleDraft.value.trim()
  editingConvId.value = null
  if (newTitle) {
    await handleRenameConversation(id, newTitle)
  }
}

function cancelRenameConversation() {
  editingConvId.value = null
  editingTitleDraft.value = ''
}

// ── 侧边栏折叠与快捷键 ────────────────────────────
const isSidebarCollapsed = ref(localStorage.getItem('ai_chat_sidebar_collapsed') === 'true')

function toggleSidebar() {
  if (window.innerWidth <= 768) {
    sidebarOpen.value = !sidebarOpen.value
  } else {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
    localStorage.setItem('ai_chat_sidebar_collapsed', String(isSidebarCollapsed.value))
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === '[') {
    e.preventDefault()
    toggleSidebar()
  }
}

// ── 顶栏模型快速切换 ──────────────────────────────
const modelDropdownOpen = ref(false)
const claudeModels = getClaudeModels()

const quickModels = computed(() => {
  if (currentSettings.transport === 'backend') {
    const list = [currentSettings.backend.model, currentSettings.ollama.model, 'qwen2.5:7b', 'deepseek-chat', 'claude-3-5-sonnet-20241022'].filter(Boolean)
    return Array.from(new Set(list))
  }
  if (currentSettings.provider === 'ollama') {
    const list = [currentSettings.ollama.model, 'qwen2.5:7b', 'llama3:8b', 'deepseek-r1:7b', 'mistral'].filter(Boolean)
    return Array.from(new Set(list))
  }
  if (currentSettings.provider === 'openai') {
    const list = [currentSettings.openai.model, 'gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'moonshot-v1-8k'].filter(Boolean)
    return Array.from(new Set(list))
  }
  const list = [currentSettings.claude.model, ...claudeModels].filter(Boolean)
  return Array.from(new Set(list))
})

function isCurrentModel(m: string): boolean {
  if (currentSettings.transport === 'backend') {
    return (currentSettings.backend.model || currentSettings.ollama.model) === m
  }
  return currentSettings[currentSettings.provider].model === m
}

function selectQuickModel(modelName: string) {
  if (currentSettings.transport === 'backend') {
    currentSettings.backend.model = modelName
  } else {
    currentSettings[currentSettings.provider].model = modelName
  }
  persistSettings(currentSettings)
  modelDropdownOpen.value = false
  toast.show(`已切换至模型：${modelName}`, 'success')
}

function handleClickOutside(e: MouseEvent) {
  if (modelDropdownOpen.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.topbar-model-wrapper')) {
      modelDropdownOpen.value = false
    }
  }
}

// ── 消息级操作与键盘快捷键 ────────────────────────
const copiedMsgId = ref<string | null>(null)
const copiedFullMsgId = ref<string | null>(null)
const copiedUserMsgId = ref<string | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null
let copyFullTimer: ReturnType<typeof setTimeout> | null = null
let copyUserTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 智能提取“【客户回复草稿】”部分，避免将内部排障依据、chunk ID、二线判断等内部字段复制给客户
 */
function extractCustomerReplyDraft(content: string): { text: string; isDraftOnly: boolean } {
  const pattern = /(?:【客户回复草稿】|###\s*客户回复草稿|\*\*客户回复草稿\*\*|客户回复草稿[:：])\s*([\s\S]*)$/i
  const match = content.match(pattern)
  if (match && match[1]?.trim()) {
    return { text: match[1].trim(), isDraftOnly: true }
  }
  return { text: content.trim(), isDraftOnly: false }
}


const escalatedMsgIds = ref<Set<string>>(new Set())
const confirmedMsgIds = ref<Set<string>>(new Set())

function handleEditDraft(content: string) {
  const { text } = extractCustomerReplyDraft(content)
  inputValue.value = text
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      autoResize()
    }
  })
  toast.show('已将客户回复草稿载入输入框，可在下方微调修改', 'success')
}

function handleViewEvidence(msg: { ragContext?: { results?: unknown[] } }) {
  if (msg.ragContext?.results && msg.ragContext.results.length > 0) {
    toast.show(`当前回答已关联 ${msg.ragContext.results.length} 处知识库依据，已在下方展开溯源卡片`, 'success')
  } else {
    toast.show('当前回答未命中知识库检索切片，属于通用模型推理', 'warning')
  }
}

function handleEscalateTicket(msgId: string) {
  const next = new Set(escalatedMsgIds.value)
  if (next.has(msgId)) {
    next.delete(msgId)
    escalatedMsgIds.value = next
    toast.show('已取消【转二线研发】状态标记', 'success')
  } else {
    next.add(msgId)
    escalatedMsgIds.value = next
    const conf = new Set(confirmedMsgIds.value)
    conf.delete(msgId)
    confirmedMsgIds.value = conf
    toast.show('工单已标记为【转二线研发人工介入】，建议技术人员接管深入排障', 'warning')
  }
}

function handleConfirmResolution(msgId: string) {
  const next = new Set(confirmedMsgIds.value)
  if (next.has(msgId)) {
    next.delete(msgId)
    confirmedMsgIds.value = next
    toast.show('已取消【方案已确认】状态标记', 'success')
  } else {
    next.add(msgId)
    confirmedMsgIds.value = next
    const esc = new Set(escalatedMsgIds.value)
    esc.delete(msgId)
    escalatedMsgIds.value = esc
    toast.show('排障方案已标记为【方案已确认闭环】，工单处理完成', 'success')
  }
}

function handleAdoptAndCopyDraft(id: string, content: string) {
  const { text, isDraftOnly } = extractCustomerReplyDraft(content)
  navigator.clipboard.writeText(text).then(() => {
    copiedMsgId.value = id
    if (isDraftOnly) {
      toast.show('已采纳草稿并复制客户回复（已过滤内部分析）', 'success')
    } else {
      toast.show('已采纳草稿并复制回复内容', 'success')
    }
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedMsgId.value = null
    }, 2000)
  })
}

function handleCopyFullMessage(id: string, content: string) {
  navigator.clipboard.writeText(content).then(() => {
    copiedFullMsgId.value = id
    toast.show('已复制完整排障分析与回复到剪贴板', 'success')
    if (copyFullTimer) clearTimeout(copyFullTimer)
    copyFullTimer = setTimeout(() => {
      copiedFullMsgId.value = null
    }, 2000)
  })
}

function handleCopyUserMessage(id: string, content: string) {
  navigator.clipboard.writeText(content).then(() => {
    copiedUserMsgId.value = id
    toast.show('已复制工单报障内容', 'success')
    if (copyUserTimer) clearTimeout(copyUserTimer)
    copyUserTimer = setTimeout(() => {
      copiedUserMsgId.value = null
    }, 2000)
  })
}

function handleEditPrompt(content: string) {
  inputValue.value = content
  nextTick(() => {
    textareaRef.value?.focus()
    autoResize()
  })
  toast.show('已载入报障内容到输入框', 'success')
}

function handleRegenerate(id: string) {
  handleRegenerateMessage(id)
}

const isComposing = ref(false)

function handleCompositionStart() {
  isComposing.value = true
}

function handleCompositionEnd() {
  setTimeout(() => {
    isComposing.value = false
  }, 30)
}

function handleKeyEnter(e: KeyboardEvent) {
  if (e.isComposing || isComposing.value || e.keyCode === 229) {
    return
  }
  if (isStreaming.value) {
    toast.show('请等待当前回答完成，或先点击停止', 'warning')
    return
  }
  handleSend()
}

function handleKeyUp(e: KeyboardEvent) {
  if (inputValue.value.trim() === '') {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user' && messages.value[i].content) {
        e.preventDefault()
        inputValue.value = messages.value[i].content
        nextTick(() => {
          autoResize()
        })
        break
      }
    }
  }
}

// ── 快捷排障工单用例 ────────────────────────────────
const suggestionPrompts = [
  {
    title: '【用例1 预构建错误】Vite 依赖预构建失败',
    desc: '典型排障：Failed to resolve import lodash-es，检索知识库，给出排查步骤与客户回复草稿。',
    prompt: `【客户报障工单 #1024】
产品/组件：Vite 5.x
问题描述：本地执行 npm run dev 报 "[vite] Internal server error: Failed to resolve import 'lodash-es' from 'src/main.ts'. Does the file exist?"，确认已在 package.json 声明且已安装。
环境信息：Node 18.18.0, Vite 5.1.4, Windows 11
排查请求：请基于技术知识库进行问题定性、给出建议排障步骤，并生成客户回复草稿。`,
    icon: Code2,
  },
  {
    title: '【用例2 证据不足】生产环境偶现白屏',
    desc: '边界拒答：无报错日志与版本上下文，触发证据不足提示、信息追问并建议人工介入。',
    prompt: `【客户报障工单 #1025】
产品/组件：Vite 前端应用
问题描述：打包构建发布到生产环境后，部分用户反馈页面偶现白屏，刷新有时能好。
环境信息：暂无控制台报错日志，未提供浏览器版本与网络环境。
排查请求：请分析当前证据是否足以确认根因；若证据不足请明确指出信息缺口，草拟向客户追问的清单与回复草稿。`,
    icon: TriangleAlert,
  },
  {
    title: '【用例3 配置踩坑】dev server 本地代理 404',
    desc: '版本排错：server.proxy 目标路径未 rewrite 导致 404，溯源官方配置文档。',
    prompt: `【客户报障工单 #1026】
产品/组件：Vite 5.x
问题描述：在 vite.config.ts 中配置了 server.proxy 转发 '/api' 到后端 'http://localhost:8080'，但发起 fetch('/api/user') 依然 404。
配置片段：
server: {
  proxy: {
    '/api': { target: 'http://localhost:8080', changeOrigin: true }
  }
}
排查请求：请基于知识库定位代理配置常见陷阱与解决步骤，并输出可直接发送的客户回复草稿。`,
    icon: FileSearch,
  },
]

function applySuggestion(promptText: string) {
  inputValue.value = promptText
  nextTick(() => {
    textareaRef.value?.focus()
    autoResize()
  })
}

// ── 生命周期监听 ──────────────────────────────────
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('click', handleClickOutside)
  if (copyTimer) clearTimeout(copyTimer)
})

// ── 上传相关 ──────────────────────────────────────
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const knowledgeInputRef = ref<HTMLInputElement | null>(null)
const isKnowledgeUploading = ref(false)
const knowledgeUploadLabel = ref('')
const knowledgeUploadPercent = ref(0)

function handleImageSelect(e: Event) {
  // 文件 input 选中图片后，把 FileList 转成数组交给 useChatView 校验和读取。
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addImages(Array.from(input.files))
    input.value = ''
  }
}

function handleFileSelect(e: Event) {
  // 文本文件和代码文件走 addFiles，内容会被读取后随消息保存。
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addFiles(Array.from(input.files))
    input.value = ''
  }
}

async function handleKnowledgeFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!files.length) return

  isKnowledgeUploading.value = true
  knowledgeUploadLabel.value = '准备上传到知识库'
  knowledgeUploadPercent.value = 0
  let successCount = 0
  let totalChunks = 0
  let totalChars = 0
  const failures: string[] = []

  try {
    for (const file of files) {
      knowledgeUploadLabel.value = file.name
      knowledgeUploadPercent.value = 0
      const result = await uploadKnowledgeFile(file, {
        onProgress: progress => updateKnowledgeUploadProgress(file.name, progress),
      })
      if (result.ok) {
        successCount++
        totalChunks += result.chunkCount ?? 0
        totalChars += result.charCount ?? 0
      } else {
        failures.push(`${result.fileName}: ${result.message || '上传失败'}`)
      }
    }

    if (successCount > 0) {
      const details = totalChunks > 0
          ? `，生成 ${totalChunks} 个片段，${totalChars} 字`
          : ''
      toast.show(`已上传 ${successCount} 个文件到知识库${details}`, 'success')
    }
    if (failures.length > 0) {
      toast.show(failures[0], 'error', 7000)
    }
  } finally {
    isKnowledgeUploading.value = false
  }
}

function updateKnowledgeUploadProgress(fileName: string, progress: UploadProgress) {
  knowledgeUploadLabel.value = `${fileName} · ${progress.message}`
  knowledgeUploadPercent.value = progress.percent
}

function formatFileSize(bytes: number): string {
  // UI 展示用，把字节数转成 B/KB/MB。
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handlePaste(e: ClipboardEvent) {
  // 支持直接粘贴截图或图片文件。
  const items = e.clipboardData?.items
  if (!items) return
  const imageFiles: File[] = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }
  if (imageFiles.length) {
    e.preventDefault()
    addImages(imageFiles)
  }
}

function handleDrop(e: DragEvent) {
  // 支持把图片和文本/代码文件拖到输入框区域上传。
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  const droppedFiles = Array.from(files)
  const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'))
  const textFiles = droppedFiles.filter(f => !f.type.startsWith('image/'))
  if (imageFiles.length) addImages(imageFiles)
  if (textFiles.length) addFiles(textFiles)
}

// ── Textarea 自动高度 ─────────────────────────────
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
  // textarea 根据内容自动增高，但最多 200px，避免输入框占满屏幕。
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// 发送后重置高度
watch(inputValue, (val) => {
  if (!val) {
    const el = textareaRef.value
    if (el) el.style.height = 'auto'
  }
})

</script>

<style src="../styles/chat.css" />
