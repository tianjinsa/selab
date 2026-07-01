<template>
  <div class="grid catalog-page">
    <section class="surface panel toolbar-panel">
      <div class="toolbar-header">
        <div class="toolbar-copy">
          <h2>校园二手市场</h2>
          <p>分类由管理员维护，购买申请会进入卖家私信卡片。</p>
        </div>
        <div class="toolbar-actions">
          <n-button secondary @click="$router.push('/market/orders')">我的交易</n-button>
          <n-button secondary @click="$router.push('/market/grade')">年级推荐</n-button>
          <n-button type="primary" @click="$router.push('/market/new')">发布商品</n-button>
        </div>
      </div>
      <div class="filter-grid">
        <n-select v-model:value="filters.categoryId" clearable placeholder="分类" :options="categoryOptions" />
        <n-input v-model:value="filters.keyword" clearable placeholder="关键词" @keyup.enter="load" />
        <n-input-number v-model:value="filters.minPrice" clearable placeholder="最低价" />
        <n-input-number v-model:value="filters.maxPrice" clearable placeholder="最高价" />
        <n-button secondary @click="load">筛选</n-button>
      </div>
    </section>

    <transition-group v-if="products.length" name="card-flow" tag="div" class="card-grid" appear>
      <article v-for="product in products" :key="product.id" class="module-card market-card">
        <div>
          <img v-if="product.imageUrls?.[0]" class="post-cover" :src="product.imageUrls[0]" alt="商品图" />
          <div class="card-title-row">
            <strong>{{ product.title }}</strong>
            <n-tag>{{ productStatusText[product.status] }}</n-tag>
          </div>
          <p class="muted">{{ product.category?.name }} · {{ product.condition }} · {{ product.tradeMethod }}</p>
          <p class="price-text">{{ formatMoney(product.price) }}</p>
          <n-alert v-if="product.lowCreditWarning" type="warning" :show-icon="false">卖家信用分较低，请先沟通确认。</n-alert>
        </div>
        <div class="card-footer-row">
          <span class="muted">收藏 {{ product.favoriteCount }}</span>
          <n-button secondary @click="$router.push(`/market/${product.id}`)">查看详情</n-button>
        </div>
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
