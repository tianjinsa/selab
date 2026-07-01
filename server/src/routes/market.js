import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import {
  acceptPurchase,
  applyPurchase,
  cancelOrder,
  createOrderDispute,
  createOrderReview,
  createProduct,
  createProductReport,
  deleteOwnProduct,
  deliverOrder,
  getProductDetail,
  gradeRecommendations,
  listFavoriteProducts,
  listMarketAdmin,
  listMyOrders,
  listProducts,
  marketModerationCenter,
  marketWorkbench,
  marketMeta,
  payOrder,
  receiveOrder,
  rejectPurchase,
  requestCategory,
  resolveCategoryRequest,
  scanOrderTimeouts,
  takeDownProduct,
  toggleProductFavorite,
  updateOwnProductVisibility
} from '../services/market.js';
import { enqueueContentModeration } from '../services/contentModeration.js';

const router = express.Router();

router.get('/meta', requireUser, asyncHandler(async (req, res) => {
  res.json(marketMeta(req.store));
}));

router.get('/products', requireUser, asyncHandler(async (req, res) => {
  res.json({ products: listProducts(req.store, req.query, req.user.id) });
}));

router.post('/products', requireUser, asyncHandler(async (req, res) => {
  const product = await createProduct(req.store, req.user, req.body);
  await enqueueContentModeration(req.store, req.realtime, 'product', product.id);
  res.status(201).json({ product });
}));

router.get('/recommendations/grade', requireUser, asyncHandler(async (req, res) => {
  res.json(gradeRecommendations(req.store, req.user));
}));

router.get('/orders/my', requireUser, asyncHandler(async (req, res) => {
  res.json({ orders: listMyOrders(req.store, req.user.id) });
}));

router.get('/orders/workbench', requireUser, asyncHandler(async (req, res) => {
  res.json(marketWorkbench(req.store, req.user.id));
}));

router.get('/moderation', requireUser, asyncHandler(async (req, res) => {
  res.json(await marketModerationCenter(req.store, req.user));
}));

router.get('/favorites', requireUser, asyncHandler(async (req, res) => {
  res.json({ products: listFavoriteProducts(req.store, req.user.id) });
}));

router.post('/category-requests', requireUser, asyncHandler(async (req, res) => {
  const request = await requestCategory(req.store, req.user, req.body);
  res.status(201).json({ request });
}));

router.get('/products/:id', requireUser, asyncHandler(async (req, res) => {
  res.json({ product: getProductDetail(req.store, req.params.id, req.user.id) });
}));

router.post('/products/:id/favorite', requireUser, asyncHandler(async (req, res) => {
  res.json(await toggleProductFavorite(req.store, req.user, req.params.id));
}));

router.patch('/products/:id/visibility', requireUser, asyncHandler(async (req, res) => {
  const product = await updateOwnProductVisibility(req.store, req.user, req.params.id, Boolean(req.body.visible));
  res.json({ product });
}));

router.delete('/products/:id', requireUser, asyncHandler(async (req, res) => {
  res.json(await deleteOwnProduct(req.store, req.user, req.params.id));
}));

router.post('/products/:id/apply', requireUser, asyncHandler(async (req, res) => {
  const order = await applyPurchase(req.store, req.realtime, req.user, req.params.id);
  res.status(201).json({ order });
}));

router.post('/products/:id/reports', requireUser, asyncHandler(async (req, res) => {
  const report = await createProductReport(req.store, req.user, req.params.id, req.body.reason);
  res.status(201).json({ report });
}));

router.post('/orders/:id/accept', requireUser, asyncHandler(async (req, res) => {
  res.json({ order: await acceptPurchase(req.store, req.realtime, req.user, req.params.id) });
}));

router.post('/orders/:id/reject', requireUser, asyncHandler(async (req, res) => {
  res.json({ order: await rejectPurchase(req.store, req.realtime, req.user, req.params.id) });
}));

router.post('/orders/:id/pay', requireUser, asyncHandler(async (req, res) => {
  res.json({ order: await payOrder(req.store, req.user, req.params.id) });
}));

router.post('/orders/:id/deliver', requireUser, asyncHandler(async (req, res) => {
  res.json({ order: await deliverOrder(req.store, req.realtime, req.user, req.params.id) });
}));

router.post('/orders/:id/receive', requireUser, asyncHandler(async (req, res) => {
  res.json({ order: await receiveOrder(req.store, req.user, req.params.id) });
}));

router.post('/orders/:id/cancel', requireUser, asyncHandler(async (req, res) => {
  res.json({ order: await cancelOrder(req.store, req.user, req.params.id, req.body.reason) });
}));

router.post('/orders/:id/disputes', requireUser, asyncHandler(async (req, res) => {
  const dispute = await createOrderDispute(req.store, req.user, req.params.id, req.body);
  res.status(201).json({ dispute });
}));

router.post('/orders/:id/reviews', requireUser, asyncHandler(async (req, res) => {
  const review = await createOrderReview(req.store, req.user, req.params.id, req.body);
  res.status(201).json({ review });
}));

router.get('/admin/all', requireAdmin, asyncHandler(async (req, res) => {
  res.json(listMarketAdmin(req.store));
}));

router.get('/admin/meta', requireAdmin, asyncHandler(async (req, res) => {
  res.json(marketMeta(req.store));
}));

router.post('/admin/category-requests/:id/resolve', requireAdmin, asyncHandler(async (req, res) => {
  const category = await resolveCategoryRequest(req.store, req.params.id, req.body);
  res.json({ category });
}));

router.post('/admin/products/:id/take-down', requireAdmin, asyncHandler(async (req, res) => {
  await takeDownProduct(req.store, req.params.id, req.body.reason || '管理员下架');
  res.json({ ok: true });
}));

router.post('/admin/scan-timeouts', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await scanOrderTimeouts(req.store));
}));

export default router;
