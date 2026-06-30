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
      <n-form-item label="图片地址">
        <n-input v-model:value="imageText" type="textarea" placeholder="每行一个图片地址，可留空" />
      </n-form-item>
      <n-button type="primary" :loading="saving" @click="submit">发布</n-button>
    </n-form>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { request } from '../../../shared/http.js';

const router = useRouter();
const message = useMessage();
const saving = ref(false);
const imageText = ref('');
const typeOptions = ['纯文字帖子', '图文帖子', '求助帖', '经验分享帖'].map((item) => ({ label: item, value: item }));
const form = reactive({ title: '', content: '', type: '经验分享帖', tags: [], imageUrls: [], visibility: 'public' });

async function submit() {
  saving.value = true;
  try {
    const body = {
      ...form,
      imageUrls: imageText.value.split('\n').map((item) => item.trim()).filter(Boolean)
    };
    const data = await request('/api/forum/posts', { method: 'POST', body });
    message.success('帖子已发布');
    router.push(`/forum/${data.post.id}`);
  } catch (error) {
    message.error(error.message || '发布失败');
  } finally {
    saving.value = false;
  }
}
</script>
