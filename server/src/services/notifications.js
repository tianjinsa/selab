function now() {
  return new Date().toISOString();
}

export async function createNotification(store, payload, realtime = null) {
  const notification = await store.insert('notifications', {
    userId: payload.userId,
    type: payload.type || 'system',
    title: payload.title,
    body: payload.body || '',
    link: payload.link || '',
    sourceId: payload.sourceId || '',
    isRead: false
  });
  if (realtime) {
    realtime.sendToUser(payload.userId, 'notification.new', notification);
    const count = countUnread(store, payload.userId);
    realtime.sendToUser(payload.userId, 'notification.unread_count', { count });
  }
  return notification;
}

export function countUnread(store, userId) {
  return store.collection('notifications')
    .filter((item) => item.userId === userId && !item.isRead && !item.deletedAt)
    .length;
}

export function listNotifications(store, userId, type = '') {
  return store.collection('notifications')
    .filter((item) => item.userId === userId && !item.deletedAt)
    .filter((item) => !type || item.type === type)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function markNotificationRead(store, userId, id) {
  const item = store.collection('notifications')
    .find((notification) => notification.id === id && notification.userId === userId);
  if (!item) return null;
  return store.update('notifications', id, { isRead: true, readAt: now() });
}

export async function markNotificationsReadByLink(store, userId, link, type = '') {
  const notifications = store.collection('notifications');
  let changed = false;
  for (const item of notifications) {
    if (
      item.userId === userId
      && !item.deletedAt
      && !item.isRead
      && item.link === link
      && (!type || item.type === type)
    ) {
      item.isRead = true;
      item.readAt = now();
      item.updatedAt = now();
      changed = true;
    }
  }
  if (changed) await store.saveCollection('notifications');
  return countUnread(store, userId);
}

export async function markAllNotificationsRead(store, userId, type = '') {
  const notifications = store.collection('notifications');
  let changed = false;
  for (const item of notifications) {
    if (item.userId === userId && !item.deletedAt && !item.isRead && (!type || item.type === type)) {
      item.isRead = true;
      item.readAt = now();
      item.updatedAt = now();
      changed = true;
    }
  }
  if (changed) await store.saveCollection('notifications');
  return countUnread(store, userId);
}

export async function deleteNotification(store, userId, id) {
  const item = store.collection('notifications')
    .find((notification) => notification.id === id && notification.userId === userId);
  if (!item) return null;
  return store.update('notifications', id, { deletedAt: now() });
}
