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
              <div class="brand-mark">{{ isCounselor ? 'CO' : 'AD' }}</div>
              <div>
                <div class="brand-title">{{ isCounselor ? '学院导员端' : '平台管理后台' }}</div>
                <div class="brand-subtitle">{{ isCounselor ? '学生风险跟进' : '独立管理员登录态' }}</div>
              </div>
            </div>
            <nav v-if="!isCounselor" class="nav-list">
              <router-link class="nav-item" to="/"><Gauge :size="18" />仪表盘</router-link>
              <router-link class="nav-item" to="/users"><UsersRound :size="18" />用户管理</router-link>
              <router-link class="nav-item" to="/tasks"><ClipboardList :size="18" />任务管理</router-link>
              <router-link class="nav-item" to="/forum"><MessagesSquare :size="18" />社区管理</router-link>
              <router-link class="nav-item" to="/market"><ShoppingBag :size="18" />二手管理</router-link>
              <router-link class="nav-item" to="/ai"><Bot :size="18" />AI 管理</router-link>
              <router-link class="nav-item" to="/review"><ShieldCheck :size="18" />综合审核</router-link>
              <router-link class="nav-item" to="/counselors"><GraduationCap :size="18" />学院导员</router-link>
            </nav>
            <nav v-else class="nav-list">
              <router-link class="nav-item" to="/counselor"><ShieldCheck :size="18" />风险工作台</router-link>
            </nav>
            <div class="nav-footer">
              <strong>{{ isCounselor ? adminSession.admin?.name || '导员端' : '管理端' }}</strong>
              <span>{{ isCounselor ? '只显示负责范围内学生告警' : '审核、配置、仲裁与风险记录' }}</span>
            </div>
          </aside>
          <main class="main-pane">
            <div class="topbar">
              <div>
                <h1 class="page-title">{{ pageTitle }}</h1>
                <p class="page-desc">{{ isCounselor ? '查看学生风险内容并维护自己的负责学号范围。' : '管理员操作会写入操作日志，危险操作需要确认。' }}</p>
              </div>
              <n-space align="center">
                <ThemeToggle />
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
import { Bot, ClipboardList, Gauge, GraduationCap, LogOut, MessagesSquare, ShieldCheck, ShoppingBag, UsersRound } from '@lucide/vue';
import OverlayScrollbars from '../shared/OverlayScrollbars.vue';
import ThemeToggle from '../shared/ThemeToggle.vue';
import { useThemeMode } from '../shared/theme.js';
import { adminSession, clearAdminSession, loadAdminSession } from './session.js';

const router = useRouter();
const route = useRoute();
const { naiveTheme, naiveThemeOverrides } = useThemeMode();
const isCounselor = computed(() => adminSession.admin?.role === 'counselor');
const pageTitle = computed(() => {
  if (isCounselor.value) return '导员风险工作台';
  const map = {
    '/': '后台仪表盘',
    '/users': '用户管理',
    '/tasks': '任务管理',
    '/forum': '社区管理',
    '/market': '二手市场管理',
    '/ai': 'AI 管理',
    '/review': '综合审核',
    '/counselors': '学院导员'
  };
  return map[route.path] || '后台仪表盘';
});

onMounted(async () => {
  const admin = await loadAdminSession().catch(() => {
    clearAdminSession();
    router.push('/login');
  });
  if (admin?.role === 'counselor' && route.path !== '/counselor') router.replace('/counselor');
  if (admin?.role === 'admin' && route.path === '/counselor') router.replace('/');
});

function logout() {
  clearAdminSession();
  router.push('/login');
}
</script>
