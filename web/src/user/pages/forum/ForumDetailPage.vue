<template>
  <div class="grid" v-if="post">
    <section class="surface panel">
      <n-space justify="space-between" align="start">
        <div>
          <n-space align="center">
            <h2 style="margin: 0;">{{ post.title }}</h2>
            <n-tag>{{ post.type }}</n-tag>
          </n-space>
          <p class="muted">{{ post.author?.nickname }} · 浏览 {{ post.viewCount }}</p>
        </div>
        <n-button secondary @click="$router.push('/forum')">返回社区</n-button>
      </n-space>
      <img v-if="post.imageUrls?.[0]" class="post-cover" :src="post.imageUrls[0]" alt="帖子封面" style="max-height: 420px;" />
      <p style="white-space: pre-wrap;">{{ post.content }}</p>
      <n-space size="small">
        <n-tag v-for="tag in post.tags" :key="tag">{{ tag }}</n-tag>
      </n-space>
      <n-space style="margin-top: 16px;">
        <n-button secondary @click="likePost">{{ post.liked ? '取消点赞' : '点赞' }} · {{ post.likeCount }}</n-button>
        <n-button secondary @click="favoritePost">{{ post.favorited ? '取消收藏' : '收藏' }} · {{ post.favoriteCount }}</n-button>
        <n-button secondary @click="followAuthor">{{ post.followedAuthor ? '取消关注' : '关注作者' }}</n-button>
        <n-button secondary @click="sharePost">分享 · {{ post.shareCount }}</n-button>
      </n-space>
    </section>

    <section class="surface panel">
      <h3 style="margin-top: 0;">评论</h3>
      <n-input v-model:value="commentText" type="textarea" :autosize="{ minRows: 2 }" placeholder="写下你的评论" />
      <n-button style="margin-top: 10px;" type="primary" @click="sendComment('')">发表评论</n-button>
      <n-list v-if="post.comments?.length" style="margin-top: 16px;">
        <n-list-item v-for="comment in post.comments" :key="comment.id">
          <div>
            <n-space justify="space-between">
              <strong>{{ comment.author?.nickname }}</strong>
              <n-space>
                <n-button text @click="likeComment(comment.id)">赞 {{ comment.likeCount }}</n-button>
                <n-button text @click="replyTo = replyTo === comment.id ? '' : comment.id">回复</n-button>
                <n-button text type="warning" @click="report('comment', comment.id)">举报</n-button>
              </n-space>
            </n-space>
            <p>{{ comment.content }}</p>
            <div v-for="reply in comment.replies" :key="reply.id" class="metric-card" style="margin: 8px 0 0 20px;">
              <strong>{{ reply.author?.nickname }}</strong>：{{ reply.content }}
            </div>
            <div v-if="replyTo === comment.id" style="margin-top: 8px;">
              <n-input v-model:value="replyText" placeholder="回复内容" />
              <n-button size="small" style="margin-top: 6px;" @click="sendComment(comment.id)">发送回复</n-button>
            </div>
          </div>
        </n-list-item>
      </n-list>
      <div v-else class="empty-state">还没有评论</div>
    </section>

    <section class="surface panel">
      <n-collapse>
        <n-collapse-item title="举报帖子" name="report">
          <n-input v-model:value="reportReason" type="textarea" placeholder="说明举报原因" />
          <n-button style="margin-top: 10px;" secondary type="warning" @click="report('post', post.id)">提交举报</n-button>
        </n-collapse-item>
      </n-collapse>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useMessage } from 'naive-ui';
import { request } from '../../../shared/http.js';

const route = useRoute();
const message = useMessage();
const post = ref(null);
const commentText = ref('');
const replyText = ref('');
const replyTo = ref('');
const reportReason = ref('');

onMounted(load);

async function load() {
  post.value = (await request(`/api/forum/posts/${route.params.id}`)).post;
}

async function likePost() {
  await request(`/api/forum/posts/${post.value.id}/like`, { method: 'POST' });
  await load();
}

async function favoritePost() {
  await request(`/api/forum/posts/${post.value.id}/favorite`, { method: 'POST' });
  await load();
}

async function followAuthor() {
  await request(`/api/forum/follow/${post.value.authorId}`, { method: 'POST' });
  await load();
}

async function sharePost() {
  await request(`/api/forum/posts/${post.value.id}/share`, { method: 'POST' });
  message.success('分享卡片已生成，链接可在浏览器地址栏复制');
  await load();
}

async function sendComment(parentId) {
  const content = parentId ? replyText.value : commentText.value;
  if (!content.trim()) return message.warning('请输入评论内容');
  await request(`/api/forum/posts/${post.value.id}/comments`, { method: 'POST', body: { content, parentId } });
  commentText.value = '';
  replyText.value = '';
  replyTo.value = '';
  await load();
}

async function likeComment(id) {
  await request(`/api/forum/comments/${id}/like`, { method: 'POST' });
  await load();
}

async function report(type, targetId) {
  if (!reportReason.value.trim()) return message.warning('请填写举报原因');
  await request('/api/forum/reports', { method: 'POST', body: { type, targetId, reason: reportReason.value } });
  reportReason.value = '';
  message.success('举报已提交，管理员将处理');
}
</script>
