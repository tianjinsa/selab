import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import {
  acceptApplication,
  applyTask,
  approveDelivery,
  cancelTask,
  createTaskDispute,
  createTaskDraft,
  createTaskReport,
  createTaskReview,
  decorateTask,
  getTaskDetail,
  listTasks,
  publishTaskAfterPayment,
  rejectApplication,
  scanTaskTimeouts,
  submitDelivery,
  taskAreas,
  taskRanking,
  taskTendencies,
  updateTaskDraft
} from '../services/tasks.js';
import { badRequest } from '../utils/errors.js';

const router = express.Router();

router.get('/meta', requireUser, asyncHandler(async (req, res) => {
  const settings = req.store.collection('settings');
  res.json({
    categories: settings.taskCategories,
    areas: taskAreas(),
    rewardMin: settings.taskRewardMin,
    rewardMax: settings.taskRewardMax
  });
}));

router.get('/', requireUser, asyncHandler(async (req, res) => {
  res.json({ tasks: listTasks(req.store, req.query, req.user.id) });
}));

router.post('/', requireUser, asyncHandler(async (req, res) => {
  const task = await createTaskDraft(req.store, req.user, req.body);
  res.status(201).json({ task });
}));

router.get('/ranking', requireUser, asyncHandler(async (req, res) => {
  res.json({ ranking: taskRanking(req.store, String(req.query.range || 'week')) });
}));

router.get('/:id', requireUser, asyncHandler(async (req, res) => {
  res.json({ task: getTaskDetail(req.store, req.params.id, req.user.id) });
}));

router.patch('/:id', requireUser, asyncHandler(async (req, res) => {
  const task = await updateTaskDraft(req.store, req.user, req.params.id, req.body);
  res.json({ task });
}));

router.post('/:id/pay', requireUser, asyncHandler(async (req, res) => {
  const task = await publishTaskAfterPayment(req.store, req.user, req.params.id);
  res.json({ task });
}));

router.post('/:id/apply', requireUser, asyncHandler(async (req, res) => {
  const application = await applyTask(req.store, req.realtime, req.user, req.params.id);
  res.status(201).json({ application });
}));

router.post('/applications/:id/accept', requireUser, asyncHandler(async (req, res) => {
  const task = await acceptApplication(req.store, req.realtime, req.user, req.params.id);
  res.json({ task });
}));

router.post('/applications/:id/reject', requireUser, asyncHandler(async (req, res) => {
  const application = await rejectApplication(req.store, req.realtime, req.user, req.params.id);
  res.json({ application });
}));

router.post('/:id/deliveries', requireUser, asyncHandler(async (req, res) => {
  const delivery = await submitDelivery(req.store, req.realtime, req.user, req.params.id, req.body);
  res.status(201).json({ delivery });
}));

router.post('/:id/complete', requireUser, asyncHandler(async (req, res) => {
  const task = await approveDelivery(req.store, req.realtime, req.user, req.params.id);
  res.json({ task });
}));

router.post('/:id/disputes', requireUser, asyncHandler(async (req, res) => {
  const dispute = await createTaskDispute(req.store, req.realtime, req.user, req.params.id, req.body);
  res.status(201).json({ dispute });
}));

router.post('/:id/cancel', requireUser, asyncHandler(async (req, res) => {
  const task = await cancelTask(req.store, req.realtime, req.user, req.params.id, req.body);
  res.json({ task });
}));

router.post('/:id/reviews', requireUser, asyncHandler(async (req, res) => {
  const review = await createTaskReview(req.store, req.user, req.params.id, req.body);
  res.status(201).json({ review });
}));

router.post('/:id/reports', requireUser, asyncHandler(async (req, res) => {
  const report = await createTaskReport(req.store, req.user, req.params.id, req.body);
  res.status(201).json({ report });
}));

router.get('/admin/all', requireAdmin, asyncHandler(async (req, res) => {
  const tasks = req.store.collection('tasks')
    .filter((task) => !req.query.status || task.status === req.query.status)
    .map((task) => decorateTask(req.store, task, '', true))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ tasks });
}));

router.get('/admin/meta', requireAdmin, asyncHandler(async (req, res) => {
  const settings = req.store.collection('settings');
  res.json({
    categories: settings.taskCategories,
    areas: taskAreas(),
    rewardMin: settings.taskRewardMin,
    rewardMax: settings.taskRewardMax
  });
}));

router.get('/admin/tendencies', requireAdmin, asyncHandler(async (req, res) => {
  const settings = req.store.collection('settings');
  if (settings.mockEnabled) {
    return res.json({
      tendencies: [
        { keyword: '取快递', count: 18 },
        { keyword: '代打印', count: 12 },
        { keyword: '课程资料', count: 8 },
        { keyword: '技能服务', count: 6 }
      ],
      source: 'mock'
    });
  }
  res.json({ tendencies: taskTendencies(req.store), source: 'database' });
}));

router.patch('/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
  const patch = {};
  if (Array.isArray(req.body.taskCategories)) {
    const categories = req.body.taskCategories.map((item) => String(item).trim()).filter(Boolean);
    if (!categories.length) throw badRequest('任务分类不能为空');
    patch.taskCategories = [...new Set(categories)];
  }
  if (req.body.taskRewardMin !== undefined) patch.taskRewardMin = Number(req.body.taskRewardMin);
  if (req.body.taskRewardMax !== undefined) patch.taskRewardMax = Number(req.body.taskRewardMax);
  if (patch.taskRewardMin !== undefined && patch.taskRewardMax !== undefined && patch.taskRewardMin > patch.taskRewardMax) {
    throw badRequest('酬金下限不能高于上限');
  }
  const settings = await req.store.updateSettings(patch);
  res.json({ settings });
}));

router.post('/admin/:id/take-down', requireAdmin, asyncHandler(async (req, res) => {
  const task = req.store.collection('tasks').find((item) => item.id === req.params.id);
  if (!task) throw badRequest('任务不存在');
  const updated = await req.store.update('tasks', task.id, {
    status: 'cancelled',
    cancelReason: req.body.reason || '管理员下架'
  });
  await req.store.insert('adminLogs', {
    operator: 'admin',
    action: 'take_down_task',
    targetType: 'task',
    targetId: task.id,
    detail: { reason: req.body.reason || '' }
  });
  res.json({ task: updated });
}));

router.post('/admin/scan-timeouts', requireAdmin, asyncHandler(async (req, res) => {
  const result = await scanTaskTimeouts(req.store);
  res.json(result);
}));

export default router;
