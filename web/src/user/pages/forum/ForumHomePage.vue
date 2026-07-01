<template>
  <div class="grid">
    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">校园社区</h2>
          <p class="muted">图文、求助和经验分享会进入统一通知与互动体系。</p>
        </div>
        <n-space>
          <n-button secondary @click="$router.push('/forum/studio')">
            <template #icon><BarChart3 :size="16" /></template>
            创作中心
          </n-button>
          <n-button secondary @click="$router.push('/forum/collections')">
            <template #icon><Bookmark :size="16" /></template>
            收藏/关注
          </n-button>
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
        <img v-if="post.imageUrls?.[0]" class="post-cover" :src="assetUrl(post.imageUrls[0])" alt="帖子封面" />
        <n-space justify="space-between" align="center">
          <strong>{{ post.title }}</strong>
          <n-tag size="small">{{ post.type }}</n-tag>
        </n-space>
        <p class="muted">{{ post.content.slice(0, 90) }}</p>
        <n-space size="small">
          <n-tag v-for="tag in post.tags" :key="tag" size="small">{{ tag }}</n-tag>
        </n-space>
        <div class="post-card-footer">
          <button type="button" class="comment-author inline" @click.stop="$router.push(`/users/${post.authorId}`)">
            <UserAvatar :size="24" :src="post.author?.avatarUrl" :name="post.author?.nickname" />
            <strong>{{ post.author?.nickname || '同学' }}</strong>
          </button>
          <div class="post-stat-row" aria-label="帖子互动数据">
            <span class="post-stat" title="浏览"><Eye :size="14" />{{ post.viewCount }}</span>
            <span class="post-stat" title="点赞"><Heart :size="14" />{{ post.likeCount }}</span>
            <span class="post-stat" title="评论"><MessageCircle :size="14" />{{ post.commentCount }}</span>
            <span class="post-stat" title="收藏"><Star :size="14" />{{ post.favoriteCount }}</span>
            <span class="post-stat" title="分享"><Share2 :size="14" />{{ post.shareCount }}</span>
          </div>
        </div>
      </article>
    </transition-group>
    <section v-else class="surface empty-state">当前没有帖子</section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { BarChart3, Bookmark, Eye, Heart, MessageCircle, Share2, Star } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import UserAvatar from '../../../shared/UserAvatar.vue';

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
