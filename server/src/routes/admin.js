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
      notifications: req.store.collection('notifications').length,
      tasks: req.store.collection('tasks').length,
      posts: req.store.collection('posts').filter((item) => !item.deletedAt).length,
      products: req.store.collection('products').filter((item) => !item.deletedAt).length,
      orders: req.store.collection('orders').length,
      pendingReports: req.store.collection('reports').filter((item) => item.status === 'pending').length,
      pendingDisputes: req.store.collection('taskDisputes').filter((item) => item.status === 'pending').length
        + req.store.collection('orderDisputes').filter((item) => item.status === 'pending').length,
      aiRisks: req.store.collection('aiRiskAlerts').length
    },
    mockEnabled: Boolean(req.store.collection('settings').mockEnabled)
  });
}));

router.get('/review-items', requireAdmin, asyncHandler(async (req, res) => {
  res.json({
    reports: req.store.collection('reports')
      .map((item) => ({ ...item, target: describeReportTarget(req.store, item), reporter: userBrief(req.store, item.reporterId) }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    taskDisputes: req.store.collection('taskDisputes')
      .map((item) => ({ ...item, task: req.store.collection('tasks').find((task) => task.id === item.taskId), user: userBrief(req.store, item.userId) }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    orderDisputes: req.store.collection('orderDisputes')
      .map((item) => ({ ...item, order: req.store.collection('orders').find((order) => order.id === item.orderId), user: userBrief(req.store, item.userId) }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  });
}));

router.post('/reports/:id/resolve', requireAdmin, asyncHandler(async (req, res) => {
  const report = req.store.collection('reports').find((item) => item.id === req.params.id);
  if (!report) throw badRequest('举报不存在');
  const valid = Boolean(req.body.valid);
  if (valid) await applyReportPenalty(req.store, report, req.body.result || '举报属实');
  const updated = await req.store.update('reports', report.id, {
    status: valid ? 'resolved_valid' : 'resolved_rejected',
    handledAt: now(),
    result: req.body.result || (valid ? '举报属实' : '举报驳回')
  });
  await req.store.insert('adminLogs', {
    operator: 'admin',
    action: 'resolve_report',
    targetType: 'report',
    targetId: report.id,
    detail: { valid, result: req.body.result || '' }
  });
  res.json({ report: updated });
}));

router.post('/task-disputes/:id/resolve', requireAdmin, asyncHandler(async (req, res) => {
  const dispute = req.store.collection('taskDisputes').find((item) => item.id === req.params.id);
  if (!dispute) throw badRequest('任务纠纷不存在');
  const task = req.store.collection('tasks').find((item) => item.id === dispute.taskId);
  if (!task) throw badRequest('任务不存在');
  const action = req.body.action === 'cancel' ? 'cancelled' : 'completed';
  await req.store.update('tasks', task.id, {
    status: action,
    adminResolvedAt: now(),
    adminResolveReason: req.body.reason || '管理员仲裁'
  });
  await req.store.update('taskDisputes', dispute.id, {
    status: 'resolved',
    result: action,
    handledAt: now()
  });
  if (req.body.faultUserId) await changeCredit(req.store, req.body.faultUserId, -4, '任务纠纷判责');
  await req.store.insert('adminLogs', {
    operator: 'admin',
    action: 'resolve_task_dispute',
    targetType: 'taskDispute',
    targetId: dispute.id,
    detail: { action, faultUserId: req.body.faultUserId || '' }
  });
  res.json({ ok: true });
}));

router.post('/order-disputes/:id/resolve', requireAdmin, asyncHandler(async (req, res) => {
  const dispute = req.store.collection('orderDisputes').find((item) => item.id === req.params.id);
  if (!dispute) throw badRequest('订单纠纷不存在');
  const order = req.store.collection('orders').find((item) => item.id === dispute.orderId);
  if (!order) throw badRequest('订单不存在');
  const status = req.body.action === 'cancel' ? 'cancelled' : 'completed';
  await req.store.update('orders', order.id, {
    status,
    adminResolvedAt: now(),
    adminResolveReason: req.body.reason || '管理员仲裁'
  });
  const product = req.store.collection('products').find((item) => item.id === order.productId);
  if (product) {
    await req.store.update('products', product.id, { status: status === 'completed' ? 'sold' : 'on_sale', lockedOrderId: '' });
  }
  await req.store.update('orderDisputes', dispute.id, {
    status: 'resolved',
    result: status,
    handledAt: now()
  });
  if (req.body.faultUserId) await changeCredit(req.store, req.body.faultUserId, -4, '订单纠纷判责');
  await req.store.insert('adminLogs', {
    operator: 'admin',
    action: 'resolve_order_dispute',
    targetType: 'orderDispute',
    targetId: dispute.id,
    detail: { status, faultUserId: req.body.faultUserId || '' }
  });
  res.json({ ok: true });
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

function userBrief(store, userId) {
  const user = store.collection('users').find((item) => item.id === userId);
  return user ? { id: user.id, nickname: user.nickname, studentId: user.studentId, creditScore: user.creditScore } : null;
}

function describeReportTarget(store, report) {
  if (report.type === 'task') {
    const task = store.collection('tasks').find((item) => item.id === report.targetId);
    return task ? { title: task.title, ownerId: task.publisherId } : null;
  }
  if (report.type === 'product') {
    const product = store.collection('products').find((item) => item.id === report.targetId);
    return product ? { title: product.title, ownerId: product.sellerId } : null;
  }
  if (report.type === 'post') {
    const post = store.collection('posts').find((item) => item.id === report.targetId);
    return post ? { title: post.title, ownerId: post.authorId } : null;
  }
  if (report.type === 'comment') {
    const comment = store.collection('comments').find((item) => item.id === report.targetId);
    return comment ? { title: comment.content?.slice(0, 40), ownerId: comment.authorId } : null;
  }
  return null;
}

async function applyReportPenalty(store, report, reason) {
  const target = describeReportTarget(store, report);
  if (!target?.ownerId) return;
  if (report.type === 'task') await store.update('tasks', report.targetId, { status: 'cancelled', cancelReason: reason });
  if (report.type === 'product') await store.update('products', report.targetId, { status: 'off_shelf', deletedAt: now(), takeDownReason: reason });
  if (report.type === 'post') await store.update('posts', report.targetId, { deletedAt: now() });
  if (report.type === 'comment') await store.update('comments', report.targetId, { deletedAt: now() });
  await changeCredit(store, target.ownerId, -4, reason);
}

async function changeCredit(store, userId, change, reason) {
  const user = store.collection('users').find((item) => item.id === userId);
  if (!user) return null;
  const before = user.creditScore;
  const after = Math.max(0, Math.min(10, before + change));
  await store.update('users', userId, { creditScore: after });
  return store.insert('userCreditLogs', {
    userId,
    change,
    before,
    after,
    reason,
    operator: 'admin'
  });
}
