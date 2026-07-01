<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <div>
        <h2 style="margin: 0;">{{ pageTitle }}</h2>
        <p class="muted">{{ pageDescription }}</p>
      </div>
      <n-button secondary @click="$router.push('/tasks')">返回市场</n-button>
    </n-space>
    <n-alert v-if="$route.query.cancelled" type="warning" :show-icon="false" style="margin-top: 14px;">
      已取消支付，你可以继续修改任务；如果再次退出，本次草稿不会自动发布。
    </n-alert>
    <n-alert v-if="isResubmitMode" type="error" :show-icon="false" style="margin-top: 14px;">
      该任务此前已退款。修改后需要重新完成模拟支付，支付成功后才会再次进入审核。
    </n-alert>
    <n-spin :show="aiChecking" description="AI 正在检测任务分类与标签相似度...">
    <n-form :model="form" label-placement="top" style="margin-top: 16px;">
      <n-grid :cols="2" :x-gap="16" responsive="screen">
        <n-form-item-gi label="任务标题">
          <n-input v-model:value="form.title" maxlength="40" show-count />
        </n-form-item-gi>
        <n-form-item-gi label="任务类型">
          <div class="category-ai-field">
            <n-select v-model:value="form.category" :options="categoryOptions" />
            <n-button secondary :loading="categoryChecking" @click="showCategoryRequest = !showCategoryRequest">申请新分类</n-button>
          </div>
        </n-form-item-gi>
        <n-form-item-gi label="地点 / 校区">
          <n-select v-model:value="form.campusArea" :options="areaOptions" />
        </n-form-item-gi>
        <n-form-item-gi label="酬金">
          <n-input-number v-model:value="form.reward" :min="meta.rewardMin" :max="meta.rewardMax" />
        </n-form-item-gi>
        <n-form-item-gi label="截止时间">
          <n-date-picker v-model:value="deadlineValue" type="datetime" clearable />
        </n-form-item-gi>
        <n-form-item-gi label="联系方式补充">
          <n-input v-model:value="form.contactNote" placeholder="例如：到楼下后私信我" />
        </n-form-item-gi>
      </n-grid>
      <n-form-item label="任务详情">
        <n-input v-model:value="form.detail" type="textarea" :autosize="{ minRows: 4 }" />
      </n-form-item>
      <n-form-item label="任务标签">
        <div class="tag-ai-field">
          <n-dynamic-tags v-model:value="form.tags" :max="5" />
          <span class="muted">最多 5 个，每个最长 20 个字符；发布前会自动检测相似标签。</span>
        </div>
      </n-form-item>
      <n-form-item label="交付要求">
        <n-input v-model:value="form.deliveryRequirement" type="textarea" :autosize="{ minRows: 2 }" />
      </n-form-item>
      <n-form-item label="任务图片">
        <div class="upload-field">
          <n-upload
            multiple
            accept="image/jpeg,image/png,image/webp"
            :max="9"
            :show-file-list="false"
            :custom-request="uploadTaskImage"
          >
            <n-button secondary :loading="uploading">
              <template #icon><ImagePlus :size="16" /></template>
              上传图片
            </n-button>
          </n-upload>
          <span class="muted">可上传地点、物品或需求截图，最多 9 张。</span>
        </div>
        <div v-if="form.imageUrls.length" class="image-preview-grid">
          <div v-for="url in form.imageUrls" :key="url" class="image-preview-item">
            <img :src="assetUrl(url)" alt="任务图片预览" />
            <n-button circle quaternary size="small" @click="removeImage(url)">
              <template #icon><X :size="15" /></template>
            </n-button>
          </div>
        </div>
      </n-form-item>
      <n-alert type="info" :show-icon="false" style="margin-bottom: 14px;">
        酬金范围：{{ meta.rewardMin }} - {{ meta.rewardMax }} 元。支付、结算和退款都会记录模拟流水。
      </n-alert>
      <n-button type="primary" :loading="saving" @click="submit">{{ submitText }}</n-button>
    </n-form>
    </n-spin>

    <n-card v-if="showCategoryRequest" title="任务分类新增申请" style="margin-top: 18px;">
      <n-form :model="categoryRequest" label-placement="top">
        <n-form-item label="分类名称"><n-input v-model:value="categoryRequest.name" /></n-form-item>
        <n-form-item label="申请理由"><n-input v-model:value="categoryRequest.reason" type="textarea" /></n-form-item>
        <n-button secondary :loading="categoryChecking" @click="submitCategoryRequest">提交申请</n-button>
      </n-form>
    </n-card>
  </section>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDialog, useMessage } from 'naive-ui';
import { ImagePlus, X } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { uploadFile } from '../../../shared/uploadManager.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const taskId = computed(() => route.params.id);
const loadedTask = ref(null);
const meta = ref({ categories: [], areas: [], rewardMin: 1, rewardMax: 500 });
const saving = ref(false);
const aiChecking = ref(false);
const categoryChecking = ref(false);
const showCategoryRequest = ref(false);
const uploadingCount = ref(0);
const uploading = computed(() => uploadingCount.value > 0);
const deadlineValue = ref(Date.now() + 24 * 60 * 60 * 1000);
const form = reactive({
  title: '',
  category: '',
  campusArea: '',
  reward: 10,
  deadlineAt: '',
  detail: '',
  deliveryRequirement: '',
  contactNote: '',
  tags: [],
  imageUrls: []
});
const categoryRequest = reactive({ name: '', reason: '' });

const categoryOptions = computed(() => meta.value.categories.map((item) => ({ label: item, value: item })));
const areaOptions = computed(() => meta.value.areas.map((item) => ({ label: item, value: item })));
const isResubmitMode = computed(() => Boolean(taskId.value) && (route.query.resubmit === '1' || loadedTask.value?.moderationStatus === 'rejected'));
const pageTitle = computed(() => {
  if (isResubmitMode.value) return '修改并重新提交任务';
  return taskId.value ? '编辑待支付任务' : '发布任务';
});
const pageDescription = computed(() => (
  isResubmitMode.value
    ? '根据审核意见调整内容后重新支付发布，支付成功后会重新进入审核。'
    : '提交后先进入模拟支付，支付成功任务才会正式出现在市场。'
));
const submitText = computed(() => (isResubmitMode.value ? '修改后去支付' : '提交并进入模拟支付'));

onMounted(async () => {
  meta.value = await request('/api/tasks/meta');
  form.category = meta.value.categories[0] || '';
  form.campusArea = meta.value.areas[0] || '';
  if (taskId.value) {
    const data = await request(`/api/tasks/${taskId.value}`);
    loadedTask.value = data.task;
    Object.assign(form, data.task);
    form.tags = Array.isArray(data.task.tags) ? data.task.tags : [];
    form.imageUrls = Array.isArray(data.task.imageUrls) ? data.task.imageUrls : [];
    deadlineValue.value = new Date(data.task.deadlineAt).getTime();
  }
});

async function submit() {
  saving.value = true;
  aiChecking.value = true;
  try {
    const decision = await resolveTagSimilarity(await checkTaskTagSimilarity(form.tags));
    if (!decision) return;
    const payload = {
      ...form,
      tags: applyTagReplacements(form.tags, decision.replacements),
      tagReplacements: decision.replacements,
      confirmSimilarTags: decision.confirmSimilarTags,
      deadlineAt: new Date(deadlineValue.value).toISOString()
    };
    if (isResubmitMode.value) {
      const data = await request(`/api/tasks/${taskId.value}/resubmit`, { method: 'PATCH', body: payload });
      message.success('任务已更新，请重新完成模拟支付');
      router.push(`/tasks/${data.task.id}/payment`);
      return;
    }
    const data = taskId.value
      ? await request(`/api/tasks/${taskId.value}`, { method: 'PATCH', body: payload })
      : await request('/api/tasks', { method: 'POST', body: payload });
    router.push(`/tasks/${data.task.id}/payment`);
  } catch (error) {
    message.error(error.message || '提交失败');
  } finally {
    aiChecking.value = false;
    saving.value = false;
  }
}

async function checkTaskTagSimilarity(tags) {
  const cleaned = [...new Set((Array.isArray(tags) ? tags : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))]
    .slice(0, 5);
  if (!cleaned.length) return [];
  const data = await request('/api/task-tags/check-similarity', { method: 'POST', body: { tags: cleaned } });
  return data.similarity || [];
}

function resolveTagSimilarity(similarity = []) {
  const conflicts = similarity.filter((item) => item.matches?.length);
  if (!conflicts.length) return Promise.resolve({ replacements: {}, confirmSimilarTags: false });
  return new Promise((resolve) => {
    const replacements = Object.fromEntries(conflicts.map((item) => [item.input, item.matches[0].label]));
    dialog.warning({
      title: '检测到相似任务标签',
      content: () => h('div', { class: 'similarity-dialog-content' }, [
        h('p', '建议替换为已有标签以便任务倾向统计更准确，也可以坚持使用新标签。'),
        ...conflicts.map((item) => h('div', { class: 'similarity-row' }, [
          h('strong', `#${item.input}`),
          h('span', ` 相似已有标签：#${item.matches[0].label}（相似度 ${Math.round(item.matches[0].similarity * 100)}%）`)
        ]))
      ]),
      positiveText: '使用已有标签替换',
      negativeText: '坚持使用',
      onPositiveClick: () => {
        form.tags = applyTagReplacements(form.tags, replacements);
        resolve({ replacements, confirmSimilarTags: false });
      },
      onNegativeClick: () => resolve({ replacements: {}, confirmSimilarTags: true }),
      onClose: () => resolve(null)
    });
  });
}

function applyTagReplacements(tags = [], replacements = {}) {
  return [...new Set(tags
    .map((item) => String(replacements[item] || item || '').replace(/^#/, '').trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 20)))]
    .slice(0, 5);
}

async function submitCategoryRequest() {
  categoryChecking.value = true;
  try {
    const result = await request('/api/task-categories/request-new', { method: 'POST', body: categoryRequest });
    if (result.status === 'duplicate') {
      message.error(`任务分类已存在：${result.matches?.[0]?.label || categoryRequest.name}`);
      return;
    }
    if (result.status === 'similar') {
      showSimilarCategoryDialog(result);
      return;
    }
    clearCategoryRequest();
    message.success('任务分类申请已提交，请等待管理员处理');
  } catch (error) {
    message.error(error.message || '任务分类申请失败');
  } finally {
    categoryChecking.value = false;
  }
}

function showSimilarCategoryDialog(result) {
  const first = result.matches?.[0];
  dialog.warning({
    title: '检测到高度相似任务分类',
    content: () => h('div', { class: 'similarity-dialog-content' }, [
      h('p', `你申请的「${categoryRequest.name}」与已有任务分类较相似。`),
      first ? h('p', `已有分类：${first.label}，相似度 ${Math.round(first.similarity * 100)}%。`) : null,
      h('p', '建议直接使用已有分类；如确实不是同义分类，可以申请 AI 仲裁。')
    ]),
    positiveText: first ? '使用已有分类' : '关闭',
    negativeText: '申请 AI 仲裁',
    onPositiveClick: () => {
      if (first?.label) form.category = first.label;
      clearCategoryRequest();
      showCategoryRequest.value = false;
    },
    onNegativeClick: async () => {
      categoryChecking.value = true;
      try {
        const arbitration = await request('/api/task-categories/ai-arbitrate', {
          method: 'POST',
          body: { requestId: result.request?.id }
        });
        if (arbitration.approved) {
          meta.value.categories.push(arbitration.category);
          form.category = arbitration.category;
          clearCategoryRequest();
          showCategoryRequest.value = false;
          message.success('AI 仲裁通过，任务分类已创建');
        } else {
          message.error(`AI 仲裁未通过：${arbitration.reason}`);
        }
      } catch (error) {
        message.error(error.message || 'AI 仲裁失败');
      } finally {
        categoryChecking.value = false;
      }
    }
  });
}

function clearCategoryRequest() {
  categoryRequest.name = '';
  categoryRequest.reason = '';
}

async function uploadTaskImage({ file, onFinish, onError }) {
  if (form.imageUrls.length + uploadingCount.value >= 9) {
    message.warning('最多上传 9 张图片');
    onError?.();
    return;
  }
  uploadingCount.value += 1;
  try {
    const data = await uploadFile('/api/files/upload', file.file, { label: file.name || file.file?.name || '任务图片' });
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
