export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function tokenFor(kind) {
  return localStorage.getItem(kind === 'admin' ? 'adminToken' : 'userToken') || '';
}

export async function request(path, options = {}, kind = 'user') {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = tokenFor(kind);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data?.error?.message || '请求失败', response.status, data?.error?.details || null);
  }
  return data;
}

export function assetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return undefined;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (!value.startsWith('/uploads/')) return value;
  const isVite = window.location.port === '5173';
  return isVite ? `${window.location.protocol}//${window.location.hostname}:3000${value}` : value;
}

export function websocketUrl(token) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const isVite = window.location.port === '5173';
  const host = isVite ? `${window.location.hostname}:3000` : window.location.host;
  return `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
}
