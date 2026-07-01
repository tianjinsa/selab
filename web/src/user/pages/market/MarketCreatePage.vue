<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <div>
        <h2 style="margin: 0;">发布二手商品</h2>
        <p class="muted">商品分类必须选择管理员配置的分类；没有合适分类可先提交分类申请。</p>
      </div>
      <n-button secondary @click="$router.push('/market')">返回市场</n-button>
    </n-space>
    <n-form :model="form" label-placement="top" style="margin-top: 16px;">
      <n-grid :cols="2" :x-gap="14" responsive="screen">
        <n-form-item-gi label="商品名称"><n-input v-model:value="form.title" /></n-form-item-gi>
        <n-form-item-gi label="分类"><n-select v-model:value="form.categoryId" :options="categoryOptions" /></n-form-item-gi>
        <n-form-item-gi label="价格"><n-input-number v-model:value="form.price" :min="0.01" /></n-form-item-gi>
        <n-form-item-gi label="成色"><n-select v-model:value="form.condition" :options="conditionOptions" /></n-form-item-gi>
        <n-form-item-gi label="交易方式"><n-select v-model:value="form.tradeMethod" :options="tradeOptions" /></n-form-item-gi>
        <n-form-item-gi label="自提地点或说明"><n-input v-model:value="form.pickupLocation" /></n-form-item-gi>
      </n-grid>
      <n-form-item label="详情描述"><n-input v-model:value="form.detail" type="textarea" :autosize="{ minRows: 4 }" /></n-form-item>
      <n-form-item label="商品图片">
        <div class="upload-field">
          <n-upload
            multiple
            accept="image/jpeg,image/png,image/webp"
            :max="9"
            :show-file-list="false"
            :custom-request="uploadProductImage"
          >
            <n-button secondary :loading="uploading">
              <template #icon><ImagePlus :size="16" /></template>
              上传图片
            </n-button>
          </n-upload>
          <span class="muted">最多 9 张，建议上传实物图。</span>
        </div>
        <div v-if="form.imageUrls.length" class="image-preview-grid">
          <div v-for="url in form.imageUrls" :key="url" class="image-preview-item">
            <img :src="assetUrl(url)" alt="商品图片预览" />
            <n-button circle quaternary size="small" @click="removeImage(url)">
              <template #icon><X :size="15" /></template>
            </n-button>
          </div>
        </div>
      </n-form-item>
      <n-space>
        <n-button type="primary" :loading="saving" @click="submit">发布商品</n-button>
        <n-button secondary @click="showCategoryRequest = !showCategoryRequest">申请新增分类</n-button>
      </n-space>
    </n-form>

    <n-card v-if="showCategoryRequest" title="分类新增申请" style="margin-top: 18px;">
      <n-form :model="categoryRequest" label-placement="top">
        <n-form-item label="分类名称"><n-input v-model:value="categoryRequest.name" /></n-form-item>
        <n-form-item label="申请理由"><n-input v-model:value="categoryRequest.reason" type="textarea" /></n-form-item>
        <n-button secondary @click="submitCategoryRequest">提交申请</n-button>
      </n-form>
    </n-card>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { ImagePlus, X } from '@lucide/vue';
import { assetUrl, request } from '../../../shared/http.js';
import { uploadFile } from '../../../shared/uploadManager.js';

const router = useRouter();
const message = useMessage();
const meta = ref({ categories: [], conditions: [], tradeMethods: [] });
const saving = ref(false);
const uploadingCount = ref(0);
const uploading = computed(() => uploadingCount.value > 0);
const showCategoryRequest = ref(false);
const form = reactive({ title: '', categoryId: '', price: 20, condition: '', detail: '', tradeMethod: '', pickupLocation: '', imageUrls: [] });
const categoryRequest = reactive({ name: '', reason: '' });

const categoryOptions = computed(() => meta.value.categories.map((item) => ({ label: item.name, value: item.id })));
const conditionOptions = computed(() => meta.value.conditions.map((item) => ({ label: item, value: item })));
const tradeOptions = computed(() => meta.value.tradeMethods.map((item) => ({ label: item, value: item })));

onMounted(async () => {
  meta.value = await request('/api/market/meta');
  form.categoryId = meta.value.categories[0]?.id || '';
  form.condition = meta.value.conditions[0] || '';
  form.tradeMethod = meta.value.tradeMethods[0] || '';
});

async function submit() {
  saving.value = true;
  try {
    await request('/api/market/products', {
      method: 'POST',
      body: { ...form, imageUrls: form.imageUrls }
    });
    message.success('商品已提交审核，审核通过后会展示');
    router.push('/market/moderation');
  } catch (error) {
    message.error(error.message || '发布失败');
  } finally {
    saving.value = false;
  }
}

async function uploadProductImage({ file, onFinish, onError }) {
  if (form.imageUrls.length + uploadingCount.value >= 9) {
    message.warning('最多上传 9 张图片');
    onError?.();
    return;
  }
  uploadingCount.value += 1;
  try {
    const data = await uploadFile('/api/files/upload', file.file, { label: file.name || file.file?.name || '商品图片' });
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

async function submitCategoryRequest() {
  await request('/api/market/category-requests', { method: 'POST', body: categoryRequest });
  categoryRequest.name = '';
  categoryRequest.reason = '';
  showCategoryRequest.value = false;
  message.success('分类申请已提交，请等待管理员处理');
}
</script>
