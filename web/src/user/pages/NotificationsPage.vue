<template>
  <section class="surface message-center">
    <aside class="message-center-sidebar">
      <div class="message-center-brand">
        <Send :size="18" />
        <strong>消息中心</strong>
      </div>
      <button
        v-for="category in categories"
        :key="category.key"
        type="button"
        class="message-center-nav"
        :class="{ active: activeCategory === category.key }"
        @click="switchCategory(category.key)"
      >
        <component :is="category.icon" :size="18" />
        <span>{{ category.label }}</span>
        <n-badge v-if="category.unread" :value="category.unread" :max="99" />
      </button>
      <n-button secondary block @click="readCurrentCategory">
        <template #icon><CheckCheck :size="16" /></template>
        当前分类已读
      </n-button>
    </aside>

    <section class="message-center-list">
      <div class="message-center-header">
        <div>
          <h3>{{ currentCategory?.label }}</h3>
          <p class="muted">{{ currentCategory?.desc }}</p>
        </div>
        <n-button text type="primary" @click="loadCenter">刷新</n-button>
      </div>

      <transition-group
        v-if="activeCategory === 'messages' && conversations.length"
        name="list-flow"
        tag="div"
        class="message-center-items"
        appear
      >
        <button
          v-for="conversation in conversations"
          :key="conversation.id"
          type="button"
          class="message-center-item"
          :class="{ active: activeConversationId === conversation.id, unread: conversation.unreadCount }"
          @click="selectConversation(conversation.id)"
        >
          <UserAvatar :size="42" :src="conversation.peer?.avatarUrl" :name="conversation.peer?.nickname" />
          <span>
            <strong>{{ conversation.peer?.nickname || '同学' }}</strong>
            <small>{{ conversationPreview(conversation.lastMessage) }}</small>
          </span>
          <n-badge v-if="conversation.unreadCount" :value="conversation.unreadCount" :max="99" />
        </button>
      </transition-group>

      <transition-group
        v-else-if="activeCategory !== 'messages' && filteredNotifications.length"
        name="list-flow"
        tag="div"
        class="message-center-items"
        appear
      >
        <button
          v-for="item in filteredNotifications"
          :key="item.id"
          type="button"
          class="message-center-item notification"
          :class="{ active: activeNotificationId === item.id, unread: !item.isRead }"
          @click="selectNotification(item)"
        >
          <span class="notification-dot" />
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.body || '暂无详细内容' }}</small>
          </span>
          <n-tag size="small">{{ notificationTypeText(item.type) }}</n-tag>
        </button>
      </transition-group>

      <div v-else class="message-center-empty">
        {{ activeCategory === 'messages' ? '还没有私信会话' : '当前分类没有通知' }}
      </div>
    </section>

    <section class="message-center-detail">
      <template v-if="activeCategory === 'messages'">
        <div v-if="activeConversation" class="message-detail-card">
          <div class="message-detail-header">
            <UserAvatar :size="52" :src="activeConversation.peer?.avatarUrl" :name="activeConversation.peer?.nickname" />
            <div>
              <h3>{{ activeConversation.peer?.nickname || '同学' }}</h3>
              <p class="muted">{{ activeConversation.peer?.studentId || '校园用户' }}</p>
            </div>
            <n-button type="primary" @click="$router.push(`/messages/${activeConversation.id}`)">进入私信</n-button>
          </div>
          <div v-if="activeMessages.length" class="message-detail-stream">
            <div
              v-for="item in activeMessages"
              :key="item.id"
              class="message-detail-bubble"
              :class="{ mine: item.senderId === session.user?.id }"
            >
              {{ messagePreview(item) }}
              <small>{{ formatTime(item.createdAt) }}</small>
            </div>
          </div>
          <div v-else class="message-center-empty compact">这段会话还没有消息</div>
        </div>
        <div v-else class="message-center-blank">
          <MessageCircle :size="54" />
          <strong>选择左侧私信会话</strong>
          <p class="muted">点击会话后会自动标记对应私信和私信通知为已读。</p>
        </div>
      </template>

      <template v-else>
        <div v-if="activeNotification" class="message-detail-card notification-detail">
          <n-space align="center" :wrap="true">
            <n-tag>{{ notificationTypeText(activeNotification.type) }}</n-tag>
            <n-tag v-if="!activeNotification.isRead" type="warning">未读</n-tag>
            <span class="muted">{{ formatTime(activeNotification.createdAt) }}</span>
          </n-space>
          <h3>{{ activeNotification.title }}</h3>
          <p>{{ activeNotification.body || '暂无详细内容' }}</p>
          <n-space>
            <n-button v-if="activeNotification.link" type="primary" @click="openNotification(activeNotification)">
              查看相关内容
            </n-button>
            <n-button secondary type="error" @click="remove(activeNotification.id)">
              <template #icon><Trash2 :size="16" /></template>
              删除
            </n-button>
          </n-space>
        </div>
        <div v-else class="message-center-blank">
          <Bell :size="54" />
          <strong>选择一条通知</strong>
          <p class="muted">点击通知会自动已读，右侧会显示详情和相关入口。</p>
        </div>
      </template>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  AtSign,
  Bell,
  CheckCheck,
  ClipboardList,
  Mail,
  MessageCircle,
  Send,
  ShoppingBag,
  Trash2
} from '@lucide/vue';
import { request } from '../../shared/http.js';
import UserAvatar from '../../shared/UserAvatar.vue';
import { userSession as session } from '../session.js';

const router = useRouter();
const message = useMessage();
const activeCategory = ref('messages');
const notifications = ref([]);
const conversations = ref([]);
const activeConversationId = ref('');
const activeNotificationId = ref('');
const activeMessages = ref([]);

const categories = computed(() => [
  {
    key: 'messages',
    label: '我的私信',
    desc: '同学之间的实时对话，进入会话后自动同步已读。',
    icon: Mail,
    unread: conversations.value.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0)
  },
  {
    key: 'forum',
    label: '社区互动',
    desc: '评论、点赞、收藏、关注和举报处理等社区消息。',
    icon: AtSign,
    unread: unreadByType('forum')
  },
  {
    key: 'task',
    label: '任务通知',
    desc: '任务申请、验收、结算和超时提醒。',
    icon: ClipboardList,
    unread: unreadByType('task')
  },
  {
    key: 'market',
    label: '交易通知',
    desc: '二手交易申请、支付、交付和订单状态。',
    icon: ShoppingBag,
    unread: unreadByType('market')
  },
  {
    key: 'system',
    label: '系统通知',
    desc: '平台状态、账号和系统级提醒。',
    icon: Bell,
    unread: unreadByType('system')
  },
  {
    key: 'all',
    label: '通知汇总',
    desc: '除私信会话外的全部通知。',
    icon: MessageCircle,
    unread: notifications.value.filter((item) => item.type !== 'message' && !item.isRead).length
  }
]);

const currentCategory = computed(() => categories.value.find((item) => item.key === activeCategory.value));
const activeConversation = computed(() => conversations.value.find((item) => item.id === activeConversationId.value));
const activeNotification = computed(() => notifications.value.find((item) => item.id === activeNotificationId.value));
const filteredNotifications = computed(() => {
  if (activeCategory.value === 'all') return notifications.value.filter((item) => item.type !== 'message');
  return notifications.value.filter((item) => item.type === activeCategory.value);
});

onMounted(loadCenter);

async function loadCenter() {
  const [notificationData, conversationData] = await Promise.all([
    request('/api/notifications'),
    request('/api/conversations')
  ]);
  notifications.value = notificationData.notifications || [];
  conversations.value = conversationData.conversations || [];
  session.unreadCount = notificationData.unreadCount || 0;
  if (activeConversationId.value) {
    await loadConversationMessages(activeConversationId.value);
  }
  if (activeNotificationId.value && !notifications.value.some((item) => item.id === activeNotificationId.value)) {
    activeNotificationId.value = '';
  }
}

function switchCategory(key) {
  activeCategory.value = key;
  activeConversationId.value = '';
  activeNotificationId.value = '';
  activeMessages.value = [];
}

async function selectConversation(id) {
  activeConversationId.value = id;
  activeNotificationId.value = '';
  await loadConversationMessages(id);
  const readData = await request(`/api/conversations/${id}/read`, { method: 'PATCH' });
  if (readData.unreadCount !== undefined) session.unreadCount = readData.unreadCount;
  await loadCenter();
}

async function loadConversationMessages(id) {
  const data = await request(`/api/conversations/${id}/messages`);
  activeMessages.value = (data.messages || []).slice(-12);
}

async function selectNotification(item) {
  activeNotificationId.value = item.id;
  activeConversationId.value = '';
  activeMessages.value = [];
  if (!item.isRead) {
    await markRead(item.id);
  }
}

async function markRead(id) {
  await request(`/api/notifications/${id}/read`, { method: 'PATCH' });
  const target = notifications.value.find((item) => item.id === id);
  if (target) {
    target.isRead = true;
    target.readAt = new Date().toISOString();
  }
  await loadUnreadCount();
}

async function readCurrentCategory() {
  if (activeCategory.value === 'messages') {
    const unreadConversations = conversations.value.filter((item) => Number(item.unreadCount || 0) > 0);
    await Promise.all(unreadConversations.map((item) => request(`/api/conversations/${item.id}/read`, { method: 'PATCH' })));
    message.success('私信已全部标记为已读');
  } else if (activeCategory.value === 'all') {
    const unreadNotifications = filteredNotifications.value.filter((item) => !item.isRead);
    await Promise.all(unreadNotifications.map((item) => request(`/api/notifications/${item.id}/read`, { method: 'PATCH' })));
    message.success('通知已全部标记为已读');
  } else {
    await request('/api/notifications/read-all', { method: 'POST', body: { type: activeCategory.value } });
    message.success('当前分类已全部标记为已读');
  }
  await loadCenter();
}

async function openNotification(item) {
  if (!item.isRead) await markRead(item.id);
  if (item.link) router.push(item.link);
}

async function remove(id) {
  await request(`/api/notifications/${id}`, { method: 'DELETE' });
  if (activeNotificationId.value === id) activeNotificationId.value = '';
  await loadCenter();
}

async function loadUnreadCount() {
  const data = await request('/api/notifications/unread-count');
  session.unreadCount = data.count || 0;
}

function unreadByType(type) {
  return notifications.value.filter((item) => item.type === type && !item.isRead).length;
}

function notificationTypeText(type) {
  return {
    message: '私信',
    forum: '社区',
    task: '任务',
    market: '交易',
    system: '系统'
  }[type] || '通知';
}

function conversationPreview(messageItem) {
  if (!messageItem) return '还没有消息';
  return messagePreview(messageItem);
}

function messagePreview(item) {
  if (item.card) return item.card.title || item.content || '业务卡片';
  if (item.content) return item.content;
  if (item.type === 'image') return `图片：${item.attachment?.name || '图片'}`;
  if (item.type === 'file') return `文件：${item.attachment?.name || '附件'}`;
  return '新消息';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
