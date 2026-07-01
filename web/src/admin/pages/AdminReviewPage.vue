<template>
  <div class="grid">
    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>AI 内容审核</h2>
          <p class="muted">帖子、任务和商品共用同一个审核队列；违规内容会保留发布时快照，便于追溯。</p>
        </div>
        <n-space>
          <n-button secondary :loading="scanning" @click="scanModeration">立即扫描</n-button>
          <n-button secondary @click="load">刷新</n-button>
        </n-space>
      </div>
      <n-data-table :columns="moderationColumns" :data="moderationItems" :pagination="{ pageSize: 8 }" />
    </section>

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

    <n-modal v-model:show="snapshotVisible" preset="card" title="违规快照" class="moderation-snapshot-modal">
      <n-descriptions bordered :column="2" size="small">
        <n-descriptions-item label="类型">{{ entityTypeText(activeSnapshot?.entityType) }}</n-descriptions-item>
        <n-descriptions-item label="状态">{{ moderationStatusText(activeSnapshot?.status) }}</n-descriptions-item>
        <n-descriptions-item label="标题">{{ activeSnapshot?.snapshot?.title || activeSnapshot?.title || '-' }}</n-descriptions-item>
        <n-descriptions-item label="用户">{{ activeSnapshot?.owner?.nickname || '-' }}</n-descriptions-item>
        <n-descriptions-item label="风险">{{ riskText(activeSnapshot?.riskLevel) }}</n-descriptions-item>
        <n-descriptions-item label="命中分类">{{ categoryText(activeSnapshot?.categories || []) }}</n-descriptions-item>
      </n-descriptions>
      <n-alert v-if="activeSnapshot?.reason || activeSnapshot?.error" type="warning" :show-icon="false" style="margin-top: 12px;">
        {{ activeSnapshot.reason || activeSnapshot.error }}
      </n-alert>
      <div class="snapshot-block">
        <strong>提取文本</strong>
        <pre>{{ activeSnapshot?.snapshot?.text || '-' }}</pre>
      </div>
      <div class="snapshot-block">
        <strong>原始字段</strong>
        <pre>{{ snapshotRaw }}</pre>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, h, onMounted, ref } from 'vue';
import { NButton, NTag, useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const dialog = useDialog();
const message = useMessage();
const reports = ref([]);
const taskDisputes = ref([]);
const orderDisputes = ref([]);
const moderationItems = ref([]);
const scanning = ref(false);
const snapshotVisible = ref(false);
const activeSnapshot = ref(null);

const snapshotRaw = computed(() => JSON.stringify(activeSnapshot.value?.snapshot?.raw || {}, null, 2));

const moderationColumns = [
  { title: '类型', key: 'entityType', width: 90, render: (row) => entityTypeText(row.entityType) },
  { title: '标题', key: 'title', render: (row) => row.title || row.snapshot?.title || '-' },
  { title: '用户', key: 'owner', width: 110, render: (row) => row.owner?.nickname || '-' },
  {
    title: '状态',
    key: 'status',
    width: 110,
    render: (row) => h(NTag, { type: moderationStatusType(row.status) }, { default: () => moderationStatusText(row.status) })
  },
  {
    title: '风险',
    key: 'riskLevel',
    width: 110,
    render: (row) => h(NTag, { type: riskTagType(row.riskLevel) }, { default: () => riskText(row.riskLevel) })
  },
  { title: '命中分类', key: 'categories', render: (row) => categoryText(row.categories || []) },
  { title: '原因', key: 'reason', render: (row) => row.reason || row.error || '-' },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    render(row) {
      return h(NButton, { size: 'small', secondary: true, onClick: () => showSnapshot(row) }, { default: () => '查看快照' });
    }
  }
];

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
  moderationItems.value = data.moderationItems || [];
}

async function scanModeration() {
  scanning.value = true;
  try {
    const result = await request('/api/admin/moderation/scan', { method: 'POST', body: { limit: 50 } }, 'admin');
    message.success(`审核完成：通过 ${result.approved || 0}，打回 ${result.rejected || 0}`);
    await load();
  } finally {
    scanning.value = false;
  }
}

function showSnapshot(row) {
  activeSnapshot.value = row;
  snapshotVisible.value = true;
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

function entityTypeText(type) {
  return { post: '帖子', task: '任务', product: '商品' }[type] || type || '-';
}

function moderationStatusText(status) {
  return {
    pending: '待审核',
    processing: '审核中',
    approved: '已通过',
    rejected: '违规打回',
    error: '审核出错',
    superseded: '已失效'
  }[status] || status || '-';
}

function moderationStatusType(status) {
  return {
    pending: 'warning',
    processing: 'info',
    approved: 'success',
    rejected: 'error',
    error: 'error',
    superseded: 'default'
  }[status] || 'default';
}

function riskText(level) {
  return {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
    critical: '严重'
  }[level] || '未知';
}

function riskTagType(level) {
  return {
    low: 'success',
    medium: 'warning',
    high: 'error',
    critical: 'error'
  }[level] || 'default';
}

function categoryText(categories) {
  if (!categories.length) return '-';
  const map = {
    antisocial: '反社会/极端暴力',
    self_harm: '自残自杀',
    illegal: '违法违规',
    sexual: '色情低俗',
    fraud: '诈骗交易'
  };
  return categories.map((item) => map[item] || item).join('、');
}
</script>
