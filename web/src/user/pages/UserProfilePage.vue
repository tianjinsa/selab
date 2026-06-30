<template>
  <div class="grid" v-if="profile">
    <section class="surface panel user-profile-hero">
      <div class="user-profile-main">
        <n-avatar round :size="76" :src="profile.avatarUrl || undefined">
          {{ avatarText(profile.nickname) }}
        </n-avatar>
        <div>
          <n-space align="center" :wrap="true">
            <h2 style="margin: 0;">{{ profile.nickname || '同学' }}</h2>
            <n-tag type="success">信用分 {{ profile.creditScore }}</n-tag>
          </n-space>
          <p class="muted">学号 {{ profile.studentId }} · 加入于 {{ formatDate(profile.createdAt) }}</p>
          <p class="user-profile-bio">{{ profile.bio || '这位同学还没有填写个人简介。' }}</p>
          <p v-if="profile.contact" class="muted">公开联系方式：{{ profile.contact }}</p>
        </div>
      </div>
      <n-space>
        <n-button v-if="!isSelf" secondary @click="toggleFollow">
          {{ followed ? '取消关注' : '关注' }}
        </n-button>
        <n-button v-if="!isSelf" type="primary" @click="startConversation">发私信</n-button>
        <n-button v-else type="primary" @click="$router.push('/profile')">编辑资料</n-button>
      </n-space>
    </section>

    <section class="metric-grid">
      <div class="metric-card">
        <span>发布帖子</span>
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
        <h3 style="margin: 0;">公开帖子</h3>
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
          <n-space justify="space-between" style="margin-top: 10px;">
            <span class="muted">浏览 {{ post.viewCount }}</span>
            <span class="muted">赞 {{ post.likeCount }} · 评 {{ post.commentCount }} · 藏 {{ post.favoriteCount }}</span>
          </n-space>
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
import { request } from '../../shared/http.js';
import { loadUserSession, userSession as session } from '../session.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const profile = ref(null);
const stats = ref({ postCount: 0, followerCount: 0, followingCount: 0 });
const posts = ref([]);
const followed = ref(false);

const isSelf = computed(() => profile.value?.id === session.user?.id);

onMounted(async () => {
  await loadUserSession();
  await loadProfile();
});

watch(() => route.params.id, loadProfile);

async function loadProfile() {
  const data = await request(`/api/users/${route.params.id}`);
  profile.value = data.user;
  stats.value = data.stats || stats.value;
  posts.value = data.posts || [];
  followed.value = Boolean(data.followed);
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
