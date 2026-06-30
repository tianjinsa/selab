import { reactive } from 'vue';
import { request } from '../shared/http.js';

export const userSession = reactive({
  token: localStorage.getItem('userToken') || '',
  user: null,
  unreadCount: 0
});

export function setUserSession(token, user) {
  userSession.token = token;
  userSession.user = user;
  localStorage.setItem('userToken', token);
}

export function clearUserSession() {
  userSession.token = '';
  userSession.user = null;
  userSession.unreadCount = 0;
  localStorage.removeItem('userToken');
}

export async function loadUserSession() {
  if (!userSession.token) return null;
  const data = await request('/api/auth/me');
  userSession.user = data.user;
  const count = await request('/api/notifications/unread-count').catch(() => ({ count: 0 }));
  userSession.unreadCount = count.count || 0;
  return data.user;
}
