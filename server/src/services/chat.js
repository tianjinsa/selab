import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { createNotification, markNotificationsReadByLink } from './notifications.js';

function now() {
  return new Date().toISOString();
}

function publicUser(user) {
  return {
    id: user.id,
    studentId: user.studentId,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    creditScore: user.creditScore,
    isMuted: Boolean(user.isMuted),
    isPublishRestricted: Boolean(user.isPublishRestricted)
  };
}

export function findPeerConversation(store, userId, peerId) {
  return store.collection('conversations').find((conversation) => {
    const members = conversation.memberIds || [];
    return members.length === 2 && members.includes(userId) && members.includes(peerId);
  });
}

export async function getOrCreateConversation(store, userId, peerId) {
  if (userId === peerId) throw badRequest('不能和自己创建私信会话');
  const peer = store.collection('users').find((user) => user.id === peerId && !user.isBanned);
  if (!peer) throw notFound('目标用户不存在或不可用');
  const existing = findPeerConversation(store, userId, peerId);
  if (existing) return existing;
  return store.insert('conversations', {
    memberIds: [userId, peerId],
    mutedBy: [],
    lastMessageAt: now()
  });
}

export function listConversations(store, userId) {
  const users = store.collection('users');
  const messages = store.collection('messages');
  return store.collection('conversations')
    .filter((conversation) => conversation.memberIds?.includes(userId))
    .map((conversation) => {
      const peerId = conversation.memberIds.find((id) => id !== userId);
      const peer = users.find((user) => user.id === peerId);
      const visibleMessages = messages
        .filter((message) => message.conversationId === conversation.id)
        .filter((message) => !(message.deletedFor || []).includes(userId));
      const lastMessage = visibleMessages
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
      const unreadCount = visibleMessages
        .filter((message) => message.senderId !== userId && !(message.readBy || []).includes(userId))
        .length;
      return {
        ...conversation,
        peer: publicUser(peer || {}),
        lastMessage,
        unreadCount
      };
    })
    .sort((a, b) => String(b.lastMessageAt || b.updatedAt).localeCompare(String(a.lastMessageAt || a.updatedAt)));
}

export function listMessages(store, userId, conversationId) {
  const conversation = store.collection('conversations').find((item) => item.id === conversationId);
  if (!conversation) throw notFound('会话不存在');
  if (!conversation.memberIds.includes(userId)) throw forbidden('不能查看不属于自己的会话');
  return store.collection('messages')
    .filter((message) => message.conversationId === conversationId)
    .filter((message) => !(message.deletedFor || []).includes(userId))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function sendMessage(store, realtime, senderId, conversationId, payload) {
  const conversation = store.collection('conversations').find((item) => item.id === conversationId);
  if (!conversation) throw notFound('会话不存在');
  if (!conversation.memberIds.includes(senderId)) throw forbidden('不能向不属于自己的会话发送消息');
  const sender = store.collection('users').find((user) => user.id === senderId);
  if (sender?.isMuted) throw forbidden('账号已被禁言，暂不能发送私信');
  const content = String(payload.content || '').trim();
  const attachment = normalizeAttachment(payload);
  const type = normalizeMessageType(payload.type, attachment);
  if (type === 'text' && !content) throw badRequest('消息内容不能为空');
  if ((type === 'image' || type === 'file') && !attachment) throw badRequest('请先上传附件');

  const message = await store.insert('messages', {
    conversationId,
    senderId,
    type,
    content,
    imageUrl: type === 'image' ? attachment.url : (payload.imageUrl || ''),
    attachment,
    card: payload.card || null,
    readBy: [senderId],
    deletedFor: []
  });
  await store.update('conversations', conversationId, { lastMessageAt: message.createdAt });

  for (const receiverId of conversation.memberIds.filter((id) => id !== senderId)) {
    const muted = conversation.mutedBy?.includes(receiverId);
    if (!muted) {
      await createNotification(store, {
        userId: receiverId,
        type: 'message',
        title: '收到新的私信',
        body: messageNotificationBody(message),
        link: `/messages/${conversationId}`,
        sourceId: message.id
      }, realtime);
    }
    realtime?.sendToUser(receiverId, 'chat.message.new', { conversationId, message });
  }
  realtime?.sendToUser(senderId, 'chat.message.new', { conversationId, message });
  return message;
}

function normalizeMessageType(type, attachment) {
  if (attachment?.kind === 'image') return 'image';
  if (attachment) return 'file';
  return type || 'text';
}

function normalizeAttachment(payload = {}) {
  const raw = payload.attachment || (payload.imageUrl ? { url: payload.imageUrl, kind: 'image' } : null);
  if (!raw) return null;
  const url = String(raw.url || '').trim();
  if (!url.startsWith('/uploads/')) throw badRequest('附件地址无效');
  const mimeType = String(raw.mimeType || '').trim();
  const kind = raw.kind === 'image' || mimeType.startsWith('image/') ? 'image' : 'file';
  return {
    url,
    kind,
    name: String(raw.name || raw.originalName || (kind === 'image' ? '图片' : '附件')).trim().slice(0, 120),
    mimeType,
    size: Number(raw.size || 0)
  };
}

function messageNotificationBody(message) {
  if (message.content) return message.content;
  if (message.type === 'image') return `收到图片：${message.attachment?.name || '图片'}`;
  if (message.type === 'file') return `收到文件：${message.attachment?.name || '附件'}`;
  return '收到一条新消息';
}

export async function markConversationRead(store, realtime, userId, conversationId) {
  const conversation = store.collection('conversations').find((item) => item.id === conversationId);
  if (!conversation) throw notFound('会话不存在');
  if (!conversation.memberIds.includes(userId)) throw forbidden('不能操作不属于自己的会话');
  const messages = store.collection('messages');
  let changed = false;
  for (const message of messages) {
    if (message.conversationId === conversationId && !(message.readBy || []).includes(userId)) {
      message.readBy = [...(message.readBy || []), userId];
      message.updatedAt = now();
      changed = true;
    }
  }
  if (changed) await store.saveCollection('messages');
  const unreadCount = await markNotificationsReadByLink(store, userId, `/messages/${conversationId}`, 'message');
  realtime?.sendToUser(userId, 'chat.message.read', { conversationId });
  realtime?.sendToUser(userId, 'notification.unread_count', { count: unreadCount });
  return { ok: true, unreadCount };
}

export async function setConversationMuted(store, userId, conversationId, muted) {
  const conversation = store.collection('conversations').find((item) => item.id === conversationId);
  if (!conversation) throw notFound('会话不存在');
  if (!conversation.memberIds.includes(userId)) throw forbidden('不能操作不属于自己的会话');
  const mutedBy = new Set(conversation.mutedBy || []);
  if (muted) mutedBy.add(userId);
  else mutedBy.delete(userId);
  return store.update('conversations', conversationId, { mutedBy: [...mutedBy] });
}

export async function softDeleteMessage(store, userId, messageId) {
  const message = store.collection('messages').find((item) => item.id === messageId);
  if (!message) throw notFound('消息不存在');
  const conversation = store.collection('conversations').find((item) => item.id === message.conversationId);
  if (!conversation?.memberIds.includes(userId)) throw forbidden('不能删除不属于自己的消息');
  const deletedFor = new Set(message.deletedFor || []);
  deletedFor.add(userId);
  return store.update('messages', messageId, { deletedFor: [...deletedFor] });
}
