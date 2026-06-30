import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireUser } from '../services/auth.js';
import { notFound } from '../utils/errors.js';
import { listPosts } from '../services/forum.js';
import {
  getOrCreateConversation,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  setConversationMuted,
  softDeleteMessage
} from '../services/chat.js';

const router = express.Router();

router.get('/users/search', requireUser, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const users = req.store.collection('users')
    .filter((user) => user.id !== req.user.id && !user.isBanned)
    .filter((user) => !q || user.nickname.includes(q) || user.studentId.includes(q) || user.phone.includes(q))
    .slice(0, 20)
    .map((user) => ({
      id: user.id,
      studentId: user.studentId,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      creditScore: user.creditScore
    }));
  res.json({ users });
}));

router.get('/users/:id', requireUser, asyncHandler(async (req, res) => {
  const target = req.store.collection('users').find((user) => user.id === req.params.id && !user.isBanned);
  if (!target) throw notFound('用户不存在');
  const follows = req.store.collection('follows');
  const posts = listPosts(req.store, { authorId: target.id }, req.user.id);
  res.json({
    user: {
      id: target.id,
      studentId: target.studentId,
      nickname: target.nickname,
      avatarUrl: target.avatarUrl,
      coverUrl: target.coverUrl || '',
      contact: target.contact,
      bio: target.bio,
      creditScore: target.creditScore,
      createdAt: target.createdAt
    },
    followed: follows.some((item) => item.followerId === req.user.id && item.followingId === target.id),
    stats: {
      postCount: posts.length,
      followerCount: follows.filter((item) => item.followingId === target.id).length,
      followingCount: follows.filter((item) => item.followerId === target.id).length
    },
    posts
  });
}));

router.get('/conversations', requireUser, asyncHandler(async (req, res) => {
  res.json({ conversations: listConversations(req.store, req.user.id) });
}));

router.post('/conversations/by-user/:peerId', requireUser, asyncHandler(async (req, res) => {
  const conversation = await getOrCreateConversation(req.store, req.user.id, req.params.peerId);
  res.status(201).json({ conversation });
}));

router.get('/conversations/:id/messages', requireUser, asyncHandler(async (req, res) => {
  res.json({ messages: listMessages(req.store, req.user.id, req.params.id) });
}));

router.post('/conversations/:id/messages', requireUser, asyncHandler(async (req, res) => {
  const message = await sendMessage(req.store, req.realtime, req.user.id, req.params.id, req.body);
  res.status(201).json({ message });
}));

router.patch('/conversations/:id/read', requireUser, asyncHandler(async (req, res) => {
  const result = await markConversationRead(req.store, req.realtime, req.user.id, req.params.id);
  res.json(result);
}));

router.patch('/conversations/:id/mute', requireUser, asyncHandler(async (req, res) => {
  const conversation = await setConversationMuted(req.store, req.user.id, req.params.id, Boolean(req.body.muted));
  res.json({ conversation });
}));

router.delete('/messages/:id', requireUser, asyncHandler(async (req, res) => {
  await softDeleteMessage(req.store, req.user.id, req.params.id);
  res.json({ ok: true });
}));

export default router;
