import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import {
  createComment,
  createForumReport,
  createPost,
  deleteOwnPost,
  deleteRejectedOwnPosts,
  forumStudio,
  forumRankings,
  generateForumSummary,
  getPostDetail,
  listFavoritePosts,
  listForumReports,
  listFollowingUsers,
  listPosts,
  resubmitRejectedPost,
  resolveForumReport,
  sharePost,
  toggleCommentLike,
  toggleFollow,
  togglePostFavorite,
  togglePostLike,
  updateOwnPostVisibility,
  wordCloud
} from '../services/forum.js';
import { enqueueContentModeration } from '../services/contentModeration.js';
import { paginateItems } from '../utils/pagination.js';

const router = express.Router();

router.get('/posts', requireUser, asyncHandler(async (req, res) => {
  const page = paginateItems(listPosts(req.store, req.query, req.user.id), req.query, { limit: 12, maxLimit: 40 });
  res.json({ posts: page.items, pageInfo: page.pageInfo });
}));

router.post('/posts', requireUser, asyncHandler(async (req, res) => {
  const post = await createPost(req.store, req.user, req.body);
  await enqueueContentModeration(req.store, req.realtime, 'post', post.id);
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

router.get('/me/favorites', requireUser, asyncHandler(async (req, res) => {
  res.json({ posts: listFavoritePosts(req.store, req.user.id) });
}));

router.get('/me/following', requireUser, asyncHandler(async (req, res) => {
  res.json({ users: listFollowingUsers(req.store, req.user.id) });
}));

router.get('/me/studio', requireUser, asyncHandler(async (req, res) => {
  res.json(forumStudio(req.store, req.user.id));
}));

router.delete('/me/studio/rejected', requireUser, asyncHandler(async (req, res) => {
  res.json(await deleteRejectedOwnPosts(req.store, req.user));
}));

router.patch('/posts/:id/resubmit', requireUser, asyncHandler(async (req, res) => {
  const post = await resubmitRejectedPost(req.store, req.user, req.params.id, req.body);
  await enqueueContentModeration(req.store, req.realtime, 'post', post.id);
  res.json({ post });
}));

router.patch('/posts/:id/visibility', requireUser, asyncHandler(async (req, res) => {
  const post = await updateOwnPostVisibility(req.store, req.user, req.params.id, Boolean(req.body.visible));
  res.json({ post });
}));

router.delete('/posts/:id', requireUser, asyncHandler(async (req, res) => {
  res.json(await deleteOwnPost(req.store, req.user, req.params.id));
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
