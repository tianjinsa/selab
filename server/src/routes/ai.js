import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import {
  aiCategories,
  cancelAiRun,
  createKnowledgeBase,
  createAiSession,
  createKnowledgeEntry,
  deleteKnowledgeBase,
  deleteKnowledgeEntry,
  deleteAiSession,
  getAiAdminData,
  getAiRiskDetail,
  getAiSession,
  listAiSessions,
  regenerateAiRun,
  updateAiSession,
  updateAiUserMessage,
  updateAiConfig,
  updateKnowledgeBase,
  updateKnowledgeEntry
} from '../services/ai.js';

const router = express.Router();

router.get('/sessions', requireUser, asyncHandler(async (req, res) => {
  res.json({ sessions: listAiSessions(req.store, req.user.id) });
}));

router.post('/sessions', requireUser, asyncHandler(async (req, res) => {
  const session = await createAiSession(req.store, req.user.id, req.body.title);
  res.status(201).json({ session });
}));

router.get('/sessions/:id', requireUser, asyncHandler(async (req, res) => {
  res.json(getAiSession(req.store, req.user.id, req.params.id));
}));

router.patch('/sessions/:id', requireUser, asyncHandler(async (req, res) => {
  res.json({ session: await updateAiSession(req.store, req.user.id, req.params.id, req.body) });
}));

router.delete('/sessions/:id', requireUser, asyncHandler(async (req, res) => {
  res.json(await deleteAiSession(req.store, req.user.id, req.params.id));
}));

router.patch('/sessions/:id/messages/:messageId', requireUser, asyncHandler(async (req, res) => {
  res.json({ message: await updateAiUserMessage(req.store, req.user.id, req.params.id, req.params.messageId, req.body) });
}));

router.post('/sessions/:id/regenerate', requireUser, asyncHandler(async (req, res) => {
  res.json(await regenerateAiRun(req.store, req.realtime, req.user.id, req.params.id, req.body));
}));

router.post('/sessions/:id/cancel', requireUser, asyncHandler(async (req, res) => {
  res.json(await cancelAiRun(req.store, req.user.id, req.params.id));
}));

router.get('/categories', requireUser, asyncHandler(async (_req, res) => {
  res.json({ categories: aiCategories() });
}));

router.get('/admin', requireAdmin, asyncHandler(async (req, res) => {
  res.json(getAiAdminData(req.store));
}));

router.get('/admin/risks/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json(getAiRiskDetail(req.store, req.params.id));
}));

router.patch('/admin/config', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ config: await updateAiConfig(req.store, req.body) });
}));

router.post('/admin/knowledge', requireAdmin, asyncHandler(async (req, res) => {
  const entry = await createKnowledgeEntry(req.store, req.body);
  res.status(201).json({ entry });
}));

router.patch('/admin/knowledge/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ entry: await updateKnowledgeEntry(req.store, req.params.id, req.body) });
}));

router.delete('/admin/knowledge/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await deleteKnowledgeEntry(req.store, req.params.id));
}));

router.post('/admin/knowledge-bases', requireAdmin, asyncHandler(async (req, res) => {
  const base = await createKnowledgeBase(req.store, req.body);
  res.status(201).json({ base });
}));

router.patch('/admin/knowledge-bases/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ base: await updateKnowledgeBase(req.store, req.params.id, req.body) });
}));

router.delete('/admin/knowledge-bases/:id', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await deleteKnowledgeBase(req.store, req.params.id));
}));

export default router;
