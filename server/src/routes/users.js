const express = require('express');
const auth = require('../services/auth');
const store = require('../services/store');
const { ok } = require('../response');

const router = express.Router();

router.get('/me', auth.requireAuth, (req, res) => ok(res, store.withoutPassword(req.user)));

router.put('/me', auth.requireAuth, (req, res) => {
  const allowed = ['nickname', 'avatar', 'studentNo', 'contact', 'phone'];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) req.user[key] = req.body[key];
  });
  store.audit(req.data, { type: 'profile', title: '更新个人资料', actorId: req.user.id });
  store.save(req.data);
  return ok(res, store.withoutPassword(req.user), '个人资料已更新');
});

router.get('/:id/credit', auth.requireAuth, (req, res) => {
  const user = store.getUser(req.data, req.params.id);
  const tasks = req.data.tasks.filter((item) => item.assigneeId === req.params.id && item.status === '已完成');
  const reviews = req.data.orders.filter((item) => item.buyerId === req.params.id || item.sellerId === req.params.id);
  return ok(res, {
    user: store.withoutPassword(user),
    creditScore: user?.creditScore || 80,
    creditLevel: user?.creditLevel || 'B',
    completedTaskCount: tasks.length,
    tradeCount: reviews.length
  });
});

module.exports = router;
