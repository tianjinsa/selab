<template>
  <div class="grid profile-content-page">
    <section class="surface panel collection-hero">
      <div>
        <button type="button" class="comment-author inline" @click="$router.push(`/users/${route.params.id}`)">
          <UserAvatar :size="42" :src="profileUser.avatarUrl" :name="profileUser.nickname" />
          <span>
            <strong>{{ profileUser.nickname || '同学' }}</strong>
            <small class="muted">信用分 {{ profileUser.creditScore ?? '-' }}</small>
          </span>
        </button>
        <h2>{{ typeMeta.title }}</h2>
        <p class="muted">共 {{ pageInfo.total }} 项，每页 {{ pageSize }} 项。</p>
      </div>
      <n-space>
        <n-button secondary @click="$router.push(`/users/${route.params.id}`)">
          <template #icon><ArrowLeft :size="16" /></template>
          返回主页
        </n-button>
      </n-space>
    </section>

    <transition-group v-if="items.length" name="card-flow" tag="div" :class="contentGridClass" appear>
      <article v-for="item in items" :key="item.id" :class="cardClass" @click="openItem(item)">
        <template v-if="contentType === 'posts'">
          <img v-if="item.imageUrls?.[0]" class="post-cover" :src="assetUrl(item.imageUrls[0])" alt="帖子封面" />
          <n-space justify="space-between" align="center">
            <strong>{{ item.title }}</strong>
            <n-tag size="small">{{ item.type }}</n-tag>
          </n-space>
          <p class="muted">{{ (item.content || '').slice(0, 110) }}</p>
          <div class="post-card-footer">
            <span class="post-stat" title="浏览"><Eye :size="14" />{{ item.viewCount }}</span>
            <div class="post-stat-row">
              <span class="post-stat" title="点赞"><Heart :size="14" />{{ item.likeCount }}</span>
              <span class="post-stat" title="评论"><MessageCircle :size="14" />{{ item.commentCount }}</span>
              <span class="post-stat" title="收藏"><Star :size="14" />{{ item.favoriteCount }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="contentType === 'tasks'">
          <div>
            <img v-if="item.imageUrls?.[0]" class="post-cover" :src="assetUrl(item.imageUrls[0])" alt="任务图片" />
            <n-space justify="space-between" align="center">
              <strong>{{ item.title }}</strong>
              <n-tag size="small" :type="taskStatusType(item.status)">{{ taskStatusText[item.status] }}</n-tag>
            </n-space>
            <p class="muted">{{ item.category }} · {{ item.campusArea }} · {{ formatTaskMoney(item.reward) }}</p>
            <p>{{ (item.detail || '').slice(0, 120) }}</p>
          </div>
          <n-button secondary @click.stop="$router.push(`/tasks/${item.id}`)">查看任务</n-button>
        </template>

        <template v-else>
          <div>
            <img v-if="item.imageUrls?.[0]" class="post-cover" :src="assetUrl(item.imageUrls[0])" alt="商品图" />
            <n-space justify="space-between" align="center">
              <strong>{{ item.title }}</strong>
              <n-tag size="small" :type="productStatusType(item.status)">{{ productStatusText[item.status] }}</n-tag>
            </n-space>
            <p class="muted">{{ item.category?.name || '未分类' }} · {{ item.condition }} · {{ item.tradeMethod }}</p>
            <p class="market-favorite-price">{{ formatProductMoney(item.price) }}</p>
          </div>
          <n-button secondary @click.stop="$router.push(`/market/${item.id}`)">查看商品</n-button>
        </template>
      </article>
    </transition-group>
    <section v-else class="surface empty-state">当前没有{{ typeMeta.emptyName }}</section>

    <section class="profile-content-pagination surface panel">
      <n-pagination
        v-model:page="page"
        :page-size="pageSize"
        :item-count="pageInfo.total"
        :disabled="loading"
        @update:page="loadContent"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Eye, Heart, MessageCircle, Star } from '@lucide/vue';
import { assetUrl, request } from '../../shared/http.js';
import UserAvatar from '../../shared/UserAvatar.vue';
import { formatMoney as formatTaskMoney, taskStatusText, taskStatusType } from './tasks/taskFormat.js';
import { formatMoney as formatProductMoney, productStatusText, productStatusType } from './market/marketFormat.js';

const route = useRoute();
const router = useRouter();
const page = ref(1);
const pageSize = 12;
const loading = ref(false);
const items = ref([]);
const profileUser = reactive({ nickname: '', avatarUrl: '', creditScore: '-' });
const pageInfo = reactive({ total: 0, limit: pageSize, offset: 0, hasMore: false });

const contentType = computed(() => {
  const value = String(route.params.type || 'posts');
  return ['posts', 'tasks', 'products'].includes(value) ? value : 'posts';
});
const typeMeta = computed(() => ({
  posts: { title: '全部公开帖子', emptyName: '公开帖子' },
  tasks: { title: '全部公开任务', emptyName: '公开任务' },
  products: { title: '全部公开商品', emptyName: '公开商品' }
}[contentType.value]));
const contentGridClass = computed(() => (contentType.value === 'posts' ? 'waterfall' : 'grid grid-3 profile-preview-grid'));
const cardClass = computed(() => (contentType.value === 'posts' ? 'post-card profile-preview-card' : 'module-card profile-preview-card'));

onMounted(loadContent);

watch(() => [route.params.id, route.params.type], () => {
  page.value = 1;
  loadContent();
});

async function loadContent() {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      type: contentType.value,
      page: page.value,
      limit: pageSize
    });
    const data = await request(`/api/users/${route.params.id}/content?${params.toString()}`);
    items.value = data.items || [];
    Object.assign(profileUser, data.user || {});
    Object.assign(pageInfo, data.pageInfo || { total: items.value.length, limit: pageSize, offset: 0, hasMore: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    loading.value = false;
  }
}

function openItem(item) {
  if (contentType.value === 'tasks') router.push(`/tasks/${item.id}`);
  else if (contentType.value === 'products') router.push(`/market/${item.id}`);
  else router.push(`/forum/${item.id}`);
}
</script>
