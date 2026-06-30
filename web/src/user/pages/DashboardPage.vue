<template>
  <div class="campus-home">
    <section class="home-hero">
      <div class="hero-copy">
        <span class="eyebrow">Campus Life</span>
        <h2>今天的校园小事，在这里直接办完</h2>
        <p>发任务、找资料、买二手、问流程、看社区动态，都共用同一套身份、私信和通知。</p>
        <div class="home-search">
          <n-input v-model:value="searchText" size="large" placeholder="搜任务、商品、帖子，或直接问智能体" @keyup.enter="goSearch" />
          <n-select v-model:value="searchTarget" size="large" :options="searchOptions" style="width: 132px;" />
          <n-button size="large" type="primary" @click="goSearch">
            <template #icon><Search :size="18" /></template>
            查找
          </n-button>
        </div>
        <div class="quick-actions">
          <n-button type="primary" @click="$router.push('/tasks/new')">
            <template #icon><Plus :size="16" /></template>
            发布任务
          </n-button>
          <n-button secondary @click="$router.push('/market/new')">
            <template #icon><ShoppingBag :size="16" /></template>
            出闲置
          </n-button>
          <n-button secondary @click="$router.push('/forum/new')">
            <template #icon><PenLine :size="16" /></template>
            发帖子
          </n-button>
          <n-button secondary @click="$router.push('/ai')">
            <template #icon><Bot :size="16" /></template>
            问智能体
          </n-button>
        </div>
      </div>
      <div class="hero-status">
        <div class="credit-ring" :style="creditRingStyle">
          <span>{{ session.user?.creditScore ?? '-' }}</span>
          <small>信用分</small>
        </div>
        <div class="hero-status-list">
          <button type="button" @click="$router.push('/notifications')">
            <Bell :size="16" />
            <span>{{ session.unreadCount }} 条未读通知</span>
          </button>
          <button type="button" @click="$router.push('/messages')">
            <Mail :size="16" />
            <span>打开统一私信</span>
          </button>
          <button type="button" @click="$router.push('/profile')">
            <UserRound :size="16" />
            <span>完善个人资料</span>
          </button>
        </div>
      </div>
    </section>

    <transition-group name="card-flow" tag="section" class="service-strip" appear>
      <article v-for="item in services" :key="item.path" class="service-tile" @click="$router.push(item.path)">
        <div class="service-icon"><component :is="item.icon" :size="22" /></div>
        <div>
          <strong>{{ item.title }}</strong>
          <p>{{ item.desc }}</p>
        </div>
        <ArrowRight :size="18" />
      </article>
    </transition-group>

    <section class="home-section">
      <div class="section-heading">
        <div>
          <h3>现在可以做什么</h3>
          <p>直接从真实内容开始，不需要先理解系统模块。</p>
        </div>
        <n-button text type="primary" @click="refreshAll">刷新</n-button>
      </div>
      <div class="home-content-grid">
        <article class="live-panel">
          <div class="panel-title">
            <ClipboardList :size="18" />
            <strong>新任务</strong>
            <n-button text size="small" @click="$router.push('/tasks')">更多</n-button>
          </div>
          <transition-group v-if="tasks.length" name="card-flow" tag="div" class="live-list" appear>
            <button v-for="task in tasks" :key="task.id" type="button" @click="$router.push(`/tasks/${task.id}`)">
              <span>{{ task.title }}</span>
              <strong>￥{{ task.reward }}</strong>
              <small>{{ task.campusArea }} · {{ task.category }}</small>
            </button>
          </transition-group>
          <div v-else class="compact-empty">
            <p>还没有正在招募的任务。</p>
            <n-button size="small" type="primary" @click="$router.push('/tasks/new')">发布第一个任务</n-button>
          </div>
        </article>

        <article class="live-panel">
          <div class="panel-title">
            <MessagesSquare :size="18" />
            <strong>社区正在聊</strong>
            <n-button text size="small" @click="$router.push('/forum')">更多</n-button>
          </div>
          <transition-group v-if="posts.length" name="card-flow" tag="div" class="live-list" appear>
            <button v-for="post in posts" :key="post.id" type="button" @click="$router.push(`/forum/${post.id}`)">
              <span>{{ post.title }}</span>
              <small>{{ post.author?.nickname || '同学' }} · 赞 {{ post.likeCount }} · 评 {{ post.commentCount }}</small>
            </button>
          </transition-group>
          <div v-else class="compact-empty">
            <p>社区还没有新内容。</p>
            <n-button size="small" type="primary" @click="$router.push('/forum/new')">分享校园动态</n-button>
          </div>
        </article>

        <article class="live-panel">
          <div class="panel-title">
            <ShoppingBag :size="18" />
            <strong>二手好物</strong>
            <n-button text size="small" @click="$router.push('/market')">更多</n-button>
          </div>
          <transition-group v-if="products.length" name="card-flow" tag="div" class="live-list" appear>
            <button v-for="product in products" :key="product.id" type="button" @click="$router.push(`/market/${product.id}`)">
              <span>{{ product.title }}</span>
              <strong>￥{{ product.price }}</strong>
              <small>{{ product.category?.name || '分类' }} · {{ product.condition }}</small>
            </button>
          </transition-group>
          <div v-else class="compact-empty">
            <p>暂时没有在售商品。</p>
            <n-button size="small" type="primary" @click="$router.push('/market/new')">发布闲置</n-button>
          </div>
        </article>
      </div>
    </section>

    <section class="home-lower">
      <article class="assistant-callout">
        <Bot :size="30" />
        <div>
          <h3>不知道从哪开始，直接问校园智能体</h3>
          <p>它可以查询公开任务、商品、帖子和知识库，也能生成任务发布草案，但不会替你下单或发布正式内容。</p>
        </div>
        <n-button type="primary" @click="$router.push('/ai')">开始咨询</n-button>
      </article>
      <article class="service-health">
        <span class="eyebrow">服务状态</span>
        <strong>{{ health?.db?.mode === 'sqlserver' ? 'SQL Server 已连接' : '演示数据模式' }}</strong>
        <p>{{ health?.db?.message || '正在检测服务状态' }}</p>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  ArrowRight,
  Bell,
  Bot,
  ClipboardList,
  Mail,
  MessagesSquare,
  PenLine,
  Plus,
  Search,
  ShoppingBag,
  UserRound
} from '@lucide/vue';
import { useRouter } from 'vue-router';
import { request } from '../../shared/http.js';
import { loadUserSession, userSession as session } from '../session.js';

const router = useRouter();
const health = ref(null);
const tasks = ref([]);
const posts = ref([]);
const products = ref([]);
const searchText = ref('');
const searchTarget = ref('ai');
const creditScore = computed(() => {
  const score = Number(session.user?.creditScore ?? 0);
  return Math.max(0, Math.min(10, score));
});
const creditRingStyle = computed(() => {
  const score = creditScore.value;
  const theme = score < 4
    ? { color: '#ef5a5a', track: 'rgba(239, 90, 90, 0.22)', core: 'rgba(73, 28, 31, 0.94)', glow: 'rgba(239, 90, 90, 0.24)' }
    : score < 6
      ? { color: '#f2a93b', track: 'rgba(242, 169, 59, 0.24)', core: 'rgba(72, 48, 22, 0.94)', glow: 'rgba(242, 169, 59, 0.24)' }
      : score < 8
        ? { color: '#42b883', track: 'rgba(66, 184, 131, 0.22)', core: 'rgba(21, 58, 49, 0.94)', glow: 'rgba(66, 184, 131, 0.22)' }
        : { color: '#4dd7c0', track: 'rgba(77, 215, 192, 0.24)', core: 'rgba(18, 53, 47, 0.94)', glow: 'rgba(77, 215, 192, 0.28)' };
  return {
    '--credit-progress': `${score * 36}deg`,
    '--credit-color': theme.color,
    '--credit-track': theme.track,
    '--credit-core': theme.core,
    '--credit-glow': theme.glow
  };
});

const searchOptions = [
  { label: '智能体', value: 'ai' },
  { label: '任务', value: 'tasks' },
  { label: '社区', value: 'forum' },
  { label: '二手', value: 'market' }
];

const services = [
  { title: '任务互助', path: '/tasks', icon: ClipboardList, desc: '找人帮忙、申请接单、验收结算' },
  { title: '校园社区', path: '/forum', icon: MessagesSquare, desc: '经验、求助、Tag 和热榜' },
  { title: '二手市场', path: '/market', icon: ShoppingBag, desc: '分类导航、购买申请、担保流程' },
  { title: '校园智能体', path: '/ai', icon: Bot, desc: '问流程、查公开内容、生成草案' }
];

onMounted(async () => {
  await loadUserSession().catch(() => {});
  await refreshAll();
});

async function refreshAll() {
  const [healthData, taskData, postData, productData] = await Promise.all([
    request('/api/health').catch(() => null),
    request('/api/tasks').catch(() => ({ tasks: [] })),
    request('/api/forum/posts?sort=hot').catch(() => ({ posts: [] })),
    request('/api/market/products?sort=hot').catch(() => ({ products: [] }))
  ]);
  health.value = healthData;
  tasks.value = (taskData.tasks || []).slice(0, 4);
  posts.value = (postData.posts || []).slice(0, 4);
  products.value = (productData.products || []).slice(0, 4);
}

function goSearch() {
  const keyword = searchText.value.trim();
  if (searchTarget.value === 'ai') {
    router.push('/ai');
    return;
  }
  const pathMap = {
    tasks: '/tasks',
    forum: '/forum',
    market: '/market'
  };
  const path = pathMap[searchTarget.value] || '/ai';
  router.push({ path, query: keyword ? { keyword } : {} });
}
</script>
