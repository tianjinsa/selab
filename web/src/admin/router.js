import { createRouter, createWebHistory } from 'vue-router';
import { adminSession } from './session.js';
import AdminLoginPage from './pages/AdminLoginPage.vue';
import AdminDashboardPage from './pages/AdminDashboardPage.vue';
import AdminUsersPage from './pages/AdminUsersPage.vue';
import AdminTasksPage from './pages/AdminTasksPage.vue';
import AdminForumPage from './pages/AdminForumPage.vue';
import AdminMarketPage from './pages/AdminMarketPage.vue';
import AdminAiPage from './pages/AdminAiPage.vue';

export const adminRouter = createRouter({
  history: createWebHistory('/admin'),
  routes: [
    { path: '/login', component: AdminLoginPage, meta: { public: true } },
    { path: '/', component: AdminDashboardPage },
    { path: '/users', component: AdminUsersPage },
    { path: '/tasks', component: AdminTasksPage },
    { path: '/forum', component: AdminForumPage },
    { path: '/market', component: AdminMarketPage },
    { path: '/ai', component: AdminAiPage }
  ]
});

adminRouter.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!adminSession.token) return '/login';
  return true;
});
