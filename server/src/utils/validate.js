import { badRequest } from './errors.js';

export function assertStudentId(studentId) {
  if (!/^\d{12}$/.test(String(studentId || ''))) {
    throw badRequest('学号必须为 12 位纯数字');
  }
}

export function assertPhone(phone) {
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) {
    throw badRequest('手机号格式不正确');
  }
}

export function assertPassword(password) {
  if (!password || String(password).length < 6) {
    throw badRequest('密码至少需要 6 位');
  }
}

export function pickProfilePatch(body) {
  const allowed = ['avatarUrl', 'nickname', 'phone', 'contact', 'bio'];
  const patch = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      patch[key] = body[key];
    }
  }
  if (patch.phone !== undefined) assertPhone(patch.phone);
  return patch;
}
