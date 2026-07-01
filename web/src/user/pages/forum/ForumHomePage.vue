<template>
  <div class="grid catalog-page">
    <section class="surface panel toolbar-panel">
      <div class="toolbar-header">
        <div class="toolbar-copy">
          <h2>校园社区</h2>
          <p>图文、求助和经验分享会进入统一通知与互动体系。</p>
        </div>
        <div class="toolbar-actions">
          <n-button secondary :loading="feed.refreshing.value" @click="refreshPosts">
            <template #icon><RefreshCw :size="16" /></template>
            刷新
          </n-button>
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
        </div>
      </div>
      <div class="filter-grid">
        <n-input v-model:value="filters.keyword" placeholder="关键词" clearable @keyup.enter="refreshPosts" />
        <n-input v-model:value="filters.tag" placeholder="Tag" clearable @keyup.enter="refreshPosts" />
        <n-select v-model:value="filters.sort" :options="sortOptions" />
        <n-button secondary @click="refreshPosts">筛选</n-button>
      </div>
      <div v-if="posts.length" class="feed-window-note">
        已加载 {{ feed.offset.value }}/{{ feed.total.value || feed.offset.value }}，当前保留 {{ posts.length }} 项
      </div>
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h3>社区热点</h3>
          <p>自动汇总近期公开帖子中的讨论重点。</p>
        </div>
      </div>
      <n-alert type="info" :show-icon="false">{{ summary?.summary || '暂无社区热点总结' }}</n-alert>
    </section>

    <transition-group v-if="posts.length" name="card-flow" tag="div" class="waterfall" appear>
      <article
        v-for="post in posts"
        :key="post.id"
        class="post-card"
        role="link"
        tabindex="0"
        @click="$router.push(`/forum/${post.id}`)"
        @keydown.enter.self="$router.push(`/forum/${post.id}`)"
        @keydown.space.self.prevent="$router.push(`/forum/${post.id}`)"
      >
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
    <section v-else-if="feed.isEmpty.value" class="surface empty-state">当前没有帖子</section>
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
import { BarChart3, Bookmark, Eye, Heart, MessageCircle, RefreshCw, Share2, Star } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { useWindowedFeed } from '../../../shared/useWindowedFeed.js';
import UserAvatar from '../../../shared/UserAvatar.vue';

const route = useRoute();
const summary = ref(null);
const filters = reactive({ keyword: '', tag: '', sort: 'recommended' });
const sortOptions = [
  { label: '推荐', value: 'recommended' },
  { label: '最新发布', value: 'new' },
  { label: '热门优先', value: 'hot' }
];
const feed = useWindowedFeed({
  pageSize: 12,
  maxItems: 48,
  loadPage: async ({ limit, offset, seed }) => {
    const params = new URLSearchParams();
    if (filters.keyword) params.set('keyword', filters.keyword);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.sort !== 'new') params.set('sort', filters.sort);
    params.set('limit', limit);
    params.set('offset', offset);
    params.set('recommendSeed', seed);
    const data = await request(`/api/forum/posts?${params.toString()}`);
    return { items: data.posts || [], pageInfo: data.pageInfo };
  }
});
const posts = computed(() => feed.items.value);

onMounted(async () => {
  filters.keyword = String(route.query.keyword || '');
  window.addEventListener('scroll', feed.handleWindowScroll, { passive: true });
  await Promise.all([feed.loadMore(), loadSummary()]);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', feed.handleWindowScroll);
});

async function loadSummary() {
  summary.value = (await request('/api/forum/summary')).summary;
}

async function refreshPosts() {
  await Promise.all([feed.refresh(), loadSummary()]);
}
</script>
