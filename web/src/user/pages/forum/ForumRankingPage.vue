<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <div>
        <h2 style="margin: 0;">社区热度榜</h2>
        <p class="muted">浏览、点赞、评论、收藏、分享共同计入热度，最新内容会获得一定优势。</p>
      </div>
      <n-tabs v-model:value="range" type="segment" @update:value="load">
        <n-tab name="day" tab="日榜" />
        <n-tab name="week" tab="周榜" />
        <n-tab name="all" tab="总榜" />
      </n-tabs>
    </n-space>
    <n-list v-if="posts.length" style="margin-top: 14px;">
      <n-list-item v-for="(post, index) in posts" :key="post.id">
        <n-space justify="space-between" align="center">
          <div>
            <strong>#{{ index + 1 }} {{ post.title }}</strong>
            <p class="muted" style="margin: 4px 0 0;">浏览 {{ post.viewCount }} · 赞 {{ post.likeCount }} · 评 {{ post.commentCount }} · 藏 {{ post.favoriteCount }} · 分享 {{ post.shareCount }}</p>
          </div>
          <n-button secondary @click="$router.push(`/forum/${post.id}`)">查看</n-button>
        </n-space>
      </n-list-item>
    </n-list>
    <div v-else class="empty-state">暂无热榜数据</div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { request } from '../../../shared/http.js';

const range = ref('day');
const posts = ref([]);

onMounted(load);

async function load() {
  posts.value = (await request(`/api/forum/rankings?range=${range.value}`)).posts;
}
</script>
