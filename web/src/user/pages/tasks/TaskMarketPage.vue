<template>
  <div class="grid catalog-page">
    <section class="surface panel toolbar-panel">
      <div class="toolbar-header">
        <div class="toolbar-copy">
          <h2>任务市场</h2>
          <p>用地点 / 校区替代真实距离，申请后会自动进入发布者私信。</p>
        </div>
        <div class="toolbar-actions">
          <n-button secondary @click="$router.push('/tasks/workbench')">任务工作台</n-button>
          <n-button secondary @click="$router.push('/tasks/ranking')">接单榜</n-button>
          <n-button type="primary" @click="$router.push('/tasks/new')">发布任务</n-button>
        </div>
      </div>
      <div class="filter-grid">
        <n-select v-model:value="filters.category" clearable placeholder="任务类型" :options="categoryOptions" />
        <n-select v-model:value="filters.campusArea" clearable placeholder="地点 / 校区" :options="areaOptions" />
        <n-input-number v-model:value="filters.minReward" placeholder="最低酬金" clearable />
        <n-input-number v-model:value="filters.maxReward" placeholder="最高酬金" clearable />
        <n-input v-model:value="filters.keyword" placeholder="关键词" clearable @keyup.enter="loadTasks" />
        <n-button secondary @click="loadTasks">筛选任务</n-button>
      </div>
    </section>

    <transition-group v-if="tasks.length" name="card-flow" tag="div" class="card-grid" appear>
      <article v-for="task in tasks" :key="task.id" class="module-card task-card">
        <div>
          <div class="card-title-row">
            <strong>{{ task.title }}</strong>
            <n-tag size="small" :type="taskStatusType(task.status)">{{ taskStatusText[task.status] }}</n-tag>
          </div>
          <p class="muted">{{ task.category }} · {{ task.campusArea }} · {{ formatMoney(task.reward) }}</p>
          <p>{{ task.detail }}</p>
          <n-alert v-if="task.lowCreditWarning" type="warning" :show-icon="false">发布者信用分较低，请沟通确认后再接单。</n-alert>
        </div>
        <div class="card-footer-row">
          <span class="muted">申请 {{ task.applicationCount }} 人</span>
          <n-button secondary @click="$router.push(`/tasks/${task.id}`)">查看详情</n-button>
        </div>
      </article>
    </transition-group>
    <section v-else class="surface empty-state">当前筛选条件下没有任务</section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { request } from '../../../shared/http.js';
import { formatMoney, taskStatusText, taskStatusType } from './taskFormat.js';

const route = useRoute();
const meta = ref({ categories: [], areas: [] });
const tasks = ref([]);
const filters = reactive({ category: null, campusArea: null, minReward: null, maxReward: null, keyword: '' });

const categoryOptions = computed(() => meta.value.categories.map((item) => ({ label: item, value: item })));
const areaOptions = computed(() => meta.value.areas.map((item) => ({ label: item, value: item })));

onMounted(async () => {
  meta.value = await request('/api/tasks/meta');
  filters.keyword = String(route.query.keyword || '');
  await loadTasks();
});

async function loadTasks() {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null && value !== '') params.set(key, value);
  }
  const data = await request(`/api/tasks?${params.toString()}`);
  tasks.value = data.tasks;
}
</script>
