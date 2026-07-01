<template>
  <div class="grid">
    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">任务市场</h2>
          <p class="muted">用地点 / 校区替代真实距离，申请后会自动进入发布者私信。</p>
        </div>
        <n-space>
          <n-button secondary :loading="feed.refreshing.value" @click="refreshTasks">
            <template #icon><RefreshCw :size="16" /></template>
            刷新
          </n-button>
          <n-button secondary @click="$router.push('/tasks/workbench')">任务工作台</n-button>
          <n-button secondary @click="$router.push('/tasks/ranking')">接单榜</n-button>
          <n-button type="primary" @click="$router.push('/tasks/new')">发布任务</n-button>
        </n-space>
      </n-space>
      <n-grid :cols="6" :x-gap="10" :y-gap="10" responsive="screen" style="margin-top: 16px;">
        <n-grid-item>
          <n-select v-model:value="filters.category" clearable placeholder="任务类型" :options="categoryOptions" />
        </n-grid-item>
        <n-grid-item>
          <n-select v-model:value="filters.campusArea" clearable placeholder="地点 / 校区" :options="areaOptions" />
        </n-grid-item>
        <n-grid-item>
          <n-input-number v-model:value="filters.minReward" placeholder="最低酬金" clearable />
        </n-grid-item>
        <n-grid-item>
          <n-input-number v-model:value="filters.maxReward" placeholder="最高酬金" clearable />
        </n-grid-item>
        <n-grid-item>
          <n-input v-model:value="filters.keyword" placeholder="关键词" clearable @keyup.enter="refreshTasks" />
        </n-grid-item>
        <n-grid-item>
          <n-select v-model:value="filters.sort" :options="sortOptions" />
        </n-grid-item>
      </n-grid>
      <n-button style="margin-top: 12px;" secondary @click="refreshTasks">筛选任务</n-button>
      <div v-if="tasks.length" class="feed-window-note">
        已加载 {{ feed.offset.value }}/{{ feed.total.value || feed.offset.value }}，当前保留 {{ tasks.length }} 项
      </div>
    </section>

    <transition-group v-if="tasks.length" name="card-flow" tag="div" class="grid grid-3" appear>
      <article
        v-for="task in tasks"
        :key="task.id"
        class="module-card legacy-catalog-card"
        role="link"
        tabindex="0"
        @click="$router.push(`/tasks/${task.id}`)"
        @keydown.enter.self="$router.push(`/tasks/${task.id}`)"
        @keydown.space.self.prevent="$router.push(`/tasks/${task.id}`)"
      >
        <div>
          <n-space justify="space-between" align="center">
            <strong>{{ task.title }}</strong>
            <n-tag size="small" :type="taskStatusType(task.status)">{{ taskStatusText[task.status] }}</n-tag>
          </n-space>
          <p class="muted">{{ task.category }} · {{ task.campusArea }} · {{ formatMoney(task.reward) }}</p>
          <p>{{ task.detail }}</p>
          <n-alert v-if="task.lowCreditWarning" type="warning" :show-icon="false">发布者信用分较低，请沟通确认后再接单。</n-alert>
        </div>
        <n-space justify="space-between" align="center">
          <span class="muted">申请 {{ task.applicationCount }} 人</span>
          <n-button secondary @click.stop="$router.push(`/tasks/${task.id}`)">查看详情</n-button>
        </n-space>
      </article>
    </transition-group>
    <section v-else-if="feed.isEmpty.value" class="surface empty-state">当前筛选条件下没有任务</section>
    <section class="feed-load-state">
      <span v-if="feed.loading.value">正在加载更多...</span>
      <span v-else-if="feed.finished.value">已经到底了</span>
      <n-button v-else secondary @click="feed.loadMore">加载更多</n-button>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { RefreshCw } from '@lucide/vue';
import { request } from '../../../shared/http.js';
import { useWindowedFeed } from '../../../shared/useWindowedFeed.js';
import { formatMoney, taskStatusText, taskStatusType } from './taskFormat.js';

const route = useRoute();
const meta = ref({ categories: [], areas: [] });
const filters = reactive({ category: null, campusArea: null, minReward: null, maxReward: null, keyword: '', sort: 'recommended' });
const sortOptions = [
  { label: '推荐', value: 'recommended' },
  { label: '最新发布', value: 'new' },
  { label: '热门优先', value: 'hot' }
];
const feed = useWindowedFeed({
  pageSize: 12,
  maxItems: 48,
  loadPage: async ({ limit, offset, seed }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== '') params.set(key, value);
    }
    if (filters.sort === 'new') params.delete('sort');
    params.set('limit', limit);
    params.set('offset', offset);
    params.set('recommendSeed', seed);
    const data = await request(`/api/tasks?${params.toString()}`);
    return { items: data.tasks || [], pageInfo: data.pageInfo };
  }
});
const tasks = computed(() => feed.items.value);

const categoryOptions = computed(() => meta.value.categories.map((item) => ({ label: item, value: item })));
const areaOptions = computed(() => meta.value.areas.map((item) => ({ label: item, value: item })));

onMounted(async () => {
  meta.value = await request('/api/tasks/meta');
  filters.keyword = String(route.query.keyword || '');
  window.addEventListener('scroll', feed.handleWindowScroll, { passive: true });
  await feed.loadMore();
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', feed.handleWindowScroll);
});

async function refreshTasks() {
  await feed.refresh();
}
</script>
