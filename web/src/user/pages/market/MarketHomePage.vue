<template>
  <div class="grid">
    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">校园二手市场</h2>
          <p class="muted">分类由管理员维护，购买申请会进入卖家私信卡片。</p>
        </div>
        <n-space>
          <n-button secondary @click="$router.push('/market/orders')">我的交易</n-button>
          <n-button secondary @click="$router.push('/market/grade')">年级推荐</n-button>
          <n-button type="primary" @click="$router.push('/market/new')">发布商品</n-button>
        </n-space>
      </n-space>
      <n-grid :cols="5" :x-gap="10" responsive="screen" style="margin-top: 16px;">
        <n-grid-item><n-select v-model:value="filters.categoryId" clearable placeholder="分类" :options="categoryOptions" /></n-grid-item>
        <n-grid-item><n-input v-model:value="filters.keyword" clearable placeholder="关键词" @keyup.enter="load" /></n-grid-item>
        <n-grid-item><n-input-number v-model:value="filters.minPrice" clearable placeholder="最低价" /></n-grid-item>
        <n-grid-item><n-input-number v-model:value="filters.maxPrice" clearable placeholder="最高价" /></n-grid-item>
        <n-grid-item><n-button block secondary @click="load">筛选</n-button></n-grid-item>
      </n-grid>
    </section>

    <transition-group v-if="products.length" name="card-flow" tag="div" class="grid grid-3" appear>
      <article v-for="product in products" :key="product.id" class="module-card">
        <div>
          <img v-if="product.imageUrls?.[0]" class="post-cover" :src="product.imageUrls[0]" alt="商品图" />
          <n-space justify="space-between" align="center">
            <strong>{{ product.title }}</strong>
            <n-tag>{{ productStatusText[product.status] }}</n-tag>
          </n-space>
          <p class="muted">{{ product.category?.name }} · {{ product.condition }} · {{ product.tradeMethod }}</p>
          <p style="font-size: 22px; font-weight: 800;">{{ formatMoney(product.price) }}</p>
          <n-alert v-if="product.lowCreditWarning" type="warning" :show-icon="false">卖家信用分较低，请先沟通确认。</n-alert>
        </div>
        <n-space justify="space-between">
          <span class="muted">收藏 {{ product.favoriteCount }}</span>
          <n-button secondary @click="$router.push(`/market/${product.id}`)">查看详情</n-button>
        </n-space>
      </article>
    </transition-group>
    <section v-else class="surface empty-state">当前筛选下没有商品</section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { request } from '../../../shared/http.js';
import { formatMoney, productStatusText } from './marketFormat.js';

const route = useRoute();
const meta = ref({ categories: [] });
const products = ref([]);
const filters = reactive({ categoryId: null, keyword: '', minPrice: null, maxPrice: null });
const categoryOptions = computed(() => meta.value.categories.map((item) => ({ label: item.name, value: item.id })));

onMounted(async () => {
  meta.value = await request('/api/market/meta');
  filters.keyword = String(route.query.keyword || '');
  await load();
});

async function load() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== '') params.set(key, value);
  }
  products.value = (await request(`/api/market/products?${params.toString()}`)).products;
}
</script>
