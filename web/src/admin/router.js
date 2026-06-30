import { createRouter, createWebHistory } from 'vue-router';
import { adminSession } from './session.js';
import AdminLoginPage from './pages/AdminLoginPage.vue';
import AdminDashboardPage from './pages/AdminDashboardPage.vue';
import AdminUsersPage from './pages/AdminUsersPage.vue';

export const adminRouter = createRouter({
  history: createWebHistory('/admin'),
  routes: [
    { path: '/login', component: AdminLoginPage, meta: { public: true } },
    { path: '/', component: AdminDashboardPage },
    { path: '/users', component: AdminUsersPage }
  ]
});

adminRouter.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!adminSession.token) return '/login';
  return true;
});
