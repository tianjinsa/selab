<template>
  <n-config-provider>
    <n-message-provider>
      <n-dialog-provider>
        <router-view v-if="$route.meta.public" />
        <div v-else class="app-shell">
          <aside class="side-nav">
            <div class="brand-block">
              <div class="brand-title">平台管理后台</div>
              <div class="brand-subtitle">独立管理员登录态</div>
            </div>
            <nav class="nav-list">
              <router-link class="nav-item" to="/"><Gauge :size="18" />仪表盘</router-link>
              <router-link class="nav-item" to="/users"><UsersRound :size="18" />用户管理</router-link>
            </nav>
          </aside>
          <main class="main-pane">
            <div class="topbar">
              <div>
                <h1 class="page-title">{{ $route.path === '/users' ? '用户管理' : '后台仪表盘' }}</h1>
                <p class="page-desc">管理员操作会写入操作日志，危险操作需要确认。</p>
              </div>
              <n-button secondary @click="logout">
                <template #icon><LogOut :size="16" /></template>
                退出
              </n-button>
            </div>
            <router-view />
          </main>
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Gauge, LogOut, UsersRound } from '@lucide/vue';
import { clearAdminSession, loadAdminSession } from './session.js';

const router = useRouter();

onMounted(async () => {
  await loadAdminSession().catch(() => {
    clearAdminSession();
    router.push('/login');
  });
});

function logout() {
  clearAdminSession();
  router.push('/login');
}
</script>
