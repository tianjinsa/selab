import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, forbidden } from '../utils/errors.js';
import { assertPassword, assertPhone, assertStudentId } from '../utils/validate.js';
import {
  hashPassword,
  requireUser,
  sanitizeUser,
  signUserToken,
  verifyPassword
} from '../services/auth.js';

const router = express.Router();

router.post('/register', asyncHandler(async (req, res) => {
  const { studentId, phone, password, nickname = '' } = req.body;
  assertStudentId(studentId);
  assertPhone(phone);
  assertPassword(password);

  const users = req.store.collection('users');
  if (users.some((user) => user.studentId === studentId)) {
    throw badRequest('该学号已注册');
  }
  if (users.some((user) => user.phone === phone)) {
    throw badRequest('该手机号已注册');
  }

  const user = await req.store.insert('users', {
    studentId,
    phone,
    passwordHash: await hashPassword(password),
    nickname: nickname.trim() || `同学${studentId.slice(-4)}`,
    avatarUrl: '',
    contact: '',
    bio: '',
    creditScore: 10,
    isBanned: false,
    isMuted: false,
    isPublishRestricted: false,
    lastLoginAt: new Date().toISOString()
  });

  res.status(201).json({
    token: signUserToken(user),
    user: sanitizeUser(user)
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { account, password } = req.body;
  if (!account || !password) throw badRequest('请输入账号和密码');
  const user = req.store.collection('users')
    .find((item) => item.studentId === account || item.phone === account);
  if (!user) throw badRequest('账号不存在');
  if (user.isBanned) throw forbidden('账号已被封禁，请联系管理员');
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw badRequest('密码错误');
  const updated = await req.store.update('users', user.id, { lastLoginAt: new Date().toISOString() });
  res.json({
    token: signUserToken(updated),
    user: sanitizeUser(updated)
  });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { studentId, phone, newPassword } = req.body;
  assertStudentId(studentId);
  assertPhone(phone);
  assertPassword(newPassword);
  const user = req.store.collection('users')
    .find((item) => item.studentId === studentId && item.phone === phone);
  if (!user) throw badRequest('学号和手机号不匹配');
  await req.store.update('users', user.id, { passwordHash: await hashPassword(newPassword) });
  res.json({ ok: true, message: '密码已重置，请使用新密码登录' });
}));

router.get('/me', requireUser, asyncHandler(async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
}));

export default router;
