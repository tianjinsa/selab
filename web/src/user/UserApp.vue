<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <OverlayScrollbars />
        <div v-if="$route.meta.public" class="public-shell">
          <router-view v-slot="{ Component, route }">
            <transition name="page-flow" mode="out-in" appear>
              <component :is="Component" :key="route.fullPath" />
            </transition>
          </router-view>
        </div>
        <div v-else class="app-shell">
          <aside class="side-nav">
            <div class="brand-block">
              <div class="brand-mark">CL</div>
              <div>
                <div class="brand-title">校园生活服务</div>
                <div class="brand-subtitle">互助、交流、闲置与咨询</div>
              </div>
            </div>
            <nav class="nav-list">
              <router-link class="nav-item" to="/"><Home :size="18" /><span class="nav-item-label">校园首页</span></router-link>
              <router-link class="nav-item" to="/tasks"><ClipboardList :size="18" /><span class="nav-item-label">任务互助</span></router-link>
              <router-link class="nav-item" to="/forum"><MessagesSquare :size="18" /><span class="nav-item-label">社区论坛</span></router-link>
              <router-link class="nav-item" to="/market"><ShoppingBag :size="18" /><span class="nav-item-label">二手市场</span></router-link>
              <router-link class="nav-item" to="/ai"><Bot :size="18" /><span class="nav-item-label">智能体</span></router-link>
              <router-link class="nav-item" to="/messages">
                <Mail :size="18" />
                <span class="nav-item-label">私信</span>
                <span v-if="session.messageUnreadCount" class="nav-unread-badge">{{ unreadBadgeText(session.messageUnreadCount) }}</span>
              </router-link>
              <router-link class="nav-item" to="/notifications">
                <Bell :size="18" />
                <span class="nav-item-label">通知</span>
                <span v-if="session.unreadCount" class="nav-unread-badge">{{ unreadBadgeText(session.unreadCount) }}</span>
              </router-link>
              <router-link class="nav-item" to="/wallet"><WalletCards :size="18" /><span class="nav-item-label">钱包</span></router-link>
              <router-link class="nav-item" to="/profile"><UserRound :size="18" /><span class="nav-item-label">个人中心</span></router-link>
            </nav>
            <div class="nav-footer">
              <strong>{{ session.user?.nickname || '同学' }}</strong>
              <span>信用分 {{ session.user?.creditScore ?? '-' }}，未读 {{ session.unreadCount }} 条</span>
            </div>
          </aside>
          <main class="main-pane">
            <div class="topbar" :class="{ 'topbar--compact': isTopbarCompact }">
              <div>
                <h1 class="page-title">{{ routeTitle }}</h1>
                <p class="page-desc">{{ session.user?.nickname || '同学' }}，信用分 {{ session.user?.creditScore ?? '-' }}</p>
              </div>
              <n-space align="center">
                <ThemeToggle />
                <n-badge :value="session.unreadCount" :max="99">
                  <n-button secondary circle aria-label="打开通知中心" @click="$router.push('/notifications')">
                    <template #icon><Bell :size="16" /></template>
                  </n-button>
                </n-badge>
                <n-button secondary @click="logout">
                  <template #icon><LogOut :size="16" /></template>
                  退出
                </n-button>
              </n-space>
            </div>
            <router-view v-slot="{ Component, route }">
              <transition name="page-flow" mode="out-in" appear>
                <component :is="Component" :key="route.fullPath" />
              </transition>
            </router-view>
          </main>
          <UploadProgressDock />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bell, Bot, ClipboardList, Home, LogOut, Mail, MessagesSquare, ShoppingBag, UserRound, WalletCards } from '@lucide/vue';
import OverlayScrollbars from '../shared/OverlayScrollbars.vue';
import ThemeToggle from '../shared/ThemeToggle.vue';
import UploadProgressDock from '../shared/UploadProgressDock.vue';
import { websocketUrl } from '../shared/http.js';
import { createReconnectableWebSocket } from '../shared/realtimeSocket.js';
import { useThemeMode } from '../shared/theme.js';
import { clearUserSession, loadUserSession, userSession as session } from './session.js';

const route = useRoute();
const router = useRouter();
const { naiveTheme, naiveThemeOverrides } = useThemeMode();
let unreadSocket = null;
const topbarScrolled = ref(false);
const TOPBAR_COLLAPSE_SCROLL_Y = 56;
const TOPBAR_EXPAND_SCROLL_Y = 16;
let topbarScrollFrame = 0;

const isTopbarCompact = computed(() => route.path !== '/' || topbarScrolled.value);

const routeTitle = computed(() => {
  const map = {
    '/': '校园首页',
    '/profile': '个人中心',
    '/users': '同学主页',
    '/messages': '统一私信',
    '/notifications': '通知中心',
    '/wallet': '主系统钱包',
    '/tasks': '校园任务互助',
    '/tasks/workbench': '任务工作台',
    '/tasks/moderation': '任务审核情况',
    '/forum': '校园社区论坛',
    '/forum/studio': '创作中心',
    '/forum/collections': '社区收藏与关注',
    '/market': '校园二手市场',
    '/market/favorites': '市场收藏',
    '/market/orders': '我的交易',
    '/market/moderation': '商品审核情况',
    '/ai': '校园信息智能体'
  };
  return map[route.path] || map[`/${route.path.split('/')[1]}`] || '校园首页';
});

onMounted(async () => {
  updateTopbarScrollState();
  window.addEventListener('scroll', updateTopbarScrollState, { passive: true });
  if (session.token && !session.user) {
    await loadUserSession().catch(() => {
      clearUserSession();
      router.push('/login');
    });
  }
});

onBeforeUnmount(() => {
  unreadSocket?.close();
  window.removeEventListener('scroll', updateTopbarScrollState);
  if (topbarScrollFrame) window.cancelAnimationFrame(topbarScrollFrame);
});

watch(
  () => route.fullPath,
  () => {
    updateTopbarScrollState();
  }
);

watch(
  () => session.token,
  (token) => {
    unreadSocket?.close();
    unreadSocket = null;
    if (!token) return;
    unreadSocket = createReconnectableWebSocket({
      url: () => websocketUrl(session.token),
      onMessage: handleUnreadSocketMessage
    });
    unreadSocket.connect();
  },
  { immediate: true }
);

function logout() {
  clearUserSession();
  router.push('/login');
}

function handleUnreadSocketMessage(event) {
  let packet;
  try {
    packet = JSON.parse(event.data);
  } catch {
    return;
  }
  if (packet.event === 'notification.unread_count') {
    session.unreadCount = packet.payload?.count || 0;
  }
  if (packet.event === 'message.unread_count') {
    session.messageUnreadCount = packet.payload?.count || 0;
  }
}

function unreadBadgeText(value) {
  const count = Number(value || 0);
  return count > 99 ? '99+' : String(count);
}

function updateTopbarScrollState() {
  if (topbarScrollFrame) return;
  topbarScrollFrame = window.requestAnimationFrame(() => {
    topbarScrollFrame = 0;
    applyTopbarScrollState();
  });
}

function applyTopbarScrollState() {
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  if (topbarScrolled.value) {
    if (scrollY < TOPBAR_EXPAND_SCROLL_Y) topbarScrolled.value = false;
    return;
  }
  if (scrollY > TOPBAR_COLLAPSE_SCROLL_Y) {
    topbarScrolled.value = true;
  }
}
</script>
