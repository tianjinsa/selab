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
          <div v-if="messageMetaText(item)" class="message-meta">
            <small class="muted">
              {{ messageMetaText(item) }}
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
            <div v-if="item.role === 'assistant' && reasoningBlocks(item).length" class="reasoning-panel">
              <div class="reasoning-heading">
                <Brain :size="15" />
                <span>思考过程</span>
              </div>
              <div class="reasoning-content">
                <template v-for="block in reasoningBlocks(item)" :key="block.id">
                  <div v-if="block.type === 'text'" class="reasoning-text markdown-body" v-html="renderMarkdown(block.text)" />
                  <div v-else-if="block.tool" class="tool-event inline-tool-event" :class="block.tool.status">
                    <Wrench :size="15" />
                    <div>
                      <strong>{{ block.tool.displayName || block.tool.toolName }}</strong>
                      <span>{{ toolStatusText(block.tool.status) }}</span>
                      <small v-if="block.tool.summary">{{ block.tool.summary }}</small>
                      <small v-if="block.tool.error" class="tool-error-text">{{ block.tool.error }}</small>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div
              v-if="contentBlocks(item).length"
              class="assistant-content-flow"
            >
              <template v-for="block in contentBlocks(item)" :key="block.id">
                <div v-if="block.type === 'text'" class="markdown-body" v-html="renderMarkdown(block.text)" />
                <div v-else-if="block.tool" class="tool-event inline-tool-event" :class="block.tool.status">
                  <Wrench :size="15" />
                  <div>
                    <strong>{{ block.tool.displayName || block.tool.toolName }}</strong>
                    <span>{{ toolStatusText(block.tool.status) }}</span>
                    <small v-if="block.tool.summary">{{ block.tool.summary }}</small>
                    <small v-if="block.tool.error" class="tool-error-text">{{ block.tool.error }}</small>
                  </div>
                </div>
              </template>
            </div>
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
                <n-button v-if="card.type === 'task_draft'" size="small" type="primary" @click="openTaskDraft(card)">在此发布任务</n-button>
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

    <n-modal v-model:show="taskDraftVisible" preset="card" class="task-draft-modal" title="发布 AI 生成任务" :bordered="false">
      <template v-if="publishedTask">
        <div class="task-publish-result">
          <Check :size="34" />
          <div>
            <h3>{{ publishedTask.title }}</h3>
            <p class="muted">任务已完成模拟支付并发布到任务市场。</p>
          </div>
          <n-space>
            <n-button secondary @click="taskDraftVisible = false">继续聊天</n-button>
            <n-button type="primary" @click="$router.push(`/tasks/${publishedTask.id}`)">查看任务</n-button>
          </n-space>
        </div>
      </template>
      <n-form v-else :model="taskDraftForm" label-placement="top">
        <n-grid :cols="2" :x-gap="14" responsive="screen">
          <n-form-item-gi label="任务标题">
            <n-input v-model:value="taskDraftForm.title" maxlength="40" show-count />
          </n-form-item-gi>
          <n-form-item-gi label="任务类型">
            <n-select v-model:value="taskDraftForm.category" :options="taskCategoryOptions" />
          </n-form-item-gi>
          <n-form-item-gi label="地点 / 校区">
            <n-select v-model:value="taskDraftForm.campusArea" :options="taskAreaOptions" />
          </n-form-item-gi>
          <n-form-item-gi label="酬金">
            <n-input-number v-model:value="taskDraftForm.reward" :min="taskMeta.rewardMin" :max="taskMeta.rewardMax" />
          </n-form-item-gi>
          <n-form-item-gi label="截止时间">
            <n-date-picker v-model:value="taskDraftForm.deadlineValue" type="datetime" clearable />
          </n-form-item-gi>
          <n-form-item-gi label="联系方式补充">
            <n-input v-model:value="taskDraftForm.contactNote" placeholder="例如：到楼下后私信我" />
          </n-form-item-gi>
        </n-grid>
        <n-form-item label="任务详情">
          <n-input v-model:value="taskDraftForm.detail" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" />
        </n-form-item>
        <n-form-item label="交付要求">
          <n-input v-model:value="taskDraftForm.deliveryRequirement" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" />
        </n-form-item>
        <n-alert type="info" :show-icon="false" style="margin-bottom: 14px;">
          发布会在当前页面完成模拟支付，发布后可在任务市场查看。
        </n-alert>
        <n-space justify="end">
          <n-button secondary @click="taskDraftVisible = false">取消</n-button>
          <n-button type="primary" :loading="taskDraftSubmitting" @click="publishTaskDraft">确认发布并模拟支付</n-button>
        </n-space>
      </n-form>
    </n-modal>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
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
const taskDraftVisible = ref(false);
const taskDraftSubmitting = ref(false);
const publishedTask = ref(null);
const taskMeta = ref({ categories: [], areas: [], rewardMin: 1, rewardMax: 500 });
const taskDraftForm = reactive({
  title: '',
  category: '',
  campusArea: '',
  reward: 10,
  deadlineValue: Date.now() + 24 * 60 * 60 * 1000,
  detail: '',
  deliveryRequirement: '',
  contactNote: ''
});
let socket = null;

const taskCategoryOptions = computed(() => taskMeta.value.categories.map((item) => ({ label: item, value: item })));
const taskAreaOptions = computed(() => taskMeta.value.areas.map((item) => ({ label: item, value: item })));

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
      const target = ensureAssistantMessage(packet.payload);
      if (target) target.runState = 'requesting';
    }
    if (packet.event === 'ai.token') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId)
        || ensureAssistantMessage(packet.payload);
      if (target) {
        target.content = `${target.content || ''}${packet.payload.delta}`;
        target.runState = packet.payload.runState || 'responding';
        mergeTextPart(target, packet.payload.partId, packet.payload.channel || 'content', packet.payload.delta);
      }
      scrollBottom();
    }
    if (packet.event === 'ai.reasoning') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId)
        || ensureAssistantMessage(packet.payload);
      if (target) {
        target.reasoningContent = `${target.reasoningContent || ''}${packet.payload.delta}`;
        target.runState = packet.payload.runState || 'responding';
        mergeTextPart(target, packet.payload.partId, packet.payload.channel || 'reasoning', packet.payload.delta);
      }
      scrollBottom();
    }
    if (packet.event === 'ai.tool_call') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId)
        || ensureAssistantMessage(packet.payload);
      if (target) {
        target.runState = packet.payload.runState || target.runState;
        mergeToolEvent(target, packet.payload.toolEvent);
      }
      scrollBottom();
    }
    if (packet.event === 'ai.message_state') {
      if (packet.payload.sessionId && packet.payload.sessionId !== sessionId.value) return;
      const target = messages.value.find((item) => item.id === packet.payload.messageId)
        || ensureAssistantMessage(packet.payload);
      if (target) target.runState = packet.payload.runState;
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
  const normalized = {
    ...item,
    content: item.content || '',
    cards: Array.isArray(item.cards) ? item.cards : [],
    toolEvents: Array.isArray(item.toolEvents) ? item.toolEvents : [],
    streamParts: Array.isArray(item.streamParts) ? item.streamParts : [],
    reasoningContent: item.reasoningContent || '',
    runState: item.runState || item.status || ''
  };
  if (!normalized.streamParts.length) {
    normalized.streamParts = legacyStreamParts(normalized);
  }
  return normalized;
}

function legacyStreamParts(item) {
  const parts = [];
  if (item.reasoningContent) {
    parts.push({
      id: `legacy_reasoning_${item.id}`,
      type: 'text',
      channel: 'reasoning',
      text: item.reasoningContent
    });
  }
  for (const event of visibleToolEvents(item)) {
    parts.push({
      id: `legacy_tool_${event.id}`,
      type: 'tool',
      channel: event.channel || 'content',
      toolEventId: event.id
    });
  }
  if (item.content) {
    parts.push({
      id: `legacy_content_${item.id}`,
      type: 'text',
      channel: 'content',
      text: item.content
    });
  }
  return parts;
}

function mergeTextPart(message, partId, channel, delta) {
  const parts = Array.isArray(message.streamParts) ? [...message.streamParts] : [];
  const id = partId || `live_${channel}_${message.id}`;
  const existing = parts.find((part) => part.id === id);
  if (existing?.type === 'text') {
    existing.text = `${existing.text || ''}${delta}`;
    existing.channel = channel;
    message.streamParts = parts;
    return;
  }
  const last = parts[parts.length - 1];
  if (!partId && last?.type === 'text' && last.channel === channel) {
    last.text = `${last.text || ''}${delta}`;
    message.streamParts = parts;
    return;
  }
  parts.push({
    id,
    type: 'text',
    channel,
    text: String(delta || '')
  });
  message.streamParts = parts;
}

function toolEventMap(message) {
  return new Map((message.toolEvents || []).map((event) => [event.id, event]));
}

function messageBlocks(message, channel) {
  const events = toolEventMap(message);
  return (message.streamParts || [])
    .filter((part) => (part.channel || 'content') === channel)
    .map((part) => {
      if (part.type === 'tool') {
        return { ...part, tool: events.get(part.toolEventId) };
      }
      return part;
    })
    .filter((part) => part.type !== 'tool' || part.tool);
}

function reasoningBlocks(message) {
  return messageBlocks(message, 'reasoning');
}

function contentBlocks(message) {
  return messageBlocks(message, 'content');
}

function normalizeToolEvent(event = {}) {
  return {
    ...event,
    channel: event.channel || 'content',
    error: event.error || (event.status === 'error' ? event.summary || '工具调用失败' : '')
  };
}

function ensureAssistantMessage(payload = {}) {
  const id = payload.assistantMessageId || payload.messageId;
  if (!id || (payload.sessionId && payload.sessionId !== sessionId.value)) return null;
  const existing = messages.value.find((item) => item.id === id);
  if (existing) return existing;
  const next = normalizeMessage({
    id,
    sessionId: payload.sessionId || sessionId.value,
    role: 'assistant',
    content: '',
    status: 'running',
    runState: payload.runState || 'requesting',
    cards: [],
    toolEvents: [],
    streamParts: [],
    reasoningContent: '',
    createdAt: new Date().toISOString()
  });
  messages.value.push(next);
  return next;
}

function mergeToolEvent(message, event) {
  if (!event) return;
  const nextEvent = normalizeToolEvent(event);
  const events = Array.isArray(message.toolEvents) ? [...message.toolEvents] : [];
  const index = events.findIndex((item) => item.id === nextEvent.id);
  if (index >= 0) events.splice(index, 1, normalizeToolEvent({ ...events[index], ...nextEvent }));
  else events.push(nextEvent);
  message.toolEvents = events;
  ensureToolPart(message, nextEvent);
}

function ensureToolPart(message, event) {
  const parts = Array.isArray(message.streamParts) ? [...message.streamParts] : [];
  if (!parts.some((part) => part.type === 'tool' && part.toolEventId === event.id)) {
    parts.push({
      id: `tool_${event.id}`,
      type: 'tool',
      channel: event.channel || 'content',
      toolEventId: event.id
    });
    message.streamParts = parts;
  }
}

function visibleToolEvents(message) {
  const events = Array.isArray(message.toolEvents) ? message.toolEvents : [];
  if (events.length) return events;
  const cards = Array.isArray(message.cards) ? message.cards : [];
  const byType = new Map();
  for (const card of cards) {
    if (!['task', 'product', 'post', 'task_draft'].includes(card.type)) continue;
    const current = byType.get(card.type) || [];
    current.push(card);
    byType.set(card.type, current);
  }
  const meta = {
    task: ['公开任务查询', 'search_public_tasks', '返回任务结果'],
    product: ['公开商品查询', 'search_public_products', '返回商品结果'],
    post: ['公开帖子查询', 'search_public_posts', '返回帖子结果'],
    task_draft: ['任务草案生成', 'create_task_draft_card', '已生成任务草案']
  };
  return [...byType.entries()].map(([type, items]) => ({
    id: `card_tool_${message.id}_${type}`,
    displayName: meta[type][0],
    toolName: meta[type][1],
    status: 'done',
    summary: type === 'task_draft'
      ? `${meta[type][2]}：${items[0]?.title || '未命名任务'}`
      : `${meta[type][2]} ${items.length} 条`
  }));
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

function messageMetaText(message) {
  const parts = [];
  if (message.role === 'assistant') {
    const runState = messageRunStateText(message);
    if (runState) parts.push(runState);
  } else {
    const status = messageStatusText(message.status);
    if (status && message.status !== 'done') parts.push(status);
  }
  if (message.editedAt) parts.push('已编辑');
  return parts.join(' · ');
}

function messageRunStateText(message) {
  if (message.status === 'done') return '';
  if (message.runState === 'requesting') return '请求中';
  if (message.runState === 'responding') return '回复中';
  if (message.runState === 'waiting_tool') return '等待工具中';
  if (message.runState === 'error' || message.status === 'error') return '出错';
  if (message.runState === 'stopped' || message.status === 'stopped') return '已停止';
  if (message.status === 'running') return '请求中';
  return '';
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

async function loadTaskMeta() {
  if (taskMeta.value.categories.length && taskMeta.value.areas.length) return;
  taskMeta.value = await request('/api/tasks/meta');
}

async function openTaskDraft(card) {
  await loadTaskMeta();
  const categories = taskMeta.value.categories || [];
  const areas = taskMeta.value.areas || [];
  Object.assign(taskDraftForm, {
    title: String(card.title || '').slice(0, 40),
    category: categories.includes(card.category) ? card.category : categories[0] || '',
    campusArea: areas.includes(card.campusArea) ? card.campusArea : areas[0] || '',
    reward: clampNumber(Number(card.reward || 10), taskMeta.value.rewardMin, taskMeta.value.rewardMax),
    deadlineValue: Date.now() + 24 * 60 * 60 * 1000,
    detail: String(card.detail || ''),
    deliveryRequirement: String(card.deliveryRequirement || ''),
    contactNote: String(card.contactNote || '')
  });
  publishedTask.value = null;
  taskDraftVisible.value = true;
}

async function publishTaskDraft() {
  taskDraftSubmitting.value = true;
  try {
    const payload = {
      title: taskDraftForm.title,
      category: taskDraftForm.category,
      campusArea: taskDraftForm.campusArea,
      reward: taskDraftForm.reward,
      deadlineAt: new Date(taskDraftForm.deadlineValue).toISOString(),
      detail: taskDraftForm.detail,
      deliveryRequirement: taskDraftForm.deliveryRequirement,
      contactNote: taskDraftForm.contactNote,
      imageUrls: []
    };
    const draftData = await request('/api/tasks', { method: 'POST', body: payload });
    const publishData = await request(`/api/tasks/${draftData.task.id}/pay`, { method: 'POST' });
    publishedTask.value = publishData.task;
    notice.success('任务已发布');
  } catch (error) {
    notice.error(error.message || '发布任务失败');
  } finally {
    taskDraftSubmitting.value = false;
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
</script>
