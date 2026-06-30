import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import {
  createComment,
  createForumReport,
  createPost,
  forumRankings,
  generateForumSummary,
  getPostDetail,
  listForumReports,
  listPosts,
  resolveForumReport,
  sharePost,
  toggleCommentLike,
  toggleFollow,
  togglePostFavorite,
  togglePostLike,
  wordCloud
} from '../services/forum.js';

const router = express.Router();

router.get('/posts', requireUser, asyncHandler(async (req, res) => {
  res.json({ posts: listPosts(req.store, req.query, req.user.id) });
}));

router.post('/posts', requireUser, asyncHandler(async (req, res) => {
  const post = await createPost(req.store, req.user, req.body);
  res.status(201).json({ post });
}));

router.get('/rankings', requireUser, asyncHandler(async (req, res) => {
  res.json({ posts: forumRankings(req.store, String(req.query.range || 'day'), req.user.id) });
}));

router.get('/word-cloud', requireUser, asyncHandler(async (req, res) => {
  res.json({ words: wordCloud(req.store) });
}));

router.get('/summary', requireUser, asyncHandler(async (req, res) => {
  const settings = req.store.collection('settings');
  if (settings.mockEnabled) {
    return res.json({
      summary: {
        title: '社区热点总结',
        summary: 'Mock 展示：本周校园社区集中讨论取快递、课程资料、二手教材和宿舍生活。'
      },
      source: 'mock'
    });
  }
  res.json({ summary: await generateForumSummary(req.store), source: 'database' });
}));

router.get('/posts/:id', requireUser, asyncHandler(async (req, res) => {
  res.json({
    post: getPostDetail(req.store, req.params.id, req.user.id, {
      trackView: req.query.trackView !== 'false'
    })
  });
}));

router.post('/posts/:id/like', requireUser, asyncHandler(async (req, res) => {
  res.json(await togglePostLike(req.store, req.realtime, req.user, req.params.id));
}));

router.post('/posts/:id/favorite', requireUser, asyncHandler(async (req, res) => {
  res.json(await togglePostFavorite(req.store, req.realtime, req.user, req.params.id));
}));

router.post('/posts/:id/share', requireUser, asyncHandler(async (req, res) => {
  res.json(await sharePost(req.store, req.params.id));
}));

router.post('/posts/:id/comments', requireUser, asyncHandler(async (req, res) => {
  const comment = await createComment(req.store, req.realtime, req.user, req.params.id, req.body);
  res.status(201).json({ comment });
}));

router.post('/comments/:id/like', requireUser, asyncHandler(async (req, res) => {
  res.json(await toggleCommentLike(req.store, req.user, req.params.id));
}));

router.post('/follow/:id', requireUser, asyncHandler(async (req, res) => {
  res.json(await toggleFollow(req.store, req.realtime, req.user, req.params.id));
}));

router.post('/reports', requireUser, asyncHandler(async (req, res) => {
  const report = await createForumReport(req.store, req.user, req.body.type, req.body.targetId, req.body.reason);
  res.status(201).json({ report });
}));

router.get('/admin/reports', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ reports: listForumReports(req.store) });
}));

router.post('/admin/reports/:id/resolve', requireAdmin, asyncHandler(async (req, res) => {
  const report = await resolveForumReport(req.store, req.params.id, req.body);
  res.json({ report });
}));

router.get('/admin/word-cloud', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ words: wordCloud(req.store) });
}));

router.get('/admin/summary', requireAdmin, asyncHandler(async (req, res) => {
  const settings = req.store.collection('settings');
  if (settings.mockEnabled) {
    return res.json({
      summary: {
        title: '社区热点总结',
        summary: 'Mock 展示：近期高频话题为学习资料、校园生活、跑腿服务和二手交易。'
      },
      source: 'mock'
    });
  }
  res.json({ summary: await generateForumSummary(req.store), source: 'database' });
}));

router.post('/admin/summary/regenerate', requireAdmin, asyncHandler(async (req, res) => {
  res.json({ summary: await generateForumSummary(req.store, true), source: 'database' });
}));

export default router;
