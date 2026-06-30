<template>
  <div class="grid" v-if="task">
    <section class="surface panel">
      <n-space justify="space-between" align="start">
        <div>
          <n-space align="center">
            <h2 style="margin: 0;">{{ task.title }}</h2>
            <n-tag :type="taskStatusType(task.status)">{{ taskStatusText[task.status] }}</n-tag>
          </n-space>
          <p class="muted">{{ task.category }} · {{ task.campusArea }} · {{ formatMoney(task.reward) }}</p>
        </div>
        <n-button secondary @click="$router.push('/tasks')">返回市场</n-button>
      </n-space>
      <n-alert v-if="task.lowCreditWarning" type="warning" :show-icon="false" style="margin: 12px 0;">
        发布者信用分低于 6 分，建议先通过私信确认任务细节。
      </n-alert>
      <p>{{ task.detail }}</p>
      <n-descriptions bordered :column="2">
        <n-descriptions-item label="发布者">{{ task.publisher?.nickname }} · 信用分 {{ task.publisher?.creditScore }}</n-descriptions-item>
        <n-descriptions-item label="截止时间">{{ new Date(task.deadlineAt).toLocaleString() }}</n-descriptions-item>
        <n-descriptions-item label="交付要求">{{ task.deliveryRequirement || '无特殊要求' }}</n-descriptions-item>
        <n-descriptions-item label="联系方式补充">{{ task.contactNote || '通过私信沟通' }}</n-descriptions-item>
      </n-descriptions>
      <n-space style="margin-top: 14px;">
        <n-button v-if="canApply" type="primary" :loading="acting" @click="apply">申请任务并发送卡片</n-button>
        <n-button v-if="isPublisher && task.status === 'editing'" type="primary" @click="$router.push(`/tasks/${task.id}/payment`)">继续支付发布</n-button>
        <n-button v-if="isRelated && ['open', 'accepted'].includes(task.status)" secondary @click="cancelTask">取消 / 放弃任务</n-button>
      </n-space>
      <n-alert v-if="!canApply && applyHint" type="info" :show-icon="false" style="margin-top: 12px;">{{ applyHint }}</n-alert>
    </section>

    <section v-if="isPublisher && task.applications?.length" class="surface panel">
      <h3 style="margin-top: 0;">申请列表</h3>
      <n-list>
        <n-list-item v-for="item in task.applications" :key="item.id">
          <n-space justify="space-between" align="center">
            <div>
              <strong>{{ item.applicant?.nickname }}</strong>
              <span class="muted"> · 信用分 {{ item.applicant?.creditScore }} · {{ applicationText(item.status) }}</span>
            </div>
            <n-space v-if="task.status === 'open' && item.status === 'pending'">
              <n-button size="small" type="primary" @click="operateApplication(item.id, 'accept')">同意</n-button>
              <n-button size="small" secondary @click="operateApplication(item.id, 'reject')">拒绝</n-button>
            </n-space>
          </n-space>
        </n-list-item>
      </n-list>
    </section>

    <section v-if="isAssignee && ['accepted', 'timeout'].includes(task.status)" class="surface panel">
      <h3 style="margin-top: 0;">提交交付凭证</h3>
      <n-input v-model:value="delivery.note" type="textarea" :autosize="{ minRows: 3 }" placeholder="说明完成情况、交付位置或附件说明" />
      <n-button style="margin-top: 12px;" type="primary" @click="submitDelivery">提交凭证</n-button>
    </section>

    <section v-if="isPublisher && task.status === 'submitted'" class="surface panel">
      <h3 style="margin-top: 0;">验收处理</h3>
      <div v-for="item in task.deliveries" :key="item.id" class="metric-card" style="margin-bottom: 10px;">
        {{ item.note }}
      </div>
      <n-space>
        <n-button type="primary" @click="completeTask">验收通过并结算</n-button>
        <n-button secondary type="warning" @click="openDispute">拒绝验收 / 申请介入</n-button>
      </n-space>
    </section>

    <section v-if="isRelated && task.status === 'completed'" class="surface panel">
      <h3 style="margin-top: 0;">任务评价</h3>
      <n-rate v-model:value="review.rating" />
      <n-input v-model:value="review.content" type="textarea" :autosize="{ minRows: 2 }" placeholder="写下本次合作评价" style="margin-top: 10px;" />
      <n-button style="margin-top: 12px;" secondary @click="submitReview">提交评价</n-button>
    </section>

    <section class="surface panel">
      <n-collapse>
        <n-collapse-item title="模拟支付流水" name="flows">
          <n-timeline>
            <n-timeline-item v-for="flow in task.paymentFlows" :key="flow.id" :title="flow.title" :content="`${formatMoney(flow.amount)} · ${flow.status}`" :time="new Date(flow.createdAt).toLocaleString()" />
          </n-timeline>
        </n-collapse-item>
        <n-collapse-item title="举报任务" name="report">
          <n-input v-model:value="reportReason" type="textarea" placeholder="说明举报原因" />
          <n-button style="margin-top: 10px;" secondary type="warning" @click="reportTask">提交举报</n-button>
        </n-collapse-item>
      </n-collapse>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDialog, useMessage } from 'naive-ui';
import { request } from '../../../shared/http.js';
import { userSession as session } from '../../session.js';
import { formatMoney, taskStatusText, taskStatusType } from './taskFormat.js';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const task = ref(null);
const acting = ref(false);
const delivery = reactive({ note: '' });
const review = reactive({ rating: 5, content: '' });
const reportReason = ref('');

const isPublisher = computed(() => task.value?.publisherId === session.user?.id);
const isAssignee = computed(() => task.value?.assigneeId === session.user?.id);
const isRelated = computed(() => isPublisher.value || isAssignee.value);
const canApply = computed(() => task.value?.status === 'open' && !isPublisher.value && !task.value?.myApplication && session.user?.creditScore >= 4);
const applyHint = computed(() => {
  if (!task.value) return '';
  if (isPublisher.value) return '这是你发布的任务，可在详情页处理申请。';
  if (session.user?.creditScore < 4) return '信用分低于 4 分，暂不能申请任务。';
  if (task.value.myApplication) return `你已提交申请，当前状态：${applicationText(task.value.myApplication.status)}`;
  if (task.value.status !== 'open') return '任务当前不可申请。';
  return '';
});

onMounted(load);

async function load() {
  task.value = (await request(`/api/tasks/${route.params.id}`)).task;
}

async function apply() {
  acting.value = true;
  try {
    await request(`/api/tasks/${task.value.id}/apply`, { method: 'POST' });
    message.success('申请已发送，已自动进入发布者私信');
    await load();
    router.push('/messages');
  } catch (error) {
    message.error(error.message || '申请失败');
  } finally {
    acting.value = false;
  }
}

async function operateApplication(id, action) {
  await request(`/api/tasks/applications/${id}/${action === 'accept' ? 'accept' : 'reject'}`, { method: 'POST' });
  message.success(action === 'accept' ? '已同意申请' : '已拒绝申请');
  await load();
}

async function submitDelivery() {
  await request(`/api/tasks/${task.value.id}/deliveries`, { method: 'POST', body: delivery });
  message.success('交付凭证已提交，等待发布者验收');
  delivery.note = '';
  await load();
}

async function completeTask() {
  await request(`/api/tasks/${task.value.id}/complete`, { method: 'POST' });
  message.success('任务已完成并记录结算流水');
  await load();
}

function openDispute() {
  dialog.warning({
    title: '申请管理员介入',
    content: '任务将进入纠纷状态，管理员可根据证据强制完成或取消。',
    positiveText: '确认申请',
    negativeText: '再看看',
    onPositiveClick: async () => {
      await request(`/api/tasks/${task.value.id}/disputes`, {
        method: 'POST',
        body: { reason: '发布者拒绝验收，申请管理员介入' }
      });
      await load();
    }
  });
}

function cancelTask() {
  dialog.warning({
    title: '确认取消 / 放弃任务',
    content: task.value.status === 'accepted' ? '已确认接单后取消会扣除操作方 1 分信用分。' : '当前阶段取消不会扣信用分。',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/tasks/${task.value.id}/cancel`, { method: 'POST', body: { reason: '用户主动取消' } });
      await load();
    }
  });
}

async function submitReview() {
  await request(`/api/tasks/${task.value.id}/reviews`, { method: 'POST', body: review });
  message.success('评价已提交');
  await load();
}

async function reportTask() {
  if (!reportReason.value.trim()) return message.warning('请填写举报原因');
  await request(`/api/tasks/${task.value.id}/reports`, { method: 'POST', body: { reason: reportReason.value } });
  reportReason.value = '';
  message.success('举报已提交，管理员后台可处理');
}

function applicationText(status) {
  return {
    pending: '待处理',
    accepted: '已同意',
    rejected: '已拒绝',
    expired: '已失效'
  }[status] || status;
}
</script>
