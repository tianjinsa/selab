import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { assertCleanContent } from '../utils/content.js';
import { createNotification } from './notifications.js';
import { getOrCreateConversation, sendMessage } from './chat.js';
import { isModerationApproved } from './contentModeration.js';
import { creditWallet } from './wallet.js';

const conditions = ['全新', '几乎全新', '轻微使用', '明显使用', '功能正常'];
const tradeMethods = ['线下自提', '校内面交', '宿舍楼下', '其他'];

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
  if (user.isBanned) throw forbidden('账号已封禁，不能发布商品');
  if (user.isPublishRestricted) throw forbidden('账号已被限制发布，不能发布商品');
}

function moderationActivityAt(entity) {
  return entity.moderationCheckedAt || entity.moderationRejectedAt || entity.updatedAt || entity.createdAt || '';
}

function ownModerationProducts(store, userId) {
  return store.collection('products')
    .filter((product) => product.sellerId === userId && !product.deletedAt && product.moderationStatus);
}

function moderationUnreadCount(items, readAt = '') {
  if (!readAt) return items.filter((item) => (item.moderationStatus || 'approved') !== 'approved').length;
  return items.filter((item) => String(moderationActivityAt(item)).localeCompare(String(readAt)) > 0).length;
}

function categoryById(store, id) {
  return (store.collection('settings').productCategories || []).find((item) => item.id === id);
}

function assertProductPayload(store, body) {
  const title = String(body.title || '').trim();
  const categoryId = String(body.categoryId || '').trim();
  const price = Number(body.price);
  const condition = String(body.condition || '').trim();
  const detail = String(body.detail || '').trim();
  const tradeMethod = String(body.tradeMethod || '').trim();
  const pickupLocation = String(body.pickupLocation || '').trim();
  if (!title) throw badRequest('请输入商品名称');
  if (!categoryById(store, categoryId)) throw badRequest('请选择有效商品分类');
  if (!Number.isFinite(price) || price <= 0) throw badRequest('请输入有效价格');
  if (!conditions.includes(condition)) throw badRequest('请选择有效成色');
  if (!detail) throw badRequest('请输入商品详情');
  if (!tradeMethods.includes(tradeMethod)) throw badRequest('请选择交易方式');
  if (!pickupLocation) throw badRequest('请输入自提地点或说明');
  assertCleanContent(store, title, detail, pickupLocation);
  return {
    title,
    categoryId,
    price,
    condition,
    detail,
    tradeMethod,
    pickupLocation,
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.slice(0, 9) : []
  };
}

export function marketMeta(store) {
  return {
    categories: store.collection('settings').productCategories || [],
    conditions,
    tradeMethods
  };
}

export async function createProduct(store, user, body) {
  assertCanPublish(user);
  const payload = assertProductPayload(store, body);
  const product = await store.insert('products', {
    ...payload,
    sellerId: user.id,
    status: 'on_sale',
    moderationStatus: 'pending',
    moderationReason: '',
    moderationCheckedAt: '',
    moderationRejectedAt: '',
    stock: 1,
    viewCount: 0,
    soldAt: '',
    lockedOrderId: '',
    hiddenAt: '',
    deletedAt: ''
  });
  return decorateProduct(store, product, user.id, true);
}

export function listProducts(store, query = {}, viewerId = '') {
  let products = store.collection('products').filter((item) => !item.deletedAt && !item.hiddenAt);
  if (!query.includeUnavailable) products = products.filter((item) => ['on_sale', 'trading'].includes(item.status));
  products = products.filter((item) => isModerationApproved(item));
  if (query.sellerId) products = products.filter((item) => item.sellerId === query.sellerId);
  if (query.categoryId) products = products.filter((item) => item.categoryId === query.categoryId);
  if (query.keyword) {
    const keyword = String(query.keyword).trim();
    products = products.filter((item) => `${item.title} ${item.detail}`.includes(keyword));
  }
  if (query.condition) products = products.filter((item) => item.condition === query.condition);
  if (query.tradeMethod) products = products.filter((item) => item.tradeMethod === query.tradeMethod);
  const minPrice = query.minPrice === undefined || query.minPrice === '' ? null : Number(query.minPrice);
  const maxPrice = query.maxPrice === undefined || query.maxPrice === '' ? null : Number(query.maxPrice);
  if (Number.isFinite(minPrice)) products = products.filter((item) => item.price >= minPrice);
  if (Number.isFinite(maxPrice)) products = products.filter((item) => item.price <= maxPrice);
  const decorated = products.map((product) => decorateProduct(store, product, viewerId));
  if (query.sort === 'recommended') {
    return decorated.sort((a, b) => compareRecommended(
      productRecommendationScore(a, viewerId, query.recommendSeed),
      productRecommendationScore(b, viewerId, query.recommendSeed),
      a,
      b,
      (product) => product.createdAt
    ));
  }
  if (query.sort === 'hot') return decorated.sort((a, b) => productHeat(b) - productHeat(a));
  return decorated.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function listFavoriteProducts(store, userId) {
  const products = store.collection('products');
  return store.collection('productFavorites')
    .filter((item) => item.userId === userId)
    .map((favorite) => {
      const product = products.find((item) => item.id === favorite.productId && !item.deletedAt && !item.hiddenAt && isModerationApproved(item));
      return product ? { ...decorateProduct(store, product, userId), favoritedAt: favorite.createdAt } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.favoritedAt || '').localeCompare(String(a.favoritedAt || '')));
}

export function getProductDetail(store, productId, viewerId = '') {
  const product = store.collection('products').find((item) => item.id === productId && !item.deletedAt);
  if (!product) throw notFound('商品不存在');
  if (product.hiddenAt && product.sellerId !== viewerId) throw notFound('商品不存在');
  if (product.sellerId !== viewerId && !isModerationApproved(product)) throw notFound('商品不存在');
  product.viewCount = Number(product.viewCount || 0) + 1;
  store.saveCollection('products').catch(() => {});
  return decorateProduct(store, product, viewerId, true);
}

export async function toggleProductFavorite(store, user, productId) {
  const product = store.collection('products').find((item) => item.id === productId && !item.deletedAt);
  if (!product) throw notFound('商品不存在');
  if (product.hiddenAt && product.sellerId !== user.id) throw notFound('商品不存在');
  if (product.sellerId !== user.id && !isModerationApproved(product)) throw notFound('商品不存在');
  const favorites = store.collection('productFavorites');
  const existing = favorites.find((item) => item.productId === productId && item.userId === user.id);
  if (existing) {
    await store.replaceCollection('productFavorites', favorites.filter((item) => item.id !== existing.id));
    return { favorited: false };
  }
  await store.insert('productFavorites', { productId, userId: user.id });
  return { favorited: true };
}

export async function requestCategory(store, user, body) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('请输入申请分类名称');
  assertCleanContent(store, name, body.reason);
  return store.insert('categoryRequests', {
    userId: user.id,
    name,
    parentId: body.parentId || null,
    reason: String(body.reason || '').trim(),
    status: 'pending',
    handledAt: '',
    rejectReason: ''
  });
}

export async function resolveCategoryRequest(store, requestId, body) {
  const item = store.collection('categoryRequests').find((request) => request.id === requestId);
  if (!item) throw notFound('分类申请不存在');
  if (item.status !== 'pending') throw badRequest('分类申请已经处理');
  if (body.approved) {
    const settings = store.collection('settings');
    const category = {
      id: `cat-${Date.now()}`,
      name: item.name,
      parentId: item.parentId || null
    };
    await store.updateSettings({ productCategories: [...settings.productCategories, category] });
    await store.update('categoryRequests', item.id, { status: 'approved', handledAt: now() });
    return category;
  }
  await store.update('categoryRequests', item.id, {
    status: 'rejected',
    handledAt: now(),
    rejectReason: body.rejectReason || '管理员拒绝'
  });
  return null;
}

export function gradeRecommendations(store, user) {
  const year = Number(String(user.studentId || '').slice(0, 4));
  const currentYear = new Date().getFullYear();
  let stage = 'unknown';
  if (Number.isFinite(year)) {
    const grade = currentYear - year + 1;
    if (grade <= 1) stage = 'freshman';
    else if (grade >= 4) stage = 'senior';
    else stage = 'middle';
  }
  const settings = store.collection('settings');
  const names = settings.gradeCategoryMap?.[stage] || settings.gradeCategoryMap?.unknown || [];
  const categoryIds = settings.productCategories.filter((item) => names.includes(item.name)).map((item) => item.id);
  const products = listProducts(store, { includeUnavailable: false, sort: 'hot' }, user.id)
    .filter((item) => categoryIds.includes(item.categoryId))
    .slice(0, 20);
  return { stage, categoryNames: names, products };
}

export async function applyPurchase(store, realtime, user, productId) {
  const product = store.collection('products').find((item) => item.id === productId && !item.deletedAt);
  if (!product) throw notFound('商品不存在');
  if (product.hiddenAt) throw notFound('商品不存在');
  if (product.sellerId === user.id) throw badRequest('不能购买自己发布的商品');
  if (!isModerationApproved(product)) throw badRequest('商品正在审核，暂不能购买');
  if (product.status !== 'on_sale') throw badRequest('商品当前不可购买');
  for (const order of store.collection('orders')) {
    if (order.productId === product.id && order.buyerId === user.id && order.status === 'applying') {
      order.status = 'cancelled';
      order.cancelReason = '用户重复申请，旧申请失效';
      order.updatedAt = now();
    }
  }
  await store.saveCollection('orders');
  const order = await store.insert('orders', {
    productId: product.id,
    buyerId: user.id,
    sellerId: product.sellerId,
    price: product.price,
    status: 'applying',
    expiresAt: plusDays(1),
    paidAt: '',
    deliveredAt: '',
    completedAt: '',
    cancelReason: ''
  });
  const conversation = await getOrCreateConversation(store, user.id, product.sellerId);
  await sendMessage(store, realtime, user.id, conversation.id, {
    type: 'card',
    content: `申请购买：${product.title}`,
    card: {
      type: 'product_purchase',
      uniqueKey: `product:${product.id}:buyer:${user.id}:seller:${product.sellerId}:product_purchase`,
      status: 'pending',
      title: '商品购买申请卡片',
      productId: product.id,
      orderId: order.id,
      productTitle: product.title,
      price: product.price,
      buyerId: user.id,
      buyerName: user.nickname,
      buyerCredit: user.creditScore,
      sellerId: product.sellerId,
      expiresAt: order.expiresAt
    }
  });
  await createNotification(store, {
    userId: product.sellerId,
    type: 'market',
    title: '收到购买申请',
    body: `${user.nickname} 申请购买「${product.title}」`,
    link: `/market/${product.id}`,
    sourceId: order.id
  }, realtime);
  return order;
}

export async function acceptPurchase(store, realtime, user, orderId) {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  const product = store.collection('products').find((item) => item.id === order.productId);
  if (!product) throw notFound('商品不存在');
  if (order.sellerId !== user.id) throw forbidden('只有卖家可以同意出售');
  if (product.status !== 'on_sale' || order.status !== 'applying') throw badRequest('当前订单不能同意');
  order.status = 'waiting_payment';
  order.acceptedAt = now();
  order.updatedAt = now();
  for (const item of store.collection('orders')) {
    if (item.productId === product.id && item.id !== order.id && item.status === 'applying') {
      item.status = 'cancelled';
      item.cancelReason = '商品已锁定给其他买家';
      item.updatedAt = now();
    }
  }
  await store.saveCollection('orders');
  await store.update('products', product.id, { status: 'trading', lockedOrderId: order.id });
  await updateProductCards(store, realtime, product.id);
  await createNotification(store, {
    userId: order.buyerId,
    type: 'market',
    title: '卖家已同意出售',
    body: `「${product.title}」已为你锁定，请在 1 天内完成模拟支付`,
    link: `/market/${product.id}`,
    sourceId: order.id
  }, realtime);
  return decorateOrder(store, order);
}

export async function rejectPurchase(store, realtime, user, orderId) {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  const product = store.collection('products').find((item) => item.id === order.productId);
  if (!product) throw notFound('商品不存在');
  if (order.sellerId !== user.id) throw forbidden('只有卖家可以拒绝申请');
  if (order.status !== 'applying') throw badRequest('当前订单不能拒绝');
  await store.update('orders', order.id, { status: 'rejected', cancelReason: '卖家拒绝' });
  await updateProductCards(store, realtime, product.id);
  await createNotification(store, {
    userId: order.buyerId,
    type: 'market',
    title: '购买申请被拒绝',
    body: `卖家拒绝了你对「${product.title}」的购买申请`,
    link: `/market/${product.id}`,
    sourceId: order.id
  }, realtime);
  return decorateOrder(store, order);
}

export async function payOrder(store, user, orderId) {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  if (order.buyerId !== user.id) throw forbidden('只有买家可以支付订单');
  if (order.status !== 'waiting_payment') throw badRequest('订单当前不能支付');
  const product = store.collection('products').find((item) => item.id === order.productId);
  await store.update('orders', order.id, { status: 'waiting_delivery', paidAt: now() });
  await recordPaymentFlow(store, {
    userId: user.id,
    relatedType: 'order',
    relatedId: order.id,
    type: 'product_escrow_payment',
    amount: order.price,
    status: 'success',
    title: `商品担保支付：${product?.title || order.id}`
  });
  return decorateOrder(store, store.collection('orders').find((item) => item.id === order.id));
}

export async function deliverOrder(store, realtime, user, orderId) {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  if (order.sellerId !== user.id) throw forbidden('只有卖家可以确认交付');
  if (order.status !== 'waiting_delivery') throw badRequest('订单当前不能交付');
  await store.update('orders', order.id, { status: 'waiting_receive', deliveredAt: now() });
  const product = store.collection('products').find((item) => item.id === order.productId);
  await createNotification(store, {
    userId: order.buyerId,
    type: 'market',
    title: '卖家已交付商品',
    body: `「${product?.title || '商品'}」等待你确认收货`,
    link: `/market/${order.productId}`,
    sourceId: order.id
  }, realtime);
  return decorateOrder(store, store.collection('orders').find((item) => item.id === order.id));
}

export async function receiveOrder(store, user, orderId) {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  if (order.buyerId !== user.id) throw forbidden('只有买家可以确认收货');
  if (order.status !== 'waiting_receive') throw badRequest('订单当前不能确认收货');
  await completeOrder(store, order, 'buyer_receive');
  return decorateOrder(store, store.collection('orders').find((item) => item.id === order.id));
}

export async function cancelOrder(store, user, orderId, reason = '') {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  if (![order.buyerId, order.sellerId].includes(user.id)) throw forbidden('只有订单相关用户可以取消');
  if (!['applying', 'waiting_payment'].includes(order.status)) throw badRequest('当前订单不能直接取消');
  await store.update('orders', order.id, { status: 'cancelled', cancelReason: reason || '用户取消' });
  const product = store.collection('products').find((item) => item.id === order.productId);
  if (product?.lockedOrderId === order.id) {
    await store.update('products', product.id, { status: 'on_sale', lockedOrderId: '' });
  }
  return decorateOrder(store, store.collection('orders').find((item) => item.id === order.id));
}

export async function createOrderDispute(store, user, orderId, body) {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  if (![order.buyerId, order.sellerId].includes(user.id)) throw forbidden('只有订单相关用户可以申请纠纷');
  if (!['waiting_delivery', 'waiting_receive'].includes(order.status)) throw badRequest('当前订单不能申请纠纷');
  const reason = String(body.reason || '').trim();
  if (!reason) throw badRequest('请填写纠纷原因');
  const dispute = await store.insert('orderDisputes', {
    orderId,
    userId: user.id,
    reason,
    evidenceUrls: Array.isArray(body.evidenceUrls) ? body.evidenceUrls.slice(0, 6) : [],
    status: 'pending'
  });
  await store.update('orders', order.id, { status: 'dispute' });
  return dispute;
}

export async function createOrderReview(store, user, orderId, body) {
  const order = store.collection('orders').find((item) => item.id === orderId);
  if (!order) throw notFound('订单不存在');
  if (order.status !== 'completed') throw badRequest('订单完成后才能评价');
  if (![order.buyerId, order.sellerId].includes(user.id)) throw forbidden('只有订单相关用户可以评价');
  if (store.collection('orderReviews').some((review) => review.orderId === orderId && review.reviewerId === user.id)) {
    throw badRequest('你已经评价过该订单');
  }
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('评分必须为 1 到 5 星');
  return store.insert('orderReviews', {
    orderId,
    reviewerId: user.id,
    targetId: user.id === order.buyerId ? order.sellerId : order.buyerId,
    rating,
    content: String(body.content || '').trim(),
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls.slice(0, 6) : [],
    positive: rating >= 4
  });
}

export async function createProductReport(store, user, productId, reason) {
  const product = store.collection('products').find((item) => item.id === productId && !item.deletedAt);
  if (!product) throw notFound('商品不存在');
  if (!String(reason || '').trim()) throw badRequest('请填写举报原因');
  return store.insert('reports', {
    type: 'product',
    targetId: product.id,
    reporterId: user.id,
    reason: String(reason).trim(),
    status: 'pending'
  });
}

export function listMyOrders(store, userId) {
  return store.collection('orders')
    .filter((item) => item.buyerId === userId || item.sellerId === userId)
    .map((order) => decorateOrder(store, order))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function marketWorkbench(store, userId) {
  const products = store.collection('products');
  const orders = store.collection('orders');
  const reviews = store.collection('orderReviews');
  const ownedProducts = products
    .filter((product) => product.sellerId === userId && !product.deletedAt)
    .map((product) => decorateProduct(store, product, userId))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const visibleOwnedProducts = ownedProducts.filter((product) => isModerationApproved(product));
  const moderationRaw = ownModerationProducts(store, userId);
  const buying = orders
    .filter((order) => order.buyerId === userId)
    .map((order) => ({
      ...decorateOrder(store, order),
      hasMyReview: reviews.some((review) => review.orderId === order.id && review.reviewerId === userId)
    }))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const selling = orders
    .filter((order) => order.sellerId === userId)
    .map((order) => ({
      ...decorateOrder(store, order),
      hasMyReview: reviews.some((review) => review.orderId === order.id && review.reviewerId === userId)
    }))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const relatedOrderIds = new Set([...buying, ...selling].map((order) => order.id));
  const paymentFlows = store.collection('paymentFlows')
    .filter((flow) => flow.relatedType === 'order' && (flow.userId === userId || relatedOrderIds.has(flow.relatedId)))
    .map((flow) => ({
      ...flow,
      order: decorateOrder(store, orders.find((order) => order.id === flow.relatedId) || {})
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const actionItems = buildMarketActionItems(buying, selling);
  const revenue = paymentFlows
    .filter((flow) => flow.userId === userId && flow.type === 'product_finish_settlement')
    .reduce((sum, flow) => sum + Number(flow.amount || 0), 0);
  const refunds = paymentFlows
    .filter((flow) => flow.userId === userId && flow.type === 'product_moderation_refund')
    .reduce((sum, flow) => sum + Number(flow.amount || 0), 0);
  const spending = paymentFlows
    .filter((flow) => flow.userId === userId && flow.type === 'product_escrow_payment')
    .reduce((sum, flow) => sum + Number(flow.amount || 0), 0);

  return {
    stats: {
      actionCount: actionItems.length,
      ownedProducts: visibleOwnedProducts.length,
      onSaleProducts: visibleOwnedProducts.filter((product) => product.status === 'on_sale' && !product.hiddenAt).length,
      moderationUnread: moderationUnreadCount(moderationRaw, store.collection('users').find((item) => item.id === userId)?.marketModerationReadAt || ''),
      moderationTotal: moderationRaw.length,
      moderationPending: moderationRaw.filter((product) => product.moderationStatus === 'pending').length,
      moderationRejected: moderationRaw.filter((product) => product.moderationStatus === 'rejected').length,
      buyingActive: buying.filter((order) => ['applying', 'waiting_payment', 'waiting_delivery', 'waiting_receive', 'dispute'].includes(order.status)).length,
      buyingCompleted: buying.filter((order) => order.status === 'completed').length,
      sellingActive: selling.filter((order) => ['applying', 'waiting_payment', 'waiting_delivery', 'waiting_receive', 'dispute'].includes(order.status)).length,
      sellingCompleted: selling.filter((order) => order.status === 'completed').length,
      revenue,
      refunds,
      spending
    },
    actionItems,
    buying,
    selling,
    products: visibleOwnedProducts,
    paymentFlows: paymentFlows.slice(0, 50)
  };
}

export async function marketModerationCenter(store, user) {
  const itemsRaw = ownModerationProducts(store, user.id);
  const readAt = user.marketModerationReadAt || '';
  const unreadCount = moderationUnreadCount(itemsRaw, readAt);
  const items = itemsRaw
    .map((product) => decorateProduct(store, product, user.id))
    .sort((a, b) => String(moderationActivityAt(b)).localeCompare(String(moderationActivityAt(a))));
  await store.update('users', user.id, { marketModerationReadAt: now() });
  return {
    unreadCount,
    stats: {
      total: items.length,
      pending: items.filter((product) => product.moderationStatus === 'pending').length,
      approved: items.filter((product) => (product.moderationStatus || 'approved') === 'approved').length,
      rejected: items.filter((product) => product.moderationStatus === 'rejected').length,
      hidden: items.filter((product) => product.hiddenAt).length
    },
    items
  };
}

export async function updateOwnProductVisibility(store, user, productId, visible) {
  const product = store.collection('products').find((item) => item.id === productId && !item.deletedAt);
  if (!product) throw notFound('商品不存在');
  if (product.sellerId !== user.id) throw forbidden('只能管理自己发布的商品');
  if (visible && product.moderationStatus === 'rejected') throw badRequest('审核未通过的商品不能恢复公开');
  const updated = await store.update('products', product.id, {
    hiddenAt: visible ? '' : now()
  });
  return decorateProduct(store, updated, user.id, true);
}

export async function deleteOwnProduct(store, user, productId) {
  const product = store.collection('products').find((item) => item.id === productId && !item.deletedAt);
  if (!product) throw notFound('商品不存在');
  if (product.sellerId !== user.id) throw forbidden('只能删除自己发布的商品');
  const activeOrder = store.collection('orders').find((order) => (
    order.productId === product.id
    && ['applying', 'waiting_payment', 'waiting_delivery', 'waiting_receive', 'dispute'].includes(order.status)
  ));
  if (activeOrder) throw badRequest('商品存在进行中的订单，不能直接删除');
  await store.update('products', product.id, {
    status: product.status === 'sold' ? product.status : 'off_shelf',
    hiddenAt: now(),
    deletedAt: now(),
    lockedOrderId: '',
    takeDownReason: product.takeDownReason || '卖家删除商品'
  });
  return { ok: true };
}

export async function deleteRejectedOwnProducts(store, user) {
  const targets = ownModerationProducts(store, user.id)
    .filter((product) => product.moderationStatus === 'rejected');
  const failed = [];
  let deletedCount = 0;
  for (const product of targets) {
    try {
      await deleteOwnProduct(store, user, product.id);
      deletedCount += 1;
    } catch (error) {
      failed.push({ id: product.id, title: product.title, reason: error.message || '删除失败' });
    }
  }
  return { ok: failed.length === 0, deletedCount, failed };
}

export function listMarketAdmin(store) {
  return {
    products: store.collection('products').map((item) => decorateProduct(store, item, '', true)),
    orders: store.collection('orders').map((item) => decorateOrder(store, item)),
    categoryRequests: store.collection('categoryRequests').map((item) => ({
      ...item,
      user: userBrief(store, item.userId)
    })),
    reports: store.collection('reports')
      .filter((item) => ['product', 'order'].includes(item.type))
      .map((item) => ({
        ...item,
        reporter: userBrief(store, item.reporterId)
      }))
  };
}

export async function takeDownProduct(store, productId, reason = '') {
  const product = store.collection('products').find((item) => item.id === productId);
  if (!product) throw notFound('商品不存在');
  await store.update('products', product.id, {
    status: 'off_shelf',
    deletedAt: now(),
    takeDownReason: reason
  });
  await store.insert('adminLogs', {
    operator: 'admin',
    action: 'take_down_product',
    targetType: 'product',
    targetId: product.id,
    detail: { reason }
  });
  return product;
}

export async function scanOrderTimeouts(store) {
  let changed = false;
  for (const order of store.collection('orders')) {
    if (order.status === 'waiting_payment' && order.acceptedAt) {
      const accepted = new Date(order.acceptedAt);
      accepted.setDate(accepted.getDate() + 1);
      if (accepted.getTime() < Date.now()) {
        order.status = 'cancelled';
        order.cancelReason = '待付款超过 1 天自动取消';
        order.updatedAt = now();
        const product = store.collection('products').find((item) => item.id === order.productId);
        if (product?.lockedOrderId === order.id) {
          product.status = 'on_sale';
          product.lockedOrderId = '';
          product.updatedAt = now();
        }
        changed = true;
      }
    }
    if (order.status === 'waiting_receive' && order.deliveredAt) {
      const delivered = new Date(order.deliveredAt);
      delivered.setDate(delivered.getDate() + 3);
      if (delivered.getTime() < Date.now()) {
        await completeOrder(store, order, 'auto_receive_after_3_days');
        changed = true;
      }
    }
  }
  if (changed) {
    await store.saveCollection('orders');
    await store.saveCollection('products');
  }
  return { changed };
}

function buildMarketActionItems(buying, selling) {
  const items = [];
  for (const order of buying) {
    if (order.status === 'waiting_payment') {
      items.push({
        id: `pay-${order.id}`,
        type: 'payment',
        title: '待支付订单',
        body: `「${order.product?.title || '商品'}」已被卖家同意出售，请完成模拟支付。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.updatedAt || order.acceptedAt || order.createdAt
      });
    }
    if (order.status === 'waiting_receive') {
      items.push({
        id: `receive-${order.id}`,
        type: 'receive',
        title: '待确认收货',
        body: `卖家已交付「${order.product?.title || '商品'}」，确认后会完成结算。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.deliveredAt || order.updatedAt || order.createdAt
      });
    }
    if (order.status === 'completed' && !order.hasMyReview) {
      items.push({
        id: `review-buyer-${order.id}`,
        type: 'review',
        title: '待评价卖家',
        body: `「${order.product?.title || '商品'}」已完成，可以补充交易评价。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.completedAt || order.updatedAt || order.createdAt
      });
    }
    if (order.status === 'dispute') {
      items.push({
        id: `dispute-buyer-${order.id}`,
        type: 'dispute',
        title: '订单纠纷处理中',
        body: `「${order.product?.title || '商品'}」已进入管理员介入流程。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.updatedAt || order.createdAt
      });
    }
  }
  for (const order of selling) {
    if (order.status === 'applying') {
      items.push({
        id: `accept-${order.id}`,
        type: 'application',
        title: '有新的购买申请',
        body: `${order.buyer?.nickname || '买家'} 想购买「${order.product?.title || '商品'}」。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.updatedAt || order.createdAt
      });
    }
    if (order.status === 'waiting_delivery') {
      items.push({
        id: `deliver-${order.id}`,
        type: 'delivery',
        title: '待交付商品',
        body: `买家已支付「${order.product?.title || '商品'}」，请完成交付并标记。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.paidAt || order.updatedAt || order.createdAt
      });
    }
    if (order.status === 'completed' && !order.hasMyReview) {
      items.push({
        id: `review-seller-${order.id}`,
        type: 'review',
        title: '待评价买家',
        body: `「${order.product?.title || '商品'}」已完成，可以补充交易评价。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.completedAt || order.updatedAt || order.createdAt
      });
    }
    if (order.status === 'dispute') {
      items.push({
        id: `dispute-seller-${order.id}`,
        type: 'dispute',
        title: '订单纠纷处理中',
        body: `「${order.product?.title || '商品'}」已进入管理员介入流程。`,
        orderId: order.id,
        productId: order.productId,
        path: `/market/${order.productId}`,
        createdAt: order.updatedAt || order.createdAt
      });
    }
  }
  return items
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 12);
}

async function completeOrder(store, order, reason) {
  order.status = 'completed';
  order.completedAt = now();
  order.completeReason = reason;
  order.updatedAt = now();
  await store.saveCollection('orders');
  const product = store.collection('products').find((item) => item.id === order.productId);
  if (product) {
    product.status = 'sold';
    product.soldAt = now();
    product.updatedAt = now();
    await store.saveCollection('products');
  }
  await recordPaymentFlow(store, {
    userId: order.sellerId,
    relatedType: 'order',
    relatedId: order.id,
    type: 'product_finish_settlement',
    amount: order.price,
    status: 'success',
    title: `商品收入入账钱包：${product?.title || order.id}`
  });
  await creditWallet(store, {
    userId: order.sellerId,
    relatedType: 'order',
    relatedId: order.id,
    amount: order.price,
    title: `商品收入：${product?.title || order.id}`,
    source: 'product_finish_settlement'
  });
}

async function recordPaymentFlow(store, payload) {
  return store.insert('paymentFlows', {
    ...payload,
    serialNo: `PAY-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    createdAt: now()
  });
}

async function updateProductCards(store, realtime, productId) {
  const orders = store.collection('orders').filter((item) => item.productId === productId);
  const orderById = new Map(orders.map((item) => [item.id, item]));
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

function productHeat(product) {
  return Number(product.viewCount || 0) + Number(product.favoriteCount || 0) * 4;
}

function productRecommendationScore(product, viewerId = '', seed = '') {
  const ageHours = Math.max(1, (Date.now() - new Date(product.createdAt).getTime()) / (60 * 60 * 1000));
  const recency = 24 / Math.sqrt(ageHours);
  const saleBoost = product.status === 'on_sale' ? 12 : 3;
  const ownPenalty = viewerId && product.sellerId === viewerId ? -8 : 0;
  return productHeat(product) + recency + saleBoost + ownPenalty + stableJitter(product.id, seed);
}

function stableJitter(id = '', seed = '') {
  const value = `${seed}:${id}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1009;
  }
  return hash / 1009;
}

function compareRecommended(scoreA, scoreB, itemA, itemB, timeGetter) {
  const scoreDiff = scoreB - scoreA;
  if (scoreDiff !== 0) return scoreDiff;
  const timeDiff = String(timeGetter(itemB) || '').localeCompare(String(timeGetter(itemA) || ''));
  if (timeDiff !== 0) return timeDiff;
  return String(itemB.id || '').localeCompare(String(itemA.id || ''));
}

export function decorateProduct(store, product, viewerId = '', detail = false) {
  const favorites = store.collection('productFavorites').filter((item) => item.productId === product.id);
  const category = categoryById(store, product.categoryId);
  const orders = store.collection('orders').filter((item) => item.productId === product.id);
  const decorated = {
    ...product,
    category,
    seller: userBrief(store, product.sellerId),
    favoriteCount: favorites.length,
    favorited: viewerId ? favorites.some((item) => item.userId === viewerId) : false,
    activeOrder: product.lockedOrderId ? orders.find((item) => item.id === product.lockedOrderId) || null : null,
    myOrder: viewerId ? orders.find((item) => item.buyerId === viewerId && !['cancelled', 'rejected'].includes(item.status)) || null : null,
    lowCreditWarning: userBrief(store, product.sellerId)?.creditScore < 6
  };
  if (detail) {
    decorated.orders = orders.map((order) => decorateOrder(store, order));
    decorated.reviews = store.collection('orderReviews').filter((review) => orders.some((order) => order.id === review.orderId));
    decorated.paymentFlows = store.collection('paymentFlows').filter((flow) => orders.some((order) => order.id === flow.relatedId));
  }
  return decorated;
}

export function decorateOrder(store, order) {
  const product = store.collection('products').find((item) => item.id === order.productId);
  return {
    ...order,
    product: product ? { id: product.id, title: product.title, imageUrls: product.imageUrls, price: product.price } : null,
    buyer: userBrief(store, order.buyerId),
    seller: userBrief(store, order.sellerId)
  };
}
