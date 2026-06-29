const express = require('express');
const auth = require('../services/auth');
const store = require('../services/store');
const { ok, fail } = require('../response');

const router = express.Router();

router.post('/', auth.requireAuth, (req, res) => {
  const { targetType, targetId, reason, evidence = [] } = req.body;
  if (!targetType || !targetId || !reason) return fail(res, 400, '举报对象和原因不能为空');
  const report = {
    id: store.id('report'),
    targetType,
    targetId,
    reporterId: req.user.id,
    reason,
    evidence,
    status: '待审核',
    result: '',
    createdAt: store.now(),
  };
  req.data.reports.unshift(report);
  store.addNotification(req.data, {
    userId: req.user.id,
    type: '举报反馈',
    title: '举报已提交',
    content: `平台会审核你提交的 ${targetType} 举报。`,
    relatedType: targetType,
    relatedId: targetId,
  });
  store.audit(req.data, { type: 'report', title: '用户提交举报', actorId: req.user.id });
  store.save(req.data);
  return ok(res, report, '举报已提交，等待管理员审核');
});

router.get('/mine', auth.requireAuth, (req, res) => {
  return ok(
    res,
    req.data.reports
      .filter((item) => item.reporterId === req.user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  );
});

module.exports = router;
