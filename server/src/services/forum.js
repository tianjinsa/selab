import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { randomUUID } from 'node:crypto';
import { assertCleanContent } from '../utils/content.js';
import { createNotification } from './notifications.js';

function now() {
  return new Date().toISOString();
}

function userBrief(store, userId) {
  const user = store.collection('users').find((item) => item.id === userId);
  if (!user) return null;
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    creditScore: user.creditScore
  };
}

function assertCanPost(user) {
  if (user.isBanned) throw forbidden('账号已封禁，不能发帖');
  if (user.isMuted) throw forbidden('账号已禁言，不能发帖或评论');
  if (user.isPublishRestricted) throw forbidden('账号已被限制发布，不能发帖');
}

function normalizeTags(store, tags) {
  const next = (Array.isArray(tags) ? tags : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  for (const tag of next) {
    if (tag.length > 20) throw badRequest('单个 Tag 最长 20 个字符');
    assertCleanContent(store, tag);
  }
  return [...new Set(next)];
}

function normalizePostImageUrls(imageUrls) {
  return (Array.isArray(imageUrls) ? imageUrls : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => item.startsWith('/uploads/'))
    .slice(0, 9);
}

export async function createPost(store, user, body) {
  assertCanPost(user);
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title) throw badRequest('请输入帖子标题');
  if (!content) throw badRequest('请输入正文内容');
  assertCleanContent(store, title, content);
  const tags = normalizeTags(store, body.tags);
  const imageUrls = normalizePostImageUrls(body.imageUrls);
  const post = await store.insert('posts', {
    authorId: user.id,
    title,
    content,
    type: body.type || '经验分享帖',
    imageUrls,
    visibility: body.visibility || 'public',
    moderationStatus: 'pending',
    moderationReason: '',
    moderationCheckedAt: '',
    moderationRejectedAt: '',
    viewCount: 0,
    shareCount: 0,
    deletedAt: ''
  });
  await savePostTags(store, post.id, tags);
  return decoratePost(store, post, user.id, true);
}

export function listPosts(store, query = {}, viewerId = '') {
  let posts = store.collection('posts')
    .filter((post) => !post.deletedAt && post.visibility === 'public');
  if (query.keyword) {
    const keyword = String(query.keyword).trim();
    posts = posts.filter((post) => `${post.title} ${post.content}`.includes(keyword));
  }
  if (query.tag) {
    posts = posts.filter((post) => postTags(store, post.id).includes(query.tag));
  }
  if (query.authorId) posts = posts.filter((post) => post.authorId === query.authorId);
  const decorated = posts.map((post) => decoratePost(store, post, viewerId));
  if (query.sort === 'recommended') {
    return decorated.sort((a, b) => compareRecommended(
      recommendationScore(store, a, viewerId, query.recommendSeed),
      recommendationScore(store, b, viewerId, query.recommendSeed),
      a,
      b,
      (post) => post.createdAt
    ));
  }
  if (query.sort === 'hot') {
    return decorated.sort((a, b) => heatScore(b) - heatScore(a));
  }
  return decorated.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function listFavoritePosts(store, userId) {
  const posts = store.collection('posts');
  return store.collection('postFavorites')
    .filter((item) => item.userId === userId)
    .map((favorite) => {
      const post = posts.find((item) => item.id === favorite.postId && !item.deletedAt && item.visibility === 'public');
      return post ? { ...decoratePost(store, post, userId), favoritedAt: favorite.createdAt } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.favoritedAt || '').localeCompare(String(a.favoritedAt || '')));
}

export function forumStudio(store, userId) {
  const posts = store.collection('posts')
    .filter((post) => post.authorId === userId && !post.deletedAt)
    .map((post) => decoratePost(store, post, userId, false))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const stats = posts.reduce((acc, post) => {
    acc.total += 1;
    acc.views += Number(post.viewCount || 0);
    acc.likes += Number(post.likeCount || 0);
    acc.comments += Number(post.commentCount || 0);
    acc.favorites += Number(post.favoriteCount || 0);
    acc.shares += Number(post.shareCount || 0);
    const status = post.moderationStatus || 'approved';
    acc[status] = Number(acc[status] || 0) + 1;
    if (post.visibility !== 'public') acc.hidden += 1;
    return acc;
  }, {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    hidden: 0,
    views: 0,
    likes: 0,
    comments: 0,
    favorites: 0,
    shares: 0
  });
  return { stats, posts };
}

export async function resubmitRejectedPost(store, user, postId, body) {
  assertCanPost(user);
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  if (post.authorId !== user.id) throw forbidden('只能修改自己发布的帖子');
  if (post.moderationStatus !== 'rejected') throw badRequest('只有审核未通过的帖子可以修改后重发');
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title) throw badRequest('请输入帖子标题');
  if (!content) throw badRequest('请输入正文内容');
  assertCleanContent(store, title, content);
  const tags = normalizeTags(store, body.tags);
  const imageUrls = normalizePostImageUrls(body.imageUrls);
  const updated = await store.update('posts', post.id, {
    title,
    content,
    type: body.type || post.type || '经验分享帖',
    imageUrls,
    visibility: 'public',
    moderationStatus: 'pending',
    moderationReason: '',
    moderationCheckedAt: '',
    moderationRejectedAt: ''
  });
  await savePostTags(store, post.id, tags);
  return decoratePost(store, updated, user.id, true);
}

export async function updateOwnPostVisibility(store, user, postId, visible) {
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  if (post.authorId !== user.id) throw forbidden('只能管理自己发布的帖子');
  if (visible && post.moderationStatus === 'rejected') {
    throw badRequest('违规打回帖子需要修改后重新提交审核');
  }
  const updated = await store.update('posts', post.id, {
    visibility: visible ? 'public' : 'hidden'
  });
  return decoratePost(store, updated, user.id, true);
}

export async function deleteOwnPost(store, user, postId) {
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  if (post.authorId !== user.id) throw forbidden('只能删除自己发布的帖子');
  await store.update('posts', post.id, {
    visibility: 'hidden',
    deletedAt: now()
  });
  return { ok: true };
}

export function listFollowingUsers(store, userId) {
  const users = store.collection('users');
  return store.collection('follows')
    .filter((item) => item.followerId === userId)
    .map((follow) => {
      const target = users.find((item) => item.id === follow.followingId && !item.isBanned);
      if (!target) return null;
      const publicPosts = store.collection('posts')
        .filter((post) => post.authorId === target.id && !post.deletedAt && post.visibility === 'public')
        .map((post) => decoratePost(store, post, userId))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return {
        ...userBrief(store, target.id),
        studentId: target.studentId,
        bio: target.bio,
        contact: target.contact,
        followedAt: follow.createdAt,
        stats: userStats(store, target.id),
        recentPosts: publicPosts.slice(0, 3)
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.followedAt || '').localeCompare(String(a.followedAt || '')));
}

export function getPostDetail(store, postId, viewerId = '', options = {}) {
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  if (post.visibility !== 'public' && post.authorId !== viewerId) throw notFound('帖子不存在');
  if (options.trackView !== false) {
    post.viewCount = Number(post.viewCount || 0) + 1;
    store.saveCollection('posts').catch(() => {});
  }
  return decoratePost(store, post, viewerId, true);
}

export async function togglePostLike(store, realtime, user, postId) {
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  const likes = store.collection('postLikes');
  const existing = likes.find((item) => item.postId === postId && item.userId === user.id);
  if (existing) {
    await store.replaceCollection('postLikes', likes.filter((item) => item.id !== existing.id));
    return { liked: false };
  }
  await store.insert('postLikes', { postId, userId: user.id });
  if (post.authorId !== user.id) {
    await createNotification(store, {
      userId: post.authorId,
      type: 'forum',
      title: '帖子收到点赞',
      body: `${user.nickname} 点赞了「${post.title}」`,
      link: `/forum/${post.id}`,
      sourceId: post.id
    }, realtime);
  }
  return { liked: true };
}

export async function togglePostFavorite(store, realtime, user, postId) {
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  const favorites = store.collection('postFavorites');
  const existing = favorites.find((item) => item.postId === postId && item.userId === user.id);
  if (existing) {
    await store.replaceCollection('postFavorites', favorites.filter((item) => item.id !== existing.id));
    return { favorited: false };
  }
  await store.insert('postFavorites', { postId, userId: user.id });
  if (post.authorId !== user.id) {
    await createNotification(store, {
      userId: post.authorId,
      type: 'forum',
      title: '帖子被收藏',
      body: `${user.nickname} 收藏了「${post.title}」`,
      link: `/forum/${post.id}`,
      sourceId: post.id
    }, realtime);
  }
  return { favorited: true };
}

export async function sharePost(store, postId) {
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  await store.update('posts', post.id, { shareCount: Number(post.shareCount || 0) + 1 });
  return { shareUrl: `/forum/${post.id}` };
}

export async function toggleFollow(store, realtime, user, targetId) {
  if (user.id === targetId) throw badRequest('不能关注自己');
  const target = store.collection('users').find((item) => item.id === targetId && !item.isBanned);
  if (!target) throw notFound('用户不存在');
  const follows = store.collection('follows');
  const existing = follows.find((item) => item.followerId === user.id && item.followingId === targetId);
  if (existing) {
    await store.replaceCollection('follows', follows.filter((item) => item.id !== existing.id));
    return { followed: false };
  }
  await store.insert('follows', { followerId: user.id, followingId: targetId });
  await createNotification(store, {
    userId: targetId,
    type: 'forum',
    title: '新增关注',
    body: `${user.nickname} 关注了你`,
    link: `/forum?authorId=${user.id}`,
    sourceId: user.id
  }, realtime);
  return { followed: true };
}

export async function createComment(store, realtime, user, postId, body) {
  assertCanPost(user);
  const post = store.collection('posts').find((item) => item.id === postId && !item.deletedAt);
  if (!post) throw notFound('帖子不存在');
  const content = String(body.content || '').trim();
  if (!content) throw badRequest('评论内容不能为空');
  assertCleanContent(store, content);
  const parentId = body.parentId || '';
  if (parentId && !store.collection('comments').some((item) => item.id === parentId && item.postId === postId && !item.deletedAt)) {
    throw badRequest('回复的评论不存在');
  }
  const comment = await store.insert('comments', {
    postId,
    parentId,
    authorId: user.id,
    content,
    likeUserIds: [],
    deletedAt: ''
  });
  const notifyUserId = parentId
    ? store.collection('comments').find((item) => item.id === parentId)?.authorId
    : post.authorId;
  if (notifyUserId && notifyUserId !== user.id) {
    await createNotification(store, {
      userId: notifyUserId,
      type: 'forum',
      title: parentId ? '收到评论回复' : '帖子收到评论',
      body: `${user.nickname}：${content.slice(0, 40)}`,
      link: `/forum/${post.id}`,
      sourceId: comment.id
    }, realtime);
  }
  return decorateComment(store, comment);
}

export async function toggleCommentLike(store, user, commentId) {
  const comment = store.collection('comments').find((item) => item.id === commentId && !item.deletedAt);
  if (!comment) throw notFound('评论不存在');
  const likeSet = new Set(comment.likeUserIds || []);
  if (likeSet.has(user.id)) likeSet.delete(user.id);
  else likeSet.add(user.id);
  await store.update('comments', comment.id, { likeUserIds: [...likeSet] });
  return { liked: likeSet.has(user.id), count: likeSet.size };
}

export async function createForumReport(store, user, type, targetId, reason) {
  const target = type === 'post'
    ? store.collection('posts').find((item) => item.id === targetId && !item.deletedAt)
    : store.collection('comments').find((item) => item.id === targetId && !item.deletedAt);
  if (!target) throw notFound('举报对象不存在');
  if (!String(reason || '').trim()) throw badRequest('请填写举报原因');
  return store.insert('reports', {
    type,
    targetId,
    reporterId: user.id,
    reason: String(reason).trim(),
    status: 'pending'
  });
}

export function forumRankings(store, range = 'day', viewerId = '') {
  const nowTime = Date.now();
  const maxAge = range === 'day' ? 1 : range === 'week' ? 7 : 3650;
  return listPosts(store, {}, viewerId)
    .filter((post) => range === 'all' || (nowTime - new Date(post.createdAt).getTime()) <= maxAge * 24 * 60 * 60 * 1000)
    .sort((a, b) => heatScore(b, range) - heatScore(a, range))
    .slice(0, 20);
}

export function wordCloud(store) {
  const counts = new Map();
  for (const item of store.collection('postTags')) {
    counts.set(item.name, (counts.get(item.name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 40);
}

export async function generateForumSummary(store, force = false) {
  const existing = store.collection('forumAiSummaries')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (existing && !force) return existing;
  const topTags = wordCloud(store).slice(0, 5).map((item) => item.text);
  const hotPosts = forumRankings(store, 'week').slice(0, 3).map((item) => item.title);
  const summary = topTags.length
    ? `本周社区讨论集中在 ${topTags.join('、')}。热门内容包括：${hotPosts.join('；') || '暂无明显热门帖'}。`
    : '本周社区数据较少，暂未形成稳定热点。';
  return store.insert('forumAiSummaries', {
    title: '社区热点总结',
    summary,
    source: 'local-ai-fallback'
  });
}

export function listForumReports(store) {
  return store.collection('reports')
    .filter((item) => ['post', 'comment'].includes(item.type))
    .map((item) => ({
      ...item,
      reporter: userBrief(store, item.reporterId),
      target: reportTarget(store, item)
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function resolveForumReport(store, reportId, body) {
  const report = store.collection('reports').find((item) => item.id === reportId);
  if (!report) throw notFound('举报不存在');
  const valid = Boolean(body.valid);
  const target = report.type === 'post'
    ? store.collection('posts').find((item) => item.id === report.targetId)
    : store.collection('comments').find((item) => item.id === report.targetId);
  if (valid && target) {
    target.deletedAt = now();
    target.updatedAt = now();
    if (report.type === 'post') await store.saveCollection('posts');
    else await store.saveCollection('comments');
    await changeCredit(store, target.authorId, -4, `${report.type === 'post' ? '社区帖子' : '评论'}举报属实`);
  }
  await store.update('reports', report.id, {
    status: valid ? 'resolved_valid' : 'resolved_rejected',
    handledAt: now(),
    result: body.result || (valid ? '举报属实，内容已删除' : '举报驳回')
  });
  await store.insert('adminLogs', {
    operator: 'admin',
    action: 'resolve_forum_report',
    targetType: 'report',
    targetId: report.id,
    detail: { valid, result: body.result || '' }
  });
  return report;
}

function decoratePost(store, post, viewerId = '', detail = false) {
  const likes = store.collection('postLikes').filter((item) => item.postId === post.id);
  const favorites = store.collection('postFavorites').filter((item) => item.postId === post.id);
  const comments = store.collection('comments').filter((item) => item.postId === post.id && !item.deletedAt);
  const decorated = {
    ...post,
    author: userBrief(store, post.authorId),
    tags: postTags(store, post.id),
    likeCount: likes.length,
    favoriteCount: favorites.length,
    commentCount: comments.length,
    liked: viewerId ? likes.some((item) => item.userId === viewerId) : false,
    favorited: viewerId ? favorites.some((item) => item.userId === viewerId) : false,
    followedAuthor: viewerId ? store.collection('follows').some((item) => item.followerId === viewerId && item.followingId === post.authorId) : false
  };
  if (detail) {
    const top = comments.filter((item) => !item.parentId).map((comment) => decorateComment(store, comment));
    const replies = comments.filter((item) => item.parentId).map((comment) => decorateComment(store, comment));
    decorated.comments = top.map((comment) => ({
      ...comment,
      replies: replies.filter((reply) => reply.parentId === comment.id)
    }));
  }
  return decorated;
}

function decorateComment(store, comment) {
  return {
    ...comment,
    author: userBrief(store, comment.authorId),
    likeCount: (comment.likeUserIds || []).length
  };
}

function postTags(store, postId) {
  return store.collection('postTags')
    .filter((item) => item.postId === postId)
    .map((item) => item.name);
}

async function savePostTags(store, postId, tags) {
  const allTags = store.collection('tags');
  for (const name of tags) {
    if (!allTags.some((item) => item.name === name)) {
      allTags.push({ id: randomUUID(), name, createdAt: now(), updatedAt: now() });
    }
  }
  await store.saveCollection('tags');
  const remaining = store.collection('postTags').filter((item) => item.postId !== postId);
  const next = tags.map((name) => ({ id: randomUUID(), postId, name, createdAt: now(), updatedAt: now() }));
  await store.replaceCollection('postTags', [...remaining, ...next]);
}

function heatScore(post, range = 'all') {
  const base = Number(post.viewCount || 0)
    + Number(post.likeCount || 0) * 3
    + Number(post.commentCount || 0) * 5
    + Number(post.favoriteCount || 0) * 4
    + Number(post.shareCount || 0) * 6;
  if (range !== 'all') return base;
  const ageDays = Math.max(1, (Date.now() - new Date(post.createdAt).getTime()) / (24 * 60 * 60 * 1000));
  return base / Math.sqrt(ageDays);
}

function recommendationScore(store, post, viewerId = '', seed = '') {
  const ageHours = Math.max(1, (Date.now() - new Date(post.createdAt).getTime()) / (60 * 60 * 1000));
  const recency = 28 / Math.sqrt(ageHours);
  const followBoost = viewerId && store.collection('follows').some((item) => item.followerId === viewerId && item.followingId === post.authorId) ? 18 : 0;
  const likedTagNames = new Set(
    store.collection('postFavorites')
      .filter((item) => item.userId === viewerId)
      .flatMap((item) => postTags(store, item.postId))
  );
  const tagBoost = (post.tags || []).filter((tag) => likedTagNames.has(tag)).length * 5;
  return heatScore(post) + recency + followBoost + tagBoost + stableJitter(post.id, seed);
}

function stableJitter(id = '', seed = '') {
  const value = `${seed}:${id}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1009;
  }
  return hash / 1009;
}

function compareRecommended(scoreA, scoreB, itemA, itemB, timeGetter) {
  const scoreDiff = scoreB - scoreA;
  if (scoreDiff !== 0) return scoreDiff;
  const timeDiff = String(timeGetter(itemB) || '').localeCompare(String(timeGetter(itemA) || ''));
  if (timeDiff !== 0) return timeDiff;
  return String(itemB.id || '').localeCompare(String(itemA.id || ''));
}

function reportTarget(store, report) {
  if (report.type === 'post') {
    const post = store.collection('posts').find((item) => item.id === report.targetId);
    return post ? { title: post.title, author: userBrief(store, post.authorId), deletedAt: post.deletedAt } : null;
  }
  const comment = store.collection('comments').find((item) => item.id === report.targetId);
  return comment ? { title: comment.content.slice(0, 40), author: userBrief(store, comment.authorId), deletedAt: comment.deletedAt } : null;
}

function userStats(store, userId) {
  const posts = store.collection('posts').filter((item) => item.authorId === userId && !item.deletedAt && item.visibility === 'public');
  const follows = store.collection('follows');
  return {
    postCount: posts.length,
    followerCount: follows.filter((item) => item.followingId === userId).length,
    followingCount: follows.filter((item) => item.followerId === userId).length
  };
}

async function changeCredit(store, userId, change, reason) {
  const user = store.collection('users').find((item) => item.id === userId);
  if (!user) return null;
  const before = user.creditScore;
  const after = Math.max(0, Math.min(10, before + change));
  await store.update('users', userId, { creditScore: after });
  return store.insert('userCreditLogs', {
    userId,
    change,
    before,
    after,
    reason,
    operator: 'admin'
  });
}
