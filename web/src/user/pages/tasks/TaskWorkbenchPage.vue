<template>
  <div class="workbench-page">
    <section class="surface panel workbench-hero">
      <div>
        <span class="status-pill"><ListChecks :size="14" /> 任务工作台</span>
        <h2>我的任务协作</h2>
        <p class="muted">集中处理发布、接单、验收、评价和资金流水，减少在市场和私信之间来回查找。</p>
      </div>
      <n-space>
        <n-button secondary @click="$router.push('/tasks')">
          <template #icon><ClipboardList :size="16" /></template>
          任务市场
        </n-button>
        <n-button type="primary" @click="$router.push('/tasks/new')">
          <template #icon><Plus :size="16" /></template>
          发布任务
        </n-button>
      </n-space>
    </section>

    <section class="workbench-stat-grid">
      <article class="metric-card workbench-stat">
        <span>待处理</span>
        <strong>{{ stats.actionCount }}</strong>
        <small class="muted">申请、验收、交付、评价</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>我发布的</span>
        <strong>{{ stats.publishedTotal }}</strong>
        <small class="muted">进行中 {{ stats.publishedActive }} · 完成 {{ stats.publishedCompleted }}</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>我接单的</span>
        <strong>{{ stats.assignedActive }}</strong>
        <small class="muted">已完成 {{ stats.assignedCompleted }}</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>资金概览</span>
        <strong>{{ formatMoney(stats.income) }}</strong>
        <small class="muted">支出 {{ formatMoney(stats.spending) }}</small>
      </article>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h3 style="margin: 0;">待我处理</h3>
          <p class="muted" style="margin: 6px 0 0;">按时间排序显示最需要行动的任务节点。</p>
        </div>
        <n-button text @click="load">
          <template #icon><RefreshCcw :size="15" /></template>
          刷新
        </n-button>
      </n-space>
      <transition-group v-if="actionItems.length" name="card-flow" tag="div" class="workbench-action-list" appear>
        <button v-for="item in actionItems" :key="item.id" type="button" class="workbench-action-item" @click="$router.push(item.path)">
          <span class="workbench-action-icon">
            <component :is="actionIcon(item.type)" :size="18" />
          </span>
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.body }}</small>
          </span>
          <ArrowRight :size="18" />
        </button>
      </transition-group>
      <div v-else class="empty-state">当前没有必须处理的任务节点</div>
    </section>

    <section class="surface panel">
      <n-tabs type="segment" animated>
        <n-tab-pane name="published" tab="我发布的">
          <div v-if="published.length" class="workbench-section-list">
            <article v-for="task in published" :key="task.id" class="workbench-task-card">
              <div class="workbench-card-head">
                <div>
                  <strong>{{ task.title }}</strong>
                  <p class="workbench-meta">{{ task.category }} · {{ task.campusArea }} · {{ formatMoney(task.reward) }}</p>
                </div>
                <n-tag :type="taskStatusType(task.status)">{{ taskStatusText[task.status] || task.status }}</n-tag>
              </div>
              <p>{{ shortText(task.detail) }}</p>
              <div class="workbench-chip-row">
                <n-tag size="small" :bordered="false">申请 {{ task.applicationCount || 0 }}</n-tag>
                <n-tag v-if="task.pendingApplicationCount" size="small" type="warning" :bordered="false">
                  待处理 {{ task.pendingApplicationCount }}
                </n-tag>
                <n-tag v-if="task.assignee" size="small" type="info" :bordered="false">接单者 {{ task.assignee.nickname }}</n-tag>
                <n-tag v-if="task.deadlineAt" size="small" :bordered="false">截止 {{ formatDateTime(task.deadlineAt) }}</n-tag>
                <n-tag size="small" :type="moderationType(task.moderationStatus)" :bordered="false">
                  {{ moderationText(task.moderationStatus) }}
                </n-tag>
              </div>
              <n-alert v-if="task.moderationStatus === 'pending'" type="warning" :show-icon="false" class="workbench-inline-alert">
                任务正在审核，通过后才会出现在任务市场。
              </n-alert>
              <n-alert v-if="task.moderationStatus === 'rejected'" type="error" :show-icon="false" class="workbench-inline-alert">
                {{ task.moderationReason || '任务审核未通过，暂不会对外展示。' }}
              </n-alert>
              <n-space>
                <n-button size="small" secondary @click="$router.push(`/tasks/${task.id}`)">查看</n-button>
                <n-button v-if="task.status === 'editing'" size="small" type="primary" @click="$router.push(`/tasks/${task.id}/payment`)">继续支付</n-button>
                <n-button v-if="task.status === 'submitted'" size="small" type="primary" @click="$router.push(`/tasks/${task.id}`)">去验收</n-button>
              </n-space>
            </article>
          </div>
          <div v-else class="empty-state">你还没有发布过任务</div>
        </n-tab-pane>

        <n-tab-pane name="assigned" tab="我接单的">
          <div v-if="assigned.length" class="workbench-section-list">
            <article v-for="task in assigned" :key="task.id" class="workbench-task-card">
              <div class="workbench-card-head">
                <div>
                  <strong>{{ task.title }}</strong>
                  <p class="workbench-meta">发布者 {{ task.publisher?.nickname || '同学' }} · {{ formatMoney(task.reward) }}</p>
                </div>
                <n-tag :type="taskStatusType(task.status)">{{ taskStatusText[task.status] || task.status }}</n-tag>
              </div>
              <p>{{ shortText(task.detail) }}</p>
              <div class="workbench-chip-row">
                <n-tag size="small" :bordered="false">{{ task.category }}</n-tag>
                <n-tag size="small" :bordered="false">{{ task.campusArea }}</n-tag>
                <n-tag v-if="task.deadlineAt" size="small" :bordered="false">截止 {{ formatDateTime(task.deadlineAt) }}</n-tag>
              </div>
              <n-space>
                <n-button size="small" secondary @click="$router.push(`/tasks/${task.id}`)">查看</n-button>
                <n-button v-if="['accepted', 'timeout'].includes(task.status)" size="small" type="primary" @click="$router.push(`/tasks/${task.id}`)">提交凭证</n-button>
              </n-space>
            </article>
          </div>
          <div v-else class="empty-state">你还没有接单记录</div>
        </n-tab-pane>

        <n-tab-pane name="applications" tab="申请记录">
          <div v-if="applications.length" class="workbench-section-list">
            <article v-for="item in applications" :key="item.id" class="workbench-task-card">
              <div class="workbench-card-head">
                <div>
                  <strong>{{ item.task?.title || '任务已不存在' }}</strong>
                  <p class="workbench-meta">发布者 {{ item.publisher?.nickname || '同学' }} · {{ formatDateTime(item.createdAt) }}</p>
                </div>
                <n-tag :type="applicationStatusType(item.status)">{{ applicationStatusText(item.status) }}</n-tag>
              </div>
              <p v-if="item.expiredReason" class="muted">{{ item.expiredReason }}</p>
              <n-space>
                <n-button size="small" secondary :disabled="!item.task?.id" @click="$router.push(`/tasks/${item.taskId}`)">查看任务</n-button>
                <n-button v-if="item.status === 'accepted'" size="small" type="primary" @click="$router.push(`/tasks/${item.taskId}`)">进入交付</n-button>
              </n-space>
            </article>
          </div>
          <div v-else class="empty-state">你还没有申请过任务</div>
        </n-tab-pane>

        <n-tab-pane name="flows" tab="资金流水">
          <div v-if="paymentFlows.length" class="workbench-flow-list">
            <article v-for="flow in paymentFlows" :key="flow.id" class="workbench-flow-item">
              <span class="workbench-action-icon"><WalletCards :size="18" /></span>
              <span>
                <strong>{{ flow.title || flowTypeText(flow.type) }}</strong>
                <small>{{ flow.serialNo }} · {{ formatDateTime(flow.createdAt) }}</small>
              </span>
              <strong>{{ formatMoney(flow.amount) }}</strong>
            </article>
          </div>
          <div v-else class="empty-state">暂无任务资金流水</div>
        </n-tab-pane>
      </n-tabs>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  ListChecks,
  Plus,
  RefreshCcw,
  Star,
  WalletCards
} from '@lucide/vue';
import { request } from '../../../shared/http.js';
import { formatMoney, taskStatusText, taskStatusType } from './taskFormat.js';

const data = ref(null);

const emptyStats = {
  publishedTotal: 0,
  publishedActive: 0,
  publishedCompleted: 0,
  assignedActive: 0,
  assignedCompleted: 0,
  pendingApplications: 0,
  actionCount: 0,
  income: 0,
  spending: 0
};

const stats = computed(() => data.value?.stats || emptyStats);
const actionItems = computed(() => data.value?.actionItems || []);
const published = computed(() => data.value?.published || []);
const assigned = computed(() => data.value?.assigned || []);
const applications = computed(() => data.value?.applications || []);
const paymentFlows = computed(() => data.value?.paymentFlows || []);

onMounted(load);

async function load() {
  data.value = await request('/api/tasks/workbench');
}

function actionIcon(type) {
  return {
    payment: WalletCards,
    application: ClipboardCheck,
    acceptance: CheckCircle2,
    delivery: FileText,
    review: Star
  }[type] || AlertCircle;
}

function applicationStatusText(status) {
  return {
    pending: '待处理',
    accepted: '已通过',
    rejected: '已拒绝',
    expired: '已失效'
  }[status] || status;
}

function applicationStatusType(status) {
  return {
    pending: 'warning',
    accepted: 'success',
    rejected: 'error',
    expired: 'default'
  }[status] || 'default';
}

function moderationText(status = 'approved') {
  return {
    pending: '审核中',
    approved: '审核通过',
    rejected: '审核未通过'
  }[status || 'approved'] || status;
}

function moderationType(status = 'approved') {
  return {
    pending: 'warning',
    approved: 'success',
    rejected: 'error'
  }[status || 'approved'] || 'default';
}

function flowTypeText(type) {
  return {
    task_publish_payment: '任务发布支付',
    task_finish_settlement: '任务完成结算',
    task_cancel_refund: '任务取消退款',
    task_timeout_refund: '无人接单退款'
  }[type] || type;
}

function shortText(value = '') {
  const text = String(value || '');
  return text.length > 92 ? `${text.slice(0, 92)}...` : text;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
