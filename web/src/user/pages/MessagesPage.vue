<template>
  <section class="surface chat-layout">
    <aside class="conversation-list">
      <div style="padding: 14px;">
        <n-input v-model:value="keyword" placeholder="搜索同学：昵称 / 学号 / 手机号" clearable @keyup.enter="searchUsers" />
        <n-button block secondary style="margin-top: 8px;" @click="searchUsers">查找并发起私信</n-button>
      </div>
      <div v-if="searchResults.length" style="padding: 0 14px 12px;">
        <n-alert type="info" :show-icon="false">
          <div v-for="user in searchResults" :key="user.id" style="display: flex; justify-content: space-between; align-items: center; margin: 6px 0;">
            <span>{{ user.nickname }} · {{ user.studentId }}</span>
            <n-button size="small" @click="startConversation(user.id)">私信</n-button>
          </div>
        </n-alert>
      </div>
      <transition-group name="list-flow" tag="div" class="conversation-scroll" appear>
        <div v-for="conversation in conversations" :key="conversation.id" class="conversation-item" :class="{ active: activeId === conversation.id }" @click="selectConversation(conversation.id)">
          <n-space justify="space-between">
            <strong>{{ conversation.peer?.nickname || '同学' }}</strong>
            <n-badge v-if="conversation.unreadCount" :value="conversation.unreadCount" />
          </n-space>
          <div class="muted" style="margin-top: 4px;">{{ conversationPreview(conversation.lastMessage) }}</div>
        </div>
      </transition-group>
      <div v-if="!conversations.length" class="empty-state">搜索同学后开始第一段私信</div>
    </aside>

    <main class="message-board">
      <div v-if="!activeId" class="empty-state">选择一个会话查看消息</div>
      <template v-else>
        <div class="message-stream" ref="streamRef">
          <transition-group name="message-flow" tag="div" class="message-flow-list" appear>
          <div v-for="item in messages" :key="item.id" class="message-bubble" :class="{ mine: item.senderId === session.user?.id }">
            <div v-if="item.card" class="business-card">
              <div class="business-card-title">
                <span>{{ item.card.title }}</span>
                <n-tag size="small" :type="cardStatusType(item.card.status)">{{ cardStatusText(item.card.status) }}</n-tag>
              </div>
              <p style="margin: 8px 0 4px;">{{ item.card.taskTitle || item.card.productTitle || item.content }}</p>
              <p class="muted" style="margin: 0;">{{ cardActorLabel(item.card) }}：{{ item.card.applicantName || item.card.buyerName }} · 信用分 {{ item.card.applicantCredit || item.card.buyerCredit }}</p>
              <p class="muted" style="margin: 4px 0 0;">金额：￥{{ item.card.reward || item.card.price }} · 有效期至 {{ formatTime(item.card.expiresAt) }}</p>
              <n-space v-if="canOperateTaskCard(item.card)" style="margin-top: 10px;">
                <n-button size="small" type="primary" @click="operateTaskCard(item.card, 'accept')">同意</n-button>
                <n-button size="small" secondary @click="operateTaskCard(item.card, 'reject')">拒绝</n-button>
              </n-space>
              <n-space v-if="canOperateProductCard(item.card)" style="margin-top: 10px;">
                <n-button size="small" type="primary" @click="operateProductCard(item.card, 'accept')">同意出售</n-button>
                <n-button size="small" secondary @click="operateProductCard(item.card, 'reject')">拒绝</n-button>
              </n-space>
              <p v-if="item.card.expiredReason" class="muted" style="margin: 8px 0 0;">{{ item.card.expiredReason }}</p>
            </div>
            <div v-else-if="item.type === 'image' && messageAttachment(item)" class="chat-attachment image">
              <a :href="messageAttachment(item).url" target="_blank" rel="noreferrer">
                <img :src="messageAttachment(item).url" :alt="messageAttachment(item).name || '私信图片'" />
              </a>
              <p v-if="item.content">{{ item.content }}</p>
            </div>
            <a v-else-if="messageAttachment(item)" class="chat-attachment file" :href="messageAttachment(item).url" target="_blank" rel="noreferrer">
              <FileText :size="22" />
              <span>
                <strong>{{ messageAttachment(item).name || '附件' }}</strong>
                <small>{{ formatFileSize(messageAttachment(item).size) }}</small>
              </span>
              <Download :size="17" />
            </a>
            <div v-else>{{ item.content }}</div>
            <small class="muted">{{ formatTime(item.createdAt) }}</small>
          </div>
          </transition-group>
        </div>
        <div class="message-composer">
          <div class="composer-uploads">
            <n-upload
              accept="image/jpeg,image/png,image/webp"
              :show-file-list="false"
              :custom-request="uploadAndSendAttachment"
            >
              <n-button secondary circle :loading="uploadingAttachment" :disabled="!activeId || uploadingAttachment">
                <template #icon><ImagePlus :size="16" /></template>
              </n-button>
            </n-upload>
            <n-upload
              accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
              :show-file-list="false"
              :custom-request="uploadAndSendAttachment"
            >
              <n-button secondary circle :loading="uploadingAttachment" :disabled="!activeId || uploadingAttachment">
                <template #icon><Paperclip :size="16" /></template>
              </n-button>
            </n-upload>
          </div>
          <n-input v-model:value="draft" placeholder="输入消息，Enter 发送" @keyup.enter="send" />
          <n-button type="primary" :disabled="!draft.trim() || uploadingAttachment" @click="send">
            <template #icon><Send :size="16" /></template>
            发送
          </n-button>
          <n-button secondary @click="toggleMute">{{ activeConversationMuted ? '取消免打扰' : '免打扰' }}</n-button>
        </div>
      </template>
    </main>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { Download, FileText, ImagePlus, Paperclip, Send } from '@lucide/vue';
import { request, websocketUrl } from '../../shared/http.js';
import { loadUserSession, userSession as session } from '../session.js';

const route = useRoute();
const router = useRouter();
const notice = useMessage();
const conversations = ref([]);
const messages = ref([]);
const activeId = ref(route.params.id || '');
const draft = ref('');
const keyword = ref('');
const searchResults = ref([]);
const streamRef = ref(null);
const uploadingAttachment = ref(false);
let socket = null;

const activeConversation = computed(() => conversations.value.find((item) => item.id === activeId.value));
const activeConversationMuted = computed(() => activeConversation.value?.mutedBy?.includes(session.user?.id));

onMounted(async () => {
  await loadUserSession();
  await loadConversations();
  if (activeId.value) await selectConversation(activeId.value);
  connectSocket();
});

onBeforeUnmount(() => {
  if (socket) socket.close();
});

async function loadConversations() {
  const data = await request('/api/conversations');
  conversations.value = data.conversations;
}

async function selectConversation(id) {
  activeId.value = id;
  router.replace(`/messages/${id}`);
  const data = await request(`/api/conversations/${id}/messages`);
  messages.value = data.messages;
  await request(`/api/conversations/${id}/read`, { method: 'PATCH' });
  await loadConversations();
  scrollBottom();
}

async function searchUsers() {
  if (!keyword.value.trim()) {
    searchResults.value = [];
    return;
  }
  const data = await request(`/api/users/search?q=${encodeURIComponent(keyword.value.trim())}`);
  searchResults.value = data.users;
}

async function startConversation(peerId) {
  const data = await request(`/api/conversations/by-user/${peerId}`, { method: 'POST' });
  searchResults.value = [];
  keyword.value = '';
  await loadConversations();
  await selectConversation(data.conversation.id);
}

async function send() {
  const content = draft.value.trim();
  if (!content || !activeId.value) return;
  draft.value = '';
  await sendPayload({ content, type: 'text' });
}

async function sendPayload(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      event: 'chat.message.send',
      payload: { conversationId: activeId.value, ...payload }
    }));
  } else {
    const data = await request(`/api/conversations/${activeId.value}/messages`, { method: 'POST', body: payload });
    messages.value.push(data.message);
    await loadConversations();
    scrollBottom();
  }
}

async function uploadAndSendAttachment({ file, onFinish, onError }) {
  if (!activeId.value) {
    notice.warning('请先选择一个会话');
    onError();
    return;
  }
  uploadingAttachment.value = true;
  try {
    const body = new FormData();
    body.append('file', file.file);
    const data = await request('/api/files/upload-attachment', { method: 'POST', body });
    const asset = data.asset || {};
    const kind = asset.kind === 'image' ? 'image' : 'file';
    const attachment = {
      url: data.url,
      kind,
      name: asset.originalName || file.name || (kind === 'image' ? '图片' : '附件'),
      mimeType: asset.mimeType || file.file?.type || '',
      size: asset.size || file.file?.size || 0
    };
    await sendPayload({ content: '', type: kind, attachment });
    notice.success(kind === 'image' ? '图片已发送' : '文件已发送');
    onFinish();
  } catch (error) {
    notice.error(error.message || '上传失败');
    onError();
  } finally {
    uploadingAttachment.value = false;
  }
}

async function toggleMute() {
  const nextMuted = !activeConversationMuted.value;
  await request(`/api/conversations/${activeId.value}/mute`, {
    method: 'PATCH',
    body: { muted: nextMuted }
  });
  await loadConversations();
  notice.success(nextMuted ? '已开启免打扰' : '已取消免打扰');
}

function connectSocket() {
  socket = new WebSocket(websocketUrl(session.token));
  socket.onmessage = async (event) => {
    const packet = JSON.parse(event.data);
    if (packet.event === 'chat.message.new') {
      if (packet.payload.conversationId === activeId.value) {
        messages.value.push(packet.payload.message);
        await request(`/api/conversations/${activeId.value}/read`, { method: 'PATCH' }).catch(() => {});
        scrollBottom();
      }
      await loadConversations();
    }
    if (packet.event === 'card.updated') {
      const target = messages.value.find((item) => item.id === packet.payload.messageId);
      if (target) target.card = packet.payload.card;
      await loadConversations();
    }
    if (packet.event === 'notification.unread_count') {
      session.unreadCount = packet.payload.count;
    }
    if (packet.event === 'error') {
      notice.error(packet.payload.message);
    }
  };
}

function scrollBottom() {
  nextTick(() => {
    if (streamRef.value) streamRef.value.scrollTop = streamRef.value.scrollHeight;
  });
}

function formatTime(value) {
  return new Date(value).toLocaleString();
}

function messageAttachment(message) {
  if (message?.attachment?.url) return message.attachment;
  if (message?.imageUrl) {
    return {
      url: message.imageUrl,
      kind: 'image',
      name: '图片',
      mimeType: '',
      size: 0
    };
  }
  return null;
}

function conversationPreview(message) {
  if (!message) return '还没有消息';
  if (message.content) return message.content;
  const attachment = messageAttachment(message);
  if (!attachment) return '还没有消息';
  return attachment.kind === 'image'
    ? `[图片] ${attachment.name || ''}`.trim()
    : `[文件] ${attachment.name || '附件'}`;
}

function formatFileSize(size = 0) {
  const value = Number(size || 0);
  if (!value) return '未知大小';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function cardStatusText(status) {
  return {
    pending: '待处理',
    accepted: '已同意',
    rejected: '已拒绝',
    expired: '已失效'
  }[status] || status;
}

function cardStatusType(status) {
  return {
    pending: 'warning',
    accepted: 'success',
    rejected: 'error',
    expired: 'default'
  }[status] || 'default';
}

function canOperateTaskCard(card) {
  return card.type === 'task_application'
    && card.publisherId === session.user?.id
    && card.status === 'pending';
}

function canOperateProductCard(card) {
  return card.type === 'product_purchase'
    && card.sellerId === session.user?.id
    && card.status === 'pending';
}

function cardActorLabel(card) {
  return card.type === 'product_purchase' ? '买家' : '申请人';
}

async function operateTaskCard(card, action) {
  const path = action === 'accept'
    ? `/api/tasks/applications/${card.applicationId}/accept`
    : `/api/tasks/applications/${card.applicationId}/reject`;
  await request(path, { method: 'POST' });
  notice.success(action === 'accept' ? '已同意该任务申请' : '已拒绝该任务申请');
  if (activeId.value) await selectConversation(activeId.value);
}

async function operateProductCard(card, action) {
  const path = action === 'accept'
    ? `/api/market/orders/${card.orderId}/accept`
    : `/api/market/orders/${card.orderId}/reject`;
  await request(path, { method: 'POST' });
  notice.success(action === 'accept' ? '已同意出售，等待买家支付' : '已拒绝购买申请');
  if (activeId.value) await selectConversation(activeId.value);
}
</script>
