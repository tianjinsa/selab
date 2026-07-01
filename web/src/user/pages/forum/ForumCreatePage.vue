<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <div>
        <h2 style="margin: 0;">发布帖子</h2>
        <p class="muted">Tag 由用户手动输入，最多 5 个，每个最长 20 个字符。</p>
      </div>
      <n-button secondary @click="$router.push('/forum')">返回社区</n-button>
    </n-space>
    <n-spin :show="aiChecking" description="AI 正在检测分类与标签相似度...">
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
        <div class="tag-ai-field">
          <n-dynamic-tags v-model:value="form.tags" :max="5" />
          <n-button secondary :loading="generatingTags" @click="generateTags">
            AI 帮我写标签
          </n-button>
        </div>
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
    </n-spin>
  </section>
</template>

<script setup>
import { computed, h, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDialog, useMessage } from 'naive-ui';
import { X } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { uploadFile } from '../../../shared/uploadManager.js';

const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const saving = ref(false);
const aiChecking = ref(false);
const generatingTags = ref(false);
const uploadingCount = ref(0);
const uploading = computed(() => uploadingCount.value > 0);
const typeOptions = ref(['纯文字帖子', '图文帖子', '求助帖', '经验分享帖'].map((item) => ({ label: item, value: item })));
const form = reactive({ title: '', content: '', type: '经验分享帖', tags: [], imageUrls: [], visibility: 'public' });

async function submit() {
  saving.value = true;
  aiChecking.value = true;
  try {
    await supplementTagsIfNeeded();
    const categoryDecision = await resolveCategoryRecommendation();
    if (!categoryDecision) return;
    const similarity = await checkSimilarity(form.tags);
    const decision = await resolveSimilarity(similarity);
    if (!decision) return;
    const data = await request('/api/forum/posts', {
      method: 'POST',
      body: {
        ...form,
        imageUrls: form.imageUrls,
        tagReplacements: decision.replacements,
        confirmSimilarTags: decision.confirmSimilarTags
      }
    });
    message.success('帖子已发布');
    router.push(`/forum/${data.post.id}`);
  } catch (error) {
    if (error.details?.similar?.length) {
      const decision = await resolveSimilarity(error.details.similar);
      if (decision) {
        try {
          const data = await request('/api/forum/posts', {
            method: 'POST',
            body: {
              ...form,
              imageUrls: form.imageUrls,
              tagReplacements: decision.replacements,
              confirmSimilarTags: decision.confirmSimilarTags
            }
          });
          message.success('帖子已发布');
          router.push(`/forum/${data.post.id}`);
          return;
        } catch (retryError) {
          message.error(retryError.message || '发布失败');
        }
      }
    } else {
      message.error(error.message || '发布失败');
    }
  } finally {
    aiChecking.value = false;
    saving.value = false;
  }
}

async function resolveCategoryRecommendation() {
  if (!form.title.trim() && !form.content.trim()) return true;
  const data = await request('/api/forum/category-recommend', {
    method: 'POST',
    body: {
      title: form.title,
      content: form.content,
      type: form.type,
      tags: form.tags
    }
  });
  if (!data.changed || !data.recommended?.label) return true;
  return new Promise((resolve) => {
    dialog.warning({
      title: 'AI 推荐了更合适的帖子类型',
      content: () => h('div', { class: 'similarity-dialog-content' }, [
        h('p', `当前选择：${data.current?.label || form.type}`),
        h('p', `推荐分类：${data.recommended.label}${data.recommended.isNew ? '（新分类）' : '（已有分类）'}`),
        data.reason ? h('p', data.reason) : null
      ]),
      positiveText: '使用推荐分类',
      negativeText: '保持当前选择',
      onPositiveClick: async () => {
        try {
          const applied = data.recommended.isNew
            ? await request('/api/forum/category-recommend', {
              method: 'POST',
              body: {
                title: form.title,
                content: form.content,
                type: form.type,
                tags: form.tags,
                apply: true,
                acceptedLabel: data.recommended.label
              }
            })
            : data;
          const recommended = applied.recommended || data.recommended;
          ensureTypeOption(recommended.label);
          form.type = recommended.value || recommended.label;
          resolve(true);
        } catch (error) {
          message.error(error.message || '应用推荐分类失败');
          resolve(null);
        }
      },
      onNegativeClick: () => resolve(true),
      onClose: () => resolve(null)
    });
  });
}

function ensureTypeOption(label) {
  const name = String(label || '').trim();
  if (!name || typeOptions.value.some((item) => item.value === name)) return;
  typeOptions.value.push({ label: name, value: name });
}

async function generateTags() {
  if (!form.title.trim() && !form.content.trim()) {
    message.warning('请先填写标题或正文');
    return;
  }
  generatingTags.value = true;
  aiChecking.value = true;
  try {
    const data = await request('/api/tags/ai-generate', { method: 'POST', body: { title: form.title, content: form.content } });
    mergeTags(data.tags || []);
    const decision = await resolveSimilarity(data.similarity || []);
    if (decision?.replacements) applyTagReplacements(decision.replacements);
    message.success('AI 标签已生成');
  } catch (error) {
    message.error(error.message || 'AI 标签生成失败');
  } finally {
    generatingTags.value = false;
    aiChecking.value = false;
  }
}

async function supplementTagsIfNeeded() {
  if (form.tags.length >= 3 || (!form.title.trim() && !form.content.trim())) return;
  const data = await request('/api/tags/ai-generate', { method: 'POST', body: { title: form.title, content: form.content } });
  mergeTags(data.tags || []);
}

async function checkSimilarity(tags) {
  const data = await request('/api/tags/check-similarity', { method: 'POST', body: { tags } });
  return data.similarity || [];
}

function resolveSimilarity(similarity = []) {
  const conflicts = similarity.filter((item) => item.matches?.length);
  if (!conflicts.length) return Promise.resolve({ replacements: {}, confirmSimilarTags: false });
  return new Promise((resolve) => {
    const replacements = Object.fromEntries(conflicts.map((item) => [item.input, item.matches[0].label]));
    dialog.warning({
      title: '检测到相似标签',
      content: () => h('div', { class: 'similarity-dialog-content' }, [
        h('p', '建议替换为已有标签以便归类话题，也可以坚持发布新标签。'),
        ...conflicts.map((item) => h('div', { class: 'similarity-row' }, [
          h('strong', `#${item.input}`),
          h('span', ` 相似已有标签：#${item.matches[0].label}（相似度 ${Math.round(item.matches[0].similarity * 100)}%）`)
        ]))
      ]),
      positiveText: '使用已有标签替换',
      negativeText: '坚持发布',
      onPositiveClick: () => {
        applyTagReplacements(replacements);
        resolve({ replacements, confirmSimilarTags: false });
      },
      onNegativeClick: () => resolve({ replacements: {}, confirmSimilarTags: true }),
      onClose: () => resolve(null)
    });
  });
}

function mergeTags(tags = []) {
  form.tags = [...new Set([...form.tags, ...tags.map((item) => String(item || '').trim()).filter(Boolean)])].slice(0, 5);
}

function applyTagReplacements(replacements = {}) {
  form.tags = [...new Set(form.tags.map((item) => replacements[item] || item))].slice(0, 5);
}

async function uploadPostImage({ file, onFinish, onError }) {
  if (form.imageUrls.length + uploadingCount.value >= 9) {
    message.warning('最多上传 9 张图片');
    onError?.();
    return;
  }
  uploadingCount.value += 1;
  try {
    const data = await uploadFile('/api/files/upload', file.file, { label: file.name || file.file?.name || '帖子图片' });
    form.imageUrls.push(data.url);
    message.success('图片已上传');
    onFinish?.();
  } catch (error) {
    message.error(error.message || '上传失败');
    onError?.();
  } finally {
    uploadingCount.value = Math.max(0, uploadingCount.value - 1);
  }
}

function removeImage(url) {
  form.imageUrls = form.imageUrls.filter((item) => item !== url);
}
</script>
