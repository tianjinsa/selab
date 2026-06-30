export function unwrap(res) {
  if (!res) return null;
  const body = res.data || res;
  if (body && Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
}

export function listFrom(res) {
  const data = unwrap(res);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.list)) return data.list;
  return [];
}

export function getImage(images, fallback = '') {
  if (Array.isArray(images)) return images.find((item) => item) || fallback;
  if (typeof images === 'string' && images.trim()) return images;
  return fallback;
}

export function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}
