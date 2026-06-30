<template>
  <n-config-provider>
    <n-message-provider>
      <n-dialog-provider>
        <router-view v-if="$route.meta.public" v-slot="{ Component, route }">
          <transition name="page-flow" mode="out-in" appear>
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
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
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bell, Bot, ClipboardList, Home, LogOut, Mail, MessagesSquare, ShoppingBag, UserRound } from '@lucide/vue';
import { clearUserSession, loadUserSession, userSession as session } from './session.js';

const route = useRoute();
const router = useRouter();

const routeTitle = computed(() => {
  const map = {
    '/': '校园首页',
    '/profile': '个人中心',
    '/users': '同学主页',
    '/messages': '统一私信',
    '/notifications': '通知中心',
    '/tasks': '校园任务互助',
    '/forum': '校园社区论坛',
    '/market': '校园二手市场',
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
