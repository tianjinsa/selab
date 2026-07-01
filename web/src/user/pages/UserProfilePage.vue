<template>
  <div class="grid user-profile-page" v-if="profile">
    <section class="user-profile-hero">
      <div class="user-profile-cover" :style="coverStyle">
        <div v-if="isSelf" class="profile-view-switch">
          <span>查看视角</span>
          <n-radio-group v-model:value="profileViewMode" size="small">
            <n-radio-button value="owner">自己</n-radio-button>
            <n-radio-button value="visitor">访客</n-radio-button>
            <n-radio-button value="fan">粉丝</n-radio-button>
          </n-radio-group>
        </div>
      </div>

      <div class="user-profile-identity">
        <UserAvatar class="user-profile-avatar" :size="92" :src="profile.avatarUrl" :name="profile.nickname" />
        <div class="user-profile-info">
          <n-space align="center" :wrap="true">
            <h2 class="user-profile-name">{{ profile.nickname || '同学' }}</h2>
            <n-tag :type="creditTagType">
              <template #icon><ShieldCheck :size="13" /></template>
              信用分 {{ profile.creditScore }}
            </n-tag>
            <n-tag v-if="isSelf && profileViewMode !== 'owner'" size="small" type="info">
              {{ viewModeLabel }}
            </n-tag>
          </n-space>
          <p class="muted">学号 {{ profile.studentId }} · 加入于 {{ formatDate(profile.createdAt) }}</p>
          <p class="user-profile-bio">{{ profile.bio || '这位同学还没有填写个人简介。' }}</p>
          <p v-if="profile.contact" class="muted">公开联系方式：{{ profile.contact }}</p>
        </div>
        <div class="user-profile-actions">
          <template v-if="!isSelf">
            <n-button secondary @click="toggleFollow">
              <template #icon>
                <component :is="followed ? UserCheck : UserPlus" :size="16" />
              </template>
              {{ followed ? '已关注' : '关注' }}
            </n-button>
            <n-button type="primary" @click="startConversation">
              <template #icon><MessageCircle :size="16" /></template>
              发私信
            </n-button>
          </template>
          <n-button v-else-if="profileViewMode === 'owner'" type="primary" @click="$router.push('/profile')">
            <template #icon><PenLine :size="16" /></template>
            编辑资料
          </n-button>
          <n-tag v-else-if="profileViewMode === 'fan'" type="success">
            <template #icon><UserCheck :size="13" /></template>
            已关注视角
          </n-tag>
        </div>
      </div>
    </section>

    <section v-if="isSelf" class="profile-owner-note">
      <strong>{{ viewModeLabel }}</strong>
      <span>{{ viewModeDescription }}</span>
    </section>

    <section class="metric-grid">
      <div class="metric-card">
        <span>{{ postMetricLabel }}</span>
        <strong>{{ stats.postCount }}</strong>
      </div>
      <div class="metric-card">
        <span>{{ taskMetricLabel }}</span>
        <strong>{{ stats.taskCount }}</strong>
      </div>
      <div class="metric-card">
        <span>{{ productMetricLabel }}</span>
        <strong>{{ stats.productCount }}</strong>
      </div>
      <div class="metric-card">
        <span>粉丝</span>
        <strong>{{ stats.followerCount }}</strong>
      </div>
      <div class="metric-card">
        <span>关注</span>
        <strong>{{ stats.followingCount }}</strong>
      </div>
    </section>

    <section class="surface panel profile-content-section">
      <div class="profile-content-head">
        <div>
          <h3>{{ postsTitle }}</h3>
          <p class="muted">共 {{ stats.postCount }} 篇，主页仅展示最近内容。</p>
        </div>
        <n-button secondary @click="openProfileContent('posts')">查看全部</n-button>
      </div>
      <transition-group v-if="posts.length" name="card-flow" tag="div" class="waterfall user-posts" appear>
        <article v-for="post in posts" :key="post.id" class="post-card profile-preview-card" @click="$router.push(`/forum/${post.id}`)">
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
            <span class="post-stat" title="浏览"><Eye :size="14" />{{ post.viewCount }}</span>
            <div class="post-stat-row" aria-label="帖子互动数据">
              <span class="post-stat" title="点赞"><Heart :size="14" />{{ post.likeCount }}</span>
              <span class="post-stat" title="评论"><MessageCircle :size="14" />{{ post.commentCount }}</span>
              <span class="post-stat" title="收藏"><Star :size="14" />{{ post.favoriteCount }}</span>
              <span class="post-stat" title="分享"><Share2 :size="14" />{{ post.shareCount }}</span>
            </div>
          </div>
        </article>
      </transition-group>
      <div v-else class="empty-state">还没有公开帖子</div>
    </section>

    <section class="surface panel profile-content-section">
      <div class="profile-content-head">
        <div>
          <h3>{{ tasksTitle }}</h3>
          <p class="muted">共 {{ stats.taskCount }} 个，审核通过后才会展示。</p>
        </div>
        <n-button secondary @click="openProfileContent('tasks')">查看全部</n-button>
      </div>
      <transition-group v-if="tasks.length" name="card-flow" tag="div" class="grid grid-3 profile-preview-grid" appear>
        <article v-for="task in tasks" :key="task.id" class="module-card profile-preview-card">
          <div>
            <img v-if="task.imageUrls?.[0]" class="post-cover" :src="assetUrl(task.imageUrls[0])" alt="任务图片" />
            <n-space justify="space-between" align="center">
              <strong>{{ task.title }}</strong>
              <n-tag size="small" :type="taskStatusType(task.status)">{{ taskStatusText[task.status] }}</n-tag>
            </n-space>
            <p class="muted">{{ task.category }} · {{ task.campusArea }} · {{ formatTaskMoney(task.reward) }}</p>
            <p>{{ (task.detail || '').slice(0, 96) }}</p>
          </div>
          <n-button secondary @click="$router.push(`/tasks/${task.id}`)">查看任务</n-button>
        </article>
      </transition-group>
      <div v-else class="empty-state">还没有公开任务</div>
    </section>

    <section class="surface panel profile-content-section">
      <div class="profile-content-head">
        <div>
          <h3>{{ productsTitle }}</h3>
          <p class="muted">共 {{ stats.productCount }} 个，审核通过后才会展示。</p>
        </div>
        <n-button secondary @click="openProfileContent('products')">查看全部</n-button>
      </div>
      <transition-group v-if="products.length" name="card-flow" tag="div" class="grid grid-3 profile-preview-grid" appear>
        <article v-for="product in products" :key="product.id" class="module-card profile-preview-card">
          <div>
            <img v-if="product.imageUrls?.[0]" class="post-cover" :src="assetUrl(product.imageUrls[0])" alt="商品图" />
            <n-space justify="space-between" align="center">
              <strong>{{ product.title }}</strong>
              <n-tag size="small" :type="productStatusType(product.status)">{{ productStatusText[product.status] }}</n-tag>
            </n-space>
            <p class="muted">{{ product.category?.name || '未分类' }} · {{ product.condition }}</p>
            <p class="market-favorite-price">{{ formatProductMoney(product.price) }}</p>
          </div>
          <n-button secondary @click="$router.push(`/market/${product.id}`)">查看商品</n-button>
        </article>
      </transition-group>
      <div v-else class="empty-state">还没有公开商品</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { Eye, Heart, MessageCircle, PenLine, Share2, ShieldCheck, Star, UserCheck, UserPlus } from '@lucide/vue';
import { assetUrl, request } from '../../shared/http.js';
import UserAvatar from '../../shared/UserAvatar.vue';
import { loadUserSession, userSession as session } from '../session.js';
import { formatMoney as formatTaskMoney, taskStatusText, taskStatusType } from './tasks/taskFormat.js';
import { formatMoney as formatProductMoney, productStatusText, productStatusType } from './market/marketFormat.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const profile = ref(null);
const stats = ref({ postCount: 0, taskCount: 0, productCount: 0, followerCount: 0, followingCount: 0 });
const posts = ref([]);
const tasks = ref([]);
const products = ref([]);
const followed = ref(false);
const profileViewMode = ref('owner');

const isSelf = computed(() => profile.value?.id === session.user?.id);
const coverStyle = computed(() => (
  profile.value?.coverUrl
    ? { backgroundImage: `linear-gradient(180deg, rgba(18, 27, 34, 0.12), rgba(18, 27, 34, 0.56)), url("${assetUrl(profile.value.coverUrl)}")` }
    : {}
));
const creditTagType = computed(() => {
  const score = Number(profile.value?.creditScore ?? 0);
  if (score >= 8) return 'success';
  if (score >= 6) return 'warning';
  return 'error';
});
const viewModeLabel = computed(() => {
  if (profileViewMode.value === 'visitor') return '访客视角';
  if (profileViewMode.value === 'fan') return '粉丝视角';
  return '自己视角';
});
const viewModeDescription = computed(() => {
  if (profileViewMode.value === 'visitor') return '你正在查看普通同学看到的公开主页，编辑入口已隐藏。';
  if (profileViewMode.value === 'fan') return '你正在查看关注你的同学看到的公开主页状态。';
  return '你可以维护资料、检查公开内容，并确认主页展示是否完整。';
});
const postMetricLabel = computed(() => (isSelf.value && profileViewMode.value === 'owner' ? '我的公开帖子' : '公开帖子'));
const taskMetricLabel = computed(() => (isSelf.value && profileViewMode.value === 'owner' ? '我的公开任务' : '公开任务'));
const productMetricLabel = computed(() => (isSelf.value && profileViewMode.value === 'owner' ? '我的在售商品' : '公开商品'));
const postsTitle = computed(() => (isSelf.value && profileViewMode.value === 'owner' ? '我的公开帖子' : '公开帖子'));
const tasksTitle = computed(() => (isSelf.value && profileViewMode.value === 'owner' ? '我的公开任务' : '公开任务'));
const productsTitle = computed(() => (isSelf.value && profileViewMode.value === 'owner' ? '我的公开商品' : '公开商品'));

onMounted(async () => {
  await loadUserSession();
  await loadProfile();
});

watch(() => route.params.id, loadProfile);

async function loadProfile() {
  const data = await request(`/api/users/${route.params.id}`);
  const wasViewingAnotherUser = profile.value?.id && profile.value.id !== data.user?.id;
  profile.value = data.user;
  stats.value = data.stats || stats.value;
  posts.value = data.posts || [];
  tasks.value = data.tasks || [];
  products.value = data.products || [];
  followed.value = Boolean(data.followed);
  if (data.user?.id !== session.user?.id) {
    profileViewMode.value = 'visitor';
  } else if (wasViewingAnotherUser || !['owner', 'visitor', 'fan'].includes(profileViewMode.value)) {
    profileViewMode.value = 'owner';
  }
}

async function toggleFollow() {
  await request(`/api/forum/follow/${profile.value.id}`, { method: 'POST' });
  await loadProfile();
  message.success(followed.value ? '已关注' : '已取消关注');
}

async function startConversation() {
  const data = await request(`/api/conversations/by-user/${profile.value.id}`, { method: 'POST' });
  router.push(`/messages/${data.conversation.id}`);
}

function openProfileContent(type) {
  router.push(`/users/${profile.value.id}/content/${type}`);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}
</script>
