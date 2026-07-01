<template>
  <div class="workbench-page">
    <section class="surface panel workbench-hero">
      <div>
        <span class="status-pill"><ShieldCheck :size="14" /> 任务审核</span>
        <h2>任务审核情况</h2>
        <p class="muted">查看任务审核进度、打回原因和退款结果。</p>
      </div>
      <n-space>
        <n-button secondary @click="$router.push('/tasks/workbench')">
          <template #icon><ArrowLeft :size="16" /></template>
          返回工作台
        </n-button>
        <n-button type="primary" @click="$router.push('/tasks/new')">
          <template #icon><Plus :size="16" /></template>
          发布任务
        </n-button>
      </n-space>
    </section>

    <section class="workbench-stat-grid">
      <article class="metric-card workbench-stat">
        <span>审核记录</span>
        <strong>{{ stats.total }}</strong>
        <small class="muted">进入过审核流程的任务</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>审核中</span>
        <strong>{{ stats.pending }}</strong>
        <small class="muted">暂不展示到任务市场</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>未通过</span>
        <strong>{{ stats.rejected }}</strong>
        <small class="muted">需要处理或删除</small>
      </article>
      <article class="metric-card workbench-stat">
        <span>已隐藏</span>
        <strong>{{ stats.hidden }}</strong>
        <small class="muted">仅自己可见</small>
      </article>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h3 style="margin: 0;">审核列表</h3>
          <p class="muted" style="margin: 6px 0 0;">按最新审核变化排序。</p>
        </div>
        <n-space>
          <n-button
            v-if="activeStatus === 'rejected' && stats.rejected"
            secondary
            type="error"
            :loading="bulkDeleting"
            @click="confirmDeleteRejected"
          >
            <template #icon><Trash2 :size="15" /></template>
            全部删除
          </n-button>
          <n-button text type="primary" :loading="loading" @click="load">
            <template #icon><RefreshCcw :size="15" /></template>
            刷新
          </n-button>
        </n-space>
      </n-space>

      <n-tabs v-model:value="activeStatus" type="segment" animated style="margin-top: 14px;">
        <n-tab-pane name="all" tab="全部" />
        <n-tab-pane name="pending" tab="审核中" />
        <n-tab-pane name="rejected" tab="未通过" />
        <n-tab-pane name="approved" tab="已通过" />
      </n-tabs>

      <transition-group v-if="filteredItems.length" name="card-flow" tag="div" class="workbench-section-list" appear>
        <article v-for="task in filteredItems" :key="task.id" class="workbench-task-card">
          <div class="workbench-card-head">
            <div>
              <strong>{{ task.title }}</strong>
              <p class="workbench-meta">{{ task.category }} · {{ task.campusArea }} · {{ formatMoney(task.reward) }}</p>
            </div>
            <n-tag :type="moderationType(task.moderationStatus)">{{ moderationText(task.moderationStatus) }}</n-tag>
          </div>
          <p>{{ shortText(task.detail) }}</p>
          <div class="workbench-chip-row">
            <n-tag size="small" :type="taskStatusType(task.status)" :bordered="false">
              {{ taskStatusText[task.status] || task.status }}
            </n-tag>
            <n-tag v-if="task.deadlineAt" size="small" :bordered="false">截止 {{ formatDateTime(task.deadlineAt) }}</n-tag>
            <n-tag v-if="task.hiddenAt" size="small" :bordered="false">已隐藏</n-tag>
            <n-tag v-if="task.moderationCheckedAt" size="small" :bordered="false">审核 {{ formatDateTime(task.moderationCheckedAt) }}</n-tag>
          </div>
          <n-alert v-if="task.moderationStatus === 'pending'" type="warning" :show-icon="false" class="workbench-inline-alert">
            任务正在审核，通过后会出现在任务工作台和任务市场。
          </n-alert>
          <n-alert v-if="task.moderationStatus === 'rejected'" type="error" :show-icon="false" class="workbench-inline-alert">
            {{ task.moderationReason || '任务审核未通过，已停止公开展示。' }}
          </n-alert>
          <n-space>
            <n-button size="small" secondary @click="$router.push(`/tasks/${task.id}`)">查看</n-button>
            <n-button
              v-if="task.moderationStatus !== 'rejected'"
              size="small"
              secondary
              :type="task.hiddenAt ? 'success' : 'warning'"
              @click="toggleVisibility(task)"
            >
              <template #icon>
                <Eye v-if="task.hiddenAt" :size="15" />
                <EyeOff v-else :size="15" />
              </template>
              {{ task.hiddenAt ? '恢复公开' : '隐藏' }}
            </n-button>
            <n-button size="small" tertiary type="error" @click="confirmDelete(task)">
              <template #icon><Trash2 :size="15" /></template>
              删除
            </n-button>
          </n-space>
        </article>
      </transition-group>
      <div v-else class="empty-state">当前筛选下没有审核记录</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { ArrowLeft, Eye, EyeOff, Plus, RefreshCcw, ShieldCheck, Trash2 } from '@lucide/vue';
import { request } from '../../../shared/http.js';
import { formatMoney, taskStatusText, taskStatusType } from './taskFormat.js';

const dialog = useDialog();
const message = useMessage();
const loading = ref(false);
const bulkDeleting = ref(false);
const activeStatus = ref('all');
const items = ref([]);
const stats = ref({ total: 0, pending: 0, approved: 0, rejected: 0, hidden: 0 });

const filteredItems = computed(() => {
  if (activeStatus.value === 'all') return items.value;
  return items.value.filter((item) => (item.moderationStatus || 'approved') === activeStatus.value);
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await request('/api/tasks/moderation');
    items.value = data.items || [];
    stats.value = { ...stats.value, ...(data.stats || {}) };
  } finally {
    loading.value = false;
  }
}

async function toggleVisibility(task) {
  const visible = Boolean(task.hiddenAt);
  try {
    await request(`/api/tasks/${task.id}/visibility`, {
      method: 'PATCH',
      body: { visible }
    });
    message.success(visible ? '任务已恢复公开' : '任务已隐藏');
    await load();
  } catch (error) {
    message.error(error.message || '操作失败');
  }
}

function confirmDelete(task) {
  dialog.warning({
    title: '删除任务',
    content: `确认删除「${task.title || '未命名任务'}」？删除后不会在任务市场和工作台展示。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
        message.success('任务已删除');
        await load();
      } catch (error) {
        message.error(error.message || '删除失败');
      }
    }
  });
}

function confirmDeleteRejected() {
  const count = Number(stats.value.rejected || 0);
  if (!count) return;
  dialog.warning({
    title: '删除全部审核未通过任务',
    content: `确认删除 ${count} 个审核未通过任务？可删除的任务会从任务市场和工作台移除。`,
    positiveText: '全部删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      bulkDeleting.value = true;
      try {
        const result = await request('/api/tasks/moderation/rejected', { method: 'DELETE' });
        if (result.failed?.length) {
          message.warning(`已删除 ${result.deletedCount || 0} 个任务，${result.failed.length} 个因状态限制未删除`);
        } else {
          message.success(`已删除 ${result.deletedCount || 0} 个任务`);
        }
        await load();
      } catch (error) {
        message.error(error.message || '删除失败');
      } finally {
        bulkDeleting.value = false;
      }
    }
  });
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

function shortText(value = '') {
  const text = String(value || '');
  return text.length > 112 ? `${text.slice(0, 112)}...` : text;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
