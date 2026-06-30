<template>
  <div class="grid">
    <section class="surface panel">
      <h2 style="margin: 0;">年级推荐</h2>
      <p class="muted">根据学号前 4 位推断入学年份，再匹配管理员配置的推荐分类。</p>
      <n-alert type="info" :show-icon="false">推荐阶段：{{ stageText[data?.stage] || '无法判断' }}；推荐分类：{{ data?.categoryNames?.join('、') || '-' }}</n-alert>
    </section>
    <transition-group v-if="data?.products?.length" name="card-flow" tag="div" class="grid grid-3" appear>
      <article v-for="product in data.products" :key="product.id" class="module-card">
        <strong>{{ product.title }}</strong>
        <p class="muted">{{ product.category?.name }} · {{ product.condition }}</p>
        <p style="font-size: 22px; font-weight: 800;">{{ formatMoney(product.price) }}</p>
        <n-button secondary @click="$router.push(`/market/${product.id}`)">查看</n-button>
      </article>
    </transition-group>
    <section v-else class="surface empty-state">暂无适合当前年级的在售商品</section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../../../shared/http.js';
import { formatMoney } from './marketFormat.js';

const data = ref(null);
const stageText = { freshman: '大一 / 入学年级', middle: '大二 / 大三', senior: '大四 / 毕业年级', unknown: '无法判断' };

onMounted(async () => {
  data.value = await request('/api/market/recommendations/grade');
});
</script>
