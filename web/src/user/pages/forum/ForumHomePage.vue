<template>
  <div class="grid">
    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">校园社区</h2>
          <p class="muted">图文、求助和经验分享会进入统一通知与互动体系。</p>
        </div>
        <n-space>
          <n-button secondary @click="$router.push('/forum/rankings')">热度榜</n-button>
          <n-button type="primary" @click="$router.push('/forum/new')">发布帖子</n-button>
        </n-space>
      </n-space>
      <n-grid :cols="4" :x-gap="10" responsive="screen" style="margin-top: 16px;">
        <n-grid-item><n-input v-model:value="filters.keyword" placeholder="关键词" clearable @keyup.enter="loadPosts" /></n-grid-item>
        <n-grid-item><n-input v-model:value="filters.tag" placeholder="Tag" clearable @keyup.enter="loadPosts" /></n-grid-item>
        <n-grid-item>
          <n-select v-model:value="filters.sort" :options="[{label:'最新发布',value:'new'},{label:'热门优先',value:'hot'}]" />
        </n-grid-item>
        <n-grid-item><n-button secondary block @click="loadPosts">筛选</n-button></n-grid-item>
      </n-grid>
    </section>

    <section class="surface panel">
      <h3 style="margin: 0 0 12px;">社区热点</h3>
      <n-alert type="info" :show-icon="false">{{ summary?.summary || '暂无社区热点总结' }}</n-alert>
    </section>

    <transition-group v-if="posts.length" name="card-flow" tag="div" class="waterfall" appear>
      <article v-for="post in posts" :key="post.id" class="post-card" @click="$router.push(`/forum/${post.id}`)">
        <img v-if="post.imageUrls?.[0]" class="post-cover" :src="post.imageUrls[0]" alt="帖子封面" />
        <n-space justify="space-between" align="center">
          <strong>{{ post.title }}</strong>
          <n-tag size="small">{{ post.type }}</n-tag>
        </n-space>
        <p class="muted">{{ post.content.slice(0, 90) }}</p>
        <n-space size="small">
          <n-tag v-for="tag in post.tags" :key="tag" size="small">{{ tag }}</n-tag>
        </n-space>
        <n-space justify="space-between" style="margin-top: 10px;">
          <span class="muted">{{ post.author?.nickname }}</span>
          <span class="muted">赞 {{ post.likeCount }} · 评 {{ post.commentCount }} · 藏 {{ post.favoriteCount }}</span>
        </n-space>
      </article>
    </transition-group>
    <section v-else class="surface empty-state">当前没有帖子</section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { request } from '../../../shared/http.js';

const route = useRoute();
const posts = ref([]);
const summary = ref(null);
const filters = reactive({ keyword: '', tag: '', sort: 'new' });

onMounted(async () => {
  filters.keyword = String(route.query.keyword || '');
  await Promise.all([loadPosts(), loadSummary()]);
});

async function loadPosts() {
  const params = new URLSearchParams();
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.sort === 'hot') params.set('sort', 'hot');
  posts.value = (await request(`/api/forum/posts?${params.toString()}`)).posts;
}

async function loadSummary() {
  summary.value = (await request('/api/forum/summary')).summary;
}
</script>
