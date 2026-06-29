import request from '~/api/request';
import { formatTime, getImage, unwrap } from '~/utils/api';

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

function mapPost(item) {
  const author = item.author || {};
  const likes = Array.isArray(item.likes) ? item.likes : [];
  return {
    ...item,
    authorName: author.nickname || '同学',
    avatar: author.avatar || '/static/avatar1.png',
    cover: getImage(item.images, '/static/home/card0.png'),
    likeCount: likes.length,
    favoriteCount: Array.isArray(item.favorites) ? item.favorites.length : 0,
    commentCount: Number(item.commentCount || (item.comments || []).length || 0),
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
      const post = mapPost(unwrap(await request(`/community/posts/${this.data.id}`)));
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
      .then((res) => this.setData({ post: mapPost(unwrap(res)) }))
      .catch(() => wx.showToast({ title: '点赞失败', icon: 'none' }));
  },

  favoritePost() {
    request(`/community/posts/${this.data.id}/favorite`, 'POST')
      .then(() => wx.showToast({ title: '已收藏', icon: 'success' }))
      .catch(() => wx.showToast({ title: '收藏失败', icon: 'none' }));
  },

  sharePost() {
    request(`/community/posts/${this.data.id}/share`, 'POST')
      .then(() => wx.showToast({ title: '已生成分享卡片', icon: 'none' }))
      .catch(() => wx.showToast({ title: '分享失败', icon: 'none' }));
  },
});
