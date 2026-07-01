import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireUser } from '../services/auth.js';
import {
  arbitrateProductCategory,
  arbitrateTaskCategory,
  checkLabelSimilarity,
  classifyProductCategories,
  generateForumTags,
  requestNewCategoryWithSimilarity,
  requestNewTaskCategoryWithSimilarity,
  vectorSettings
} from '../services/vectorAi.js';

const router = express.Router();

router.get('/vector/settings', requireUser, asyncHandler(async (_req, res) => {
  res.json(vectorSettings());
}));

router.post('/tags/ai-generate', requireUser, asyncHandler(async (req, res) => {
  const tags = await generateForumTags(req.store, req.body || {});
  const similarity = await checkLabelSimilarity(req.store, 'forumTag', tags);
  res.json({ tags, similarity });
}));

router.post('/tags/check-similarity', requireUser, asyncHandler(async (req, res) => {
  const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
  res.json({ similarity: await checkLabelSimilarity(req.store, 'forumTag', tags) });
}));

router.post('/products/ai-classify', requireUser, asyncHandler(async (req, res) => {
  const categories = await classifyProductCategories(req.store, req.body || {});
  res.json({ categories });
}));

router.post('/categories/request-new', requireUser, asyncHandler(async (req, res) => {
  res.json(await requestNewCategoryWithSimilarity(req.store, req.user, req.body || {}));
}));

router.post('/categories/ai-arbitrate', requireUser, asyncHandler(async (req, res) => {
  res.json(await arbitrateProductCategory(req.store, req.user, req.body || {}));
}));

router.post('/task-categories/check-similarity', requireUser, asyncHandler(async (req, res) => {
  const categories = Array.isArray(req.body.categories) ? req.body.categories : [];
  res.json({ similarity: await checkLabelSimilarity(req.store, 'taskCategory', categories) });
}));

router.post('/task-categories/request-new', requireUser, asyncHandler(async (req, res) => {
  res.json(await requestNewTaskCategoryWithSimilarity(req.store, req.user, req.body || {}));
}));

router.post('/task-categories/ai-arbitrate', requireUser, asyncHandler(async (req, res) => {
  res.json(await arbitrateTaskCategory(req.store, req.user, req.body || {}));
}));

router.post('/task-tags/check-similarity', requireUser, asyncHandler(async (req, res) => {
  const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
  res.json({ similarity: await checkLabelSimilarity(req.store, 'taskTag', tags) });
}));

export default router;
