<template>
  <div class="grid catalog-page">
    <section class="surface panel toolbar-panel">
      <div class="toolbar-header">
        <div class="toolbar-copy">
          <h2>校园二手市场</h2>
          <p>分类由管理员维护，购买申请会进入卖家私信卡片。</p>
        </div>
        <div class="toolbar-actions">
          <n-button secondary :loading="feed.refreshing.value" @click="refreshProducts">
            <template #icon><RefreshCw :size="16" /></template>
            刷新
          </n-button>
          <n-button secondary @click="$router.push('/market/favorites')">
            <template #icon><Star :size="16" /></template>
            我的收藏
          </n-button>
          <n-button secondary @click="$router.push('/market/orders')">我的交易</n-button>
          <n-button secondary @click="$router.push('/market/grade')">年级推荐</n-button>
          <n-button type="primary" @click="$router.push('/market/new')">发布商品</n-button>
        </div>
      </div>
      <div class="filter-grid">
        <n-select v-model:value="filters.categoryId" clearable placeholder="分类" :options="categoryOptions" />
        <n-input v-model:value="filters.keyword" clearable placeholder="关键词" @keyup.enter="refreshProducts" />
        <n-input-number v-model:value="filters.minPrice" clearable placeholder="最低价" />
        <n-input-number v-model:value="filters.maxPrice" clearable placeholder="最高价" />
        <n-select v-model:value="filters.sort" :options="sortOptions" />
        <n-button secondary @click="refreshProducts">筛选</n-button>
      </div>
      <div v-if="products.length" class="feed-window-note">
        已加载 {{ feed.offset.value }}/{{ feed.total.value || feed.offset.value }}，当前保留 {{ products.length }} 项
      </div>
    </section>

    <transition-group v-if="products.length" name="card-flow" tag="div" class="card-grid" appear>
      <article v-for="product in products" :key="product.id" class="module-card market-card">
        <div>
          <img v-if="product.imageUrls?.[0]" class="post-cover" :src="assetUrl(product.imageUrls[0])" alt="商品图" />
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
    <section v-else-if="feed.isEmpty.value" class="surface empty-state">当前筛选下没有商品</section>
    <section class="feed-load-state">
      <span v-if="feed.loading.value">正在加载更多...</span>
      <span v-else-if="feed.finished.value">已经到底了</span>
      <n-button v-else secondary @click="feed.loadMore">加载更多</n-button>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { RefreshCw, Star } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { useWindowedFeed } from '../../../shared/useWindowedFeed.js';
import { formatMoney, productStatusText } from './marketFormat.js';

const route = useRoute();
const meta = ref({ categories: [] });
const filters = reactive({ categoryId: null, keyword: '', minPrice: null, maxPrice: null, sort: 'recommended' });
const sortOptions = [
  { label: '推荐', value: 'recommended' },
  { label: '最新发布', value: 'new' },
  { label: '热门优先', value: 'hot' }
];
const categoryOptions = computed(() => meta.value.categories.map((item) => ({ label: item.name, value: item.id })));
const feed = useWindowedFeed({
  pageSize: 12,
  maxItems: 48,
  loadPage: async ({ limit, offset, seed }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== '') params.set(key, value);
    }
    if (filters.sort === 'new') params.delete('sort');
    params.set('limit', limit);
    params.set('offset', offset);
    params.set('recommendSeed', seed);
    const data = await request(`/api/market/products?${params.toString()}`);
    return { items: data.products || [], pageInfo: data.pageInfo };
  }
});
const products = computed(() => feed.items.value);

onMounted(async () => {
  meta.value = await request('/api/market/meta');
  filters.keyword = String(route.query.keyword || '');
  window.addEventListener('scroll', feed.handleWindowScroll, { passive: true });
  await feed.loadMore();
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', feed.handleWindowScroll);
});

async function refreshProducts() {
  await feed.refresh();
}
</script>
