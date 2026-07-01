<template>
  <div class="grid">
    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>举报处理</h2>
          <p class="muted">属实处理会下架/删除目标内容，并扣除内容归属用户 4 分信用分。</p>
        </div>
        <n-button secondary @click="load">刷新</n-button>
      </div>
      <n-data-table :columns="reportColumns" :data="reports" :pagination="{ pageSize: 8 }" />
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <h2>任务纠纷</h2>
      </div>
      <n-data-table :columns="taskDisputeColumns" :data="taskDisputes" :pagination="{ pageSize: 6 }" />
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <h2>订单纠纷</h2>
      </div>
      <n-data-table :columns="orderDisputeColumns" :data="orderDisputes" :pagination="{ pageSize: 6 }" />
    </section>
  </div>
</template>

<script setup>
import { h, onMounted, ref } from 'vue';
import { NButton, NTag, useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const dialog = useDialog();
const message = useMessage();
const reports = ref([]);
const taskDisputes = ref([]);
const orderDisputes = ref([]);

const reportColumns = [
  { title: '类型', key: 'type', width: 90 },
  { title: '目标', key: 'target', render: (row) => row.target?.title || '-' },
  { title: '举报人', key: 'reporter', render: (row) => row.reporter?.nickname || '-' },
  { title: '原因', key: 'reason' },
  { title: '状态', key: 'status', render: (row) => h(NTag, { type: row.status === 'pending' ? 'warning' : 'success' }, { default: () => row.status }) },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      if (row.status !== 'pending') return '-';
      return h('div', { class: 'table-actions' }, [
        h(NButton, { size: 'small', type: 'error', onClick: () => resolveReport(row, true) }, { default: () => '属实' }),
        h(NButton, { size: 'small', secondary: true, onClick: () => resolveReport(row, false) }, { default: () => '驳回' })
      ]);
    }
  }
];

const taskDisputeColumns = [
  { title: '任务', key: 'task', render: (row) => row.task?.title || '-' },
  { title: '申请人', key: 'user', render: (row) => row.user?.nickname || '-' },
  { title: '原因', key: 'reason' },
  { title: '状态', key: 'status' },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      if (row.status !== 'pending') return '-';
      return h('div', { class: 'table-actions' }, [
        h(NButton, { size: 'small', type: 'primary', onClick: () => resolveTask(row, 'complete') }, { default: () => '强制完成' }),
        h(NButton, { size: 'small', secondary: true, onClick: () => resolveTask(row, 'cancel') }, { default: () => '强制取消' })
      ]);
    }
  }
];

const orderDisputeColumns = [
  { title: '订单', key: 'order', render: (row) => row.order?.id?.slice(0, 8) || '-' },
  { title: '申请人', key: 'user', render: (row) => row.user?.nickname || '-' },
  { title: '原因', key: 'reason' },
  { title: '状态', key: 'status' },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      if (row.status !== 'pending') return '-';
      return h('div', { class: 'table-actions' }, [
        h(NButton, { size: 'small', type: 'primary', onClick: () => resolveOrder(row, 'complete') }, { default: () => '强制完成' }),
        h(NButton, { size: 'small', secondary: true, onClick: () => resolveOrder(row, 'cancel') }, { default: () => '强制取消' })
      ]);
    }
  }
];

onMounted(load);

async function load() {
  const data = await request('/api/admin/review-items', {}, 'admin');
  reports.value = data.reports;
  taskDisputes.value = data.taskDisputes;
  orderDisputes.value = data.orderDisputes;
}

function resolveReport(row, valid) {
  dialog.warning({
    title: valid ? '确认举报属实' : '驳回举报',
    content: valid ? '目标内容会被处理，责任用户扣 4 分。' : '举报会被标记为驳回。',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/admin/reports/${row.id}/resolve`, { method: 'POST', body: { valid, result: valid ? '举报属实' : '举报驳回' } }, 'admin');
      message.success('举报已处理');
      await load();
    }
  });
}

async function resolveTask(row, action) {
  await request(`/api/admin/task-disputes/${row.id}/resolve`, { method: 'POST', body: { action, reason: '管理员综合审核处理' } }, 'admin');
  message.success('任务纠纷已处理');
  await load();
}

async function resolveOrder(row, action) {
  await request(`/api/admin/order-disputes/${row.id}/resolve`, { method: 'POST', body: { action, reason: '管理员综合审核处理' } }, 'admin');
  message.success('订单纠纷已处理');
  await load();
}
</script>
