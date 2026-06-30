<template>
  <div class="grid" v-if="product">
    <section class="surface panel">
      <n-space justify="space-between" align="start">
        <div>
          <n-space align="center">
            <h2 style="margin: 0;">{{ product.title }}</h2>
            <n-tag>{{ productStatusText[product.status] }}</n-tag>
          </n-space>
          <p class="muted">{{ product.category?.name }} · {{ product.condition }} · {{ product.tradeMethod }}</p>
        </div>
        <n-button secondary @click="$router.push('/market')">返回市场</n-button>
      </n-space>
      <img v-if="product.imageUrls?.[0]" class="post-cover" :src="product.imageUrls[0]" alt="商品图" style="max-height: 420px;" />
      <p style="font-size: 26px; font-weight: 800;">{{ formatMoney(product.price) }}</p>
      <p>{{ product.detail }}</p>
      <n-descriptions bordered :column="2">
        <n-descriptions-item label="卖家">{{ product.seller?.nickname }} · 信用分 {{ product.seller?.creditScore }}</n-descriptions-item>
        <n-descriptions-item label="自提说明">{{ product.pickupLocation }}</n-descriptions-item>
      </n-descriptions>
      <n-alert v-if="product.lowCreditWarning" type="warning" :show-icon="false" style="margin-top: 12px;">卖家信用分低于 6 分，请先沟通确认。</n-alert>
      <n-space style="margin-top: 14px;">
        <n-button secondary @click="favorite">{{ product.favorited ? '取消收藏' : '收藏商品' }} · {{ product.favoriteCount }}</n-button>
        <n-button v-if="canApply" type="primary" @click="apply">申请购买并发送卡片</n-button>
        <n-button v-if="myOrder?.status === 'waiting_payment'" type="primary" @click="pay(myOrder.id)">去模拟支付</n-button>
        <n-button v-if="myOrder?.status === 'waiting_receive'" type="primary" @click="receive(myOrder.id)">确认收货</n-button>
      </n-space>
      <n-alert v-if="product.myOrder" type="info" :show-icon="false" style="margin-top: 12px;">你的订单状态：{{ orderStatusText[product.myOrder.status] }}</n-alert>
    </section>

    <section v-if="isSeller && product.orders?.length" class="surface panel">
      <h3 style="margin-top: 0;">购买申请与订单</h3>
      <n-list>
        <n-list-item v-for="order in product.orders" :key="order.id">
          <n-space justify="space-between" align="center">
            <div>
              <strong>{{ order.buyer?.nickname }}</strong>
              <span class="muted"> · 信用分 {{ order.buyer?.creditScore }} · {{ orderStatusText[order.status] }}</span>
            </div>
            <n-space>
              <n-button v-if="order.status === 'applying'" size="small" type="primary" @click="accept(order.id)">同意出售</n-button>
              <n-button v-if="order.status === 'applying'" size="small" secondary @click="reject(order.id)">拒绝</n-button>
              <n-button v-if="order.status === 'waiting_delivery'" size="small" type="primary" @click="deliver(order.id)">已交付</n-button>
            </n-space>
          </n-space>
        </n-list-item>
      </n-list>
    </section>

    <section v-if="relatedCompletedOrder" class="surface panel">
      <h3 style="margin-top: 0;">交易评价</h3>
      <n-rate v-model:value="review.rating" />
      <n-input v-model:value="review.content" type="textarea" :autosize="{ minRows: 2 }" placeholder="写下本次交易评价" style="margin-top: 10px;" />
      <n-button style="margin-top: 12px;" secondary @click="submitReview(relatedCompletedOrder.id)">提交评价</n-button>
    </section>

    <section class="surface panel">
      <n-collapse>
        <n-collapse-item title="举报商品" name="report">
          <n-input v-model:value="reportReason" type="textarea" placeholder="说明举报原因" />
          <n-button style="margin-top: 10px;" secondary type="warning" @click="report">提交举报</n-button>
        </n-collapse-item>
      </n-collapse>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { request } from '../../../shared/http.js';
import { userSession as session } from '../../session.js';
import { formatMoney, orderStatusText, productStatusText } from './marketFormat.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const product = ref(null);
const reportReason = ref('');
const review = reactive({ rating: 5, content: '' });

const isSeller = computed(() => product.value?.sellerId === session.user?.id);
const myOrder = computed(() => product.value?.myOrder);
const canApply = computed(() => product.value?.status === 'on_sale' && !isSeller.value && !myOrder.value);
const relatedCompletedOrder = computed(() => product.value?.orders?.find((order) => order.status === 'completed' && [order.buyerId, order.sellerId].includes(session.user?.id)));

onMounted(load);

async function load() {
  product.value = (await request(`/api/market/products/${route.params.id}`)).product;
}

async function favorite() {
  await request(`/api/market/products/${product.value.id}/favorite`, { method: 'POST' });
  await load();
}

async function apply() {
  await request(`/api/market/products/${product.value.id}/apply`, { method: 'POST' });
  message.success('购买申请已发送到卖家私信');
  await load();
  router.push('/messages');
}

async function accept(id) {
  await request(`/api/market/orders/${id}/accept`, { method: 'POST' });
  message.success('已同意出售，等待买家支付');
  await load();
}

async function reject(id) {
  await request(`/api/market/orders/${id}/reject`, { method: 'POST' });
  await load();
}

async function pay(id) {
  await request(`/api/market/orders/${id}/pay`, { method: 'POST' });
  message.success('模拟支付成功，等待卖家交付');
  await load();
}

async function deliver(id) {
  await request(`/api/market/orders/${id}/deliver`, { method: 'POST' });
  message.success('已标记交付，等待买家确认收货');
  await load();
}

async function receive(id) {
  await request(`/api/market/orders/${id}/receive`, { method: 'POST' });
  message.success('订单已完成，模拟打款流水已记录');
  await load();
}

async function submitReview(id) {
  await request(`/api/market/orders/${id}/reviews`, { method: 'POST', body: review });
  message.success('评价已提交');
  await load();
}

async function report() {
  if (!reportReason.value.trim()) return message.warning('请填写举报原因');
  await request(`/api/market/products/${product.value.id}/reports`, { method: 'POST', body: { reason: reportReason.value } });
  reportReason.value = '';
  message.success('举报已提交');
}
</script>
