<template>
  <div class="grid">
    <div class="grid grid-3">
      <div class="metric-card">
        <div class="metric-label">当前信用分</div>
        <div class="metric-value">{{ session.user?.creditScore ?? '-' }}</div>
        <div class="muted">低于 6 分将在交易和任务中提示</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">未读通知</div>
        <div class="metric-value">{{ session.unreadCount }}</div>
        <n-button text type="primary" @click="$router.push('/notifications')">查看通知</n-button>
      </div>
      <div class="metric-card">
        <div class="metric-label">数据状态</div>
        <div class="metric-value" style="font-size: 18px;">{{ health?.db?.mode || '检查中' }}</div>
        <div class="muted">{{ health?.db?.message || '正在读取服务状态' }}</div>
      </div>
    </div>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h2 style="margin: 0;">统一服务入口</h2>
          <p class="muted">每个业务系统会按阶段逐步接入同一套身份、私信和通知。</p>
        </div>
        <n-button secondary @click="$router.push('/messages')">
          <template #icon><Mail :size="16" /></template>
          打开私信
        </n-button>
      </n-space>
      <div class="grid grid-3" style="margin-top: 16px;">
        <article v-for="item in modules" :key="item.path" class="module-card">
          <div>
            <component :is="item.icon" :size="24" />
            <h3>{{ item.title }}</h3>
            <p class="muted">{{ item.desc }}</p>
          </div>
          <n-button secondary @click="$router.push(item.path)">进入</n-button>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { Bot, ClipboardList, Mail, MessagesSquare, ShoppingBag } from '@lucide/vue';
import { request } from '../../shared/http.js';
import { loadUserSession, userSession as session } from '../session.js';

const health = ref(null);
const modules = [
  { title: '任务互助', path: '/tasks', icon: ClipboardList, desc: '发布任务、模拟支付、申请接单与验收闭环。' },
  { title: '社区论坛', path: '/forum', icon: MessagesSquare, desc: '瀑布流内容、Tag、评论、热榜与词云。' },
  { title: '二手市场', path: '/market', icon: ShoppingBag, desc: '商品发布、分类导航、购买申请和担保流程。' },
  { title: '校园智能体', path: '/ai', icon: Bot, desc: '知识库问答、公开业务查询与流式输出。' }
];

onMounted(async () => {
  await loadUserSession().catch(() => {});
  health.value = await request('/api/health').catch(() => null);
});
</script>
