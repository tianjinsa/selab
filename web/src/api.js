const API_BASE = import.meta.env.VITE_API_BASE || '/api';

let token = localStorage.getItem('campus_admin_token') || '';

export function setToken(value) {
  token = value || '';
  if (token) localStorage.setItem('campus_admin_token', token);
  else localStorage.removeItem('campus_admin_token');
}

export function getToken() {
  return token;
}

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || '请求失败');
  }
  return data.data;
}
