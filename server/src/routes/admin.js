const express = require('express');
const auth = require('../services/auth');
const store = require('../services/store');
const categories = require('../services/categories');
const { ok, fail } = require('../response');

const router = express.Router();

router.use(auth.requireAdmin);

router.get('/overview', (req, res) => {
  const unreadReports = req.data.reports.filter((item) => item.status === '待审核').length;
  const pendingGoods = req.data.goods.filter((item) => item.auditStatus === '待审核').length;
  const activeTasks = req.data.tasks.filter((item) => ['报名中', '进行中', '待验收'].includes(item.status)).length;
  const completedOrders = req.data.orders.filter((item) => item.status === '已完成').length;
  const questionCount = req.data.agentSessions.reduce((sum, item) => sum + item.messages.filter((msg) => msg.role === 'user').length, 0);
  return ok(res, {
    users: req.data.users.length,
    activeTasks,
    posts: req.data.posts.length,
    goods: req.data.goods.length,
    completedOrders,
    unreadReports,
    pendingGoods,
    questionCount,
    latestAudits: req.data.audits.slice(0, 8)
  });
});

router.get('/settings', (req, res) => ok(res, req.data.settings));

router.put('/settings', (req, res) => {
  const nextSettings = { ...req.data.settings, ...req.body };
  if (Object.prototype.hasOwnProperty.call(req.body, 'taskCategories')) {
    nextSettings.taskCategories = categories
      .normalizeTaskCategories({ taskCategories: req.body.taskCategories }, [])
      .filter((item) => item !== '全部');
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'goodsCategories')) {
    nextSettings.goodsCategories = categories.normalizeGoodsCategories({ goodsCategories: req.body.goodsCategories }, []);
  }
  req.data.settings = nextSettings;
  store.audit(req.data, { type: 'admin', title: '更新系统参数', actorId: req.user.id });
  store.save(req.data);
  return ok(res, req.data.settings, '系统参数已更新');
});

router.get('/users', (req, res) => ok(res, req.data.users.map(store.withoutPassword)));

router.put('/users/:id', (req, res) => {
  const user = store.getUser(req.data, req.params.id);
  if (!user) return fail(res, 404, '用户不存在');
  ['muted', 'creditScore', 'creditLevel', 'role'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) user[key] = req.body[key];
  });
  store.audit(req.data, { type: 'admin', title: '更新用户状态', actorId: req.user.id });
  store.save(req.data);
  return ok(res, store.withoutPassword(user), '用户状态已更新');
});

router.get('/tasks', (req, res) => ok(res, req.data.tasks.map((item) => store.publicTask(req.data, item))));

router.put('/tasks/:id', (req, res) => {
  const task = req.data.tasks.find((item) => item.id === req.params.id);
  if (!task) return fail(res, 404, '任务不存在');
  ['status', 'type', 'reward', 'deadline', 'detail'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) task[key] = req.body[key];
  });
  store.audit(req.data, { type: 'admin', title: '审核任务', actorId: req.user.id });
  store.save(req.data);
  return ok(res, store.publicTask(req.data, task), '任务已更新');
});

router.get('/posts', (req, res) => ok(res, req.data.posts.map((item) => store.publicPost(req.data, item))));

router.put('/posts/:id', (req, res) => {
  const post = req.data.posts.find((item) => item.id === req.params.id);
  if (!post) return fail(res, 404, '帖子不存在');
  ['status', 'title', 'content'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) post[key] = req.body[key];
  });
  store.audit(req.data, { type: 'admin', title: '审核社区内容', actorId: req.user.id });
  store.save(req.data);
  return ok(res, store.publicPost(req.data, post), '帖子已更新');
});

router.get('/goods', (req, res) => ok(res, req.data.goods.map((item) => store.publicGoods(req.data, item))));

router.put('/goods/:id/audit', (req, res) => {
  const goods = req.data.goods.find((item) => item.id === req.params.id);
  if (!goods) return fail(res, 404, '商品不存在');
  goods.auditStatus = req.body.auditStatus || '通过';
  goods.status = goods.auditStatus === '通过' ? '在售' : '下架';
  goods.auditRemark = req.body.remark || '';
  store.addNotification(req.data, {
    userId: goods.sellerId,
    type: '商品审核',
    title: `商品审核${goods.auditStatus}`,
    content: goods.name,
    relatedType: 'goods',
    relatedId: goods.id
  });
  store.audit(req.data, { type: 'admin', title: '审核商品', actorId: req.user.id });
  store.save(req.data);
  return ok(res, store.publicGoods(req.data, goods), '商品审核已处理');
});

router.get('/orders', (req, res) => ok(res, req.data.orders));

router.put('/orders/:id/arbitrate', (req, res) => {
  const order = req.data.orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  order.status = req.body.result === 'refund' ? '已取消' : '已完成';
  order.arbitration = { result: req.body.result || 'compensateSeller', remark: req.body.remark || '', handledAt: store.now() };
  store.audit(req.data, { type: 'admin', title: '处理交易仲裁', actorId: req.user.id });
  store.save(req.data);
  return ok(res, order, '仲裁已处理');
});

router.get('/reports', (req, res) => ok(res, req.data.reports));

router.put('/reports/:id', (req, res) => {
  const report = req.data.reports.find((item) => item.id === req.params.id);
  if (!report) return fail(res, 404, '举报不存在');
  report.status = req.body.status || '已处理';
  report.result = req.body.result || '已记录';
  report.handledBy = req.user.id;
  report.handledAt = store.now();
  store.audit(req.data, { type: 'admin', title: '处理举报', actorId: req.user.id });
  store.save(req.data);
  return ok(res, report, '举报已处理');
});

router.get('/agent/stats', (req, res) => {
  const questionCount = req.data.agentSessions.reduce((sum, item) => sum + item.messages.filter((msg) => msg.role === 'user').length, 0);
  return ok(res, {
    questionCount,
    sessionCount: req.data.agentSessions.length,
    knowledgeCount: req.data.knowledgeBase.length,
    promptCount: req.data.prompts.length,
    resolutionRate: '92%'
  });
});

module.exports = router;
