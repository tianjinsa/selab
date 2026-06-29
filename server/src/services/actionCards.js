const store = require('./store');

const EXPIRE_MS = 24 * 60 * 60 * 1000;
const ACTION_CARD_TYPES = ['taskApply', 'goodsPurchase'];

function addDays(iso, ms = EXPIRE_MS) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function isActionCard(card) {
  return card && ACTION_CARD_TYPES.includes(card.type);
}

function targetFromCard(data, card) {
  if (!card) return null;
  if (card.targetType === 'goods' || card.type === 'goodsPurchase') return data.goods.find((item) => item.id === card.targetId);
  return data.tasks.find((item) => item.id === card.targetId);
}

function deriveOwnerId(data, card) {
  const target = targetFromCard(data, card);
  if (!target) return card.ownerId || '';
  return target.publisherId || target.sellerId || card.ownerId || '';
}

function normalizeCard(data, message) {
  if (!message || !isActionCard(message.card)) return false;
  const card = message.card;
  const before = JSON.stringify(card);
  const target = targetFromCard(data, card);
  const createdAt = card.createdAt || message.createdAt || store.now();
  const targetType = card.targetType || (card.type === 'goodsPurchase' ? 'goods' : 'task');

  card.targetType = targetType;
  card.targetId = card.targetId || card.id || '';
  card.title = card.title || (target && (target.title || target.name)) || '特殊消息';
  card.summary = card.summary || '';
  card.requesterId = card.requesterId || message.fromUserId;
  card.ownerId = card.ownerId || deriveOwnerId(data, card);
  card.status = card.status || 'pending';
  card.createdAt = createdAt;
  card.expiresAt = card.expiresAt || addDays(createdAt);
  card.actedAt = card.actedAt || '';
  card.actionMessage = card.actionMessage || '';

  return before !== JSON.stringify(card);
}

function refreshActionCards(data, nowIso = store.now()) {
  let changed = false;
  const nowTime = new Date(nowIso).getTime();
  data.messages.forEach((message) => {
    changed = normalizeCard(data, message) || changed;
    const card = message.card;
    if (!isActionCard(card) || card.status !== 'pending') return;
    if (new Date(card.expiresAt).getTime() <= nowTime) {
      card.status = 'expired';
      card.actedAt = nowIso;
      card.actionMessage = '已超过1天未处理';
      changed = true;
    }
  });
  return changed;
}

function sameActionObject(card, input) {
  return (
    isActionCard(card) &&
    card.status === 'pending' &&
    card.type === input.type &&
    card.targetType === input.targetType &&
    card.targetId === input.targetId &&
    card.requesterId === input.requesterId &&
    card.ownerId === input.ownerId
  );
}

function supersedePendingCards(data, input, nowIso) {
  const superseded = [];
  data.messages.forEach((message) => {
    if (!sameActionObject(message.card, input)) return;
    message.card.status = 'superseded';
    message.card.actedAt = nowIso;
    message.card.actionMessage = '已被新的申请替代';
    superseded.push(message);
  });
  return superseded;
}

function findOrCreateConversation(data, requesterId, ownerId, source, card) {
  let conversation = data.conversations.find((item) => {
    return item.participantIds.includes(requesterId) && item.participantIds.includes(ownerId);
  });
  if (!conversation) {
    conversation = {
      id: store.id('conv'),
      participantIds: [requesterId, ownerId],
      mutedBy: [],
      source,
      relatedCard: card,
      updatedAt: store.now()
    };
    data.conversations.unshift(conversation);
  }
  return conversation;
}

function createActionCardMessage(data, input) {
  const nowIso = store.now();
  refreshActionCards(data, nowIso);
  const card = {
    type: input.type,
    targetType: input.targetType,
    targetId: input.targetId,
    title: input.title,
    summary: input.summary || '',
    requesterId: input.requesterId,
    ownerId: input.ownerId,
    status: 'pending',
    createdAt: nowIso,
    expiresAt: addDays(nowIso),
    actedAt: '',
    actionMessage: ''
  };
  const superseded = supersedePendingCards(data, card, nowIso);
  const conversation = findOrCreateConversation(data, input.requesterId, input.ownerId, input.source, card);
  const message = {
    id: store.id('msg'),
    conversationId: conversation.id,
    fromUserId: input.requesterId,
    type: 'card',
    content: input.content,
    card,
    readBy: [input.requesterId],
    createdAt: nowIso
  };
  conversation.relatedCard = card;
  conversation.updatedAt = nowIso;
  data.messages.push(message);
  return { conversation, message, superseded };
}

function acceptTaskCard(data, message, nowIso) {
  const { card } = message;
  const task = data.tasks.find((item) => item.id === card.targetId);
  if (!task) return { error: { status: 404, message: '任务不存在' } };
  if (task.publisherId !== card.ownerId) return { error: { status: 403, message: '任务发布者不匹配' } };
  if (task.assigneeId && task.assigneeId !== card.requesterId) return { error: { status: 400, message: '任务已有接单人' } };
  if (!task.applicants.includes(card.requesterId)) task.applicants.push(card.requesterId);
  task.assigneeId = card.requesterId;
  task.status = '进行中';
  card.status = 'accepted';
  card.actedAt = nowIso;
  card.actionMessage = '发布者已同意接取';
  store.addNotification(data, {
    userId: card.requesterId,
    type: '任务状态',
    title: '你的任务申请已通过',
    content: task.title,
    relatedType: 'task',
    relatedId: task.id
  });
  return { task: store.publicTask(data, task) };
}

function acceptGoodsCard(data, message, nowIso) {
  const { card } = message;
  const goods = data.goods.find((item) => item.id === card.targetId);
  if (!goods) return { error: { status: 404, message: '商品不存在' } };
  if (goods.sellerId !== card.ownerId) return { error: { status: 403, message: '商品卖家不匹配' } };
  if (goods.status !== '在售') return { error: { status: 400, message: '商品当前不可交易' } };
  const order = {
    id: store.id('order'),
    goodsId: goods.id,
    buyerId: card.requesterId,
    sellerId: card.ownerId,
    amount: Number(goods.price),
    status: '待付款',
    escrowPaid: false,
    address: goods.location,
    createdAt: nowIso
  };
  data.orders.unshift(order);
  card.status = 'accepted';
  card.actedAt = nowIso;
  card.actionMessage = '卖家已同意，待买家付款';
  card.orderId = order.id;
  store.addNotification(data, {
    userId: card.requesterId,
    type: '交易提醒',
    title: '卖家已同意你的求购',
    content: goods.name,
    relatedType: 'order',
    relatedId: order.id
  });
  return { goods: store.publicGoods(data, goods), order };
}

function applyCardAction(data, message, action) {
  refreshActionCards(data);
  const card = message.card;
  const nowIso = store.now();
  if (!isActionCard(card)) return { error: { status: 400, message: '该消息不是可操作卡片' } };
  if (card.status !== 'pending') return { error: { status: 400, message: '卡片已处理或已过期' } };
  if (new Date(card.expiresAt).getTime() <= new Date(nowIso).getTime()) {
    card.status = 'expired';
    card.actedAt = nowIso;
    card.actionMessage = '已超过1天未处理';
    return { error: { status: 400, message: '卡片已过期' } };
  }
  if (action === 'reject') {
    card.status = 'rejected';
    card.actedAt = nowIso;
    card.actionMessage = '已拒绝';
    store.addNotification(data, {
      userId: card.requesterId,
      type: card.targetType === 'goods' ? '交易提醒' : '任务状态',
      title: card.targetType === 'goods' ? '卖家已拒绝你的求购' : '任务申请未通过',
      content: card.title,
      relatedType: card.targetType,
      relatedId: card.targetId
    });
    return {};
  }
  if (action !== 'accept') return { error: { status: 400, message: '不支持的操作' } };
  if (card.type === 'goodsPurchase') return acceptGoodsCard(data, message, nowIso);
  return acceptTaskCard(data, message, nowIso);
}

module.exports = {
  isActionCard,
  refreshActionCards,
  createActionCardMessage,
  applyCardAction
};
