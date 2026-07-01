<template>
  <div class="grid">
    <section class="surface panel collection-hero">
      <div>
        <span class="status-pill"><Star :size="14" /> 市场收藏</span>
        <h2>我收藏的商品</h2>
        <p class="muted">保留感兴趣的闲置商品，后续可直接查看状态、联系卖家或取消收藏。</p>
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

    <transition-group v-if="products.length" name="card-flow" tag="div" class="grid grid-3" appear>
      <article v-for="product in products" :key="product.id" class="module-card market-favorite-card">
        <div>
          <img v-if="product.imageUrls?.[0]" class="post-cover" :src="assetUrl(product.imageUrls[0])" alt="商品图" />
          <n-space justify="space-between" align="center">
            <strong>{{ product.title }}</strong>
            <n-tag>{{ productStatusText[product.status] || product.status }}</n-tag>
          </n-space>
          <p class="muted">{{ product.category?.name || '未分类' }} · {{ product.condition }} · {{ product.tradeMethod }}</p>
          <p class="market-favorite-price">{{ formatMoney(product.price) }}</p>
          <button type="button" class="comment-author inline" @click="$router.push(`/users/${product.sellerId}`)">
            <n-avatar round :size="24" :src="assetUrl(product.seller?.avatarUrl)">
              {{ avatarText(product.seller?.nickname) }}
            </n-avatar>
            <strong>{{ product.seller?.nickname || '同学' }}</strong>
            <small class="muted">信用分 {{ product.seller?.creditScore ?? '-' }}</small>
          </button>
          <n-alert v-if="product.status !== 'on_sale'" type="warning" :show-icon="false" style="margin-top: 10px;">
            商品当前状态：{{ productStatusText[product.status] || product.status }}
          </n-alert>
        </div>
        <div class="post-card-footer">
          <div class="post-stat-row">
            <span class="post-stat" title="收藏"><Star :size="14" fill="currentColor" />{{ product.favoriteCount }}</span>
            <span class="post-stat" title="浏览"><Eye :size="14" />{{ product.viewCount || 0 }}</span>
          </div>
          <n-space>
            <n-button size="small" secondary @click="toggleFavorite(product)">取消收藏</n-button>
            <n-button size="small" type="primary" @click="$router.push(`/market/${product.id}`)">查看详情</n-button>
          </n-space>
        </div>
        <small class="muted">收藏于 {{ formatTime(product.favoritedAt) }}</small>
      </article>
    </transition-group>
    <section v-else class="surface empty-state">还没有收藏商品</section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { Eye, Plus, Star, Store } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { formatMoney, productStatusText } from './marketFormat.js';

const message = useMessage();
const products = ref([]);

onMounted(load);

async function load() {
  products.value = (await request('/api/market/favorites')).products || [];
}

async function toggleFavorite(product) {
  await request(`/api/market/products/${product.id}/favorite`, { method: 'POST' });
  message.success('已取消收藏');
  await load();
}

function avatarText(name = '') {
  return String(name || '同').slice(0, 1);
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
