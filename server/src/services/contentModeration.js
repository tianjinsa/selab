import { createHash } from 'node:crypto';
import { createNotification } from './notifications.js';
import { applyModerationRejectionEffects } from './moderationRefunds.js';

const PROCESSING_STATUSES = new Set(['pending', 'processing']);

const categoryLabels = {
  antisocial: '反社会/极端暴力',
  self_harm: '自残自杀',
  illegal: '违法违规',
  sexual: '色情低俗',
  fraud: '诈骗交易'
};

const entityLabels = {
  post: '帖子',
  task: '任务',
  product: '商品'
};

const notificationTypes = {
  post: 'forum',
  task: 'task',
  product: 'market'
};

const publicLinks = {
  post: (id) => `/forum/${id}`,
  task: (id) => `/tasks/${id}`,
  product: (id) => `/market/${id}`
};

const userManageLinks = {
  post: '/forum/studio',
  task: '/tasks/moderation',
  product: '/market/moderation'
};

const riskRules = [
  {
    category: 'self_harm',
    level: 'critical',
    words: ['自杀', '自残', '割腕', '跳楼', '想死', '不想活', '轻生', '吞药', '结束生命']
  },
  {
    category: 'antisocial',
    level: 'critical',
    words: ['报复社会', '反社会', '无差别伤人', '校园袭击', '恐怖袭击', '炸学校', '屠杀', '灭口', '杀人教程']
  },
  {
    category: 'illegal',
    level: 'high',
    words: ['毒品', '冰毒', '大麻', '贩毒', '枪支', '管制刀具', '赌博', '洗钱', '代考', '黑客攻击', '盗号', '破解校园网', '发票代开']
  },
  {
    category: 'fraud',
    level: 'high',
    words: ['诈骗', '刷单', '套现', '刷流水', '裸聊', '贷款中介', '银行卡四件套', '校园贷']
  },
  {
    category: 'sexual',
    level: 'medium',
    words: ['约炮', '卖淫', '嫖娼', '成人视频', '裸照', '色情服务']
  }
];

let scheduledScan = null;

function now() {
  return new Date().toISOString();
}

export function isModerationApproved(entity) {
  return !entity?.moderationStatus || entity.moderationStatus === 'approved';
}

export function scheduleContentModerationScan(store, realtime) {
  if (scheduledScan) return;
  scheduledScan = setTimeout(() => {
    scheduledScan = null;
    scanContentModerationQueue(store, realtime).catch((error) => {
      console.error('Content moderation scan failed:', error.message);
    });
  }, 0);
}

export async function enqueueContentModeration(store, realtime, entityType, entityId) {
  const entity = findEntity(store, entityType, entityId);
  if (!entity) return null;
  const snapshot = buildSnapshot(store, entityType, entity);
  const items = store.collection('contentModerationItems');
  let changed = false;
  for (const item of items) {
    if (item.entityType === entityType && item.entityId === entityId && PROCESSING_STATUSES.has(item.status)) {
      item.status = 'superseded';
      item.supersededAt = now();
      item.updatedAt = now();
      changed = true;
    }
  }
  if (changed) await store.saveCollection('contentModerationItems');
  const item = await store.insert('contentModerationItems', {
    entityType,
    entityId,
    userId: snapshot.userId,
    title: snapshot.title,
    status: 'pending',
    riskLevel: 'unknown',
    categories: [],
    reason: '',
    snapshot,
    contentHash: snapshot.contentHash,
    attemptCount: 0,
    queuedAt: now(),
    checkedAt: '',
    error: ''
  });
  scheduleContentModerationScan(store, realtime);
  return item;
}

export async function scanContentModerationQueue(store, realtime, options = {}) {
  await store.loadCollections?.([
    'settings',
    'users',
    'contentModerationItems',
    'posts',
    'postTags',
    'tasks',
    'products',
    'paymentFlows',
    'orders',
    'messages',
    'conversations',
    'notifications',
    'walletTransactions'
  ], { force: true });
  const limit = Number(options.limit || 20);
  const queue = store.collection('contentModerationItems')
    .filter((item) => item.status === 'pending')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, limit);
  const results = [];
  for (const item of queue) {
    results.push(await scanModerationItem(store, realtime, item));
  }
  return {
    scanned: results.length,
    approved: results.filter((item) => item.status === 'approved').length,
    rejected: results.filter((item) => item.status === 'rejected').length,
    errors: results.filter((item) => item.status === 'error').length
  };
}

export function listAdminModerationItems(store, query = {}) {
  const status = String(query.status || '').trim();
  const entityType = String(query.entityType || '').trim();
  return store.collection('contentModerationItems')
    .filter((item) => !status || item.status === status)
    .filter((item) => !entityType || item.entityType === entityType)
    .map((item) => ({
      ...item,
      owner: userBrief(store, item.userId),
      entity: describeCurrentEntity(store, item.entityType, item.entityId)
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function scanModerationItem(store, realtime, item) {
  const latest = findEntity(store, item.entityType, item.entityId);
  if (!latest) {
    return store.update('contentModerationItems', item.id, {
      status: 'error',
      error: '审核目标不存在',
      checkedAt: now()
    });
  }
  const latestSnapshot = buildSnapshot(store, item.entityType, latest);
  if (latestSnapshot.contentHash !== item.contentHash) {
    return store.update('contentModerationItems', item.id, {
      status: 'superseded',
      checkedAt: now(),
      reason: '内容已更新，旧审核任务失效'
    });
  }
  await store.update('contentModerationItems', item.id, {
    status: 'processing',
    attemptCount: Number(item.attemptCount || 0) + 1
  });
  try {
    const result = await judgeContent(store, item.snapshot);
    await applyModerationResult(store, realtime, item, result);
    return store.update('contentModerationItems', item.id, {
      status: result.allowed ? 'approved' : 'rejected',
      riskLevel: result.riskLevel,
      categories: result.categories,
      reason: result.reason,
      checkedAt: now(),
      error: '',
      source: result.source || 'local-ai-fallback'
    });
  } catch (error) {
    return store.update('contentModerationItems', item.id, {
      status: 'error',
      error: error.message || '审核失败',
      checkedAt: now()
    });
  }
}

async function judgeContent(store, snapshot) {
  const local = localSafetyJudge(snapshot.text);
  if (!local.allowed) return local;
  const settings = store.collection('settings');
  const config = settings.aiConfig || {};
  if (!config.baseUrl || !config.model || !config.apiKey) return local;
  const ai = await judgeContentByModel(config, snapshot).catch(() => null);
  return ai || local;
}

function localSafetyJudge(text) {
  const normalized = String(text || '').toLowerCase();
  const categories = [];
  const hits = [];
  let riskLevel = 'low';
  for (const rule of riskRules) {
    const matched = rule.words.filter((word) => normalized.includes(word.toLowerCase()));
    if (!matched.length) continue;
    categories.push(rule.category);
    hits.push(...matched.slice(0, 3));
    if (rule.level === 'critical') riskLevel = 'critical';
    else if (rule.level === 'high' && riskLevel !== 'critical') riskLevel = 'high';
    else if (rule.level === 'medium' && riskLevel === 'low') riskLevel = 'medium';
  }
  if (!categories.length) {
    return {
      allowed: true,
      riskLevel: 'low',
      categories: [],
      reason: '未发现反社会、自残或违法违规风险',
      source: 'local-ai-fallback'
    };
  }
  const labels = [...new Set(categories)].map((item) => categoryLabels[item] || item);
  return {
    allowed: false,
    riskLevel,
    categories: [...new Set(categories)],
    reason: `命中${labels.join('、')}风险词：${[...new Set(hits)].join('、')}`,
    source: 'local-ai-fallback'
  };
}

async function judgeContentByModel(config, snapshot) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: '你是校园平台内容安全审核员。只输出 JSON，不要解释。重点识别反社会、自残自杀、违法违规、诈骗和色情内容。'
          },
          {
            role: 'user',
            content: [
              '请审核以下内容是否允许在校园平台发布。',
              '输出格式：{"allowed":true或false,"riskLevel":"low|medium|high|critical","categories":["antisocial|self_harm|illegal|fraud|sexual"],"reason":"给用户看的简短中文原因"}',
              `内容类型：${entityLabels[snapshot.entityType] || snapshot.entityType}`,
              `标题：${snapshot.title}`,
              `正文：${snapshot.text}`
            ].join('\n')
          }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const parsed = parseJsonObject(raw);
    if (!parsed || typeof parsed.allowed !== 'boolean') return null;
    return {
      allowed: parsed.allowed,
      riskLevel: ['low', 'medium', 'high', 'critical'].includes(parsed.riskLevel) ? parsed.riskLevel : (parsed.allowed ? 'low' : 'high'),
      categories: Array.isArray(parsed.categories) ? parsed.categories.filter((item) => categoryLabels[item]) : [],
      reason: String(parsed.reason || (parsed.allowed ? 'AI 审核通过' : 'AI 审核未通过')).slice(0, 200),
      source: 'ai'
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonObject(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = String(raw || '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function applyModerationResult(store, realtime, item, result) {
  const entity = findEntity(store, item.entityType, item.entityId);
  if (!entity) return;
  const checkedAt = now();
  if (result.allowed) {
    await store.update(collectionNameFor(item.entityType), entity.id, {
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: checkedAt
    });
    return;
  }
  const reason = result.reason || '内容审核未通过';
  const patch = {
    moderationStatus: 'rejected',
    moderationReason: reason,
    moderationRejectedAt: checkedAt,
    moderationCheckedAt: checkedAt
  };
  if (item.entityType === 'post') {
    patch.visibility = 'hidden';
  }
  const effects = await applyModerationRejectionEffects(store, realtime, item.entityType, entity, reason);
  Object.assign(patch, effects.entityPatch || {});
  await store.update(collectionNameFor(item.entityType), entity.id, patch);
  await createNotification(store, {
    userId: item.userId,
    type: notificationTypes[item.entityType] || 'system',
    title: `${entityLabels[item.entityType]}审核未通过`,
    body: `${item.snapshot.title || entityLabels[item.entityType]}：${reason}${refundNotice(item.userId, effects.refunds)}`,
    link: userManageLinks[item.entityType] || '/',
    sourceId: item.id
  }, realtime);
}

function refundNotice(ownerId, refunds = []) {
  if (!refunds.length) return '';
  const ownerAmount = refunds
    .filter((item) => item.userId === ownerId)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (ownerAmount > 0) return `；已自动退款 ${formatAmount(ownerAmount)} 元到钱包`;
  return '；相关已支付订单已自动退款给买家';
}

function formatAmount(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '');
}

function buildSnapshot(store, entityType, entity) {
  if (entityType === 'post') return buildPostSnapshot(store, entity);
  if (entityType === 'task') return buildTaskSnapshot(entity);
  if (entityType === 'product') return buildProductSnapshot(store, entity);
  return {
    entityType,
    entityId: entity.id,
    userId: '',
    title: '',
    text: '',
    raw: entity,
    imageUrls: [],
    contentHash: ''
  };
}

function buildPostSnapshot(store, post) {
  const tags = store.collection('postTags')
    .filter((item) => item.postId === post.id)
    .map((item) => item.name);
  const text = [
    `标题：${post.title || ''}`,
    `类型：${post.type || ''}`,
    `正文：${post.content || ''}`,
    `标签：${tags.join('、')}`
  ].join('\n');
  return withHash({
    entityType: 'post',
    entityId: post.id,
    userId: post.authorId,
    title: post.title || '未命名帖子',
    text,
    tags,
    imageUrls: post.imageUrls || [],
    raw: pickRaw(post, ['title', 'content', 'type', 'imageUrls', 'visibility', 'moderationStatus'])
  });
}

function buildTaskSnapshot(task) {
  const text = [
    `标题：${task.title || ''}`,
    `类型：${task.category || ''}`,
    `地点：${task.campusArea || ''}`,
    `详情：${task.detail || ''}`,
    `交付要求：${task.deliveryRequirement || ''}`,
    `联系备注：${task.contactNote || ''}`
  ].join('\n');
  return withHash({
    entityType: 'task',
    entityId: task.id,
    userId: task.publisherId,
    title: task.title || '未命名任务',
    text,
    imageUrls: task.imageUrls || [],
    raw: pickRaw(task, ['title', 'category', 'campusArea', 'detail', 'deliveryRequirement', 'contactNote', 'reward', 'deadlineAt', 'status', 'moderationStatus'])
  });
}

function buildProductSnapshot(store, product) {
  const category = (store.collection('settings').productCategories || []).find((item) => item.id === product.categoryId);
  const text = [
    `标题：${product.title || ''}`,
    `分类：${category?.name || ''}`,
    `成色：${product.condition || ''}`,
    `详情：${product.detail || ''}`,
    `交易方式：${product.tradeMethod || ''}`,
    `自提说明：${product.pickupLocation || ''}`
  ].join('\n');
  return withHash({
    entityType: 'product',
    entityId: product.id,
    userId: product.sellerId,
    title: product.title || '未命名商品',
    text,
    imageUrls: product.imageUrls || [],
    raw: pickRaw(product, ['title', 'categoryId', 'condition', 'detail', 'tradeMethod', 'pickupLocation', 'price', 'status', 'moderationStatus'])
  });
}

function withHash(snapshot) {
  const hash = createHash('sha256')
    .update(JSON.stringify({
      entityType: snapshot.entityType,
      title: snapshot.title,
      text: snapshot.text,
      imageUrls: snapshot.imageUrls || []
    }))
    .digest('hex');
  return { ...snapshot, contentHash: hash };
}

function pickRaw(entity, keys) {
  const raw = {};
  for (const key of keys) raw[key] = entity[key];
  return raw;
}

function findEntity(store, entityType, entityId) {
  return store.collection(collectionNameFor(entityType)).find((item) => item.id === entityId);
}

function collectionNameFor(entityType) {
  return {
    post: 'posts',
    task: 'tasks',
    product: 'products'
  }[entityType] || entityType;
}

function describeCurrentEntity(store, entityType, entityId) {
  const entity = findEntity(store, entityType, entityId);
  if (!entity) return null;
  return {
    id: entity.id,
    title: entity.title || '',
    status: entity.status || '',
    moderationStatus: entity.moderationStatus || '',
    link: publicLinks[entityType]?.(entity.id) || ''
  };
}

function userBrief(store, userId) {
  const user = store.collection('users').find((item) => item.id === userId);
  return user ? {
    id: user.id,
    nickname: user.nickname,
    studentId: user.studentId,
    creditScore: user.creditScore,
    avatarUrl: user.avatarUrl
  } : null;
}
