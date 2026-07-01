<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <div>
        <h2 style="margin: 0;">发布帖子</h2>
        <p class="muted">Tag 由用户手动输入，最多 5 个，每个最长 20 个字符。</p>
      </div>
      <n-button secondary @click="$router.push('/forum')">返回社区</n-button>
    </n-space>
    <n-form :model="form" label-placement="top" style="margin-top: 16px;">
      <n-form-item label="标题">
        <n-input v-model:value="form.title" maxlength="60" show-count />
      </n-form-item>
      <n-form-item label="帖子类型">
        <n-select v-model:value="form.type" :options="typeOptions" />
      </n-form-item>
      <n-form-item label="正文">
        <n-input v-model:value="form.content" type="textarea" :autosize="{ minRows: 6 }" />
      </n-form-item>
      <n-form-item label="Tag">
        <n-dynamic-tags v-model:value="form.tags" :max="5" />
      </n-form-item>
      <n-form-item label="图片">
        <div class="upload-field">
          <n-upload
            multiple
            accept="image/jpeg,image/png,image/webp"
            :max="9"
            :show-file-list="false"
            :custom-request="uploadPostImage"
          >
            <n-button secondary :loading="uploading">上传图片</n-button>
          </n-upload>
          <span class="muted">最多 9 张，支持 jpg、png、webp。</span>
        </div>
        <div v-if="form.imageUrls.length" class="image-preview-grid">
          <div v-for="url in form.imageUrls" :key="url" class="image-preview-item">
            <img :src="assetUrl(url)" alt="帖子图片预览" />
            <n-button circle quaternary size="small" @click="removeImage(url)">
              <template #icon><X :size="15" /></template>
            </n-button>
          </div>
        </div>
      </n-form-item>
      <n-button type="primary" :loading="saving" @click="submit">发布</n-button>
    </n-form>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { X } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';

const router = useRouter();
const message = useMessage();
const saving = ref(false);
const uploading = ref(false);
const typeOptions = ['纯文字帖子', '图文帖子', '求助帖', '经验分享帖'].map((item) => ({ label: item, value: item }));
const form = reactive({ title: '', content: '', type: '经验分享帖', tags: [], imageUrls: [], visibility: 'public' });

async function submit() {
  saving.value = true;
  try {
    const data = await request('/api/forum/posts', { method: 'POST', body: { ...form, imageUrls: form.imageUrls } });
    message.success('帖子已发布');
    router.push(`/forum/${data.post.id}`);
  } catch (error) {
    message.error(error.message || '发布失败');
  } finally {
    saving.value = false;
  }
}

async function uploadPostImage({ file, onFinish, onError }) {
  if (form.imageUrls.length >= 9) {
    message.warning('最多上传 9 张图片');
    onError();
    return;
  }
  uploading.value = true;
  try {
    const body = new FormData();
    body.append('file', file.file);
    const data = await request('/api/files/upload', { method: 'POST', body });
    form.imageUrls.push(data.url);
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
  form.imageUrls = form.imageUrls.filter((item) => item !== url);
}
</script>
