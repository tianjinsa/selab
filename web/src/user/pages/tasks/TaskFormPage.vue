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
    <n-form :model="form" label-placement="top" style="margin-top: 16px;">
      <n-grid :cols="2" :x-gap="16" responsive="screen">
        <n-form-item-gi label="任务标题">
          <n-input v-model:value="form.title" maxlength="40" show-count />
        </n-form-item-gi>
        <n-form-item-gi label="任务类型">
          <n-select v-model:value="form.category" :options="categoryOptions" />
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
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { ImagePlus, X } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { uploadFile } from '../../../shared/uploadManager.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const taskId = computed(() => route.params.id);
const loadedTask = ref(null);
const meta = ref({ categories: [], areas: [], rewardMin: 1, rewardMax: 500 });
const saving = ref(false);
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
  imageUrls: []
});

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
    form.imageUrls = Array.isArray(data.task.imageUrls) ? data.task.imageUrls : [];
    deadlineValue.value = new Date(data.task.deadlineAt).getTime();
  }
});

async function submit() {
  saving.value = true;
  try {
    const payload = {
      ...form,
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
    saving.value = false;
  }
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
