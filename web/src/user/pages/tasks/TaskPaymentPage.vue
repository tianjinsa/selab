<template>
  <section class="surface panel" v-if="task">
    <n-result status="info" title="模拟支付确认" description="本项目不接入真实支付，确认后会记录任务发布支付流水并正式发布任务。">
      <template #footer>
        <div class="grid" style="max-width: 520px; margin: 0 auto;">
          <n-descriptions bordered :column="1">
            <n-descriptions-item label="任务">{{ task.title }}</n-descriptions-item>
            <n-descriptions-item label="酬金">{{ formatMoney(task.reward) }}</n-descriptions-item>
            <n-descriptions-item label="截止时间">{{ new Date(task.deadlineAt).toLocaleString() }}</n-descriptions-item>
          </n-descriptions>
          <n-space justify="center">
            <n-button secondary @click="cancelPay">取消支付并返回编辑</n-button>
            <n-button type="primary" :loading="loading" @click="pay">确认支付并发布</n-button>
          </n-space>
        </div>
      </template>
    </n-result>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { request } from '../../../shared/http.js';
import { formatMoney } from './taskFormat.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const task = ref(null);
const loading = ref(false);

onMounted(async () => {
  task.value = (await request(`/api/tasks/${route.params.id}`)).task;
});

async function pay() {
  loading.value = true;
  try {
    await request(`/api/tasks/${route.params.id}/pay`, { method: 'POST' });
    message.success('模拟支付成功，任务已发布');
    router.push(`/tasks/${route.params.id}`);
  } catch (error) {
    message.error(error.message || '支付失败');
  } finally {
    loading.value = false;
  }
}

function cancelPay() {
  router.push(`/tasks/${route.params.id}/edit?cancelled=1`);
}
</script>
