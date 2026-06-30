<template>
  <section class="surface panel">
    <h2 style="margin-top: 0;">我的二手订单</h2>
    <n-list v-if="orders.length">
      <n-list-item v-for="order in orders" :key="order.id">
        <n-space justify="space-between" align="center">
          <div>
            <strong>{{ order.product?.title }}</strong>
            <p class="muted" style="margin: 4px 0 0;">{{ formatMoney(order.price) }} · {{ orderStatusText[order.status] }} · 买家 {{ order.buyer?.nickname }} / 卖家 {{ order.seller?.nickname }}</p>
          </div>
          <n-button secondary @click="$router.push(`/market/${order.productId}`)">查看商品</n-button>
        </n-space>
      </n-list-item>
    </n-list>
    <div v-else class="empty-state">暂无订单</div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../../../shared/http.js';
import { formatMoney, orderStatusText } from './marketFormat.js';

const orders = ref([]);

onMounted(async () => {
  orders.value = (await request('/api/market/orders/my')).orders;
});
</script>
