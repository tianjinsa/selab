import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireUser } from '../services/auth.js';
import {
  countUnread,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../services/notifications.js';

const router = express.Router();

router.get('/', requireUser, asyncHandler(async (req, res) => {
  const type = String(req.query.type || '');
  res.json({
    notifications: listNotifications(req.store, req.user.id, type),
    unreadCount: countUnread(req.store, req.user.id)
  });
}));

router.get('/unread-count', requireUser, asyncHandler(async (req, res) => {
  res.json({ count: countUnread(req.store, req.user.id) });
}));

router.patch('/:id/read', requireUser, asyncHandler(async (req, res) => {
  await markNotificationRead(req.store, req.user.id, req.params.id);
  req.realtime?.sendToUser(req.user.id, 'notification.unread_count', {
    count: countUnread(req.store, req.user.id)
  });
  res.json({ ok: true });
}));

router.post('/read-all', requireUser, asyncHandler(async (req, res) => {
  const count = await markAllNotificationsRead(req.store, req.user.id, String(req.body.type || ''));
  req.realtime?.sendToUser(req.user.id, 'notification.unread_count', { count });
  res.json({ ok: true, unreadCount: count });
}));

router.delete('/:id', requireUser, asyncHandler(async (req, res) => {
  await deleteNotification(req.store, req.user.id, req.params.id);
  res.json({ ok: true });
}));

export default router;
