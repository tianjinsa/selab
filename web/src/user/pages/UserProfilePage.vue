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
        <n-avatar class="user-profile-avatar" round :size="92" :src="profile.avatarUrl || undefined">
          {{ avatarText(profile.nickname) }}
        </n-avatar>
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
        <span>粉丝</span>
        <strong>{{ stats.followerCount }}</strong>
      </div>
      <div class="metric-card">
        <span>关注</span>
        <strong>{{ stats.followingCount }}</strong>
      </div>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <h3 style="margin: 0;">{{ postsTitle }}</h3>
        <n-button secondary @click="$router.push('/forum')">返回社区</n-button>
      </n-space>
      <transition-group v-if="posts.length" name="card-flow" tag="div" class="waterfall user-posts" appear>
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { Eye, Heart, MessageCircle, PenLine, Share2, ShieldCheck, Star, UserCheck, UserPlus } from '@lucide/vue';
import { request } from '../../shared/http.js';
import { loadUserSession, userSession as session } from '../session.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const profile = ref(null);
const stats = ref({ postCount: 0, followerCount: 0, followingCount: 0 });
const posts = ref([]);
const followed = ref(false);
const profileViewMode = ref('owner');

const isSelf = computed(() => profile.value?.id === session.user?.id);
const coverStyle = computed(() => (
  profile.value?.coverUrl
    ? { backgroundImage: `linear-gradient(180deg, rgba(18, 27, 34, 0.12), rgba(18, 27, 34, 0.56)), url("${profile.value.coverUrl}")` }
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
const postsTitle = computed(() => (isSelf.value && profileViewMode.value === 'owner' ? '我的公开帖子' : '公开帖子'));

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

function avatarText(name = '') {
  return String(name || '同').slice(0, 1);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}
</script>
