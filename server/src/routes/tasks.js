const express = require('express');
const auth = require('../services/auth');
const actionCards = require('../services/actionCards');
const store = require('../services/store');
const socketHub = require('../services/socketHub');
const { ok, fail } = require('../response');

const router = express.Router();

function filterTasks(data, query) {
  let list = data.tasks.slice();
  if (query.type) list = list.filter((item) => item.type === query.type);
  if (query.keyword) {
    const key = String(query.keyword).toLowerCase();
    list = list.filter((item) => `${item.title} ${item.detail} ${item.type}`.toLowerCase().includes(key));
  }
  if (query.status) list = list.filter((item) => item.status === query.status);
  if (query.minReward) list = list.filter((item) => item.reward >= Number(query.minReward));
  if (query.maxReward) list = list.filter((item) => item.reward <= Number(query.maxReward));
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function ensureTask(data, id) {
  return data.tasks.find((item) => item.id === id);
}

router.get('/', (req, res) => {
  const data = store.load();
  return ok(res, filterTasks(data, req.query).map((item) => store.publicTask(data, item)));
});

router.get('/leaderboard', (req, res) => {
  const data = store.load();
  const ranked = data.users
    .filter((item) => item.role === 'student')
    .map((user) => {
      const completed = data.tasks.filter((task) => task.assigneeId === user.id && task.status === '已完成').length;
      return {
        user: store.withoutPassword(user),
        completed,
        completionRate: completed ? 98 : 92,
        praiseRate: user.creditScore,
        orderCount: completed + data.tasks.filter((task) => task.applicants.includes(user.id)).length
      };
    })
    .sort((a, b) => b.praiseRate - a.praiseRate);
  return ok(res, ranked);
});

router.get('/functions/search', (req, res) => {
  const data = store.load();
  return ok(res, filterTasks(data, req.query).map((item) => store.publicTask(data, item)));
});

router.get('/functions/status/:id', (req, res) => {
  const data = store.load();
  const task = ensureTask(data, req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  return ok(res, { id: task.id, status: task.status, assigneeId: task.assigneeId, escrowPaid: task.escrowPaid });
});

router.get('/:id', (req, res) => {
  const data = store.load();
  const task = ensureTask(data, req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  task.views += 1;
  store.save(data);
  return ok(res, store.publicTask(data, task));
});

router.post('/', auth.requireAuth, (req, res) => {
  if (req.user.creditScore < 60 || req.user.muted) return fail(res, 403, '账号信用状态暂不可发布任务');
  const reward = Number(req.body.reward || 0);
  const [min, max] = req.data.settings.taskRewardRange;
  if (reward < min || reward > max) return fail(res, 400, `酬金需在 ${min}-${max} 元之间`);
  const task = {
    id: store.id('task'),
    title: req.body.title,
    type: req.body.type,
    reward,
    deadline: req.body.deadline,
    distance: req.body.distance || '校内',
    location: req.body.location,
    detail: req.body.detail,
    deliverable: req.body.deliverable || '交付凭证',
    publisherId: req.user.id,
    assigneeId: '',
    applicants: [],
    status: '报名中',
    escrowPaid: true,
    views: 0,
    createdAt: store.now()
  };
  req.data.tasks.unshift(task);
  store.addNotification(req.data, {
    userId: req.user.id,
    type: '支付成功',
    title: '任务酬金已托管',
    content: `${task.title} 的 ${task.reward} 元酬金已进入平台托管账户。`,
    relatedType: 'task',
    relatedId: task.id
  });
  store.audit(req.data, { type: 'task', title: '发布任务', actorId: req.user.id });
  store.save(req.data);
  return ok(res, store.publicTask(req.data, task), '任务发布成功，模拟支付已完成');
});

router.post('/:id/apply', auth.requireAuth, (req, res) => {
  const task = ensureTask(req.data, req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  if (task.publisherId === req.user.id) return fail(res, 400, '不能报名自己发布的任务');
  if (task.status !== '报名中') return fail(res, 400, '该任务当前不可报名');
  if (!task.applicants.includes(req.user.id)) task.applicants.push(req.user.id);
  const { conversation, message } = actionCards.createActionCardMessage(req.data, {
    type: 'taskApply',
    targetType: 'task',
    targetId: task.id,
    title: task.title,
    summary: `${req.user.nickname} 想接取该任务`,
    requesterId: req.user.id,
    ownerId: task.publisherId,
    source: '任务互助',
    content: req.body.message || `我想接取「${task.title}」，等待你确认。`
  });
  store.addNotification(req.data, {
    userId: task.publisherId,
    type: '任务报名',
    title: `${req.user.nickname} 报名了你的任务`,
    content: task.title,
    relatedType: 'task',
    relatedId: task.id
  });
  store.save(req.data);
  socketHub.broadcastToUser(task.publisherId, { type: 'message', data: { conversationId: conversation.id, message } });
  return ok(res, { task: store.publicTask(req.data, task), conversation, message }, '已发送报名卡片');
});

router.post('/:id/assign', auth.requireAuth, (req, res) => {
  const task = ensureTask(req.data, req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  if (task.publisherId !== req.user.id) return fail(res, 403, '只有发布者可确认接单人');
  task.assigneeId = req.body.assigneeId;
  task.status = '进行中';
  store.addNotification(req.data, {
    userId: task.assigneeId,
    type: '任务状态',
    title: '你已被确认为接单人',
    content: task.title,
    relatedType: 'task',
    relatedId: task.id
  });
  store.save(req.data);
  return ok(res, store.publicTask(req.data, task), '已确认接单人');
});

router.post('/:id/deliver', auth.requireAuth, (req, res) => {
  const task = ensureTask(req.data, req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  if (task.assigneeId !== req.user.id) return fail(res, 403, '只有接单者可提交交付凭证');
  task.status = '待验收';
  task.delivery = { proof: req.body.proof || '已提交交付凭证', createdAt: store.now() };
  store.addNotification(req.data, {
    userId: task.publisherId,
    type: '验收提醒',
    title: '任务待验收',
    content: task.title,
    relatedType: 'task',
    relatedId: task.id
  });
  store.save(req.data);
  return ok(res, store.publicTask(req.data, task), '交付凭证已提交');
});

router.post('/:id/settle', auth.requireAuth, (req, res) => {
  const task = ensureTask(req.data, req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  if (![task.publisherId, task.assigneeId].includes(req.user.id)) return fail(res, 403, '无权结算该任务');
  task.status = '已完成';
  task.settlement = { amount: task.reward, paidTo: task.assigneeId, createdAt: store.now() };
  const assignee = store.getUser(req.data, task.assigneeId);
  if (assignee) {
    assignee.creditScore = Math.min(100, assignee.creditScore + req.data.settings.creditRules.taskComplete);
  }
  store.addNotification(req.data, {
    userId: task.assigneeId,
    type: '酬金到账',
    title: '任务酬金已到账',
    content: `${task.title} 结算 ${task.reward} 元。`,
    relatedType: 'task',
    relatedId: task.id
  });
  store.save(req.data);
  return ok(res, store.publicTask(req.data, task), '任务已验收并完成模拟结算');
});

router.post('/:id/cancel', auth.requireAuth, (req, res) => {
  const task = ensureTask(req.data, req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  if (![task.publisherId, task.assigneeId].includes(req.user.id)) return fail(res, 403, '无权取消该任务');
  task.status = '已取消';
  task.refund = { amount: task.reward, reason: req.body.reason || '用户取消', createdAt: store.now() };
  store.save(req.data);
  return ok(res, store.publicTask(req.data, task), '任务已取消，酬金模拟退回');
});

module.exports = router;
