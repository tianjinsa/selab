import { randomUUID } from 'node:crypto';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { hashPassword, verifyPassword } from './auth.js';

function now() {
  return new Date().toISOString();
}

function codePart(studentId = '') {
  const text = String(studentId || '');
  return /^\d{12}$/.test(text) ? text.slice(4, 7) : '';
}

function normalizeCode(value, label) {
  const text = String(value ?? '').trim();
  if (!/^\d{3}$/.test(text)) throw badRequest(`${label}必须是 3 位数字`);
  return text;
}

function normalizeRange(body = {}, college = null) {
  const startCode = normalizeCode(body.startCode ?? body.start ?? body.from, '起始学号段');
  const endCode = normalizeCode(body.endCode ?? body.end ?? body.to, '结束学号段');
  if (startCode > endCode) throw badRequest('起始学号段不能大于结束学号段');
  if (college && (startCode < college.startCode || endCode > college.endCode)) {
    throw badRequest(`负责范围必须在学院范围 ${college.startCode}-${college.endCode} 内`);
  }
  return { startCode, endCode };
}

function normalizeRanges(ranges = [], college) {
  const source = Array.isArray(ranges) && ranges.length ? ranges : [{ startCode: college.startCode, endCode: college.endCode }];
  return source.map((range) => normalizeRange(range, college));
}

function sanitizeCounselor(counselor, college = null) {
  if (!counselor) return null;
  const { passwordHash, ...safe } = counselor;
  return {
    ...safe,
    college: college || null
  };
}

function collegeForId(store, collegeId) {
  return store.collection('colleges').find((item) => item.id === collegeId && !item.deletedAt);
}

function counselorForId(store, counselorId) {
  return store.collection('counselorAccounts').find((item) => item.id === counselorId && !item.deletedAt);
}

export function findCollegeForStudent(store, studentId = '') {
  const code = codePart(studentId);
  if (!code) return null;
  return store.collection('colleges')
    .filter((item) => !item.deletedAt)
    .find((item) => code >= item.startCode && code <= item.endCode) || null;
}

export function counselorsForStudent(store, studentId = '') {
  const code = codePart(studentId);
  if (!code) return [];
  const college = findCollegeForStudent(store, studentId);
  if (!college) return [];
  return store.collection('counselorAccounts')
    .filter((item) => !item.deletedAt && item.enabled !== false && item.collegeId === college.id)
    .filter((item) => (Array.isArray(item.ranges) ? item.ranges : []).some((range) => (
      code >= range.startCode && code <= range.endCode
    )))
    .map((item) => sanitizeCounselor(item, college));
}

export async function loginCounselor(store, username, password) {
  const counselor = store.collection('counselorAccounts')
    .find((item) => !item.deletedAt && item.enabled !== false && item.username === username);
  if (!counselor || !(await verifyPassword(password, counselor.passwordHash || ''))) return null;
  return sanitizeCounselor(counselor, collegeForId(store, counselor.collegeId));
}

export function listColleges(store) {
  return store.collection('colleges')
    .filter((item) => !item.deletedAt)
    .sort((a, b) => a.startCode.localeCompare(b.startCode));
}

export async function createCollege(store, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('学院名称不能为空');
  const range = normalizeRange(body);
  const conflict = listColleges(store).find((item) => (
    range.startCode <= item.endCode && range.endCode >= item.startCode
  ));
  if (conflict) throw badRequest(`学号段与「${conflict.name}」重叠`);
  return store.insert('colleges', {
    name,
    startCode: range.startCode,
    endCode: range.endCode,
    description: String(body.description || '').trim()
  });
}

export async function updateCollege(store, collegeId, body = {}) {
  const college = collegeForId(store, collegeId);
  if (!college) throw notFound('学院不存在');
  const name = String(body.name ?? college.name ?? '').trim();
  if (!name) throw badRequest('学院名称不能为空');
  const range = normalizeRange({
    startCode: body.startCode ?? college.startCode,
    endCode: body.endCode ?? college.endCode
  });
  const conflict = listColleges(store).find((item) => (
    item.id !== college.id && range.startCode <= item.endCode && range.endCode >= item.startCode
  ));
  if (conflict) throw badRequest(`学号段与「${conflict.name}」重叠`);
  const updated = await store.update('colleges', college.id, {
    name,
    startCode: range.startCode,
    endCode: range.endCode,
    description: String(body.description ?? college.description ?? '').trim()
  });
  await clampCounselorRanges(store, updated);
  return updated;
}

export async function deleteCollege(store, collegeId) {
  const college = collegeForId(store, collegeId);
  if (!college) throw notFound('学院不存在');
  const hasCounselors = store.collection('counselorAccounts').some((item) => !item.deletedAt && item.collegeId === college.id);
  if (hasCounselors) throw badRequest('请先删除或迁移该学院下的导员账号');
  await store.update('colleges', college.id, { deletedAt: now() });
  return { ok: true };
}

export function listCounselors(store) {
  return store.collection('counselorAccounts')
    .filter((item) => !item.deletedAt)
    .map((item) => sanitizeCounselor(item, collegeForId(store, item.collegeId)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function createCounselor(store, body = {}) {
  const username = String(body.username || '').trim();
  const name = String(body.name || '').trim();
  const password = String(body.password || '').trim();
  if (!username || !name || !password) throw badRequest('导员账号、姓名和初始密码不能为空');
  if (store.collection('counselorAccounts').some((item) => !item.deletedAt && item.username === username)) {
    throw badRequest('导员账号已存在');
  }
  const college = collegeForId(store, body.collegeId);
  if (!college) throw badRequest('请选择有效学院');
  return sanitizeCounselor(await store.insert('counselorAccounts', {
    username,
    name,
    collegeId: college.id,
    ranges: normalizeRanges(body.ranges, college),
    enabled: body.enabled !== false,
    passwordHash: await hashPassword(password)
  }), college);
}

export async function updateCounselor(store, counselorId, body = {}) {
  const counselor = counselorForId(store, counselorId);
  if (!counselor) throw notFound('导员账号不存在');
  const college = collegeForId(store, body.collegeId || counselor.collegeId);
  if (!college) throw badRequest('请选择有效学院');
  const patch = {
    name: String(body.name ?? counselor.name ?? '').trim(),
    collegeId: college.id,
    ranges: normalizeRanges(body.ranges || counselor.ranges, college),
    enabled: body.enabled !== false
  };
  if (!patch.name) throw badRequest('导员姓名不能为空');
  if (body.password) patch.passwordHash = await hashPassword(String(body.password));
  return sanitizeCounselor(await store.update('counselorAccounts', counselor.id, patch), college);
}

export async function updateOwnCounselorRanges(store, counselorId, ranges = []) {
  const counselor = counselorForId(store, counselorId);
  if (!counselor) throw notFound('导员账号不存在');
  const college = collegeForId(store, counselor.collegeId);
  if (!college) throw badRequest('导员所属学院不存在');
  return sanitizeCounselor(await store.update('counselorAccounts', counselor.id, {
    ranges: normalizeRanges(ranges, college)
  }), college);
}

export async function deleteCounselor(store, counselorId) {
  const counselor = counselorForId(store, counselorId);
  if (!counselor) throw notFound('导员账号不存在');
  await store.update('counselorAccounts', counselor.id, { deletedAt: now(), enabled: false });
  return { ok: true };
}

export async function createCounselorAlertsForUser(store, userId, payload = {}) {
  const user = store.collection('users').find((item) => item.id === userId);
  if (!user?.studentId) return [];
  const college = findCollegeForStudent(store, user.studentId);
  if (!college) return [];
  const counselors = counselorsForStudent(store, user.studentId);
  const created = [];
  for (const counselor of counselors) {
    const duplicate = store.collection('counselorAlerts').find((item) => (
      item.counselorId === counselor.id
      && item.sourceType === payload.sourceType
      && item.sourceId === payload.sourceId
    ));
    if (duplicate) continue;
    created.push(await store.insert('counselorAlerts', {
      counselorId: counselor.id,
      collegeId: college.id,
      studentUserId: user.id,
      studentName: user.nickname || '',
      studentId: user.studentId,
      sourceType: payload.sourceType || 'system',
      sourceId: payload.sourceId || randomUUID(),
      entityType: payload.entityType || '',
      entityId: payload.entityId || '',
      title: payload.title || '学生风险告警',
      reason: payload.reason || '',
      riskLevel: payload.riskLevel || '',
      snapshot: payload.snapshot || null,
      readAt: ''
    }));
  }
  return created;
}

export function listCounselorAlerts(store, counselorId, query = {}) {
  const unreadOnly = query.unread === '1' || query.unread === true;
  return store.collection('counselorAlerts')
    .filter((item) => item.counselorId === counselorId)
    .filter((item) => !unreadOnly || !item.readAt)
    .map((item) => ({
      ...item,
      college: collegeForId(store, item.collegeId)
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getCounselorAlertDetail(store, counselorId, alertId) {
  const alert = store.collection('counselorAlerts').find((item) => item.id === alertId && item.counselorId === counselorId);
  if (!alert) throw notFound('导员告警不存在');
  if (!alert.readAt) await store.update('counselorAlerts', alert.id, { readAt: now() });
  return {
    alert: {
      ...alert,
      readAt: alert.readAt || now(),
      college: collegeForId(store, alert.collegeId)
    },
    current: describeCurrentAlertTarget(store, alert)
  };
}

function describeCurrentAlertTarget(store, alert) {
  if (alert.sourceType === 'ai_risk') {
    const risk = store.collection('aiRiskAlerts').find((item) => item.id === alert.sourceId) || null;
    return {
      type: 'ai_risk',
      risk,
      conversation: risk?.sessionId ? buildAiConversation(store, risk.sessionId, risk.messageId) : null
    };
  }
  const collection = { post: 'posts', task: 'tasks', product: 'products' }[alert.entityType];
  if (!collection) return null;
  return {
    type: alert.entityType,
    entity: store.collection(collection).find((item) => item.id === alert.entityId) || null
  };
}

function buildAiConversation(store, sessionId, alertMessageId = '') {
  const session = store.collection('aiSessions').find((item) => item.id === sessionId);
  if (!session) return null;
  return {
    capturedAt: now(),
    alertMessageId,
    session: {
      id: session.id,
      title: session.title || '',
      status: session.status || '',
      userId: session.userId,
      createdAt: session.createdAt || '',
      updatedAt: session.updatedAt || ''
    },
    messages: store.collection('aiMessages')
      .filter((item) => item.sessionId === sessionId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content || '',
        reasoningContent: item.reasoningContent || '',
        status: item.status || '',
        runState: item.runState || '',
        createdAt: item.createdAt || '',
        updatedAt: item.updatedAt || '',
        editedAt: item.editedAt || ''
      }))
  };
}

export function getCounselorMe(store, counselorId) {
  const counselor = counselorForId(store, counselorId);
  if (!counselor) throw forbidden('导员账号不可用');
  return sanitizeCounselor(counselor, collegeForId(store, counselor.collegeId));
}

async function clampCounselorRanges(store, college) {
  const counselors = store.collection('counselorAccounts').filter((item) => !item.deletedAt && item.collegeId === college.id);
  for (const counselor of counselors) {
    const ranges = (counselor.ranges || [])
      .map((range) => ({
        startCode: range.startCode < college.startCode ? college.startCode : range.startCode,
        endCode: range.endCode > college.endCode ? college.endCode : range.endCode
      }))
      .filter((range) => range.startCode <= range.endCode);
    await store.update('counselorAccounts', counselor.id, {
      ranges: ranges.length ? ranges : [{ startCode: college.startCode, endCode: college.endCode }]
    });
  }
}
