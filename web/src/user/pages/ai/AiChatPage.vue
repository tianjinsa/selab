<template>
  <section class="surface ai-layout">
    <aside class="conversation-list">
      <div style="padding: 14px;">
        <n-button type="primary" block @click="newSession">新咨询</n-button>
      </div>
      <div v-for="item in sessions" :key="item.id" class="conversation-item" :class="{ active: item.id === sessionId }" @click="selectSession(item.id)">
        <strong>{{ item.title }}</strong>
        <div class="muted">{{ item.status }}</div>
      </div>
      <div v-if="!sessions.length" class="empty-state">还没有 AI 会话</div>
    </aside>

    <main class="message-board">
      <div class="message-stream" ref="streamRef">
        <div v-for="item in messages" :key="item.id" class="message-bubble" :class="{ mine: item.role === 'user' }">
          <div style="white-space: pre-wrap;">{{ item.content }}</div>
          <div v-if="item.cards?.length" class="grid" style="margin-top: 10px;">
            <div v-for="card in item.cards" :key="`${card.type}-${card.id || card.title}`" class="business-card">
              <div class="business-card-title">
                <span>{{ card.title }}</span>
                <n-tag size="small">{{ card.type }}</n-tag>
              </div>
              <p v-if="card.reward">建议酬金：￥{{ card.reward }}</p>
              <p v-if="card.price">价格：￥{{ card.price }}</p>
              <n-button v-if="card.type === 'task'" size="small" @click="$router.push(`/tasks/${card.id}`)">查看任务</n-button>
              <n-button v-if="card.type === 'product'" size="small" @click="$router.push(`/market/${card.id}`)">查看商品</n-button>
              <n-button v-if="card.type === 'post'" size="small" @click="$router.push(`/forum/${card.id}`)">查看帖子</n-button>
              <n-button v-if="card.type === 'task_draft'" size="small" type="primary" @click="$router.push('/tasks/new')">去编辑发布</n-button>
            </div>
          </div>
          <small class="muted">{{ item.status }}</small>
        </div>
        <div v-if="!messages.length" class="empty-state">可以询问校园办事、任务、二手商品、社区帖子或平台使用方式</div>
      </div>
      <div class="message-composer">
        <n-input v-model:value="draft" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" placeholder="向校园智能体提问" @keyup.enter.exact.prevent="send" />
        <n-button v-if="running" secondary type="warning" @click="stop">停止</n-button>
        <n-button v-else type="primary" :disabled="!draft.trim()" @click="send">发送</n-button>
      </div>
    </main>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { request, websocketUrl } from '../../../shared/http.js';
import { userSession as session } from '../../session.js';

const notice = useMessage();
const sessions = ref([]);
const sessionId = ref('');
const messages = ref([]);
const draft = ref('');
const running = ref(false);
const streamRef = ref(null);
let socket = null;

onMounted(async () => {
  await loadSessions();
  if (sessions.value[0]) await selectSession(sessions.value[0].id);
  connectSocket();
});

onBeforeUnmount(() => {
  if (socket) socket.close();
});

async function loadSessions() {
  sessions.value = (await request('/api/ai/sessions')).sessions;
}

async function newSession() {
  const data = await request('/api/ai/sessions', { method: 'POST', body: { title: '新的咨询' } });
  await loadSessions();
  await selectSession(data.session.id);
}

async function selectSession(id) {
  sessionId.value = id;
  const data = await request(`/api/ai/sessions/${id}`);
  messages.value = data.messages;
  running.value = data.session.status === 'running';
  scrollBottom();
}

function connectSocket() {
  socket = new WebSocket(websocketUrl(session.token));
  socket.onmessage = async (event) => {
    const packet = JSON.parse(event.data);
    if (packet.event === 'ai.message.accepted') {
      sessionId.value = packet.payload.sessionId;
      await loadSessions();
      await selectSession(sessionId.value);
    }
    if (packet.event === 'ai.run.started') {
      running.value = true;
    }
    if (packet.event === 'ai.token') {
      const target = messages.value.find((item) => item.id === packet.payload.messageId);
      if (target) target.content += packet.payload.delta;
      scrollBottom();
    }
    if (packet.event === 'ai.cards') {
      const target = messages.value.find((item) => item.id === packet.payload.messageId);
      if (target) target.cards = packet.payload.cards;
    }
    if (packet.event === 'ai.run.done' || packet.event === 'ai.run.error') {
      running.value = false;
      if (sessionId.value) await selectSession(sessionId.value);
    }
    if (packet.event === 'error') notice.error(packet.payload.message);
  };
}

async function send() {
  const content = draft.value.trim();
  if (!content) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    notice.error('WebSocket 未连接，请稍后重试');
    return;
  }
  draft.value = '';
  socket.send(JSON.stringify({ event: 'ai.message.send', payload: { sessionId: sessionId.value, content } }));
}

async function stop() {
  if (!sessionId.value) return;
  socket?.send(JSON.stringify({ event: 'ai.run.cancel', payload: { sessionId: sessionId.value } }));
  await request(`/api/ai/sessions/${sessionId.value}/cancel`, { method: 'POST' }).catch(() => {});
  running.value = false;
}

function scrollBottom() {
  nextTick(() => {
    if (streamRef.value) streamRef.value.scrollTop = streamRef.value.scrollHeight;
  });
}
</script>
