<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center">
      <div>
        <h2 style="margin: 0;">{{ taskId ? '编辑待支付任务' : '发布任务' }}</h2>
        <p class="muted">提交后先进入模拟支付，支付成功任务才会正式出现在市场。</p>
      </div>
      <n-button secondary @click="$router.push('/tasks')">返回市场</n-button>
    </n-space>
    <n-alert v-if="$route.query.cancelled" type="warning" :show-icon="false" style="margin-top: 14px;">
      已取消支付，你可以继续修改任务；如果再次退出，本次草稿不会自动发布。
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
      <n-alert type="info" :show-icon="false" style="margin-bottom: 14px;">
        酬金范围：{{ meta.rewardMin }} - {{ meta.rewardMax }} 元。支付、结算和退款都会记录模拟流水。
      </n-alert>
      <n-button type="primary" :loading="saving" @click="submit">提交并进入模拟支付</n-button>
    </n-form>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { request } from '../../../shared/http.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const taskId = computed(() => route.params.id);
const meta = ref({ categories: [], areas: [], rewardMin: 1, rewardMax: 500 });
const saving = ref(false);
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

onMounted(async () => {
  meta.value = await request('/api/tasks/meta');
  form.category = meta.value.categories[0] || '';
  form.campusArea = meta.value.areas[0] || '';
  if (taskId.value) {
    const data = await request(`/api/tasks/${taskId.value}`);
    Object.assign(form, data.task);
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
</script>
