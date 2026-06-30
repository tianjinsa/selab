<template>
  <div class="grid">
    <div class="grid grid-3">
      <div v-for="item in metrics" :key="item.label" class="metric-card">
        <div class="metric-label">{{ item.label }}</div>
        <div class="metric-value">{{ item.value }}</div>
      </div>
    </div>
    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">系统状态</h2>
          <p class="muted">{{ dashboard?.db?.message || '正在读取' }}</p>
        </div>
        <n-switch :value="dashboard?.mockEnabled" @update:value="toggleMock">
          <template #checked>Mock 开启</template>
          <template #unchecked>Mock 关闭</template>
        </n-switch>
      </n-space>
      <n-alert style="margin-top: 16px;" type="info" :show-icon="false">
        Mock 开关只影响后台展示类统计，不会修改真实用户业务状态。
      </n-alert>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const message = useMessage();
const dashboard = ref(null);

const metrics = computed(() => {
  const data = dashboard.value?.metrics || {};
  return [
    { label: '用户数', value: data.users ?? '-' },
    { label: '封禁账号', value: data.bannedUsers ?? '-' },
    { label: '禁言账号', value: data.mutedUsers ?? '-' },
    { label: '私信会话', value: data.conversations ?? '-' },
    { label: '任务数', value: data.tasks ?? '-' },
    { label: '帖子数', value: data.posts ?? '-' },
    { label: '商品数', value: data.products ?? '-' },
    { label: '订单数', value: data.orders ?? '-' },
    { label: '待处理举报', value: data.pendingReports ?? '-' },
    { label: '待处理纠纷', value: data.pendingDisputes ?? '-' },
    { label: 'AI 风险报警', value: data.aiRisks ?? '-' },
    { label: '通知数', value: data.notifications ?? '-' }
  ];
});

onMounted(load);

async function load() {
  dashboard.value = await request('/api/admin/dashboard', {}, 'admin');
}

async function toggleMock(value) {
  const data = await request('/api/admin/settings/mock', { method: 'PATCH', body: { enabled: value } }, 'admin');
  dashboard.value.mockEnabled = data.settings.mockEnabled;
  message.success(value ? 'Mock 展示已开启' : 'Mock 展示已关闭');
}
</script>
