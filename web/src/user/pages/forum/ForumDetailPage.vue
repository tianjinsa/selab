<template>
  <div class="forum-detail-page" v-if="post">
    <section class="forum-detail-viewer" :class="imageUrls.length ? 'has-images' : 'no-images'">
      <div class="forum-media-pane">
        <button type="button" class="forum-detail-close" title="返回社区" @click="$router.push('/forum')">
          <ArrowLeft :size="22" />
        </button>

        <div class="forum-media-stage">
          <template v-if="imageUrls.length">
            <img class="forum-media-image" :src="currentImage" alt="帖子图片" />
            <div class="forum-media-counter">{{ currentImageIndex + 1 }}/{{ imageUrls.length }}</div>
            <button
              v-if="imageUrls.length > 1"
              type="button"
              class="forum-media-nav prev"
              title="上一张"
              @click="showPrevImage"
            >
              <ChevronLeft :size="24" />
            </button>
            <button
              v-if="imageUrls.length > 1"
              type="button"
              class="forum-media-nav next"
              title="下一张"
              @click="showNextImage"
            >
              <ChevronRight :size="24" />
            </button>
            <div v-if="imageUrls.length > 1" class="forum-media-dots" aria-label="图片进度">
              <button
                v-for="(url, index) in imageUrls"
                :key="url"
                type="button"
                :class="{ active: index === currentImageIndex }"
                @click="currentImageIndex = index"
              ></button>
            </div>
          </template>
          <div v-else class="forum-text-stage">
            <n-tag :bordered="false">{{ post.type }}</n-tag>
            <h2>{{ post.title }}</h2>
            <p>{{ post.content }}</p>
          </div>
        </div>
      </div>

      <aside class="forum-info-pane">
        <header class="forum-info-author">
          <button type="button" class="forum-author-identity" @click="$router.push(`/users/${post.authorId}`)">
            <UserAvatar :size="46" :src="post.author?.avatarUrl" :name="post.author?.nickname" />
            <span>
              <strong>{{ post.author?.nickname || '同学' }}</strong>
              <small>信用分 {{ post.author?.creditScore ?? '-' }}</small>
            </span>
          </button>
          <n-space>
            <n-button v-if="post.authorId !== session.user?.id" secondary circle title="私信" @click="startConversation">
              <template #icon><Send :size="16" /></template>
            </n-button>
            <n-button
              v-if="post.authorId !== session.user?.id"
              class="forum-follow-pill"
              round
              :secondary="post.followedAuthor"
              :type="post.followedAuthor ? 'default' : 'error'"
              @click="followAuthor"
            >
              <template #icon>
                <component :is="post.followedAuthor ? UserCheck : UserPlus" :size="15" />
              </template>
              {{ post.followedAuthor ? '已关注' : '关注' }}
            </n-button>
          </n-space>
        </header>

        <div class="forum-info-scroll">
          <article class="forum-note-body">
            <n-space size="small">
              <n-tag>{{ post.type }}</n-tag>
              <n-tag v-for="tag in post.tags" :key="tag" :bordered="false">#{{ tag }}</n-tag>
            </n-space>
            <h2>{{ post.title }}</h2>
            <p>{{ post.content }}</p>
            <div class="forum-note-meta">
              <span>{{ formatDate(post.createdAt) }}</span>
              <span>{{ post.viewCount }} 浏览</span>
              <button type="button" @click="report('post', post.id)">
                <Flag :size="14" />
                举报
              </button>
            </div>
          </article>

          <section id="post-comments" class="forum-comment-section">
            <div class="forum-section-heading">
              <strong>共 {{ post.commentCount }} 条评论</strong>
            </div>

            <transition-group v-if="post.comments?.length" name="comment-flow" tag="div" class="forum-comment-list" appear>
              <article v-for="comment in post.comments" :key="comment.id" class="forum-comment-item">
                <button type="button" class="comment-author" @click="$router.push(`/users/${comment.authorId}`)">
                  <UserAvatar :size="34" :src="comment.author?.avatarUrl" :name="comment.author?.nickname" />
                  <strong>{{ comment.author?.nickname || '同学' }}</strong>
                </button>
                <p>{{ comment.content }}</p>
                <div class="forum-comment-actions">
                  <span>{{ formatDate(comment.createdAt) }}</span>
                  <button type="button" @click="likeComment(comment.id)">
                    <Heart :size="14" />
                    {{ comment.likeCount || '赞' }}
                  </button>
                  <button type="button" @click="replyTo = replyTo === comment.id ? '' : comment.id">
                    <MessageCircle :size="14" />
                    回复
                  </button>
                  <button type="button" @click="report('comment', comment.id)">
                    <Flag :size="14" />
                    举报
                  </button>
                </div>

                <div v-if="comment.replies?.length" class="forum-reply-list">
                  <div v-for="reply in comment.replies" :key="reply.id" class="forum-reply-item">
                    <button type="button" class="comment-author inline" @click="$router.push(`/users/${reply.authorId}`)">
                      <UserAvatar :size="24" :src="reply.author?.avatarUrl" :name="reply.author?.nickname" />
                      <strong>{{ reply.author?.nickname || '同学' }}</strong>
                    </button>
                    <span>{{ reply.content }}</span>
                  </div>
                </div>

                <div v-if="replyTo === comment.id" class="forum-reply-composer">
                  <n-input v-model:value="replyText" placeholder="回复内容" />
                  <n-button size="small" type="primary" @click="sendComment(comment.id)">发送</n-button>
                </div>
              </article>
            </transition-group>
            <div v-else class="empty-state compact">还没有评论</div>
          </section>
        </div>

        <footer class="forum-detail-actions">
          <div class="forum-comment-composer">
            <n-input
              ref="commentInputRef"
              v-model:value="commentText"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              placeholder="说点什么..."
              @keyup.enter.exact.prevent="sendComment('')"
            />
            <n-button type="primary" circle @click="sendComment('')">
              <template #icon><Send :size="16" /></template>
            </n-button>
          </div>
          <div class="forum-social-actions">
            <button type="button" :class="{ active: post.liked }" @click="likePost">
              <Heart :size="21" :fill="post.liked ? 'currentColor' : 'none'" />
              <span>{{ post.likeCount }}</span>
            </button>
            <button type="button" :class="{ active: post.favorited }" @click="favoritePost">
              <Star :size="21" :fill="post.favorited ? 'currentColor' : 'none'" />
              <span>{{ post.favoriteCount }}</span>
            </button>
            <button type="button" @click="focusComment">
              <MessageCircle :size="21" />
              <span>{{ post.commentCount }}</span>
            </button>
            <button type="button" @click="sharePost">
              <Share2 :size="21" />
              <span>{{ post.shareCount }}</span>
            </button>
          </div>
        </footer>
      </aside>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  MessageCircle,
  Send,
  Share2,
  Star,
  UserCheck,
  UserPlus
} from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import UserAvatar from '../../../shared/UserAvatar.vue';
import { loadUserSession, userSession as session } from '../../session.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const post = ref(null);
const commentText = ref('');
const replyText = ref('');
const replyTo = ref('');
const commentInputRef = ref(null);
const currentImageIndex = ref(0);
const imageUrls = computed(() => Array.isArray(post.value?.imageUrls) ? post.value.imageUrls : []);
const currentImage = computed(() => assetUrl(imageUrls.value[currentImageIndex.value] || imageUrls.value[0] || ''));

onMounted(async () => {
  if (!session.user) await loadUserSession();
  await load(true);
});

async function load(trackView = false) {
  const params = trackView ? '' : '?trackView=false';
  post.value = (await request(`/api/forum/posts/${route.params.id}${params}`)).post;
  if (currentImageIndex.value >= imageUrls.value.length) currentImageIndex.value = 0;
}

async function likePost() {
  await request(`/api/forum/posts/${post.value.id}/like`, { method: 'POST' });
  await load(false);
}

async function favoritePost() {
  await request(`/api/forum/posts/${post.value.id}/favorite`, { method: 'POST' });
  await load(false);
}

async function followAuthor() {
  await request(`/api/forum/follow/${post.value.authorId}`, { method: 'POST' });
  await load(false);
  message.success(post.value.followedAuthor ? '已关注作者' : '已取消关注');
}

async function startConversation() {
  const data = await request(`/api/conversations/by-user/${post.value.authorId}`, { method: 'POST' });
  router.push(`/messages/${data.conversation.id}`);
}

async function sharePost() {
  await request(`/api/forum/posts/${post.value.id}/share`, { method: 'POST' });
  message.success('分享卡片已生成，链接可在浏览器地址栏复制');
  await load(false);
}

async function focusComment() {
  document.getElementById('post-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await nextTick();
  commentInputRef.value?.focus?.();
}

async function sendComment(parentId) {
  const content = parentId ? replyText.value : commentText.value;
  if (!content.trim()) return message.warning('请输入评论内容');
  await request(`/api/forum/posts/${post.value.id}/comments`, { method: 'POST', body: { content, parentId } });
  commentText.value = '';
  replyText.value = '';
  replyTo.value = '';
  await load(false);
}

async function likeComment(id) {
  await request(`/api/forum/comments/${id}/like`, { method: 'POST' });
  await load(false);
}

async function report(type, targetId) {
  const reason = type === 'post' ? '用户在帖子详情页举报该帖子' : '用户在帖子详情页举报该评论';
  await request('/api/forum/reports', { method: 'POST', body: { type, targetId, reason } });
  message.success('举报已提交，管理员将处理');
}

function showPrevImage() {
  if (!imageUrls.value.length) return;
  currentImageIndex.value = (currentImageIndex.value - 1 + imageUrls.value.length) % imageUrls.value.length;
}

function showNextImage() {
  if (!imageUrls.value.length) return;
  currentImageIndex.value = (currentImageIndex.value + 1) % imageUrls.value.length;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}
</script>
