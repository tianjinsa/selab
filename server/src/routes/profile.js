import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/errors.js';
import { assertPassword, pickProfilePatch } from '../utils/validate.js';
import { hashPassword, requireUser, sanitizeUser, verifyPassword } from '../services/auth.js';

const router = express.Router();

router.get('/', requireUser, asyncHandler(async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
}));

router.patch('/', requireUser, asyncHandler(async (req, res) => {
  const patch = pickProfilePatch(req.body);
  if (patch.phone && req.store.collection('users').some((user) => user.id !== req.user.id && user.phone === patch.phone)) {
    throw badRequest('该手机号已被其他账号使用');
  }
  const updated = await req.store.update('users', req.user.id, patch);
  res.json({ user: sanitizeUser(updated) });
}));

router.post('/password', requireUser, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  assertPassword(newPassword);
  const ok = await verifyPassword(oldPassword || '', req.user.passwordHash);
  if (!ok) throw badRequest('原密码不正确');
  await req.store.update('users', req.user.id, { passwordHash: await hashPassword(newPassword) });
  res.json({ ok: true, message: '密码已更新' });
}));

export default router;
