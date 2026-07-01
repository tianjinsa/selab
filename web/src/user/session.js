import { reactive } from 'vue';
import { request } from '../shared/http.js';

export const userSession = reactive({
  token: localStorage.getItem('userToken') || '',
  user: null,
  unreadCount: 0,
  messageUnreadCount: 0
});

export function setUserSession(token, user) {
  userSession.token = token;
  userSession.user = user;
  userSession.unreadCount = 0;
  userSession.messageUnreadCount = 0;
  localStorage.setItem('userToken', token);
}

export function clearUserSession() {
  userSession.token = '';
  userSession.user = null;
  userSession.unreadCount = 0;
  userSession.messageUnreadCount = 0;
  localStorage.removeItem('userToken');
}

export async function loadUserSession() {
  if (!userSession.token) return null;
  const data = await request('/api/auth/me');
  userSession.user = data.user;
  await loadUnreadCounts();
  return data.user;
}

export async function loadUnreadCounts() {
  if (!userSession.token) return { notification: 0, message: 0 };
  const [notificationCount, messageCount] = await Promise.all([
    request('/api/notifications/unread-count').catch(() => ({ count: 0 })),
    request('/api/conversations/unread-count').catch(() => ({ count: 0 }))
  ]);
  userSession.unreadCount = notificationCount.count || 0;
  userSession.messageUnreadCount = messageCount.count || 0;
  return {
    notification: userSession.unreadCount,
    message: userSession.messageUnreadCount
  };
}
