<template>
  <div class="grid">
    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>社区词云与热点总结</h2>
          <p class="muted">词云来自用户 Tag；总结可在关闭 Mock 后基于真实数据生成。</p>
        </div>
        <n-button secondary @click="regenerate">重新生成总结</n-button>
      </div>
      <div class="word-cloud">
        <n-tag v-for="word in words" :key="word.text" :bordered="false">{{ word.text }} · {{ word.value }}</n-tag>
      </div>
      <n-alert class="panel-content-offset" type="info" :show-icon="false">
        来源：{{ summarySource === 'mock' ? 'Mock 展示数据' : '真实社区数据' }}。{{ summary?.summary || '暂无总结' }}
      </n-alert>
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>社区举报</h2>
          <p class="muted">举报属实会删除内容并扣除作者 4 分信用分。</p>
        </div>
        <n-button secondary @click="loadReports">刷新</n-button>
      </div>
      <n-data-table :columns="columns" :data="reports" :pagination="{ pageSize: 8 }" />
    </section>
  </div>
</template>

<script setup>
import { h, onMounted, ref } from 'vue';
import { NButton, NTag, useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const message = useMessage();
const dialog = useDialog();
const words = ref([]);
const summary = ref(null);
const summarySource = ref('');
const reports = ref([]);

const columns = [
  { title: '类型', key: 'type', width: 90 },
  { title: '对象', key: 'target', render: (row) => row.target?.title || '-' },
  { title: '作者', key: 'author', render: (row) => row.target?.author?.nickname || '-' },
  { title: '举报原因', key: 'reason' },
  {
    title: '状态',
    key: 'status',
    width: 130,
    render(row) {
      return h(NTag, { type: row.status === 'pending' ? 'warning' : 'success' }, { default: () => row.status });
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render(row) {
      if (row.status !== 'pending') return '-';
      return h('div', { class: 'table-actions' }, [
        h(NButton, { size: 'small', type: 'error', onClick: () => resolve(row, true) }, { default: () => '属实删除' }),
        h(NButton, { size: 'small', secondary: true, onClick: () => resolve(row, false) }, { default: () => '驳回' })
      ]);
    }
  }
];

onMounted(async () => {
  await Promise.all([loadCloud(), loadSummary(), loadReports()]);
});

async function loadCloud() {
  words.value = (await request('/api/forum/admin/word-cloud', {}, 'admin')).words;
}

async function loadSummary() {
  const data = await request('/api/forum/admin/summary', {}, 'admin');
  summary.value = data.summary;
  summarySource.value = data.source;
}

async function loadReports() {
  reports.value = (await request('/api/forum/admin/reports', {}, 'admin')).reports;
}

async function regenerate() {
  const data = await request('/api/forum/admin/summary/regenerate', { method: 'POST' }, 'admin');
  summary.value = data.summary;
  summarySource.value = data.source;
  message.success('社区热点总结已重新生成');
}

function resolve(row, valid) {
  dialog.warning({
    title: valid ? '确认举报属实' : '驳回举报',
    content: valid ? '内容会被删除，作者信用分扣 4 分。' : '举报会被标记为驳回。',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/forum/admin/reports/${row.id}/resolve`, {
        method: 'POST',
        body: { valid, result: valid ? '举报属实，内容已删除' : '举报不成立' }
      }, 'admin');
      message.success('处理完成');
      await loadReports();
    }
  });
}
</script>
