<template>
  <div class="grid">
    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">任务参数</h2>
          <p class="muted">分类和酬金范围会直接影响用户发布任务时的校验。</p>
        </div>
        <n-button secondary @click="scanTimeouts">扫描超时任务</n-button>
      </n-space>
      <n-grid :cols="3" :x-gap="12" responsive="screen" style="margin-top: 14px;">
        <n-grid-item>
          <n-input v-model:value="categoryText" type="textarea" :autosize="{ minRows: 3 }" placeholder="每行一个任务分类" />
        </n-grid-item>
        <n-grid-item>
          <n-input-number v-model:value="settings.taskRewardMin" placeholder="酬金下限" />
        </n-grid-item>
        <n-grid-item>
          <n-input-number v-model:value="settings.taskRewardMax" placeholder="酬金上限" />
        </n-grid-item>
      </n-grid>
      <n-button style="margin-top: 12px;" type="primary" @click="saveSettings">保存参数</n-button>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">任务倾向分析</h2>
          <p class="muted">当前来源：{{ tendencySource === 'mock' ? 'Mock 展示数据' : '真实任务关键词' }}</p>
        </div>
        <n-button secondary @click="loadTendencies">刷新</n-button>
      </n-space>
      <div class="grid grid-3" style="margin-top: 14px;">
        <div v-for="item in tendencies" :key="item.keyword" class="metric-card">
          <div class="metric-label">{{ item.keyword }}</div>
          <div class="metric-value">{{ item.count }}</div>
        </div>
      </div>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center" style="margin-bottom: 12px;">
        <h2 style="margin: 0;">任务列表</h2>
        <n-select v-model:value="status" clearable placeholder="状态筛选" :options="statusOptions" style="width: 180px;" @update:value="loadTasks" />
      </n-space>
      <n-data-table :columns="columns" :data="tasks" :pagination="{ pageSize: 8 }" />
    </section>
  </div>
</template>

<script setup>
import { h, onMounted, reactive, ref } from 'vue';
import { NButton, NTag, useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';
import { formatMoney, taskStatusText, taskStatusType } from '../../user/pages/tasks/taskFormat.js';

const message = useMessage();
const dialog = useDialog();
const tasks = ref([]);
const tendencies = ref([]);
const tendencySource = ref('');
const status = ref(null);
const settings = reactive({ taskCategories: [], taskRewardMin: 1, taskRewardMax: 500 });
const categoryText = ref('');
const statusOptions = Object.entries(taskStatusText).map(([value, label]) => ({ value, label }));

const columns = [
  { title: '任务', key: 'title' },
  { title: '类型', key: 'category', width: 110 },
  { title: '酬金', key: 'reward', width: 100, render: (row) => formatMoney(row.reward) },
  { title: '发布者', key: 'publisher', render: (row) => row.publisher?.nickname || '-' },
  {
    title: '状态',
    key: 'status',
    width: 110,
    render(row) {
      return h(NTag, { type: taskStatusType(row.status) }, { default: () => taskStatusText[row.status] || row.status });
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    render(row) {
      return h(NButton, { size: 'small', secondary: true, type: 'warning', onClick: () => takeDown(row) }, { default: () => '下架' });
    }
  }
];

onMounted(async () => {
  await Promise.all([loadMeta(), loadTasks(), loadTendencies()]);
});

async function loadMeta() {
  const meta = await request('/api/tasks/admin/meta', {}, 'admin');
  settings.taskCategories = meta.categories;
  settings.taskRewardMin = meta.rewardMin;
  settings.taskRewardMax = meta.rewardMax;
  categoryText.value = meta.categories.join('\n');
}

async function loadTasks() {
  const params = status.value ? `?status=${status.value}` : '';
  tasks.value = (await request(`/api/tasks/admin/all${params}`, {}, 'admin')).tasks;
}

async function loadTendencies() {
  const data = await request('/api/tasks/admin/tendencies', {}, 'admin');
  tendencies.value = data.tendencies;
  tendencySource.value = data.source;
}

async function saveSettings() {
  await request('/api/tasks/admin/settings', {
    method: 'PATCH',
    body: {
      taskCategories: categoryText.value.split('\n'),
      taskRewardMin: settings.taskRewardMin,
      taskRewardMax: settings.taskRewardMax
    }
  }, 'admin');
  message.success('任务参数已保存');
  await loadMeta();
}

async function scanTimeouts() {
  const data = await request('/api/tasks/admin/scan-timeouts', { method: 'POST' }, 'admin');
  message.success(data.changed ? '已处理超时任务' : '没有需要处理的超时任务');
  await loadTasks();
}

function takeDown(row) {
  dialog.warning({
    title: '下架任务',
    content: `确认下架「${row.title}」？该操作会写入管理员日志。`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/tasks/admin/${row.id}/take-down`, { method: 'POST', body: { reason: '管理员后台下架' } }, 'admin');
      message.success('任务已下架');
      await loadTasks();
    }
  });
}
</script>
