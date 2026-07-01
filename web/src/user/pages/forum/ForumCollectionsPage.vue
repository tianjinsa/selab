<template>
  <div class="grid">
    <section class="surface panel collection-hero">
      <div>
        <span class="status-pill"><Bookmark :size="14" /> 社区收藏夹</span>
        <h2>收藏与关注</h2>
        <p class="muted">集中查看收藏过的帖子，以及已关注同学的公开动态。</p>
      </div>
      <n-space>
        <n-button secondary @click="$router.push('/forum')">返回社区</n-button>
        <n-button type="primary" @click="$router.push('/forum/new')">发布帖子</n-button>
      </n-space>
    </section>

    <section class="surface panel">
      <n-tabs type="segment" animated>
        <n-tab-pane name="favorites" tab="收藏帖子">
          <transition-group v-if="favoritePosts.length" name="card-flow" tag="div" class="waterfall" appear>
            <article v-for="post in favoritePosts" :key="post.id" class="post-card" @click="$router.push(`/forum/${post.id}`)">
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
              <small class="muted">收藏于 {{ formatTime(post.favoritedAt) }}</small>
            </article>
          </transition-group>
          <div v-else class="empty-state">还没有收藏帖子</div>
        </n-tab-pane>

        <n-tab-pane name="following" tab="关注同学">
          <transition-group v-if="followingUsers.length" name="card-flow" tag="div" class="grid grid-2" appear>
            <article v-for="user in followingUsers" :key="user.id" class="module-card follow-card">
              <div class="follow-card-head">
                <button type="button" class="comment-author inline" @click="$router.push(`/users/${user.id}`)">
                  <UserAvatar :size="42" :src="user.avatarUrl" :name="user.nickname" />
                  <span>
                    <strong>{{ user.nickname || '同学' }}</strong>
                    <small class="muted">信用分 {{ user.creditScore ?? '-' }} · 关注于 {{ formatTime(user.followedAt) }}</small>
                  </span>
                </button>
                <n-button size="small" secondary round @click="toggleFollow(user)">
                  <template #icon><UserCheck :size="15" /></template>
                  已关注
                </n-button>
              </div>
              <p class="muted follow-bio">{{ user.bio || '这位同学还没有填写个人简介。' }}</p>
              <div class="follow-stat-strip">
                <span><strong>{{ user.stats?.postCount || 0 }}</strong> 帖子</span>
                <span><strong>{{ user.stats?.followerCount || 0 }}</strong> 粉丝</span>
                <span><strong>{{ user.stats?.followingCount || 0 }}</strong> 关注</span>
              </div>
              <div v-if="user.recentPosts?.length" class="follow-recent-list">
                <button
                  v-for="post in user.recentPosts"
                  :key="post.id"
                  type="button"
                  class="follow-recent-item"
                  @click="$router.push(`/forum/${post.id}`)"
                >
                  <span>{{ post.title }}</span>
                  <small>{{ formatTime(post.createdAt) }}</small>
                </button>
              </div>
              <div v-else class="empty-state compact">暂无公开动态</div>
              <n-space>
                <n-button size="small" secondary @click="$router.push(`/users/${user.id}`)">主页</n-button>
                <n-button size="small" type="primary" @click="startConversation(user)">
                  <template #icon><Send :size="15" /></template>
                  私信
                </n-button>
              </n-space>
            </article>
          </transition-group>
          <div v-else class="empty-state">还没有关注任何同学</div>
        </n-tab-pane>
      </n-tabs>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { Bookmark, Eye, Heart, MessageCircle, Send, Share2, Star, UserCheck } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import UserAvatar from '../../../shared/UserAvatar.vue';

const router = useRouter();
const message = useMessage();
const favoritePosts = ref([]);
const followingUsers = ref([]);

onMounted(load);

async function load() {
  const [favorites, following] = await Promise.all([
    request('/api/forum/me/favorites'),
    request('/api/forum/me/following')
  ]);
  favoritePosts.value = favorites.posts || [];
  followingUsers.value = following.users || [];
}

async function toggleFollow(user) {
  await request(`/api/forum/follow/${user.id}`, { method: 'POST' });
  message.success('已取消关注');
  await load();
}

async function startConversation(user) {
  const data = await request(`/api/conversations/by-user/${user.id}`, { method: 'POST' });
  router.push(`/messages/${data.conversation.id}`);
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
