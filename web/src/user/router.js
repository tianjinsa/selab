import { createRouter, createWebHistory } from 'vue-router';
import { userSession } from './session.js';
import LoginPage from './pages/LoginPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import ProfilePage from './pages/ProfilePage.vue';
import UserProfilePage from './pages/UserProfilePage.vue';
import MessagesPage from './pages/MessagesPage.vue';
import NotificationsPage from './pages/NotificationsPage.vue';
import PlaceholderPage from './pages/PlaceholderPage.vue';
import TaskMarketPage from './pages/tasks/TaskMarketPage.vue';
import TaskFormPage from './pages/tasks/TaskFormPage.vue';
import TaskPaymentPage from './pages/tasks/TaskPaymentPage.vue';
import TaskDetailPage from './pages/tasks/TaskDetailPage.vue';
import TaskRankingPage from './pages/tasks/TaskRankingPage.vue';
import ForumHomePage from './pages/forum/ForumHomePage.vue';
import ForumCreatePage from './pages/forum/ForumCreatePage.vue';
import ForumDetailPage from './pages/forum/ForumDetailPage.vue';
import ForumRankingPage from './pages/forum/ForumRankingPage.vue';
import MarketHomePage from './pages/market/MarketHomePage.vue';
import MarketCreatePage from './pages/market/MarketCreatePage.vue';
import MarketDetailPage from './pages/market/MarketDetailPage.vue';
import MarketGradePage from './pages/market/MarketGradePage.vue';
import MarketOrdersPage from './pages/market/MarketOrdersPage.vue';
import AiChatPage from './pages/ai/AiChatPage.vue';

export const userRouter = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/login', component: LoginPage, meta: { public: true } },
    { path: '/', component: DashboardPage },
    { path: '/profile', component: ProfilePage },
    { path: '/users/:id', component: UserProfilePage },
    { path: '/messages/:id?', component: MessagesPage },
    { path: '/notifications', component: NotificationsPage },
    { path: '/tasks', component: TaskMarketPage },
    { path: '/tasks/new', component: TaskFormPage },
    { path: '/tasks/ranking', component: TaskRankingPage },
    { path: '/tasks/:id/edit', component: TaskFormPage },
    { path: '/tasks/:id/payment', component: TaskPaymentPage },
    { path: '/tasks/:id', component: TaskDetailPage },
    { path: '/forum', component: ForumHomePage },
    { path: '/forum/new', component: ForumCreatePage },
    { path: '/forum/rankings', component: ForumRankingPage },
    { path: '/forum/:id', component: ForumDetailPage },
    { path: '/market', component: MarketHomePage },
    { path: '/market/new', component: MarketCreatePage },
    { path: '/market/grade', component: MarketGradePage },
    { path: '/market/orders', component: MarketOrdersPage },
    { path: '/market/:id', component: MarketDetailPage },
    { path: '/ai', component: AiChatPage }
  ]
});

userRouter.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!userSession.token) return '/login';
  return true;
});
