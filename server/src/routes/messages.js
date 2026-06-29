const express = require('express');
const auth = require('../services/auth');
const actionCards = require('../services/actionCards');
const store = require('../services/store');
const socketHub = require('../services/socketHub');
const { ok, fail } = require('../response');

const router = express.Router();

function refreshAndSave(data) {
  if (actionCards.refreshActionCards(data)) store.save(data);
}

function conversationDto(data, conversation, currentUserId) {
  const participants = conversation.participantIds.map((id) => store.withoutPassword(store.getUser(data, id)));
  const peer = participants.find((item) => item?.id !== currentUserId) || participants[0];
  const messages = data.messages
    .filter((item) => item.conversationId === conversation.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const lastMessage = messages[messages.length - 1] || null;
  const unreadCount = messages.filter((item) => !item.readBy.includes(currentUserId) && item.fromUserId !== currentUserId).length;
  return { ...conversation, participants, peer, lastMessage, unreadCount };
}

router.get('/conversations', auth.requireAuth, (req, res) => {
  refreshAndSave(req.data);
  const list = req.data.conversations
    .filter((item) => item.participantIds.includes(req.user.id))
    .map((item) => conversationDto(req.data, item, req.user.id))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return ok(res, list);
});

router.post('/conversations', auth.requireAuth, (req, res) => {
  const targetUserId = req.body.targetUserId;
  const target = store.getUser(req.data, targetUserId);
  if (!target) return fail(res, 404, '会话用户不存在');
  let conversation = req.data.conversations.find((item) => {
    return item.participantIds.includes(req.user.id) && item.participantIds.includes(targetUserId);
  });
  if (!conversation) {
    conversation = {
      id: store.id('conv'),
      participantIds: [req.user.id, targetUserId],
      mutedBy: [],
      source: req.body.source || '主系统',
      relatedCard: req.body.relatedCard || null,
      updatedAt: store.now()
    };
    req.data.conversations.unshift(conversation);
    store.save(req.data);
  }
  return ok(res, conversationDto(req.data, conversation, req.user.id));
});

router.get('/conversations/:id/messages', auth.requireAuth, (req, res) => {
  const conversation = req.data.conversations.find((item) => item.id === req.params.id);
  if (!conversation || !conversation.participantIds.includes(req.user.id)) return fail(res, 404, '会话不存在');
  refreshAndSave(req.data);
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 30);
  const all = req.data.messages
    .filter((item) => item.conversationId === conversation.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const paged = all.slice(Math.max(0, all.length - page * pageSize), all.length - (page - 1) * pageSize);
  return ok(res, { list: paged, total: all.length, page, pageSize });
});

router.get('/search', auth.requireAuth, (req, res) => {
  refreshAndSave(req.data);
  const keyword = String(req.query.keyword || '').trim().toLowerCase();
  if (!keyword) return ok(res, []);
  const joinedConversationIds = req.data.conversations
    .filter((item) => item.participantIds.includes(req.user.id))
    .map((item) => item.id);
  const list = req.data.messages
    .filter((item) => joinedConversationIds.includes(item.conversationId))
    .filter((item) => `${item.content || ''} ${item.card?.title || ''}`.toLowerCase().includes(keyword))
    .slice(-50)
    .map((message) => ({
      ...message,
      conversation: conversationDto(
        req.data,
        req.data.conversations.find((item) => item.id === message.conversationId),
        req.user.id,
      ),
    }));
  return ok(res, list);
});

router.post('/conversations/:id/messages', auth.requireAuth, (req, res) => {
  const conversation = req.data.conversations.find((item) => item.id === req.params.id);
  if (!conversation || !conversation.participantIds.includes(req.user.id)) return fail(res, 404, '会话不存在');
  const message = {
    id: store.id('msg'),
    conversationId: conversation.id,
    fromUserId: req.user.id,
    type: req.body.type || 'text',
    content: req.body.content,
    card: req.body.card || null,
    readBy: [req.user.id],
    createdAt: store.now()
  };
  req.data.messages.push(message);
  conversation.updatedAt = message.createdAt;
  store.save(req.data);
  conversation.participantIds
    .filter((id) => id !== req.user.id)
    .forEach((id) => {
      socketHub.broadcastToUser(id, { type: 'message', data: { conversationId: conversation.id, message } });
    });
  return ok(res, message, '消息已发送');
});

router.put('/conversations/:id/read', auth.requireAuth, (req, res) => {
  const conversation = req.data.conversations.find((item) => item.id === req.params.id);
  if (!conversation || !conversation.participantIds.includes(req.user.id)) return fail(res, 404, '会话不存在');
  req.data.messages
    .filter((item) => item.conversationId === conversation.id)
    .forEach((message) => {
      if (!message.readBy.includes(req.user.id)) message.readBy.push(req.user.id);
    });
  store.save(req.data);
  return ok(res, null, '已标记为已读');
});

router.put('/conversations/:id/mute', auth.requireAuth, (req, res) => {
  const conversation = req.data.conversations.find((item) => item.id === req.params.id);
  if (!conversation || !conversation.participantIds.includes(req.user.id)) return fail(res, 404, '会话不存在');
  const muted = Boolean(req.body.muted);
  const index = conversation.mutedBy.indexOf(req.user.id);
  if (muted && index < 0) conversation.mutedBy.push(req.user.id);
  if (!muted && index >= 0) conversation.mutedBy.splice(index, 1);
  store.save(req.data);
  return ok(res, conversationDto(req.data, conversation, req.user.id), muted ? '已开启免打扰' : '已关闭免打扰');
});

router.post('/conversations/:id/messages/:messageId/card-action', auth.requireAuth, (req, res) => {
  const conversation = req.data.conversations.find((item) => item.id === req.params.id);
  if (!conversation || !conversation.participantIds.includes(req.user.id)) return fail(res, 404, '会话不存在');
  const message = req.data.messages.find((item) => item.id === req.params.messageId && item.conversationId === conversation.id);
  if (!message || !actionCards.isActionCard(message.card)) return fail(res, 404, '卡片消息不存在');
  actionCards.refreshActionCards(req.data);
  if (message.card.ownerId !== req.user.id) return fail(res, 403, '只有接收方可处理该卡片');

  const result = actionCards.applyCardAction(req.data, message, req.body.action);
  const now = store.now();
  if (result.error) {
    store.save(req.data);
    return fail(res, result.error.status, result.error.message);
  }

  conversation.updatedAt = now;
  message.updatedAt = now;
  store.save(req.data);
  conversation.participantIds.forEach((id) => {
    socketHub.broadcastToUser(id, { type: 'message-card-updated', data: { conversationId: conversation.id, message } });
  });
  return ok(res, { message, ...result }, message.card.status === 'accepted' ? '已同意' : '已拒绝');
});

router.delete('/conversations/:id/messages/:messageId', auth.requireAuth, (req, res) => {
  const index = req.data.messages.findIndex((item) => item.id === req.params.messageId && item.conversationId === req.params.id);
  if (index < 0) return fail(res, 404, '消息不存在');
  req.data.messages.splice(index, 1);
  store.save(req.data);
  return ok(res, null, '消息已删除');
});

router.get('/notifications', auth.requireAuth, (req, res) => {
  let list = req.data.notifications.filter((item) => item.userId === req.user.id);
  if (req.query.type) list = list.filter((item) => item.type === req.query.type);
  return ok(res, list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

router.put('/notifications/read', auth.requireAuth, (req, res) => {
  const ids = req.body.ids || [];
  req.data.notifications
    .filter((item) => item.userId === req.user.id && (!ids.length || ids.includes(item.id)))
    .forEach((item) => {
      item.read = true;
    });
  store.save(req.data);
  return ok(res, null, '通知已读状态已更新');
});

router.delete('/notifications/:id', auth.requireAuth, (req, res) => {
  const index = req.data.notifications.findIndex((item) => item.id === req.params.id && item.userId === req.user.id);
  if (index < 0) return fail(res, 404, '通知不存在');
  req.data.notifications.splice(index, 1);
  store.save(req.data);
  return ok(res, null, '通知已删除');
});

module.exports = router;
