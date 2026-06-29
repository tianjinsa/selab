import request from '~/api/request';
import { formatTime, getImage, listFrom, unwrap } from '~/utils/api';

const app = getApp();

function mapComment(item) {
  const author = item.author || {};
  return {
    ...item,
    authorName: author.nickname || '同学',
    avatar: author.avatar || '/static/avatar1.png',
    likeCount: Array.isArray(item.likes) ? item.likes.length : 0,
    publishTime: formatTime(item.createdAt),
    replies: [],
  };
}

function mapFriend(item) {
  return {
    ...item,
    avatar: item.avatar || '/static/avatar1.png',
    desc: `信用 ${item.creditLevel || 'A'} · ${item.creditScore || 90} 分`,
  };
}

function mapPost(item, user = {}) {
  const author = item.author || {};
  const likes = Array.isArray(item.likes) ? item.likes : [];
  const favorites = Array.isArray(item.favorites) ? item.favorites : [];
  const following = Array.isArray(user.following) ? user.following : [];
  const authorId = author.id || item.authorId;
  return {
    ...item,
    authorName: author.nickname || '同学',
    authorId,
    avatar: author.avatar || '/static/avatar1.png',
    cover: getImage(item.images, '/static/home/card0.png'),
    likeCount: likes.length,
    favoriteCount: favorites.length,
    commentCount: Number(item.commentCount || (item.comments || []).length || 0),
    shareCount: Number(item.shares || 0),
    liked: likes.includes(user.id),
    favorited: favorites.includes(user.id),
    followingAuthor: following.includes(authorId),
    isMine: authorId === user.id,
    publishTime: formatTime(item.createdAt),
  };
}

function buildComments(comments) {
  const mapped = comments.map(mapComment);
  const byId = {};
  mapped.forEach((item) => {
    byId[item.id] = item;
  });
  mapped.forEach((item) => {
    if (item.parentId && byId[item.parentId]) byId[item.parentId].replies.push(item);
  });
  return mapped.filter((item) => !item.parentId);
}

Page({
  data: {
    id: '',
    post: null,
    comments: [],
    input: '',
    focusInput: false,
    loading: true,
    submitting: false,
    shareVisible: false,
    shareFriends: [],
    shareLoading: false,
    sharing: false,
  },

  async onLoad(options) {
    await app.ensureLogin();
    this.setData({ id: options.id || '', focusInput: options.focus === '1' });
    this.loadDetail();
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/index' });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const post = mapPost(unwrap(await request(`/community/posts/${this.data.id}`)), app.globalData.userInfo || {});
      this.setData({
        post,
        comments: buildComments(post.comments || []),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '帖子加载失败', icon: 'none' });
    }
  },

  onInput(event) {
    this.setData({ input: event.detail.value });
  },

  submitComment() {
    const content = this.data.input.trim();
    if (!content || this.data.submitting) return;
    this.setData({ submitting: true });
    request(`/community/posts/${this.data.id}/comments`, 'POST', { content })
      .then(() => {
        this.setData({ input: '', submitting: false, focusInput: false });
        wx.showToast({ title: '评论成功', icon: 'success' });
        this.loadDetail();
      })
      .catch(() => {
        this.setData({ submitting: false });
        wx.showToast({ title: '评论失败', icon: 'none' });
      });
  },

  likePost() {
    request(`/community/posts/${this.data.id}/like`, 'POST')
      .then((res) => this.setData({ post: mapPost(unwrap(res), app.globalData.userInfo || {}) }))
      .catch(() => wx.showToast({ title: '点赞失败', icon: 'none' }));
  },

  favoritePost() {
    request(`/community/posts/${this.data.id}/favorite`, 'POST')
      .then((res) => this.setData({ post: mapPost(unwrap(res), app.globalData.userInfo || {}) }))
      .catch(() => wx.showToast({ title: '收藏失败', icon: 'none' }));
  },

  toggleFollow() {
    const { post } = this.data;
    if (!post || post.isMine) return;
    const nextFollowing = !post.followingAuthor;
    request(`/users/${post.authorId}/follow`, 'PUT', { following: nextFollowing })
      .then((res) => {
        const data = unwrap(res);
        if (data.me) app.globalData.userInfo = data.me;
        this.setData({ post: mapPost(this.data.post, app.globalData.userInfo || {}) });
      })
      .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
  },

  sharePost() {
    this.setData({ shareVisible: true, shareLoading: true });
    request('/users/mutual-friends')
      .then((res) => this.setData({ shareFriends: listFrom(res).map(mapFriend), shareLoading: false }))
      .catch(() => {
        this.setData({ shareFriends: [], shareLoading: false });
        wx.showToast({ title: '好友加载失败', icon: 'none' });
      });
  },

  closeShareSheet() {
    this.setData({ shareVisible: false, sharing: false });
  },

  onShareVisibleChange(event) {
    const visible = typeof event.detail === 'boolean' ? event.detail : event.detail.visible;
    if (visible) return;
    this.closeShareSheet();
  },

  selectShareFriend(event) {
    if (this.data.sharing) return;
    const { userId } = event.currentTarget.dataset;
    if (!userId) return;
    this.setData({ sharing: true });
    request(`/community/posts/${this.data.id}/share`, 'POST', { targetUserId: userId })
      .then((res) => {
        const data = unwrap(res);
        if (data.post) this.setData({ post: mapPost(data.post, app.globalData.userInfo || {}) });
        this.setData({ shareVisible: false, sharing: false });
        wx.showToast({ title: '已转发', icon: 'success' });
      })
      .catch(() => {
        this.setData({ sharing: false });
        wx.showToast({ title: '转发失败', icon: 'none' });
      });
  },
});
