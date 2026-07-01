import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { randomUUID } from 'node:crypto';
import { assertCleanContent, extractTaskKeywords } from '../utils/content.js';
import { createNotification } from './notifications.js';
import { getOrCreateConversation, sendMessage } from './chat.js';
import { isModerationApproved } from './contentModeration.js';

const areas = ['东区', '西区', '南区', '北区', '宿舍区', '教学区', '快递点', '食堂', '图书馆', '其他'];

function now() {
  return new Date().toISOString();
}

function plusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function userBrief(store, userId) {
  const user = store.collection('users').find((item) => item.id === userId);
  if (!user) return null;
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    creditScore: user.creditScore,
    studentId: user.studentId
  };
}

function assertCanPublish(user) {
  if (user.isBanned) throw forbidden('账号已封禁，不能发布任务');
  if (user.isPublishRestricted) throw forbidden('账号已被限制发布，不能发布任务');
}

function assertTaskPayload(store, body) {
  const settings = store.collection('settings');
  const title = String(body.title || '').trim();
  const category = String(body.category || '').trim();
  const campusArea = String(body.campusArea || '').trim();
  const detail = String(body.detail || '').trim();
  const reward = Number(body.reward);
  const deadlineAt = body.deadlineAt ? new Date(body.deadlineAt) : null;
  if (!title) throw badRequest('请输入任务标题');
  if (!settings.taskCategories.includes(category)) throw badRequest('请选择有效任务类型');
  if (!areas.includes(campusArea)) throw badRequest('请选择有效地点 / 校区');
  if (!detail) throw badRequest('请输入任务详情');
  if (!Number.isFinite(reward) || reward < settings.taskRewardMin || reward > settings.taskRewardMax) {
    throw badRequest(`酬金需在 ${settings.taskRewardMin} 到 ${settings.taskRewardMax} 元之间`);
  }
  if (!deadlineAt || Number.isNaN(deadlineAt.getTime()) || deadlineAt.getTime() <= Date.now()) {
    throw badRequest('截止时间必须晚于当前时间');
  }
  assertCleanContent(store, title, detail, body.deliveryRequirement, body.contactNote);
  return {
    title,
    category,
    campusArea,
    detail,
    reward,
    deadlineAt: deadlineAt.toISOString(),
    deliveryRequirement: String(body.deliveryRequirement || '').trim(),
    contactNote: String(body.contactNote || '').trim(),
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.slice(0, 6) : []
  };
}

export function taskAreas() {
  return areas;
}

export async function createTaskDraft(store, user, body) {
  assertCanPublish(user);
  const payload = assertTaskPayload(store, body);
  const task = await store.insert('tasks', {
    ...payload,
    publisherId: user.id,
    status: 'editing',
    assigneeId: '',
    publishedAt: '',
    paidAt: '',
    completedAt: '',
    viewCount: 0
  });
  return decorateTask(store, task);
}

export async function updateTaskDraft(store, user, taskId, body) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (task.publisherId !== user.id) throw forbidden('只能编辑自己创建的任务');
  if (task.status !== 'editing') throw badRequest('只有待支付草稿可以编辑');
  const payload = assertTaskPayload(store, body);
  return decorateTask(store, await store.update('tasks', task.id, payload));
}

export async function publishTaskAfterPayment(store, user, taskId) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (task.publisherId !== user.id) throw forbidden('只能支付自己发布的任务');
  if (task.status !== 'editing') throw badRequest('任务当前状态不能支付发布');
  await recordPaymentFlow(store, {
    userId: user.id,
    relatedType: 'task',
    relatedId: task.id,
    type: 'task_publish_payment',
    amount: task.reward,
    status: 'success',
    title: `任务发布支付：${task.title}`
  });
  const updated = await store.update('tasks', task.id, {
    status: 'open',
    moderationStatus: 'pending',
    moderationReason: '',
    moderationCheckedAt: '',
    moderationRejectedAt: '',
    publishedAt: now(),
    paidAt: now()
  });
  await writeTaskKeywords(store, updated);
  return decorateTask(store, updated);
}

export function listTasks(store, query = {}, viewerId = '') {
  let tasks = store.collection('tasks')
    .filter((task) => ['open', 'accepted', 'submitted', 'timeout', 'completed'].includes(task.status))
    .filter((task) => isModerationApproved(task));
  if (query.status) tasks = tasks.filter((task) => task.status === query.status);
  if (query.category) tasks = tasks.filter((task) => task.category === query.category);
  if (query.campusArea) tasks = tasks.filter((task) => task.campusArea === query.campusArea);
  if (query.keyword) {
    const keyword = String(query.keyword).trim();
    tasks = tasks.filter((task) => `${task.title} ${task.detail}`.includes(keyword));
  }
  const minReward = query.minReward === undefined || query.minReward === '' ? null : Number(query.minReward);
  const maxReward = query.maxReward === undefined || query.maxReward === '' ? null : Number(query.maxReward);
  if (Number.isFinite(minReward)) tasks = tasks.filter((task) => task.reward >= minReward);
  if (Number.isFinite(maxReward)) tasks = tasks.filter((task) => task.reward <= maxReward);
  tasks = tasks.sort((a, b) => String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt)));
  return tasks.map((task) => decorateTask(store, task, viewerId));
}

export function taskWorkbench(store, userId) {
  const tasks = store.collection('tasks');
  const applications = store.collection('taskApplications');
  const reviews = store.collection('taskReviews');
  const paymentFlows = store.collection('paymentFlows');
  const publishedRaw = tasks.filter((task) => task.publisherId === userId);
  const assignedRaw = tasks.filter((task) => task.assigneeId === userId);
  const relatedTaskIds = new Set([...publishedRaw, ...assignedRaw].map((task) => task.id));
  const myApplications = applications
    .filter((item) => item.applicantId === userId)
    .map((item) => ({
      ...item,
      task: decorateTask(store, tasks.find((task) => task.id === item.taskId) || {}, userId),
      publisher: userBrief(store, item.publisherId)
    }))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const published = publishedRaw
    .map((task) => decorateTask(store, task, userId))
    .map((task) => ({
      ...task,
      pendingApplicationCount: applications.filter((item) => item.taskId === task.id && item.status === 'pending').length,
      hasMyReview: reviews.some((item) => item.taskId === task.id && item.reviewerId === userId)
    }))
    .sort((a, b) => String(b.updatedAt || b.publishedAt || b.createdAt).localeCompare(String(a.updatedAt || a.publishedAt || a.createdAt)));
  const assigned = assignedRaw
    .map((task) => decorateTask(store, task, userId))
    .map((task) => ({
      ...task,
      hasMyReview: reviews.some((item) => item.taskId === task.id && item.reviewerId === userId)
    }))
    .sort((a, b) => String(b.updatedAt || b.acceptedAt || b.createdAt).localeCompare(String(a.updatedAt || a.acceptedAt || a.createdAt)));
  const flows = paymentFlows
    .filter((flow) => flow.relatedType === 'task' && (flow.userId === userId || relatedTaskIds.has(flow.relatedId)))
    .map((flow) => ({
      ...flow,
      task: decorateTask(store, tasks.find((task) => task.id === flow.relatedId) || {}, userId)
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const actionItems = buildTaskActionItems(published, assigned, myApplications);
  const income = flows
    .filter((flow) => flow.userId === userId && ['task_finish_settlement', 'task_cancel_refund', 'task_timeout_refund'].includes(flow.type))
    .reduce((sum, flow) => sum + Number(flow.amount || 0), 0);
  const spending = flows
    .filter((flow) => flow.userId === userId && flow.type === 'task_publish_payment')
    .reduce((sum, flow) => sum + Number(flow.amount || 0), 0);

  return {
    stats: {
      publishedTotal: published.length,
      publishedActive: published.filter((task) => ['editing', 'open', 'accepted', 'submitted', 'timeout', 'dispute'].includes(task.status)).length,
      publishedCompleted: published.filter((task) => task.status === 'completed').length,
      assignedActive: assigned.filter((task) => ['accepted', 'submitted', 'timeout', 'dispute'].includes(task.status)).length,
      assignedCompleted: assigned.filter((task) => task.status === 'completed').length,
      pendingApplications: myApplications.filter((item) => item.status === 'pending').length,
      actionCount: actionItems.length,
      income,
      spending
    },
    actionItems,
    published,
    assigned,
    applications: myApplications,
    paymentFlows: flows.slice(0, 50)
  };
}

export function getTaskDetail(store, taskId, viewerId = '') {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (task.publisherId !== viewerId && task.assigneeId !== viewerId && !isModerationApproved(task)) throw notFound('任务不存在');
  task.viewCount = Number(task.viewCount || 0) + 1;
  store.saveCollection('tasks').catch(() => {});
  return decorateTask(store, task, viewerId, true);
}

export async function applyTask(store, realtime, user, taskId) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (task.status !== 'open') throw badRequest('任务当前不可申请');
  if (!isModerationApproved(task)) throw badRequest('任务正在审核，暂不能申请');
  if (task.publisherId === user.id) throw badRequest('不能申请自己发布的任务');
  if (user.creditScore < 4) throw forbidden('信用分低于 4 分，暂不能申请任务');

  const applications = store.collection('taskApplications');
  for (const item of applications) {
    if (item.taskId === taskId && item.applicantId === user.id && item.status === 'pending') {
      item.status = 'expired';
      item.expiredReason = '用户重复申请，旧申请失效';
      item.updatedAt = now();
    }
  }
  await store.saveCollection('taskApplications');

  const application = await store.insert('taskApplications', {
    taskId,
    publisherId: task.publisherId,
    applicantId: user.id,
    status: 'pending',
    message: '',
    expiresAt: plusDays(1)
  });

  const conversation = await getOrCreateConversation(store, user.id, task.publisherId);
  await sendMessage(store, realtime, user.id, conversation.id, {
    type: 'card',
    content: `申请任务：${task.title}`,
    card: {
      type: 'task_application',
      uniqueKey: `task:${task.id}:applicant:${user.id}:publisher:${task.publisherId}:task_application`,
      status: 'pending',
      title: '任务申请卡片',
      taskId: task.id,
      applicationId: application.id,
      taskTitle: task.title,
      reward: task.reward,
      applicantId: user.id,
      applicantName: user.nickname,
      applicantCredit: user.creditScore,
      publisherId: task.publisherId,
      expiresAt: application.expiresAt
    }
  });
  await createNotification(store, {
    userId: task.publisherId,
    type: 'task',
    title: '收到任务申请',
    body: `${user.nickname} 申请了任务「${task.title}」`,
    link: `/tasks/${task.id}`,
    sourceId: application.id
  }, realtime);
  return application;
}

export async function acceptApplication(store, realtime, user, applicationId) {
  const application = store.collection('taskApplications').find((item) => item.id === applicationId);
  if (!application) throw notFound('申请不存在');
  const task = store.collection('tasks').find((item) => item.id === application.taskId);
  if (!task) throw notFound('任务不存在');
  if (task.publisherId !== user.id) throw forbidden('只有发布者可以同意申请');
  if (task.status !== 'open') throw badRequest('任务当前不能同意申请');
  if (application.status !== 'pending') throw badRequest('该申请已经不可操作');

  application.status = 'accepted';
  application.updatedAt = now();
  for (const item of store.collection('taskApplications')) {
    if (item.taskId === task.id && item.id !== application.id && item.status === 'pending') {
      item.status = 'expired';
      item.expiredReason = '任务已确认其他接单者';
      item.updatedAt = now();
    }
  }
  await store.saveCollection('taskApplications');
  await store.update('tasks', task.id, {
    status: 'accepted',
    assigneeId: application.applicantId,
    acceptedAt: now()
  });
  await updateTaskCards(store, realtime, task.id);
  await createNotification(store, {
    userId: application.applicantId,
    type: 'task',
    title: '任务申请已通过',
    body: `你已成为「${task.title}」的接单者`,
    link: `/tasks/${task.id}`,
    sourceId: application.id
  }, realtime);
  return decorateTask(store, store.collection('tasks').find((item) => item.id === task.id));
}

export async function rejectApplication(store, realtime, user, applicationId) {
  const application = store.collection('taskApplications').find((item) => item.id === applicationId);
  if (!application) throw notFound('申请不存在');
  const task = store.collection('tasks').find((item) => item.id === application.taskId);
  if (!task) throw notFound('任务不存在');
  if (task.publisherId !== user.id) throw forbidden('只有发布者可以拒绝申请');
  if (application.status !== 'pending') throw badRequest('该申请已经不可操作');
  application.status = 'rejected';
  application.updatedAt = now();
  await store.saveCollection('taskApplications');
  await updateTaskCards(store, realtime, task.id);
  await createNotification(store, {
    userId: application.applicantId,
    type: 'task',
    title: '任务申请被拒绝',
    body: `发布者拒绝了你对「${task.title}」的申请`,
    link: `/tasks/${task.id}`,
    sourceId: application.id
  }, realtime);
  return application;
}

export async function submitDelivery(store, realtime, user, taskId, body) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (task.assigneeId !== user.id) throw forbidden('只有接单者可以提交凭证');
  if (!['accepted', 'timeout'].includes(task.status)) throw badRequest('任务当前不能提交凭证');
  const note = String(body.note || '').trim();
  if (!note && !(body.imageUrls || []).length) throw badRequest('请填写交付说明或上传凭证图片');
  const delivery = await store.insert('taskDeliveries', {
    taskId,
    assigneeId: user.id,
    note,
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.slice(0, 6) : [],
    status: 'submitted'
  });
  await store.update('tasks', task.id, {
    status: 'submitted',
    submittedAt: now()
  });
  await createNotification(store, {
    userId: task.publisherId,
    type: 'task',
    title: '任务等待验收',
    body: `「${task.title}」已提交交付凭证`,
    link: `/tasks/${task.id}`,
    sourceId: delivery.id
  }, realtime);
  return delivery;
}

export async function approveDelivery(store, realtime, user, taskId) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (task.publisherId !== user.id) throw forbidden('只有发布者可以验收任务');
  if (task.status !== 'submitted') throw badRequest('任务当前不在待验收状态');
  await completeTask(store, task, 'publisher_accept');
  await createNotification(store, {
    userId: task.assigneeId,
    type: 'task',
    title: '任务验收通过',
    body: `「${task.title}」已完成结算`,
    link: `/tasks/${task.id}`,
    sourceId: task.id
  }, realtime);
  return decorateTask(store, store.collection('tasks').find((item) => item.id === task.id));
}

export async function createTaskDispute(store, realtime, user, taskId, body) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (![task.publisherId, task.assigneeId].includes(user.id)) throw forbidden('只有任务相关用户可以申请介入');
  if (!['submitted', 'timeout', 'accepted'].includes(task.status)) throw badRequest('当前状态不能申请介入');
  const reason = String(body.reason || '').trim();
  if (!reason) throw badRequest('请填写申请介入原因');
  const dispute = await store.insert('taskDisputes', {
    taskId,
    userId: user.id,
    reason,
    evidenceUrls: Array.isArray(body.evidenceUrls) ? body.evidenceUrls.slice(0, 6) : [],
    status: 'pending'
  });
  await store.update('tasks', task.id, { status: 'dispute' });
  await createNotification(store, {
    userId: task.publisherId === user.id ? task.assigneeId : task.publisherId,
    type: 'task',
    title: '任务进入纠纷处理',
    body: `「${task.title}」已申请管理员介入`,
    link: `/tasks/${task.id}`,
    sourceId: dispute.id
  }, realtime);
  return dispute;
}

export async function cancelTask(store, realtime, user, taskId, body = {}) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (![task.publisherId, task.assigneeId].includes(user.id)) throw forbidden('只有任务相关用户可以取消或放弃');
  if (['submitted', 'completed', 'cancelled', 'closed'].includes(task.status)) throw badRequest('当前状态不能直接取消');
  if (task.status === 'accepted') {
    await changeCredit(store, user.id, -1, body.reason || '已确认接单后无故取消/放弃');
  }
  await store.update('tasks', task.id, {
    status: 'cancelled',
    cancelledAt: now(),
    cancelReason: body.reason || ''
  });
  await recordPaymentFlow(store, {
    userId: task.publisherId,
    relatedType: 'task',
    relatedId: task.id,
    type: 'task_cancel_refund',
    amount: task.reward,
    status: 'success',
    title: `任务取消退款：${task.title}`
  });
  await updateTaskCards(store, realtime, task.id);
  return decorateTask(store, store.collection('tasks').find((item) => item.id === task.id));
}

export async function createTaskReview(store, user, taskId, body) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  if (task.status !== 'completed') throw badRequest('任务完成后才能评价');
  if (![task.publisherId, task.assigneeId].includes(user.id)) throw forbidden('只有任务相关用户可以评价');
  const targetId = user.id === task.publisherId ? task.assigneeId : task.publisherId;
  if (store.collection('taskReviews').some((review) => review.taskId === taskId && review.reviewerId === user.id)) {
    throw badRequest('你已经评价过该任务');
  }
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('评分必须为 1 到 5 星');
  return store.insert('taskReviews', {
    taskId,
    reviewerId: user.id,
    targetId,
    rating,
    content: String(body.content || '').trim(),
    positive: rating >= 4
  });
}

export async function createTaskReport(store, user, taskId, body) {
  const task = store.collection('tasks').find((item) => item.id === taskId);
  if (!task) throw notFound('任务不存在');
  const reason = String(body.reason || '').trim();
  if (!reason) throw badRequest('请填写举报原因');
  return store.insert('reports', {
    type: 'task',
    targetId: task.id,
    reporterId: user.id,
    reason,
    status: 'pending'
  });
}

export function taskRanking(store, range = 'week') {
  const tasks = store.collection('tasks').filter((task) => task.status === 'completed' && task.assigneeId);
  const since = new Date();
  since.setDate(since.getDate() - (range === 'month' ? 30 : 7));
  const reviews = store.collection('taskReviews');
  const stats = new Map();
  for (const task of tasks) {
    if (new Date(task.completedAt || task.updatedAt) < since) continue;
    const current = stats.get(task.assigneeId) || { userId: task.assigneeId, completed: 0, positive: 0, reviews: 0 };
    current.completed += 1;
    const taskReviews = reviews.filter((review) => review.taskId === task.id && review.targetId === task.assigneeId);
    current.reviews += taskReviews.length;
    current.positive += taskReviews.filter((review) => review.positive).length;
    stats.set(task.assigneeId, current);
  }
  return [...stats.values()]
    .map((item) => {
      const user = userBrief(store, item.userId);
      return {
        ...item,
        user,
        positiveRate: item.reviews ? Math.round((item.positive / item.reviews) * 100) : 100,
        score: item.completed * 10 + (user?.creditScore || 0) + item.positive * 2
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

export function taskTendencies(store) {
  const counts = new Map();
  for (const item of store.collection('taskKeywords')) {
    counts.set(item.keyword, (counts.get(item.keyword) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

export async function scanTaskTimeouts(store) {
  const tasks = store.collection('tasks');
  let changed = false;
  for (const task of tasks) {
    const deadline = task.deadlineAt ? new Date(task.deadlineAt).getTime() : 0;
    if (task.status === 'open' && deadline && deadline < Date.now()) {
      task.status = 'closed';
      task.closedAt = now();
      task.updatedAt = now();
      changed = true;
      await recordPaymentFlow(store, {
        userId: task.publisherId,
        relatedType: 'task',
        relatedId: task.id,
        type: 'task_timeout_refund',
        amount: task.reward,
        status: 'success',
        title: `无人接单超时退款：${task.title}`
      });
    }
    if (task.status === 'accepted' && deadline && deadline < Date.now()) {
      task.status = 'timeout';
      task.updatedAt = now();
      changed = true;
      if (task.assigneeId) await changeCredit(store, task.assigneeId, -1, '接单者超时未完成任务');
    }
    if (task.status === 'submitted' && task.submittedAt) {
      const submittedAt = new Date(task.submittedAt);
      submittedAt.setDate(submittedAt.getDate() + 3);
      if (submittedAt.getTime() < Date.now()) {
        await completeTask(store, task, 'auto_accept_after_3_days');
        changed = true;
      }
    }
  }
  if (changed) await store.saveCollection('tasks');
  return { changed };
}

function buildTaskActionItems(published, assigned, applications) {
  const items = [];
  for (const task of published) {
    if (task.status === 'editing') {
      items.push({
        id: `pay-${task.id}`,
        type: 'payment',
        title: '待支付发布',
        body: `「${task.title}」还未支付，支付后才会进入任务市场。`,
        taskId: task.id,
        path: `/tasks/${task.id}/payment`,
        createdAt: task.updatedAt || task.createdAt
      });
    }
    if (task.status === 'open' && task.pendingApplicationCount > 0) {
      items.push({
        id: `applications-${task.id}`,
        type: 'application',
        title: '有新的接单申请',
        body: `「${task.title}」有 ${task.pendingApplicationCount} 个待处理申请。`,
        taskId: task.id,
        path: `/tasks/${task.id}`,
        createdAt: task.updatedAt || task.createdAt
      });
    }
    if (task.status === 'submitted') {
      items.push({
        id: `accept-${task.id}`,
        type: 'acceptance',
        title: '等待你验收',
        body: `「${task.title}」已提交交付凭证，请确认或申请介入。`,
        taskId: task.id,
        path: `/tasks/${task.id}`,
        createdAt: task.submittedAt || task.updatedAt || task.createdAt
      });
    }
    if (task.status === 'completed' && !task.hasMyReview) {
      items.push({
        id: `review-publisher-${task.id}`,
        type: 'review',
        title: '待评价接单者',
        body: `「${task.title}」已完成，可以补充合作评价。`,
        taskId: task.id,
        path: `/tasks/${task.id}`,
        createdAt: task.completedAt || task.updatedAt || task.createdAt
      });
    }
  }
  for (const task of assigned) {
    if (['accepted', 'timeout'].includes(task.status)) {
      items.push({
        id: `deliver-${task.id}`,
        type: 'delivery',
        title: task.status === 'timeout' ? '任务已超时，尽快补交' : '待提交交付凭证',
        body: `「${task.title}」需要提交完成说明或凭证。`,
        taskId: task.id,
        path: `/tasks/${task.id}`,
        createdAt: task.updatedAt || task.acceptedAt || task.createdAt
      });
    }
    if (task.status === 'completed' && !task.hasMyReview) {
      items.push({
        id: `review-assignee-${task.id}`,
        type: 'review',
        title: '待评价发布者',
        body: `「${task.title}」已结算，可以补充合作评价。`,
        taskId: task.id,
        path: `/tasks/${task.id}`,
        createdAt: task.completedAt || task.updatedAt || task.createdAt
      });
    }
  }
  for (const application of applications) {
    if (application.status === 'accepted') {
      items.push({
        id: `application-accepted-${application.id}`,
        type: 'application',
        title: '申请已通过',
        body: `你对「${application.task?.title || '任务'}」的申请已通过，可以进入任务沟通交付。`,
        taskId: application.taskId,
        path: `/tasks/${application.taskId}`,
        createdAt: application.updatedAt || application.createdAt
      });
    }
  }
  return items
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 12);
}

async function completeTask(store, task, reason) {
  task.status = 'completed';
  task.completedAt = now();
  task.completeReason = reason;
  task.updatedAt = now();
  await store.saveCollection('tasks');
  await recordPaymentFlow(store, {
    userId: task.assigneeId,
    relatedType: 'task',
    relatedId: task.id,
    type: 'task_finish_settlement',
    amount: task.reward,
    status: 'success',
    title: `任务完成结算：${task.title}`
  });
}

async function recordPaymentFlow(store, payload) {
  return store.insert('paymentFlows', {
    ...payload,
    serialNo: `PAY-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    createdAt: now()
  });
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
    operator: 'system'
  });
}

async function writeTaskKeywords(store, task) {
  const keywords = extractTaskKeywords(`${task.title} ${task.detail} ${task.category}`);
  const existing = store.collection('taskKeywords').filter((item) => item.taskId !== task.id);
  const next = keywords.map((keyword) => ({
    id: randomUUID(),
    taskId: task.id,
    keyword,
    createdAt: now(),
    updatedAt: now()
  }));
  await store.replaceCollection('taskKeywords', [...existing, ...next]);
}

async function updateTaskCards(store, realtime, taskId) {
  const applications = store.collection('taskApplications').filter((item) => item.taskId === taskId);
  const appById = new Map(applications.map((item) => [item.id, item]));
  const messages = store.collection('messages');
  let changed = false;
  for (const message of messages) {
    if (message.card?.type !== 'task_application') continue;
    const application = appById.get(message.card.applicationId);
    if (!application) continue;
    message.card = {
      ...message.card,
      status: application.status,
      expiredReason: application.expiredReason || ''
    };
    message.updatedAt = now();
    changed = true;
    const conversation = store.collection('conversations').find((item) => item.id === message.conversationId);
    for (const userId of conversation?.memberIds || []) {
      realtime?.sendToUser(userId, 'card.updated', { messageId: message.id, card: message.card });
    }
  }
  if (changed) await store.saveCollection('messages');
}

export function decorateTask(store, task, viewerId = '', detail = false) {
  const applications = store.collection('taskApplications').filter((item) => item.taskId === task.id);
  const deliveries = store.collection('taskDeliveries').filter((item) => item.taskId === task.id);
  const reviews = store.collection('taskReviews').filter((item) => item.taskId === task.id);
  const base = {
    ...task,
    publisher: userBrief(store, task.publisherId),
    assignee: task.assigneeId ? userBrief(store, task.assigneeId) : null,
    applicationCount: applications.length,
    myApplication: viewerId ? applications.find((item) => item.applicantId === viewerId) || null : null,
    lowCreditWarning: userBrief(store, task.publisherId)?.creditScore < 6
  };
  if (detail) {
    base.applications = applications.map((item) => ({
      ...item,
      applicant: userBrief(store, item.applicantId)
    }));
    base.deliveries = deliveries;
    base.reviews = reviews.map((item) => ({
      ...item,
      reviewer: userBrief(store, item.reviewerId),
      target: userBrief(store, item.targetId)
    }));
    base.paymentFlows = store.collection('paymentFlows').filter((item) => item.relatedType === 'task' && item.relatedId === task.id);
    base.disputes = store.collection('taskDisputes').filter((item) => item.taskId === task.id);
  }
  return base;
}
