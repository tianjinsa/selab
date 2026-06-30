import { createRouter, createWebHistory } from 'vue-router';
import { userSession } from './session.js';
import LoginPage from './pages/LoginPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import ProfilePage from './pages/ProfilePage.vue';
import MessagesPage from './pages/MessagesPage.vue';
import NotificationsPage from './pages/NotificationsPage.vue';
import PlaceholderPage from './pages/PlaceholderPage.vue';
import TaskMarketPage from './pages/tasks/TaskMarketPage.vue';
import TaskFormPage from './pages/tasks/TaskFormPage.vue';
import TaskPaymentPage from './pages/tasks/TaskPaymentPage.vue';
import TaskDetailPage from './pages/tasks/TaskDetailPage.vue';
import TaskRankingPage from './pages/tasks/TaskRankingPage.vue';

export const userRouter = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/', component: DashboardPage },
    { path: '/profile', component: ProfilePage },
    { path: '/messages/:id?', component: MessagesPage },
    { path: '/notifications', component: NotificationsPage },
    { path: '/tasks', component: TaskMarketPage },
    { path: '/tasks/new', component: TaskFormPage },
    { path: '/tasks/ranking', component: TaskRankingPage },
    { path: '/tasks/:id/edit', component: TaskFormPage },
    { path: '/tasks/:id/payment', component: TaskPaymentPage },
    { path: '/tasks/:id', component: TaskDetailPage },
    { path: '/forum', component: PlaceholderPage, props: { title: '校园社区论坛', phase: '阶段 3' } },
    { path: '/market', component: PlaceholderPage, props: { title: '校园二手市场', phase: '阶段 4' } },
    { path: '/ai', component: PlaceholderPage, props: { title: '校园信息智能体', phase: '阶段 5' } }
  ]
});

userRouter.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!userSession.token) return '/login';
  return true;
});
