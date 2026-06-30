<template>
  <div class="grid">
    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">分类申请</h2>
          <p class="muted">通过后分类进入前台商品发布选择列表。</p>
        </div>
        <n-button secondary @click="scanTimeouts">扫描订单超时</n-button>
      </n-space>
      <n-data-table style="margin-top: 12px;" :columns="requestColumns" :data="categoryRequests" :pagination="{ pageSize: 6 }" />
    </section>

    <section class="surface panel">
      <h2 style="margin-top: 0;">商品列表</h2>
      <n-data-table :columns="productColumns" :data="products" :pagination="{ pageSize: 8 }" />
    </section>

    <section class="surface panel">
      <h2 style="margin-top: 0;">订单列表</h2>
      <n-data-table :columns="orderColumns" :data="orders" :pagination="{ pageSize: 8 }" />
    </section>
  </div>
</template>

<script setup>
import { h, onMounted, ref } from 'vue';
import { NButton, NTag, useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';
import { formatMoney, orderStatusText, productStatusText } from '../../user/pages/market/marketFormat.js';

const message = useMessage();
const dialog = useDialog();
const products = ref([]);
const orders = ref([]);
const categoryRequests = ref([]);

const requestColumns = [
  { title: '分类名称', key: 'name' },
  { title: '申请人', key: 'user', render: (row) => row.user?.nickname || '-' },
  { title: '理由', key: 'reason' },
  { title: '状态', key: 'status' },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      if (row.status !== 'pending') return '-';
      return h('div', { style: 'display:flex;gap:8px;' }, [
        h(NButton, { size: 'small', type: 'primary', onClick: () => resolveCategory(row, true) }, { default: () => '通过' }),
        h(NButton, { size: 'small', secondary: true, onClick: () => resolveCategory(row, false) }, { default: () => '拒绝' })
      ]);
    }
  }
];

const productColumns = [
  { title: '商品', key: 'title' },
  { title: '分类', key: 'category', render: (row) => row.category?.name || '-' },
  { title: '价格', key: 'price', render: (row) => formatMoney(row.price) },
  { title: '卖家', key: 'seller', render: (row) => row.seller?.nickname || '-' },
  { title: '状态', key: 'status', render: (row) => h(NTag, {}, { default: () => productStatusText[row.status] || row.status }) },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      return h(NButton, { size: 'small', type: 'warning', secondary: true, onClick: () => takeDown(row) }, { default: () => '下架' });
    }
  }
];

const orderColumns = [
  { title: '商品', key: 'product', render: (row) => row.product?.title || '-' },
  { title: '买家', key: 'buyer', render: (row) => row.buyer?.nickname || '-' },
  { title: '卖家', key: 'seller', render: (row) => row.seller?.nickname || '-' },
  { title: '金额', key: 'price', render: (row) => formatMoney(row.price) },
  { title: '状态', key: 'status', render: (row) => orderStatusText[row.status] || row.status }
];

onMounted(load);

async function load() {
  const data = await request('/api/market/admin/all', {}, 'admin');
  products.value = data.products;
  orders.value = data.orders;
  categoryRequests.value = data.categoryRequests;
}

async function resolveCategory(row, approved) {
  await request(`/api/market/admin/category-requests/${row.id}/resolve`, {
    method: 'POST',
    body: { approved, rejectReason: approved ? '' : '暂不适合新增该分类' }
  }, 'admin');
  message.success(approved ? '分类已新增' : '分类申请已拒绝');
  await load();
}

function takeDown(row) {
  dialog.warning({
    title: '下架商品',
    content: `确认下架「${row.title}」？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/market/admin/products/${row.id}/take-down`, { method: 'POST', body: { reason: '管理员后台下架' } }, 'admin');
      message.success('商品已下架');
      await load();
    }
  });
}

async function scanTimeouts() {
  const data = await request('/api/market/admin/scan-timeouts', { method: 'POST' }, 'admin');
  message.success(data.changed ? '已处理超时订单' : '没有需要处理的超时订单');
  await load();
}
</script>
