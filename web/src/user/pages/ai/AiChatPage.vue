<template>
  <section class="surface ai-layout">
    <aside class="conversation-list ai-conversation-list">
      <div class="conversation-toolbar">
        <n-button type="primary" block @click="newSession">
          <template #icon><Plus :size="16" /></template>
          新咨询
        </n-button>
      </div>

      <transition-group name="list-flow" tag="div" class="conversation-scroll" appear>
        <article
          v-for="item in sessions"
          :key="item.id"
          class="conversation-item"
          :class="{ active: item.id === sessionId }"
          @click="selectSession(item.id)"
        >
          <template v-if="renamingSessionId === item.id">
            <n-input
              v-model:value="renameTitle"
              size="small"
              maxlength="40"
              @click.stop
              @keyup.enter.stop="saveRename(item)"
            />
            <div class="conversation-actions">
              <n-button quaternary circle size="small" @click.stop="saveRename(item)">
                <template #icon><Check :size="15" /></template>
              </n-button>
              <n-button quaternary circle size="small" @click.stop="cancelRename">
                <template #icon><X :size="15" /></template>
              </n-button>
            </div>
          </template>
          <template v-else>
            <div class="conversation-main">
              <strong>{{ item.title || '新的咨询' }}</strong>
              <div class="muted">{{ sessionStatusText(item.status) }}</div>
            </div>
            <div class="conversation-actions">
              <n-button quaternary circle size="small" title="重命名" @click.stop="beginRename(item)">
                <template #icon><Edit3 :size="15" /></template>
              </n-button>
              <n-button quaternary circle size="small" type="error" title="删除" @click.stop="confirmDeleteSession(item)">
                <template #icon><Trash2 :size="15" /></template>
              </n-button>
            </div>
          </template>
        </article>
        <div v-if="!sessions.length" key="empty" class="empty-state compact">还没有 AI 会话</div>
      </transition-group>
    </aside>

    <main class="message-board ai-message-board">
      <div class="message-stream ai-message-stream" ref="streamRef">
        <transition-group name="message-flow" tag="div" class="message-flow-list" appear>
          <div
            v-for="item in messages"
            :key="item.id"
            class="message-bubble"
            :class="{ mine: item.role === 'user', assistant: item.role === 'assistant' }"
          >
          <div class="message-meta">
            <span>{{ item.role === 'user' ? '我' : '校园智能体' }}</span>
            <small class="muted">
              {{ messageStatusText(item.status) }}
              <template v-if="item.editedAt"> · 已编辑</template>
            </small>
          </div>

          <template v-if="editingMessageId === item.id">
            <n-input
              v-model:value="editContent"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 8 }"
              @keyup.esc="cancelEdit"
            />
            <div class="message-actions editing-actions">
              <n-button size="small" type="primary" :disabled="!editContent.trim() || running" @click="saveEdit(item, true)">
                保存并重新生成
              </n-button>
              <n-button size="small" secondary :disabled="!editContent.trim() || running" @click="saveEdit(item, false)">
                仅保存
              </n-button>
              <n-button size="small" quaternary @click="cancelEdit">取消</n-button>
            </div>
          </template>

          <template v-else>
            <div v-if="item.role === 'assistant' && item.reasoningContent" class="reasoning-panel">
              <div class="reasoning-heading">
                <Brain :size="15" />
                <span>思考过程</span>
              </div>
              <div class="reasoning-content">{{ item.reasoningContent }}</div>
            </div>

            <div v-if="item.role === 'assistant' && item.toolEvents?.length" class="tool-timeline">
              <div v-for="event in item.toolEvents" :key="event.id" class="tool-event" :class="event.status">
                <Wrench :size="15" />
                <div>
                  <strong>{{ event.displayName || event.toolName }}</strong>
                  <span>{{ toolStatusText(event.status) }}</span>
                  <small v-if="event.summary">{{ event.summary }}</small>
                </div>
              </div>
            </div>

            <div
              v-if="item.content"
              class="markdown-body"
              v-html="renderMarkdown(item.content)"
            />
            <div v-else-if="item.role === 'assistant' && item.status === 'running'" class="muted pending-text">
              正在组织回答...
            </div>

            <div v-if="item.cards?.length" class="message-card-grid">
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

            <div class="message-actions">
              <n-button v-if="item.role === 'user'" size="tiny" quaternary :disabled="running" @click="beginEdit(item)">
                <template #icon><Edit3 :size="14" /></template>
                修改
              </n-button>
              <n-button v-if="item.role === 'user'" size="tiny" quaternary :disabled="running" @click="regenerate(item)">
                <template #icon><RefreshCcw :size="14" /></template>
                重新请求
              </n-button>
              <n-button v-if="item.role === 'assistant'" size="tiny" quaternary :disabled="running" @click="regenerate(item)">
                <template #icon><RefreshCcw :size="14" /></template>
                重新生成
              </n-button>
            </div>
          </template>
          </div>
        </transition-group>

        <div v-if="!messages.length" class="empty-state">
          <Bot :size="34" />
          <span>可以询问校园办事、任务、二手商品、社区帖子或平台使用方式</span>
        </div>
      </div>

      <div class="message-composer ai-composer">
        <n-input
          v-model:value="draft"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          placeholder="向校园智能体提问，Shift + Enter 换行"
          @keyup.enter.exact.prevent="send"
        />
        <n-button v-if="running" secondary type="warning" @click="stop">停止</n-button>
        <n-button v-else type="primary" :disabled="!draft.trim()" @click="send">
          <template #icon><Send :size="16" /></template>
          发送
        </n-button>
      </div>
    </main>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { Bot, Brain, Check, Edit3, Plus, RefreshCcw, Send, Trash2, Wrench, X } from '@lucide/vue';
import { request, websocketUrl } from '../../../shared/http.js';
import { userSession as session } from '../../session.js';

const notice = useMessage();
const dialog = useDialog();
const sessions = ref([]);
const sessionId = ref('');
const messages = ref([]);
const draft = ref('');
const running = ref(false);
const streamRef = ref(null);
const renamingSessionId = ref('');
const renameTitle = ref('');
const editingMessageId = ref('');
const editContent = ref('');
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
  messages.value = data.messages.map(normalizeMessage);
  running.value = data.session.status === 'running';
  cancelEdit();
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
      if (packet.payload.sessionId) sessionId.value = packet.payload.sessionId;
    }
    if (packet.event === 'ai.token') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId);
      if (target) target.content = `${target.content || ''}${packet.payload.delta}`;
      scrollBottom();
    }
    if (packet.event === 'ai.reasoning') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId);
      if (target) target.reasoningContent = `${target.reasoningContent || ''}${packet.payload.delta}`;
      scrollBottom();
    }
    if (packet.event === 'ai.tool_call') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId);
      if (target) mergeToolEvent(target, packet.payload.toolEvent);
      scrollBottom();
    }
    if (packet.event === 'ai.cards') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId);
      if (target) target.cards = packet.payload.cards;
    }
    if (packet.event === 'ai.run.done' || packet.event === 'ai.run.error') {
      running.value = false;
      await loadSessions();
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
  await loadSessions();
  notice.success('已停止生成');
}

function beginRename(item) {
  renamingSessionId.value = item.id;
  renameTitle.value = item.title || '';
}

function cancelRename() {
  renamingSessionId.value = '';
  renameTitle.value = '';
}

async function saveRename(item) {
  const title = renameTitle.value.trim();
  if (!title) {
    notice.warning('会话标题不能为空');
    return;
  }
  await request(`/api/ai/sessions/${item.id}`, { method: 'PATCH', body: { title } });
  cancelRename();
  await loadSessions();
  notice.success('会话已重命名');
}

function confirmDeleteSession(item) {
  dialog.warning({
    title: '删除会话',
    content: `确认删除「${item.title || '新的咨询'}」？历史消息会一并删除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/ai/sessions/${item.id}`, { method: 'DELETE' });
      if (sessionId.value === item.id) {
        sessionId.value = '';
        messages.value = [];
      }
      await loadSessions();
      if (!sessionId.value && sessions.value[0]) await selectSession(sessions.value[0].id);
      notice.success('会话已删除');
    }
  });
}

function beginEdit(item) {
  editingMessageId.value = item.id;
  editContent.value = item.content || '';
}

function cancelEdit() {
  editingMessageId.value = '';
  editContent.value = '';
}

async function saveEdit(item, shouldRegenerate) {
  const content = editContent.value.trim();
  if (!content) {
    notice.warning('消息内容不能为空');
    return;
  }
  await request(`/api/ai/sessions/${sessionId.value}/messages/${item.id}`, {
    method: 'PATCH',
    body: { content }
  });
  cancelEdit();
  if (shouldRegenerate) {
    notice.success('已保存修改，正在重新生成');
    await regenerate(item, true);
  } else {
    await selectSession(sessionId.value);
    notice.success('消息已保存');
  }
}

async function regenerate(item, silent = false) {
  if (!sessionId.value || running.value) return;
  running.value = true;
  await request(`/api/ai/sessions/${sessionId.value}/regenerate`, {
    method: 'POST',
    body: { messageId: item.id }
  });
  if (!silent) notice.success('已开始重新生成');
  await loadSessions();
  await selectSession(sessionId.value);
}

function normalizeMessage(item) {
  return {
    ...item,
    content: item.content || '',
    cards: Array.isArray(item.cards) ? item.cards : [],
    toolEvents: Array.isArray(item.toolEvents) ? item.toolEvents : [],
    reasoningContent: item.reasoningContent || ''
  };
}

function mergeToolEvent(message, event) {
  if (!event) return;
  const events = Array.isArray(message.toolEvents) ? [...message.toolEvents] : [];
  const index = events.findIndex((item) => item.id === event.id);
  if (index >= 0) events.splice(index, 1, { ...events[index], ...event });
  else events.push(event);
  message.toolEvents = events;
}

function scrollBottom() {
  nextTick(() => {
    if (streamRef.value) streamRef.value.scrollTop = streamRef.value.scrollHeight;
  });
}

function sessionStatusText(status) {
  return {
    running: '生成中',
    idle: '空闲',
    stopped: '已停止',
    error: '出错'
  }[status] || status || '空闲';
}

function messageStatusText(status) {
  return {
    running: '生成中',
    done: '完成',
    stopped: '已停止',
    error: '出错'
  }[status] || status || '';
}

function toolStatusText(status) {
  return {
    calling: '调用中',
    done: '已完成',
    error: '失败'
  }[status] || status || '调用中';
}

function renderMarkdown(content = '') {
  const lines = String(content).split(/\r?\n/);
  const html = [];
  let inCode = false;
  let inList = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      if (inCode) html.push('</code></pre>');
      else html.push('<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }
    if (!line.trim()) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push('<br>');
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      const level = Math.min(3, heading[1].length + 2);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (line.trim().startsWith('>')) {
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  if (inCode) html.push('</code></pre>');
  if (inList) html.push('</ul>');
  return html.join('');
}

function inlineMarkdown(value = '') {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
</script>
