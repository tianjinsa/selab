import { createNotification } from './notifications.js';
import { creditWallet } from './wallet.js';

function now() {
  return new Date().toISOString();
}

function serialNo() {
  return `PAY-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function hasSuccessfulFlow(store, query) {
  return store.collection('paymentFlows').some((flow) => (
    flow.userId === query.userId
    && flow.relatedType === query.relatedType
    && flow.relatedId === query.relatedId
    && flow.type === query.type
    && flow.status === 'success'
  ));
}

async function recordPaymentFlowOnce(store, payload) {
  const existing = store.collection('paymentFlows').find((flow) => {
    if (payload.dedupeKey) {
      return flow.dedupeKey === payload.dedupeKey && flow.status === 'success';
    }
    return flow.userId === payload.userId
      && flow.relatedType === payload.relatedType
      && flow.relatedId === payload.relatedId
      && flow.type === payload.type
      && flow.status === 'success';
  });
  if (existing) return { flow: existing, created: false };
  const flow = await store.insert('paymentFlows', {
    ...payload,
    status: 'success',
    serialNo: serialNo(),
    createdAt: now()
  });
  return { flow, created: true };
}

export async function applyModerationRejectionEffects(store, realtime, entityType, entity, reason = '') {
  if (entityType === 'task') return refundRejectedTask(store, entity, reason);
  if (entityType === 'product') return refundRejectedProduct(store, realtime, entity, reason);
  return { entityPatch: {}, refunds: [] };
}

async function refundRejectedTask(store, task, reason) {
  const entityPatch = {};
  if (!['completed', 'cancelled', 'closed'].includes(task.status)) {
    entityPatch.status = 'closed';
    entityPatch.closedAt = now();
    entityPatch.cancelReason = reason || '内容审核未通过';
  }

  const paid = task.paidAt || hasSuccessfulFlow(store, {
    userId: task.publisherId,
    relatedType: 'task',
    relatedId: task.id,
    type: 'task_publish_payment'
  });
  const amount = Number(task.reward || 0);
  if (!paid || amount <= 0) return { entityPatch, refunds: [] };
  const refundAttemptKey = String(task.paidAt || task.updatedAt || task.id);

  await creditWallet(store, {
    userId: task.publisherId,
    relatedType: 'task',
    relatedId: `${task.id}:${refundAttemptKey}`,
    amount,
    title: `任务审核退款：${task.title}`,
    source: 'task_moderation_refund'
  });
  const { created } = await recordPaymentFlowOnce(store, {
    userId: task.publisherId,
    relatedType: 'task',
    relatedId: task.id,
    type: 'task_moderation_refund',
    dedupeKey: `task_moderation_refund:${task.id}:${refundAttemptKey}`,
    amount,
    title: `任务审核未通过退款：${task.title}`
  });
  if (!created) return { entityPatch, refunds: [] };

  return {
    entityPatch,
    refunds: [{ userId: task.publisherId, amount, relatedType: 'task', relatedId: task.id }]
  };
}

async function refundRejectedProduct(store, realtime, product, reason) {
  const entityPatch = {
    takeDownReason: reason || '内容审核未通过'
  };
  if (product.status !== 'sold') {
    entityPatch.status = 'off_shelf';
    entityPatch.lockedOrderId = '';
  }

  const refunds = [];
  const orders = store.collection('orders').filter((order) => order.productId === product.id);
  let changedOrders = false;
  for (const order of orders) {
    if (order.status === 'completed') continue;
    const paid = order.paidAt || hasSuccessfulFlow(store, {
      userId: order.buyerId,
      relatedType: 'order',
      relatedId: order.id,
      type: 'product_escrow_payment'
    });
    if (paid) {
      const refund = await refundPaidProductOrder(store, realtime, product, order);
      if (refund) refunds.push(refund);
    }
    if (!['cancelled', 'rejected'].includes(order.status)) {
      order.status = 'cancelled';
      order.cancelReason = paid ? '商品审核未通过，担保支付已退款' : '商品审核未通过，订单已取消';
      if (paid) order.refundedAt = now();
      order.updatedAt = now();
      changedOrders = true;
    }
  }
  if (changedOrders) {
    await store.saveCollection('orders');
    await updateProductPurchaseCards(store, realtime, product.id);
  }
  return { entityPatch, refunds };
}

async function refundPaidProductOrder(store, realtime, product, order) {
  const amount = Number(order.price || 0);
  if (amount <= 0) return null;
  await creditWallet(store, {
    userId: order.buyerId,
    relatedType: 'order',
    relatedId: order.id,
    amount,
    title: `商品审核退款：${product.title}`,
    source: 'product_moderation_refund'
  });
  const { created } = await recordPaymentFlowOnce(store, {
    userId: order.buyerId,
    relatedType: 'order',
    relatedId: order.id,
    type: 'product_moderation_refund',
    amount,
    title: `商品审核未通过退款：${product.title}`
  });
  if (!created) return null;

  await createNotification(store, {
    userId: order.buyerId,
    type: 'market',
    title: '商品审核退款已入账',
    body: `你支付的「${product.title}」因商品审核未通过，已自动退回钱包。`,
    link: '/market/orders',
    sourceId: order.id
  }, realtime);
  return { userId: order.buyerId, amount, relatedType: 'order', relatedId: order.id };
}

async function updateProductPurchaseCards(store, realtime, productId) {
  const orders = store.collection('orders').filter((order) => order.productId === productId);
  const orderById = new Map(orders.map((order) => [order.id, order]));
  let changed = false;
  for (const message of store.collection('messages')) {
    if (message.card?.type !== 'product_purchase') continue;
    const order = orderById.get(message.card.orderId);
    if (!order) continue;
    message.card = {
      ...message.card,
      status: order.status === 'waiting_payment' ? 'accepted' : order.status === 'rejected' ? 'rejected' : order.status === 'cancelled' ? 'expired' : order.status
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
