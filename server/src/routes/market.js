const express = require('express');
const auth = require('../services/auth');
const actionCards = require('../services/actionCards');
const store = require('../services/store');
const socketHub = require('../services/socketHub');
const { ok, fail } = require('../response');

const router = express.Router();

function filterGoods(data, query) {
  let list = data.goods.filter((item) => item.auditStatus === '通过' && item.status !== '下架');
  if (query.keyword) {
    const key = String(query.keyword).toLowerCase();
    list = list.filter((item) => `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(key));
  }
  if (query.category) list = list.filter((item) => item.category === query.category);
  if (query.condition) list = list.filter((item) => item.condition === query.condition);
  if (query.tradeMode) list = list.filter((item) => item.tradeMode === query.tradeMode);
  if (query.minPrice) list = list.filter((item) => item.price >= Number(query.minPrice));
  if (query.maxPrice) list = list.filter((item) => item.price <= Number(query.maxPrice));
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

router.get('/goods', (req, res) => {
  const data = store.load();
  return ok(res, filterGoods(data, req.query).map((item) => store.publicGoods(data, item)));
});

router.get('/mine', auth.requireAuth, (req, res) => {
  const requestedIds = new Set(
    req.data.messages
      .filter((item) => {
        const card = item.card || {};
        return card.targetType === 'goods' && card.requesterId === req.user.id;
      })
      .map((item) => item.card.targetId),
  );
  req.data.orders
    .filter((item) => item.buyerId === req.user.id)
    .forEach((item) => requestedIds.add(item.goodsId));

  const requestedGoods = req.data.goods
    .filter((item) => requestedIds.has(item.id))
    .map((item) => store.publicGoods(req.data, item));
  const publishedGoods = req.data.goods
    .filter((item) => item.sellerId === req.user.id)
    .map((item) => store.publicGoods(req.data, item));
  const favoriteGoods = req.data.goods
    .filter((item) => (item.favorites || []).includes(req.user.id))
    .map((item) => store.publicGoods(req.data, item));
  const orders = req.data.orders.filter((item) => item.buyerId === req.user.id || item.sellerId === req.user.id);
  return ok(res, { requestedGoods, publishedGoods, favoriteGoods, orders });
});

router.post('/goods', auth.requireAuth, (req, res) => {
  const goods = {
    id: store.id('goods'),
    sellerId: req.user.id,
    name: req.body.name,
    category: req.body.category,
    price: Number(req.body.price || 0),
    condition: req.body.condition || '八成新',
    tradeMode: req.body.tradeMode || '校内自提',
    location: req.body.location || '校内',
    description: req.body.description,
    images: req.body.images || [],
    status: '审核中',
    auditStatus: '待审核',
    views: 0,
    consults: 0,
    favorites: [],
    createdAt: store.now()
  };
  req.data.goods.unshift(goods);
  store.addNotification(req.data, {
    userId: req.user.id,
    type: '商品审核',
    title: '商品已提交审核',
    content: goods.name,
    relatedType: 'goods',
    relatedId: goods.id
  });
  store.save(req.data);
  return ok(res, store.publicGoods(req.data, goods), '商品已提交审核');
});

router.get('/goods/:id', (req, res) => {
  const data = store.load();
  const goods = data.goods.find((item) => item.id === req.params.id);
  if (!goods) return fail(res, 404, '商品不存在');
  goods.views += 1;
  store.save(data);
  return ok(res, store.publicGoods(data, goods));
});

router.put('/goods/:id', auth.requireAuth, (req, res) => {
  const goods = req.data.goods.find((item) => item.id === req.params.id);
  if (!goods) return fail(res, 404, '商品不存在');
  if (goods.sellerId !== req.user.id && req.user.role !== 'admin') return fail(res, 403, '无权编辑该商品');
  ['name', 'category', 'price', 'condition', 'tradeMode', 'location', 'description', 'images', 'status'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) goods[key] = req.body[key];
  });
  store.save(req.data);
  return ok(res, store.publicGoods(req.data, goods), '商品已更新');
});

router.post('/goods/:id/favorite', auth.requireAuth, (req, res) => {
  const goods = req.data.goods.find((item) => item.id === req.params.id);
  if (!goods) return fail(res, 404, '商品不存在');
  if (!Array.isArray(goods.favorites)) goods.favorites = [];
  const index = goods.favorites.indexOf(req.user.id);
  if (index >= 0) goods.favorites.splice(index, 1);
  else goods.favorites.push(req.user.id);
  store.save(req.data);
  return ok(res, store.publicGoods(req.data, goods));
});

router.post('/goods/:id/request', auth.requireAuth, (req, res) => {
  const goods = req.data.goods.find((item) => item.id === req.params.id);
  if (!goods) return fail(res, 404, '商品不存在');
  if (goods.sellerId === req.user.id) return fail(res, 400, '不能求购自己发布的商品');
  if (goods.auditStatus !== '通过' || goods.status !== '在售') return fail(res, 400, '商品当前不可交易');
  goods.consults = Number(goods.consults || 0) + 1;
  const { conversation, message } = actionCards.createActionCardMessage(req.data, {
    type: 'goodsPurchase',
    targetType: 'goods',
    targetId: goods.id,
    title: goods.name,
    summary: `${req.user.nickname} 想购买该商品`,
    requesterId: req.user.id,
    ownerId: goods.sellerId,
    source: '二手市场',
    content: req.body.message || `我想购买「${goods.name}」，等待你确认。`
  });
  store.addNotification(req.data, {
    userId: goods.sellerId,
    type: '交易提醒',
    title: `${req.user.nickname} 想购买你的商品`,
    content: goods.name,
    relatedType: 'goods',
    relatedId: goods.id
  });
  store.save(req.data);
  socketHub.broadcastToUser(goods.sellerId, { type: 'message', data: { conversationId: conversation.id, message } });
  return ok(res, { goods: store.publicGoods(req.data, goods), conversation, message }, '已发送求购卡片');
});

router.post('/goods/:id/orders', auth.requireAuth, (req, res) => {
  const goods = req.data.goods.find((item) => item.id === req.params.id);
  if (!goods) return fail(res, 404, '商品不存在');
  if (goods.sellerId === req.user.id) return fail(res, 400, '不能购买自己发布的商品');
  const order = {
    id: store.id('order'),
    goodsId: goods.id,
    buyerId: req.user.id,
    sellerId: goods.sellerId,
    amount: Number(goods.price),
    status: '待付款',
    escrowPaid: false,
    address: req.body.address || goods.location,
    createdAt: store.now()
  };
  req.data.orders.unshift(order);
  store.save(req.data);
  return ok(res, order, '订单已创建');
});

router.post('/orders/:id/pay', auth.requireAuth, (req, res) => {
  const order = req.data.orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  if (order.buyerId !== req.user.id) return fail(res, 403, '只有买家可支付');
  order.status = '待交付';
  order.escrowPaid = true;
  order.payment = { method: req.body.method || '微信支付', paidAt: store.now(), fake: true };
  store.addNotification(req.data, {
    userId: order.sellerId,
    type: '交易提醒',
    title: '买家已付款',
    content: `订单 ${order.id} 已进入担保交易。`,
    relatedType: 'order',
    relatedId: order.id
  });
  store.save(req.data);
  return ok(res, order, '模拟支付成功');
});

router.post('/orders/:id/receive', auth.requireAuth, (req, res) => {
  const order = req.data.orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  if (order.buyerId !== req.user.id) return fail(res, 403, '只有买家可确认收货');
  order.status = '已完成';
  order.receivedAt = store.now();
  const goods = req.data.goods.find((item) => item.id === order.goodsId);
  if (goods) goods.status = '已售出';
  store.addNotification(req.data, {
    userId: order.sellerId,
    type: '酬金到账',
    title: '订单已完成',
    content: `订单 ${order.id} 款项已模拟打款。`,
    relatedType: 'order',
    relatedId: order.id
  });
  store.save(req.data);
  return ok(res, order, '已确认收货，担保款模拟到账');
});

router.post('/orders/:id/review', auth.requireAuth, (req, res) => {
  const order = req.data.orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  if (![order.buyerId, order.sellerId].includes(req.user.id)) return fail(res, 403, '无权评价该订单');
  order.reviews = order.reviews || [];
  order.reviews.push({
    id: store.id('review'),
    userId: req.user.id,
    rating: Number(req.body.rating || 5),
    content: req.body.content || '交易顺利',
    images: req.body.images || [],
    createdAt: store.now()
  });
  const target = store.getUser(req.data, order.buyerId === req.user.id ? order.sellerId : order.buyerId);
  if (target) target.creditScore = Math.min(100, target.creditScore + 1);
  store.save(req.data);
  return ok(res, order, '评价成功');
});

router.post('/orders/:id/disputes', auth.requireAuth, (req, res) => {
  const order = req.data.orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  if (![order.buyerId, order.sellerId].includes(req.user.id)) return fail(res, 403, '无权发起纠纷');
  order.status = '仲裁中';
  order.dispute = {
    id: store.id('dispute'),
    userId: req.user.id,
    reason: req.body.reason,
    evidence: req.body.evidence || [],
    status: '待仲裁',
    createdAt: store.now()
  };
  store.save(req.data);
  return ok(res, order, '纠纷已提交，等待管理员仲裁');
});

router.get('/orders/:id/status', auth.requireAuth, (req, res) => {
  const order = req.data.orders.find((item) => item.id === req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  return ok(res, { id: order.id, status: order.status, escrowPaid: order.escrowPaid });
});

router.get('/functions/search', (req, res) => {
  const data = store.load();
  return ok(res, filterGoods(data, req.query).map((item) => store.publicGoods(data, item)));
});

module.exports = router;
