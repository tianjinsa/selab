<template>
  <div class="workbench-page">
    <section class="surface panel workbench-hero">
      <div>
        <span class="status-pill"><ShieldCheck :size="14" /> 商品审核</span>
        <h2>商品审核情况</h2>
        <p class="muted">查看商品审核进度、打回原因和退款处理。</p>
      </div>
      <n-space>
        <n-button secondary @click="$router.push('/market/orders')">
          <template #icon><ArrowLeft :size="16" /></template>
          返回订单
        </n-button>
        <n-button type="primary" @click="$router.push('/market/new')">
          <template #icon><Plus :size="16" /></template>
          发布商品
        </n-button>
      </n-space>
    </section>

    <section class="workbench-stat-grid">
      <article class="metric-card workbench-stat">
        <span>审核记录</span>
        <strong>{{ stats.total }}</strong>
        <small class="muted">进入过审核流程的商品</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>审核中</span>
        <strong>{{ stats.pending }}</strong>
        <small class="muted">暂不展示到市场</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>未通过</span>
        <strong>{{ stats.rejected }}</strong>
        <small class="muted">已下架或待处理</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>已隐藏</span>
        <strong>{{ stats.hidden }}</strong>
        <small class="muted">仅自己可见</small>
      </article>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h3 style="margin: 0;">审核列表</h3>
          <p class="muted" style="margin: 6px 0 0;">按最新审核变化排序。</p>
        </div>
        <n-space>
          <n-button
            v-if="activeStatus === 'rejected' && stats.rejected"
            secondary
            type="error"
            :loading="bulkDeleting"
            @click="confirmDeleteRejected"
          >
            <template #icon><Trash2 :size="15" /></template>
            全部删除
          </n-button>
          <n-button text type="primary" :loading="loading" @click="load">
            <template #icon><RefreshCcw :size="15" /></template>
            刷新
          </n-button>
        </n-space>
      </n-space>

      <n-tabs v-model:value="activeStatus" type="segment" animated style="margin-top: 14px;">
        <n-tab-pane name="all" tab="全部" />
        <n-tab-pane name="pending" tab="审核中" />
        <n-tab-pane name="rejected" tab="未通过" />
        <n-tab-pane name="approved" tab="已通过" />
      </n-tabs>

      <transition-group v-if="filteredItems.length" name="card-flow" tag="div" class="workbench-section-list" appear>
        <article v-for="product in filteredItems" :key="product.id" class="workbench-task-card">
          <div class="workbench-card-head">
            <div class="market-order-product">
              <img v-if="product.imageUrls?.[0]" :src="assetUrl(product.imageUrls[0])" alt="商品图" />
              <span>
                <strong>{{ product.title }}</strong>
                <small>{{ product.category?.name }} · {{ product.condition }} · {{ formatMoney(product.price) }}</small>
              </span>
            </div>
            <n-tag :type="moderationType(product.moderationStatus)">{{ moderationText(product.moderationStatus) }}</n-tag>
          </div>
          <p>{{ shortText(product.detail) }}</p>
          <div class="workbench-chip-row">
            <n-tag size="small" :type="productStatusType(product.status)" :bordered="false">
              {{ productStatusText[product.status] || product.status }}
            </n-tag>
            <n-tag size="small" :bordered="false">{{ product.tradeMethod }}</n-tag>
            <n-tag v-if="product.hiddenAt" size="small" :bordered="false">已隐藏</n-tag>
            <n-tag v-if="product.moderationCheckedAt" size="small" :bordered="false">审核 {{ formatDateTime(product.moderationCheckedAt) }}</n-tag>
          </div>
          <n-alert v-if="product.moderationStatus === 'pending'" type="warning" :show-icon="false" class="workbench-inline-alert">
            商品正在审核，通过后会出现在订单后台和二手市场。
          </n-alert>
          <n-alert v-if="product.moderationStatus === 'rejected'" type="error" :show-icon="false" class="workbench-inline-alert">
            {{ product.moderationReason || '商品审核未通过，已停止公开展示。' }}
          </n-alert>
          <n-space>
            <n-button size="small" secondary @click="$router.push(`/market/${product.id}`)">查看</n-button>
            <n-button
              v-if="product.moderationStatus !== 'rejected'"
              size="small"
              secondary
              :type="product.hiddenAt ? 'success' : 'warning'"
              @click="toggleVisibility(product)"
            >
              <template #icon>
                <Eye v-if="product.hiddenAt" :size="15" />
                <EyeOff v-else :size="15" />
              </template>
              {{ product.hiddenAt ? '恢复公开' : '隐藏' }}
            </n-button>
            <n-button size="small" tertiary type="error" @click="confirmDelete(product)">
              <template #icon><Trash2 :size="15" /></template>
              删除
            </n-button>
          </n-space>
        </article>
      </transition-group>
      <div v-else class="empty-state">当前筛选下没有审核记录</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { ArrowLeft, Eye, EyeOff, Plus, RefreshCcw, ShieldCheck, Trash2 } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { formatMoney, productStatusText, productStatusType } from './marketFormat.js';

const dialog = useDialog();
const message = useMessage();
const loading = ref(false);
const bulkDeleting = ref(false);
const activeStatus = ref('all');
const items = ref([]);
const stats = ref({ total: 0, pending: 0, approved: 0, rejected: 0, hidden: 0 });

const filteredItems = computed(() => {
  if (activeStatus.value === 'all') return items.value;
  return items.value.filter((item) => (item.moderationStatus || 'approved') === activeStatus.value);
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await request('/api/market/moderation');
    items.value = data.items || [];
    stats.value = { ...stats.value, ...(data.stats || {}) };
  } finally {
    loading.value = false;
  }
}

async function toggleVisibility(product) {
  const visible = Boolean(product.hiddenAt);
  try {
    await request(`/api/market/products/${product.id}/visibility`, {
      method: 'PATCH',
      body: { visible }
    });
    message.success(visible ? '商品已恢复公开' : '商品已隐藏');
    await load();
  } catch (error) {
    message.error(error.message || '操作失败');
  }
}

function confirmDelete(product) {
  dialog.warning({
    title: '删除商品',
    content: `确认删除「${product.title || '未命名商品'}」？删除后不会在二手市场和订单后台展示。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await request(`/api/market/products/${product.id}`, { method: 'DELETE' });
        message.success('商品已删除');
        await load();
      } catch (error) {
        message.error(error.message || '删除失败');
      }
    }
  });
}

function confirmDeleteRejected() {
  const count = Number(stats.value.rejected || 0);
  if (!count) return;
  dialog.warning({
    title: '删除全部审核未通过商品',
    content: `确认删除 ${count} 个审核未通过商品？可删除的商品会从二手市场和订单后台移除。`,
    positiveText: '全部删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      bulkDeleting.value = true;
      try {
        const result = await request('/api/market/moderation/rejected', { method: 'DELETE' });
        if (result.failed?.length) {
          message.warning(`已删除 ${result.deletedCount || 0} 个商品，${result.failed.length} 个因订单状态限制未删除`);
        } else {
          message.success(`已删除 ${result.deletedCount || 0} 个商品`);
        }
        await load();
      } catch (error) {
        message.error(error.message || '删除失败');
      } finally {
        bulkDeleting.value = false;
      }
    }
  });
}

function moderationText(status = 'approved') {
  return {
    pending: '审核中',
    approved: '审核通过',
    rejected: '审核未通过'
  }[status || 'approved'] || status;
}

function moderationType(status = 'approved') {
  return {
    pending: 'warning',
    approved: 'success',
    rejected: 'error'
  }[status || 'approved'] || 'default';
}

function shortText(value = '') {
  const text = String(value || '');
  return text.length > 112 ? `${text.slice(0, 112)}...` : text;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
