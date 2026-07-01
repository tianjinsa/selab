<template>
  <div class="workbench-page">
    <section class="surface panel workbench-hero">
      <div>
        <span class="status-pill"><ShoppingBag :size="14" /> 我的交易</span>
        <h2>二手交易订单</h2>
        <p class="muted">集中管理买到的、卖出的、我发布的商品、待处理动作和资金流水。</p>
      </div>
      <n-space>
        <n-button secondary @click="$router.push('/market')">
          <template #icon><Store :size="16" /></template>
          返回市场
        </n-button>
        <n-button type="primary" @click="$router.push('/market/new')">
          <template #icon><Plus :size="16" /></template>
          发布商品
        </n-button>
      </n-space>
    </section>

    <section class="workbench-stat-grid">
      <article class="metric-card workbench-stat">
        <span>待处理</span>
        <strong>{{ stats.actionCount }}</strong>
        <small class="muted">申请、付款、交付、收货、评价</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>在售商品</span>
        <strong>{{ stats.onSaleProducts }}</strong>
        <small class="muted">共发布 {{ stats.ownedProducts }}</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>进行中订单</span>
        <strong>{{ stats.buyingActive + stats.sellingActive }}</strong>
        <small class="muted">买入 {{ stats.buyingActive }} · 卖出 {{ stats.sellingActive }}</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>卖出收入</span>
        <strong>{{ formatMoney(stats.revenue) }}</strong>
        <small class="muted">收入入钱包 · 退款 {{ formatMoney(stats.refunds) }} · 买入支出 {{ formatMoney(stats.spending) }}</small>
      </article>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h3 style="margin: 0;">待我处理</h3>
          <p class="muted" style="margin: 6px 0 0;">只显示需要你下一步操作或关注的交易节点。</p>
        </div>
        <n-button text @click="load">
          <template #icon><RefreshCcw :size="15" /></template>
          刷新
        </n-button>
      </n-space>
      <transition-group v-if="actionItems.length" name="card-flow" tag="div" class="workbench-action-list" appear>
        <button v-for="item in actionItems" :key="item.id" type="button" class="workbench-action-item" @click="$router.push(item.path)">
          <span class="workbench-action-icon">
            <component :is="actionIcon(item.type)" :size="18" />
          </span>
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.body }}</small>
          </span>
          <ArrowRight :size="18" />
        </button>
      </transition-group>
      <div v-else class="empty-state">当前没有必须处理的交易节点</div>
    </section>

    <section class="surface panel">
      <n-tabs type="segment" animated>
        <n-tab-pane name="buying" tab="买到的">
          <div v-if="buying.length" class="workbench-section-list">
            <article v-for="order in buying" :key="order.id" class="workbench-task-card">
              <div class="workbench-card-head">
                <div class="market-order-product">
                  <img v-if="order.product?.imageUrls?.[0]" :src="assetUrl(order.product.imageUrls[0])" alt="商品图" />
                  <span>
                    <strong>{{ order.product?.title || '商品已不存在' }}</strong>
                    <small>{{ formatMoney(order.price) }} · 卖家 {{ order.seller?.nickname || '同学' }}</small>
                  </span>
                </div>
                <n-tag :type="orderStatusType(order.status)">{{ orderStatusText[order.status] || order.status }}</n-tag>
              </div>
              <div class="workbench-chip-row">
                <n-tag v-if="order.paidAt" size="small" :bordered="false">支付 {{ formatDateTime(order.paidAt) }}</n-tag>
                <n-tag v-if="order.deliveredAt" size="small" :bordered="false">交付 {{ formatDateTime(order.deliveredAt) }}</n-tag>
                <n-tag v-if="order.completedAt" size="small" type="success" :bordered="false">完成 {{ formatDateTime(order.completedAt) }}</n-tag>
              </div>
              <n-space>
                <n-button size="small" secondary @click="$router.push(`/market/${order.productId}`)">查看商品</n-button>
                <n-button v-if="order.status === 'waiting_payment'" size="small" type="primary" @click="pay(order)">去支付</n-button>
                <n-button v-if="order.status === 'waiting_receive'" size="small" type="primary" @click="receive(order)">确认收货</n-button>
                <n-button v-if="['applying', 'waiting_payment'].includes(order.status)" size="small" secondary @click="cancel(order)">取消订单</n-button>
                <n-button v-if="['waiting_delivery', 'waiting_receive'].includes(order.status)" size="small" secondary type="warning" @click="dispute(order)">申请介入</n-button>
                <n-button v-if="order.status === 'completed' && !order.hasMyReview" size="small" secondary @click="$router.push(`/market/${order.productId}`)">去评价</n-button>
              </n-space>
            </article>
          </div>
          <div v-else class="empty-state">你还没有买入订单</div>
        </n-tab-pane>

        <n-tab-pane name="selling" tab="卖出的">
          <div v-if="selling.length" class="workbench-section-list">
            <article v-for="order in selling" :key="order.id" class="workbench-task-card">
              <div class="workbench-card-head">
                <div class="market-order-product">
                  <img v-if="order.product?.imageUrls?.[0]" :src="assetUrl(order.product.imageUrls[0])" alt="商品图" />
                  <span>
                    <strong>{{ order.product?.title || '商品已不存在' }}</strong>
                    <small>{{ formatMoney(order.price) }} · 买家 {{ order.buyer?.nickname || '同学' }}</small>
                  </span>
                </div>
                <n-tag :type="orderStatusType(order.status)">{{ orderStatusText[order.status] || order.status }}</n-tag>
              </div>
              <div class="workbench-chip-row">
                <n-tag v-if="order.acceptedAt" size="small" :bordered="false">同意 {{ formatDateTime(order.acceptedAt) }}</n-tag>
                <n-tag v-if="order.paidAt" size="small" :bordered="false">支付 {{ formatDateTime(order.paidAt) }}</n-tag>
                <n-tag v-if="order.completedAt" size="small" type="success" :bordered="false">完成 {{ formatDateTime(order.completedAt) }}</n-tag>
              </div>
              <n-space>
                <n-button size="small" secondary @click="$router.push(`/market/${order.productId}`)">查看商品</n-button>
                <n-button v-if="order.status === 'applying'" size="small" type="primary" @click="accept(order)">同意出售</n-button>
                <n-button v-if="order.status === 'applying'" size="small" secondary @click="reject(order)">拒绝</n-button>
                <n-button v-if="order.status === 'waiting_delivery'" size="small" type="primary" @click="deliver(order)">标记交付</n-button>
                <n-button v-if="['waiting_delivery', 'waiting_receive'].includes(order.status)" size="small" secondary type="warning" @click="dispute(order)">申请介入</n-button>
                <n-button v-if="order.status === 'completed' && !order.hasMyReview" size="small" secondary @click="$router.push(`/market/${order.productId}`)">去评价</n-button>
              </n-space>
            </article>
          </div>
          <div v-else class="empty-state">你还没有卖出订单</div>
        </n-tab-pane>

        <n-tab-pane name="products" tab="我发布的商品">
          <div v-if="products.length" class="workbench-section-list">
            <article v-for="product in products" :key="product.id" class="workbench-task-card">
              <div class="workbench-card-head">
                <div class="market-order-product">
                  <img v-if="product.imageUrls?.[0]" :src="assetUrl(product.imageUrls[0])" alt="商品图" />
                  <span>
                    <strong>{{ product.title }}</strong>
                    <small>{{ product.category?.name }} · {{ product.condition }} · {{ formatMoney(product.price) }}</small>
                  </span>
                </div>
                <n-tag :type="productStatusType(product.status)">{{ productStatusText[product.status] || product.status }}</n-tag>
              </div>
              <div class="workbench-chip-row">
                <n-tag size="small" :bordered="false">收藏 {{ product.favoriteCount || 0 }}</n-tag>
                <n-tag size="small" :bordered="false">{{ product.tradeMethod }}</n-tag>
                <n-tag size="small" :type="moderationType(product.moderationStatus)" :bordered="false">
                  {{ moderationText(product.moderationStatus) }}
                </n-tag>
                <n-tag v-if="product.activeOrder" size="small" type="warning" :bordered="false">交易锁定中</n-tag>
              </div>
              <n-alert v-if="product.moderationStatus === 'pending'" type="warning" :show-icon="false" class="workbench-inline-alert">
                商品正在审核，通过后才会出现在二手市场。
              </n-alert>
              <n-alert v-if="product.moderationStatus === 'rejected'" type="error" :show-icon="false" class="workbench-inline-alert">
                {{ product.moderationReason || '商品审核未通过，暂不会对外展示。' }}
              </n-alert>
              <n-space>
                <n-button size="small" secondary @click="$router.push(`/market/${product.id}`)">查看商品</n-button>
              </n-space>
            </article>
          </div>
          <div v-else class="empty-state">你还没有发布过商品</div>
        </n-tab-pane>

        <n-tab-pane name="flows" tab="资金流水">
          <div v-if="paymentFlows.length" class="workbench-flow-list">
            <article v-for="flow in paymentFlows" :key="flow.id" class="workbench-flow-item">
              <span class="workbench-action-icon"><WalletCards :size="18" /></span>
              <span>
                <strong>{{ flow.title || flowTypeText(flow.type) }}</strong>
                <small>{{ flow.serialNo }} · {{ formatDateTime(flow.createdAt) }}</small>
              </span>
              <strong>{{ formatMoney(flow.amount) }}</strong>
            </article>
          </div>
          <div v-else class="empty-state">暂无二手交易资金流水</div>
        </n-tab-pane>
      </n-tabs>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  CreditCard,
  PackageCheck,
  Plus,
  RefreshCcw,
  ShoppingBag,
  Star,
  Store,
  Truck,
  WalletCards
} from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { formatMoney, orderStatusText, orderStatusType, productStatusText, productStatusType } from './marketFormat.js';

const message = useMessage();
const dialog = useDialog();
const data = ref(null);

const emptyStats = {
  actionCount: 0,
  ownedProducts: 0,
  onSaleProducts: 0,
  buyingActive: 0,
  buyingCompleted: 0,
  sellingActive: 0,
  sellingCompleted: 0,
  revenue: 0,
  refunds: 0,
  spending: 0
};

const stats = computed(() => data.value?.stats || emptyStats);
const actionItems = computed(() => data.value?.actionItems || []);
const buying = computed(() => data.value?.buying || []);
const selling = computed(() => data.value?.selling || []);
const products = computed(() => data.value?.products || []);
const paymentFlows = computed(() => data.value?.paymentFlows || []);

onMounted(load);

async function load() {
  data.value = await request('/api/market/orders/workbench');
}

async function accept(order) {
  await request(`/api/market/orders/${order.id}/accept`, { method: 'POST' });
  message.success('已同意出售，等待买家支付');
  await load();
}

async function reject(order) {
  await request(`/api/market/orders/${order.id}/reject`, { method: 'POST' });
  message.success('已拒绝购买申请');
  await load();
}

async function pay(order) {
  await request(`/api/market/orders/${order.id}/pay`, { method: 'POST' });
  message.success('模拟支付成功，等待卖家交付');
  await load();
}

async function deliver(order) {
  await request(`/api/market/orders/${order.id}/deliver`, { method: 'POST' });
  message.success('已标记交付，等待买家确认收货');
  await load();
}

async function receive(order) {
  await request(`/api/market/orders/${order.id}/receive`, { method: 'POST' });
  message.success('已确认收货，订单完成结算');
  await load();
}

function cancel(order) {
  dialog.warning({
    title: '确认取消订单',
    content: `取消「${order.product?.title || '该商品'}」订单后，需要重新发起购买申请。`,
    positiveText: '确认取消',
    negativeText: '再看看',
    onPositiveClick: async () => {
      await request(`/api/market/orders/${order.id}/cancel`, { method: 'POST', body: { reason: '用户在交易页取消' } });
      message.success('订单已取消');
      await load();
    }
  });
}

function dispute(order) {
  dialog.warning({
    title: '申请管理员介入',
    content: '订单会进入纠纷状态，管理员可根据双方证据处理。',
    positiveText: '确认申请',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/market/orders/${order.id}/disputes`, {
        method: 'POST',
        body: { reason: '用户在交易页申请管理员介入' }
      });
      message.success('已申请管理员介入');
      await load();
    }
  });
}

function actionIcon(type) {
  return {
    payment: CreditCard,
    receive: PackageCheck,
    application: ClipboardCheck,
    delivery: Truck,
    review: Star,
    dispute: AlertTriangle
  }[type] || ShoppingBag;
}

function flowTypeText(type) {
  return {
    product_escrow_payment: '商品担保支付',
    product_finish_settlement: '商品收入入账钱包',
    product_moderation_refund: '审核未通过退款'
  }[type] || type;
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

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
