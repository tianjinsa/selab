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
      <div v-for="conversation in conversations" :key="conversation.id" class="conversation-item" :class="{ active: activeId === conversation.id }" @click="selectConversation(conversation.id)">
        <n-space justify="space-between">
          <strong>{{ conversation.peer?.nickname || '同学' }}</strong>
          <n-badge v-if="conversation.unreadCount" :value="conversation.unreadCount" />
        </n-space>
        <div class="muted" style="margin-top: 4px;">{{ conversation.lastMessage?.content || '还没有消息' }}</div>
      </div>
      <div v-if="!conversations.length" class="empty-state">搜索同学后开始第一段私信</div>
    </aside>

    <main class="message-board">
      <div v-if="!activeId" class="empty-state">选择一个会话查看消息</div>
      <template v-else>
        <div class="message-stream" ref="streamRef">
          <div v-for="item in messages" :key="item.id" class="message-bubble" :class="{ mine: item.senderId === session.user?.id }">
            <div>{{ item.content }}</div>
            <small class="muted">{{ formatTime(item.createdAt) }}</small>
          </div>
        </div>
        <div class="message-composer">
          <n-input v-model:value="draft" placeholder="输入消息，Enter 发送" @keyup.enter="send" />
          <n-button type="primary" :disabled="!draft.trim()" @click="send">
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
import { Send } from '@lucide/vue';
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
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      event: 'chat.message.send',
      payload: { conversationId: activeId.value, content, type: 'text' }
    }));
  } else {
    await request(`/api/conversations/${activeId.value}/messages`, { method: 'POST', body: { content, type: 'text' } });
  }
}

async function toggleMute() {
  await request(`/api/conversations/${activeId.value}/mute`, {
    method: 'PATCH',
    body: { muted: !activeConversationMuted.value }
  });
  await loadConversations();
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
</script>
