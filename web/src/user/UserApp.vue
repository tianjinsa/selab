<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <div v-if="$route.meta.public" class="public-shell">
          <ThemeToggle class="theme-floating-toggle" />
          <router-view v-slot="{ Component, route }">
            <transition name="page-flow" mode="out-in" appear>
              <component :is="Component" :key="route.fullPath" />
            </transition>
          </router-view>
        </div>
        <div v-else class="app-shell">
          <aside class="side-nav">
            <div class="brand-block">
              <div class="brand-title">校园生活服务</div>
              <div class="brand-subtitle">互助、交流、闲置与咨询</div>
            </div>
            <nav class="nav-list">
              <router-link class="nav-item" to="/"><Home :size="18" />校园首页</router-link>
              <router-link class="nav-item" to="/tasks"><ClipboardList :size="18" />任务互助</router-link>
              <router-link class="nav-item" to="/forum"><MessagesSquare :size="18" />社区论坛</router-link>
              <router-link class="nav-item" to="/market"><ShoppingBag :size="18" />二手市场</router-link>
              <router-link class="nav-item" to="/ai"><Bot :size="18" />智能体</router-link>
              <router-link class="nav-item" to="/messages"><Mail :size="18" />私信</router-link>
              <router-link class="nav-item" to="/notifications"><Bell :size="18" />通知</router-link>
              <router-link class="nav-item" to="/wallet"><WalletCards :size="18" />钱包</router-link>
              <router-link class="nav-item" to="/profile"><UserRound :size="18" />个人中心</router-link>
            </nav>
          </aside>
          <main class="main-pane">
            <div class="topbar">
              <div>
                <h1 class="page-title">{{ routeTitle }}</h1>
                <p class="page-desc">{{ session.user?.nickname || '同学' }}，信用分 {{ session.user?.creditScore ?? '-' }}</p>
              </div>
              <n-space align="center">
                <ThemeToggle />
                <n-badge :value="session.unreadCount" :max="99">
                  <n-button secondary circle @click="$router.push('/notifications')">
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
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bell, Bot, ClipboardList, Home, LogOut, Mail, MessagesSquare, ShoppingBag, UserRound, WalletCards } from '@lucide/vue';
import ThemeToggle from '../shared/ThemeToggle.vue';
import UploadProgressDock from '../shared/UploadProgressDock.vue';
import { useThemeMode } from '../shared/theme.js';
import { clearUserSession, loadUserSession, userSession as session } from './session.js';

const route = useRoute();
const router = useRouter();
const { naiveTheme, naiveThemeOverrides } = useThemeMode();

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
  if (session.token && !session.user) {
    await loadUserSession().catch(() => {
      clearUserSession();
      router.push('/login');
    });
  }
});

function logout() {
  clearUserSession();
  router.push('/login');
}
</script>
