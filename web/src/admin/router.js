import { createRouter, createWebHistory } from 'vue-router';
import { adminSession, clearAdminSession, loadAdminSession } from './session.js';
import AdminLoginPage from './pages/AdminLoginPage.vue';
import AdminDashboardPage from './pages/AdminDashboardPage.vue';
import AdminUsersPage from './pages/AdminUsersPage.vue';
import AdminTasksPage from './pages/AdminTasksPage.vue';
import AdminForumPage from './pages/AdminForumPage.vue';
import AdminMarketPage from './pages/AdminMarketPage.vue';
import AdminAiPage from './pages/AdminAiPage.vue';
import AdminReviewPage from './pages/AdminReviewPage.vue';
import AdminCounselorPage from './pages/AdminCounselorPage.vue';
import CounselorWorkbenchPage from './pages/CounselorWorkbenchPage.vue';

export const adminRouter = createRouter({
  history: createWebHistory('/admin'),
  routes: [
    { path: '/login', component: AdminLoginPage, meta: { public: true } },
    { path: '/', component: AdminDashboardPage, meta: { role: 'admin' } },
    { path: '/users', component: AdminUsersPage, meta: { role: 'admin' } },
    { path: '/tasks', component: AdminTasksPage, meta: { role: 'admin' } },
    { path: '/forum', component: AdminForumPage, meta: { role: 'admin' } },
    { path: '/market', component: AdminMarketPage, meta: { role: 'admin' } },
    { path: '/ai', component: AdminAiPage, meta: { role: 'admin' } },
    { path: '/review', component: AdminReviewPage, meta: { role: 'admin' } },
    { path: '/counselors', component: AdminCounselorPage, meta: { role: 'admin' } },
    { path: '/counselor', component: CounselorWorkbenchPage, meta: { role: 'counselor' } }
  ]
});

adminRouter.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!adminSession.token) return '/login';
  if (!adminSession.admin) {
    await loadAdminSession().catch(() => {
      clearAdminSession();
    });
    if (!adminSession.admin) return '/login';
  }
  const role = adminSession.admin?.role;
  if (role === 'counselor' && to.meta.role !== 'counselor') return '/counselor';
  if (role === 'admin' && to.meta.role === 'counselor') return '/';
  return true;
});
