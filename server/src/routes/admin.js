import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/errors.js';
import { config } from '../config.js';
import { requireAdmin, sanitizeUser, signAdminToken } from '../services/auth.js';

const router = express.Router();

function now() {
  return new Date().toISOString();
}

router.post('/auth/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (username !== config.adminAccount.username || password !== config.adminAccount.password) {
    throw badRequest('管理员账号或密码错误');
  }
  res.json({
    token: signAdminToken(),
    admin: { username: config.adminAccount.username }
  });
}));

router.get('/me', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ admin: req.admin });
}));

router.get('/dashboard', requireAdmin, asyncHandler(async (req, res) => {
  const users = req.store.collection('users');
  res.json({
    db: req.store.status,
    metrics: {
      users: users.length,
      bannedUsers: users.filter((user) => user.isBanned).length,
      mutedUsers: users.filter((user) => user.isMuted).length,
      restrictedUsers: users.filter((user) => user.isPublishRestricted).length,
      conversations: req.store.collection('conversations').length,
      messages: req.store.collection('messages').length,
      notifications: req.store.collection('notifications').length
    },
    mockEnabled: Boolean(req.store.collection('settings').mockEnabled)
  });
}));

router.get('/users', requireAdmin, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const users = req.store.collection('users')
    .filter((user) => !q || user.nickname.includes(q) || user.phone.includes(q) || user.studentId.includes(q))
    .map(sanitizeUser)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ users });
}));

router.patch('/users/:id/status', requireAdmin, asyncHandler(async (req, res) => {
  const user = req.store.collection('users').find((item) => item.id === req.params.id);
  if (!user) throw badRequest('用户不存在');
  const patch = {};
  for (const key of ['isBanned', 'isMuted', 'isPublishRestricted']) {
    if (typeof req.body[key] === 'boolean') patch[key] = req.body[key];
  }
  if (req.body.creditScore !== undefined) {
    const nextCredit = Number(req.body.creditScore);
    if (!Number.isFinite(nextCredit) || nextCredit < 0 || nextCredit > 10) {
      throw badRequest('信用分必须在 0 到 10 之间');
    }
    patch.creditScore = nextCredit;
    await req.store.insert('userCreditLogs', {
      userId: user.id,
      change: nextCredit - user.creditScore,
      before: user.creditScore,
      after: nextCredit,
      reason: req.body.reason || '管理员调整',
      operator: 'admin'
    });
  }
  const updated = await req.store.update('users', user.id, patch);
  await req.store.insert('adminLogs', {
    operator: 'admin',
    action: 'update_user_status',
    targetType: 'user',
    targetId: user.id,
    detail: { patch, reason: req.body.reason || '' },
    createdAt: now()
  });
  res.json({ user: sanitizeUser(updated) });
}));

router.patch('/settings/mock', requireAdmin, asyncHandler(async (req, res) => {
  const settings = await req.store.updateSettings({ mockEnabled: Boolean(req.body.enabled) });
  res.json({ settings });
}));

export default router;
