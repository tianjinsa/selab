import { reactive } from 'vue';
import { request } from '../shared/http.js';

export const adminSession = reactive({
  token: localStorage.getItem('adminToken') || '',
  admin: null
});

export function setAdminSession(token, admin) {
  adminSession.token = token;
  adminSession.admin = admin;
  localStorage.setItem('adminToken', token);
}

export function clearAdminSession() {
  adminSession.token = '';
  adminSession.admin = null;
  localStorage.removeItem('adminToken');
}

export async function loadAdminSession() {
  if (!adminSession.token) return null;
  const data = await request('/api/admin/me', {}, 'admin');
  adminSession.admin = data.admin;
  return data.admin;
}
