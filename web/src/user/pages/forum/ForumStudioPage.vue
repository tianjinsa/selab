<template>
  <div class="grid">
    <section class="surface panel creator-hero">
      <div>
        <span class="status-pill"><BarChart3 :size="14" /> 创作中心</span>
        <h2>帖子管理后台</h2>
        <p class="muted">查看发布数据、审核状态和违规打回原因，违规内容修改后会重新进入审核流程。</p>
      </div>
      <n-space>
        <n-button secondary @click="$router.push('/forum')">
          <template #icon><ArrowLeft :size="16" /></template>
          返回社区
        </n-button>
        <n-button type="primary" @click="$router.push('/forum/new')">
          <template #icon><Plus :size="16" /></template>
          发布帖子
        </n-button>
      </n-space>
    </section>

    <section class="creator-stat-grid">
      <article class="metric-card creator-stat">
        <span>已发布</span>
        <strong>{{ stats.total }}</strong>
        <small class="muted">审核中 {{ stats.pending }} · 违规 {{ stats.rejected }}</small>
      </article>
      <article class="metric-card creator-stat">
        <span>总浏览</span>
        <strong>{{ stats.views }}</strong>
        <small class="muted">来自全部未删除帖子</small>
      </article>
      <article class="metric-card creator-stat">
        <span>互动</span>
        <strong>{{ stats.likes + stats.comments + stats.favorites + stats.shares }}</strong>
        <small class="muted">赞评藏转合计</small>
      </article>
      <article class="metric-card creator-stat">
        <span>审核通过</span>
        <strong>{{ stats.approved }}</strong>
        <small class="muted">隐藏 {{ stats.hidden }}</small>
      </article>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h3 style="margin: 0;">我的帖子</h3>
          <p class="muted" style="margin: 6px 0 0;">像内容后台一样集中处理发布、数据和违规重发。</p>
        </div>
        <n-button text type="primary" :loading="loading" @click="load">刷新</n-button>
      </n-space>

      <n-tabs v-model:value="activeStatus" type="segment" animated style="margin-top: 14px;">
        <n-tab-pane name="all" tab="全部" />
        <n-tab-pane name="pending" tab="审核中" />
        <n-tab-pane name="approved" tab="已通过" />
        <n-tab-pane name="rejected" tab="违规打回" />
      </n-tabs>

      <transition-group v-if="filteredPosts.length" name="card-flow" tag="div" class="creator-post-list" appear>
        <article v-for="post in filteredPosts" :key="post.id" class="creator-post-card">
          <img v-if="post.imageUrls?.[0]" class="creator-post-cover" :src="assetUrl(post.imageUrls[0])" alt="帖子封面" />
          <div class="creator-post-main">
            <div class="creator-post-head">
              <div>
                <n-space size="small" align="center">
                  <strong>{{ post.title }}</strong>
                  <n-tag size="small">{{ post.type }}</n-tag>
                  <n-tag size="small" :type="moderationType(post.moderationStatus)">
                    {{ moderationText(post.moderationStatus) }}
                  </n-tag>
                </n-space>
                <p class="muted">{{ post.content.slice(0, 96) }}</p>
              </div>
              <n-space>
                <n-button size="small" secondary @click="$router.push(`/forum/${post.id}`)">查看</n-button>
                <n-button v-if="post.moderationStatus === 'rejected'" size="small" type="primary" @click="openEditor(post)">
                  <template #icon><RefreshCcw :size="15" /></template>
                  修改重发
                </n-button>
              </n-space>
            </div>
            <n-alert v-if="post.moderationStatus === 'rejected'" type="error" :show-icon="false" class="creator-reason">
              {{ post.moderationReason || '内容审核未通过，请修改后重新提交。' }}
            </n-alert>
            <div class="creator-metrics">
              <span><Eye :size="14" />{{ post.viewCount || 0 }} 浏览</span>
              <span><Heart :size="14" />{{ post.likeCount || 0 }} 点赞</span>
              <span><MessageCircle :size="14" />{{ post.commentCount || 0 }} 评论</span>
              <span><Star :size="14" />{{ post.favoriteCount || 0 }} 收藏</span>
              <span><Share2 :size="14" />{{ post.shareCount || 0 }} 分享</span>
            </div>
            <n-space size="small">
              <n-tag v-for="tag in post.tags" :key="tag" size="small" :bordered="false">#{{ tag }}</n-tag>
              <span class="muted">更新于 {{ formatTime(post.updatedAt || post.createdAt) }}</span>
            </n-space>
          </div>
        </article>
      </transition-group>
      <div v-else class="empty-state">当前筛选下没有帖子</div>
    </section>

    <n-modal v-model:show="editorVisible" preset="card" title="修改违规帖子并重新提交" class="creator-editor-modal">
      <n-form :model="editForm" label-placement="top">
        <n-form-item label="标题">
          <n-input v-model:value="editForm.title" maxlength="60" show-count />
        </n-form-item>
        <n-form-item label="帖子类型">
          <n-select v-model:value="editForm.type" :options="typeOptions" />
        </n-form-item>
        <n-form-item label="正文">
          <n-input v-model:value="editForm.content" type="textarea" :autosize="{ minRows: 5 }" />
        </n-form-item>
        <n-form-item label="Tag">
          <n-dynamic-tags v-model:value="editForm.tags" :max="5" />
        </n-form-item>
        <n-form-item label="图片">
          <div class="upload-field">
            <n-upload
              multiple
              accept="image/jpeg,image/png,image/webp"
              :max="9"
              :show-file-list="false"
              :custom-request="uploadImage"
            >
              <n-button secondary :loading="uploading">上传图片</n-button>
            </n-upload>
            <span class="muted">可删除违规图片，最多保留 9 张。</span>
          </div>
          <div v-if="editForm.imageUrls.length" class="image-preview-grid creator-edit-images">
            <div v-for="url in editForm.imageUrls" :key="url" class="image-preview-item">
              <img :src="assetUrl(url)" alt="帖子图片" />
              <n-button circle quaternary size="small" @click="removeImage(url)">
                <template #icon><X :size="15" /></template>
              </n-button>
            </div>
          </div>
        </n-form-item>
        <n-alert type="warning" :show-icon="false">
          重新提交后帖子会恢复公开展示，并重新进入内容审核流程。
        </n-alert>
        <n-space justify="end" style="margin-top: 14px;">
          <n-button secondary @click="editorVisible = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="submitResubmit">提交审核</n-button>
        </n-space>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Heart,
  MessageCircle,
  Plus,
  RefreshCcw,
  Share2,
  Star,
  X
} from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';

const message = useMessage();
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const editorVisible = ref(false);
const activeStatus = ref('all');
const posts = ref([]);
const stats = ref({
  total: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
  hidden: 0,
  views: 0,
  likes: 0,
  comments: 0,
  favorites: 0,
  shares: 0
});
const typeOptions = ['纯文字帖子', '图文帖子', '求助帖', '经验分享帖'].map((item) => ({ label: item, value: item }));
const editForm = reactive({ id: '', title: '', content: '', type: '经验分享帖', tags: [], imageUrls: [] });

const filteredPosts = computed(() => {
  if (activeStatus.value === 'all') return posts.value;
  return posts.value.filter((post) => (post.moderationStatus || 'approved') === activeStatus.value);
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await request('/api/forum/me/studio');
    posts.value = data.posts || [];
    stats.value = { ...stats.value, ...(data.stats || {}) };
  } finally {
    loading.value = false;
  }
}

function openEditor(post) {
  Object.assign(editForm, {
    id: post.id,
    title: post.title,
    content: post.content,
    type: post.type || '经验分享帖',
    tags: [...(post.tags || [])],
    imageUrls: [...(post.imageUrls || [])]
  });
  editorVisible.value = true;
}

async function submitResubmit() {
  saving.value = true;
  try {
    await request(`/api/forum/posts/${editForm.id}/resubmit`, {
      method: 'PATCH',
      body: {
        title: editForm.title,
        content: editForm.content,
        type: editForm.type,
        tags: editForm.tags,
        imageUrls: editForm.imageUrls
      }
    });
    editorVisible.value = false;
    message.success('已重新提交审核');
    await load();
  } catch (error) {
    message.error(error.message || '提交失败');
  } finally {
    saving.value = false;
  }
}

async function uploadImage({ file, onFinish, onError }) {
  if (editForm.imageUrls.length >= 9) {
    message.warning('最多上传 9 张图片');
    onError();
    return;
  }
  uploading.value = true;
  try {
    const body = new FormData();
    body.append('file', file.file);
    const data = await request('/api/files/upload', { method: 'POST', body });
    editForm.imageUrls.push(data.url);
    message.success('图片已上传');
    onFinish();
  } catch (error) {
    message.error(error.message || '上传失败');
    onError();
  } finally {
    uploading.value = false;
  }
}

function removeImage(url) {
  editForm.imageUrls = editForm.imageUrls.filter((item) => item !== url);
}

function moderationText(status = 'approved') {
  return {
    pending: '审核中',
    approved: '已通过',
    rejected: '违规打回'
  }[status || 'approved'] || status;
}

function moderationType(status = 'approved') {
  return {
    pending: 'warning',
    approved: 'success',
    rejected: 'error'
  }[status || 'approved'] || 'default';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
