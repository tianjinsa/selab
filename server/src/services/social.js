const store = require('./store');

function ensureFollowing(user) {
  if (!user) return [];
  if (!Array.isArray(user.following)) user.following = [];
  return user.following;
}

function follows(user, targetUserId) {
  return ensureFollowing(user).includes(targetUserId);
}

function setFollowing(user, targetUserId, following) {
  const list = ensureFollowing(user);
  const index = list.indexOf(targetUserId);
  if (following && index < 0) list.push(targetUserId);
  if (!following && index >= 0) list.splice(index, 1);
  return following;
}

function isMutual(data, userId, targetUserId) {
  const user = store.getUser(data, userId);
  const target = store.getUser(data, targetUserId);
  return Boolean(user && target && follows(user, targetUserId) && follows(target, userId));
}

function mutualFriends(data, userId) {
  const user = store.getUser(data, userId);
  const following = ensureFollowing(user);
  return data.users
    .filter((item) => item.id !== userId && following.includes(item.id) && follows(item, userId))
    .map((item) => store.withoutPassword(item));
}

function findOrCreateConversation(data, currentUserId, targetUserId, source, relatedCard) {
  let conversation = data.conversations.find((item) => {
    return item.participantIds.includes(currentUserId) && item.participantIds.includes(targetUserId);
  });
  if (!conversation) {
    conversation = {
      id: store.id('conv'),
      participantIds: [currentUserId, targetUserId],
      mutedBy: [],
      source,
      relatedCard,
      updatedAt: store.now()
    };
    data.conversations.unshift(conversation);
  }
  return conversation;
}

module.exports = {
  ensureFollowing,
  follows,
  setFollowing,
  isMutual,
  mutualFriends,
  findOrCreateConversation
};
