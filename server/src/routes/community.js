const express = require('express');
const auth = require('../services/auth');
const social = require('../services/social');
const store = require('../services/store');
const socketHub = require('../services/socketHub');
const { ok, fail } = require('../response');

const router = express.Router();

function containsSensitive(data, text) {
  return data.settings.sensitiveWords.find((word) => String(text || '').includes(word));
}

function filterPosts(data, query) {
  let list = data.posts.filter((item) => item.status === '已发布');
  if (query.keyword) {
    const key = String(query.keyword).toLowerCase();
    list = list.filter((item) => `${item.title} ${item.content} ${item.topics.join(' ')}`.toLowerCase().includes(key));
  }
  if (query.topic) list = list.filter((item) => item.topics.includes(query.topic));
  if (query.authorId) list = list.filter((item) => item.authorId === query.authorId);
  if (query.rank === 'hot') {
    list = list.sort((a, b) => b.views + b.likes.length * 10 + b.shares * 3 - (a.views + a.likes.length * 10 + a.shares * 3));
  } else {
    list = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return list;
}

router.get('/posts', (req, res) => {
  const data = store.load();
  return ok(res, filterPosts(data, req.query).map((item) => store.publicPost(data, item)));
});

router.post('/posts', auth.requireAuth, (req, res) => {
  const sensitive = containsSensitive(req.data, `${req.body.title} ${req.body.content}`);
  if (sensitive) return fail(res, 400, `内容包含敏感词：${sensitive}`);
  const post = {
    id: store.id('post'),
    authorId: req.user.id,
    title: req.body.title,
    content: req.body.content,
    type: req.body.type || '图文',
    topics: req.body.topics || [],
    images: req.body.images || [],
    likes: [],
    favorites: [],
    shares: 0,
    views: 0,
    status: '已发布',
    createdAt: store.now()
  };
  req.data.posts.unshift(post);
  store.audit(req.data, { type: 'community', title: '发布帖子', actorId: req.user.id });
  store.save(req.data);
  return ok(res, store.publicPost(req.data, post), '帖子发布成功');
});

router.get('/posts/:id', (req, res) => {
  const data = store.load();
  const post = data.posts.find((item) => item.id === req.params.id);
  if (!post) return fail(res, 404, '帖子不存在');
  post.views += 1;
  store.save(data);
  return ok(res, store.publicPost(data, post));
});

router.post('/posts/:id/like', auth.requireAuth, (req, res) => {
  const post = req.data.posts.find((item) => item.id === req.params.id);
  if (!post) return fail(res, 404, '帖子不存在');
  const index = post.likes.indexOf(req.user.id);
  if (index >= 0) post.likes.splice(index, 1);
  else {
    post.likes.push(req.user.id);
    if (post.authorId !== req.user.id) {
      store.addNotification(req.data, {
        userId: post.authorId,
        type: '点赞提醒',
        title: `${req.user.nickname} 赞了你的帖子`,
        content: post.title,
        relatedType: 'post',
        relatedId: post.id
      });
    }
  }
  store.save(req.data);
  return ok(res, store.publicPost(req.data, post));
});

router.post('/posts/:id/favorite', auth.requireAuth, (req, res) => {
  const post = req.data.posts.find((item) => item.id === req.params.id);
  if (!post) return fail(res, 404, '帖子不存在');
  const index = post.favorites.indexOf(req.user.id);
  if (index >= 0) post.favorites.splice(index, 1);
  else post.favorites.push(req.user.id);
  store.save(req.data);
  return ok(res, store.publicPost(req.data, post));
});

router.post('/posts/:id/share', auth.requireAuth, (req, res) => {
  const post = req.data.posts.find((item) => item.id === req.params.id);
  if (!post) return fail(res, 404, '帖子不存在');
  const targetUserId = req.body.targetUserId;
  const target = store.getUser(req.data, targetUserId);
  if (!target) return fail(res, 404, '转发好友不存在');
  if (!social.isMutual(req.data, req.user.id, targetUserId)) return fail(res, 403, '只能转发给互关好友');
  const author = store.getUser(req.data, post.authorId);
  const card = {
    type: 'postShare',
    targetType: 'post',
    targetId: post.id,
    title: post.title,
    summary: post.content,
    cover: (post.images || [])[0] || '',
    authorName: (author && author.nickname) || '同学',
    sharedBy: req.user.id,
    createdAt: store.now()
  };
  const conversation = social.findOrCreateConversation(req.data, req.user.id, targetUserId, '社区论坛', card);
  const message = {
    id: store.id('msg'),
    conversationId: conversation.id,
    fromUserId: req.user.id,
    type: 'card',
    content: req.body.message || `分享了帖子「${post.title}」`,
    card,
    readBy: [req.user.id],
    createdAt: store.now()
  };
  post.shares = Number(post.shares || 0) + 1;
  conversation.relatedCard = card;
  conversation.updatedAt = message.createdAt;
  req.data.messages.push(message);
  store.addNotification(req.data, {
    userId: targetUserId,
    type: '帖子分享',
    title: `${req.user.nickname} 转发了一篇帖子给你`,
    content: post.title,
    relatedType: 'post',
    relatedId: post.id
  });
  store.save(req.data);
  socketHub.broadcastToUser(targetUserId, { type: 'message', data: { conversationId: conversation.id, message } });
  return ok(res, { post: store.publicPost(req.data, post), conversation, message }, '已转发');
});

router.post('/posts/:id/comments', auth.requireAuth, (req, res) => {
  const post = req.data.posts.find((item) => item.id === req.params.id);
  if (!post) return fail(res, 404, '帖子不存在');
  const sensitive = containsSensitive(req.data, req.body.content);
  if (sensitive) return fail(res, 400, `评论包含敏感词：${sensitive}`);
  const comment = {
    id: store.id('comment'),
    postId: post.id,
    authorId: req.user.id,
    content: req.body.content,
    likes: [],
    parentId: req.body.parentId || '',
    createdAt: store.now()
  };
  req.data.comments.push(comment);
  if (post.authorId !== req.user.id) {
    store.addNotification(req.data, {
      userId: post.authorId,
      type: '评论回复',
      title: `${req.user.nickname} 评论了你的帖子`,
      content: req.body.content,
      relatedType: 'post',
      relatedId: post.id
    });
  }
  const mentions = String(req.body.content).match(/@[\u4e00-\u9fa5A-Za-z0-9_]+/g) || [];
  mentions.forEach((name) => {
    const target = req.data.users.find((item) => `@${item.nickname}` === name);
    if (target) {
      store.addNotification(req.data, {
        userId: target.id,
        type: '@提醒',
        title: `${req.user.nickname} 在评论中提到了你`,
        content: req.body.content,
        relatedType: 'post',
        relatedId: post.id
      });
    }
  });
  store.save(req.data);
  return ok(res, { ...comment, author: store.withoutPassword(req.user) }, '评论成功');
});

router.post('/comments/:id/like', auth.requireAuth, (req, res) => {
  const comment = req.data.comments.find((item) => item.id === req.params.id);
  if (!comment) return fail(res, 404, '评论不存在');
  const index = comment.likes.indexOf(req.user.id);
  if (index >= 0) comment.likes.splice(index, 1);
  else comment.likes.push(req.user.id);
  store.save(req.data);
  return ok(res, comment);
});

router.get('/functions/search', (req, res) => {
  const data = store.load();
  return ok(res, filterPosts(data, req.query).map((item) => store.publicPost(data, item)));
});

module.exports = router;
