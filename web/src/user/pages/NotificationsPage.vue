<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <n-tabs v-model:value="type" type="segment" @update:value="load">
        <n-tab name="" tab="全部" />
        <n-tab name="message" tab="私信" />
        <n-tab name="system" tab="系统" />
        <n-tab name="task" tab="任务" />
        <n-tab name="market" tab="交易" />
      </n-tabs>
      <n-button secondary @click="readAll">全部已读</n-button>
    </n-space>
    <n-list v-if="notifications.length" style="margin-top: 14px;">
      <n-list-item v-for="item in notifications" :key="item.id">
        <n-space justify="space-between" align="center">
          <div>
            <n-space align="center">
              <strong>{{ item.title }}</strong>
              <n-tag v-if="!item.isRead" size="small" type="warning">未读</n-tag>
              <n-tag size="small">{{ item.type }}</n-tag>
            </n-space>
            <p class="muted" style="margin: 6px 0 0;">{{ item.body }}</p>
          </div>
          <n-space>
            <n-button v-if="!item.isRead" size="small" @click="markRead(item.id)">已读</n-button>
            <n-button size="small" quaternary type="error" @click="remove(item.id)">删除</n-button>
          </n-space>
        </n-space>
      </n-list-item>
    </n-list>
    <div v-else class="empty-state">当前筛选下没有通知</div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';
import { userSession as session } from '../session.js';

const message = useMessage();
const notifications = ref([]);
const type = ref('');

onMounted(load);

async function load() {
  const data = await request(`/api/notifications?type=${encodeURIComponent(type.value)}`);
  notifications.value = data.notifications;
  session.unreadCount = data.unreadCount;
}

async function markRead(id) {
  await request(`/api/notifications/${id}/read`, { method: 'PATCH' });
  await load();
}

async function readAll() {
  await request('/api/notifications/read-all', { method: 'POST', body: { type: type.value } });
  message.success('已全部标记为已读');
  await load();
}

async function remove(id) {
  await request(`/api/notifications/${id}`, { method: 'DELETE' });
  await load();
}
</script>
