const express = require('express');
const auth = require('../services/auth');
const social = require('../services/social');
const store = require('../services/store');
const { ok, fail } = require('../response');

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

router.get('/mutual-friends', auth.requireAuth, (req, res) => {
  const friends = social.mutualFriends(req.data, req.user.id);
  return ok(res, friends);
});

router.put('/:id/follow', auth.requireAuth, (req, res) => {
  const target = store.getUser(req.data, req.params.id);
  if (!target) return fail(res, 404, '用户不存在');
  if (target.id === req.user.id) return fail(res, 400, '不能关注自己');
  const following = Boolean(req.body.following);
  social.setFollowing(req.user, target.id, following);
  if (following) {
    store.addNotification(req.data, {
      userId: target.id,
      type: '关注更新',
      title: `${req.user.nickname} 关注了你`,
      content: '进入社区可查看对方动态。',
      relatedType: 'user',
      relatedId: req.user.id
    });
  }
  store.audit(req.data, { type: 'social', title: following ? '关注用户' : '取消关注用户', actorId: req.user.id });
  store.save(req.data);
  return ok(res, {
    user: store.withoutPassword(target),
    following,
    mutual: social.isMutual(req.data, req.user.id, target.id),
    me: store.withoutPassword(req.user)
  });
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
