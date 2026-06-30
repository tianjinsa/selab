const express = require('express');
const auth = require('../services/auth');
const store = require('../services/store');
const { ok, fail } = require('../response');

const router = express.Router();

function validateInvitation(data, code, userId) {
  if (!data.settings.invitationRequired) return true;
  const invitation = data.invitations.find((item) => item.code === code);
  if (!invitation) return false;
  if (new Date(invitation.expiresAt).getTime() < Date.now()) return false;
  if (invitation.usedBy.length >= invitation.limit) return false;
  if (userId && !invitation.usedBy.includes(userId)) invitation.usedBy.push(userId);
  return true;
}

function getInvitationStatus(data, code) {
  const invitation = data.invitations.find((item) => item.code === code);
  if (!invitation) return { valid: false, message: '邀请码不存在' };
  if (new Date(invitation.expiresAt).getTime() < Date.now()) return { valid: false, message: '邀请码已过期' };
  if (invitation.usedBy.length >= invitation.limit) return { valid: false, message: '邀请码使用次数已满' };
  return {
    valid: true,
    code: invitation.code,
    limit: invitation.limit,
    usedCount: invitation.usedBy.length,
    expiresAt: invitation.expiresAt,
    message: '邀请码可用'
  };
}

router.get('/validate-invite-code', (req, res) => {
  const data = store.load();
  const code = String(req.query.code || '').trim();
  if (!code) return fail(res, 400, '请输入邀请码');
  return ok(res, getInvitationStatus(data, code));
});

router.post('/register', (req, res) => {
  const data = store.load();
  const account = String(req.body.account || req.body.username || '').trim();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '').trim();
  const nickname = String(req.body.nickname || '').trim();
  const studentNo = String(req.body.studentNo || account).trim();
  const invitationCode = String(req.body.invitationCode || req.body.inviteCode || '').trim();
  if (!account || !password || !invitationCode) return fail(res, 400, '账号、密码和邀请码不能为空');
  if (account.length < 3) return fail(res, 400, '账号至少需要 3 个字符');
  if (password.length < 6) return fail(res, 400, '密码至少需要 6 位');
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return fail(res, 400, '手机号格式不正确');
  if (data.users.some((item) => item.account === account || (phone && item.phone === phone))) return fail(res, 409, '账号或手机号已存在');

  const user = {
    id: store.id('u'),
    account,
    phone,
    role: 'student',
    passwordHash: auth.hashPassword(password),
    nickname: nickname || `校园用户${account.slice(-4)}`,
    avatar: '/static/avatar1.png',
    studentNo,
    contact: phone ? phone.replace(/^(\d{3})\d{4}(\d+)/, '$1****$2') : '',
    schoolVerified: true,
    creditScore: 90,
    creditLevel: 'A',
    following: [],
    muted: false,
    createdAt: store.now()
  };

  if (!validateInvitation(data, invitationCode, user.id)) return fail(res, 403, '邀请码无效或已过期');
  data.users.push(user);
  store.audit(data, { type: 'auth', title: '用户注册', actorId: user.id });
  store.save(data);
  return ok(res, { token: auth.sign(user), user: store.withoutPassword(user) }, '注册成功');
});

router.post('/login', (req, res) => {
  const data = store.load();
  const { account, password } = req.body;
  const user = data.users.find((item) => item.account === account || item.phone === account);
  if (!user || !auth.comparePassword(password, user)) return fail(res, 401, '账号或密码错误');
  return ok(res, { token: auth.sign(user), user: store.withoutPassword(user) }, '登录成功');
});

router.post('/wechat-login', (req, res) => {
  const data = store.load();
  const { openId = 'wx_demo_openid', invitationCode, nickname = '微信用户' } = req.body;
  let user = data.users.find((item) => item.openId === openId);
  if (!user) {
    user = {
      id: store.id('u'),
      account: `wx_${openId.slice(-8)}`,
      phone: '',
      openId,
      role: 'student',
      passwordHash: auth.hashPassword(store.id('pwd')),
      nickname,
      avatar: '/static/icon_wx.png',
      studentNo: '',
      contact: '',
      schoolVerified: true,
      creditScore: 90,
      creditLevel: 'A',
      muted: false,
      createdAt: store.now()
    };
    if (!validateInvitation(data, invitationCode, user.id)) return fail(res, 403, '微信快捷注册需要有效邀请码');
    data.users.push(user);
    store.save(data);
  }
  return ok(res, { token: auth.sign(user), user: store.withoutPassword(user) }, '微信登录成功');
});

router.get('/me', auth.requireAuth, (req, res) => ok(res, store.withoutPassword(req.user)));

router.put('/me', auth.requireAuth, (req, res) => {
  ['nickname', 'avatar', 'contact'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) req.user[key] = req.body[key];
  });
  req.user.profile = {
    ...(req.user.profile || {}),
    ...(req.body.profile || {})
  };
  store.save(req.data);
  return ok(res, store.withoutPassword(req.user), '个人资料已更新');
});

router.put('/password', auth.requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!auth.comparePassword(oldPassword, req.user)) return fail(res, 400, '原密码不正确');
  req.user.passwordHash = auth.hashPassword(newPassword);
  store.audit(req.data, { type: 'security', title: '修改密码', actorId: req.user.id });
  store.save(req.data);
  return ok(res, null, '密码已更新');
});

router.post('/invitations', auth.requireAdmin, (req, res) => {
  const code = req.body.code || `CAMPUS-${Date.now().toString(36).toUpperCase()}`;
  const invitation = {
    code,
    createdBy: req.user.id,
    usedBy: [],
    limit: Number(req.body.limit || 30),
    expiresAt: req.body.expiresAt || '2026-12-31T23:59:59.000Z'
  };
  req.data.invitations.unshift(invitation);
  store.audit(req.data, { type: 'admin', title: '生成邀请码', actorId: req.user.id });
  store.save(req.data);
  return ok(res, invitation, '邀请码已生成');
});

module.exports = router;
