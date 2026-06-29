import request from '~/api/request';
import { formatTime, getImage, listFrom, unwrap } from '~/utils/api';

const app = getApp();

const postTabs = ['推荐', '热门', '求助', '经验分享', '校园生活'];

function mapFriend(item) {
  return {
    ...item,
    avatar: item.avatar || '/static/avatar1.png',
    desc: `信用 ${item.creditLevel || 'A'} · ${item.creditScore || 90} 分`,
  };
}

function mapPost(item, index = 0, user = {}) {
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
    coverHeight: 220 + ((index % 3) * 42),
  };
}

function buildColumns(posts) {
  const heights = [0, 0];
  const columns = [[], []];
  posts.forEach((item) => {
    const target = heights[0] <= heights[1] ? 0 : 1;
    columns[target].push(item);
    heights[target] += item.coverHeight + 220 + Math.ceil(String(item.content || '').length / 12) * 20;
  });
  return columns;
}

Page({
  data: {
    tabs: postTabs,
    activeTab: '推荐',
    posts: [],
    filteredPosts: [],
    columns: [[], []],
    hotTopics: [],
    stats: [
      { label: '今日新帖', value: 0 },
      { label: '活跃话题', value: 0 },
      { label: '待回复求助', value: 0 },
    ],
    loading: true,
    shareVisible: false,
    shareFriends: [],
    sharePostId: '',
    shareLoading: false,
    sharing: false,
  },

  onLoad(option) {
    if (option.oper) {
      wx.showToast({ title: option.oper === 'release' ? '发布成功' : '保存成功', icon: 'success' });
    }
    this.loadPosts();
  },

  onShow() {
    this.loadPosts();
  },

  async loadPosts() {
    this.setData({ loading: true });
    try {
      const user = await app.ensureLogin();
      const posts = listFrom(await request('/community/posts')).map((item, index) => mapPost(item, index, user));
      const topics = posts.reduce((result, post) => result.concat(post.topics || []), []);
      const hotTopics = Array.from(new Set(topics)).slice(0, 8);
      const today = new Date().toISOString().slice(0, 10);
      this.setData(
        {
          posts,
          hotTopics,
          stats: [
            { label: '今日新帖', value: posts.filter((item) => String(item.createdAt || '').startsWith(today)).length },
            { label: '活跃话题', value: hotTopics.length },
            { label: '待回复求助', value: posts.filter((item) => item.type === '求助' && !item.commentCount).length },
          ],
          loading: false,
        },
        this.applyFilter,
      );
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '帖子加载失败', icon: 'none' });
    }
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.value }, this.applyFilter);
  },

  applyFilter() {
    const { activeTab, posts } = this.data;
    let filteredPosts = posts.slice();
    if (activeTab === '热门') {
      filteredPosts = filteredPosts.sort((a, b) => b.views + b.likeCount * 10 - (a.views + a.likeCount * 10));
    } else if (activeTab !== '推荐') {
      filteredPosts = filteredPosts.filter((item) => item.type === activeTab || (item.topics || []).includes(activeTab));
    }
    this.setData({ filteredPosts, columns: buildColumns(filteredPosts) });
  },

  goRelease() {
    wx.navigateTo({ url: '/pages/release/index' });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/community/detail/index?id=${event.currentTarget.dataset.id}` });
  },

  commentPost(event) {
    wx.navigateTo({ url: `/pages/community/detail/index?id=${event.currentTarget.dataset.id}&focus=1` });
  },

  likePost(event) {
    const { id } = event.currentTarget.dataset;
    request(`/community/posts/${id}/like`, 'POST')
      .then((res) => {
        const postIndex = this.data.posts.findIndex((item) => item.id === id);
        const nextPost = mapPost(unwrap(res), Math.max(postIndex, 0), app.globalData.userInfo || {});
        const posts = this.data.posts.map((item) => (item.id === id ? nextPost : item));
        this.setData({ posts }, this.applyFilter);
      })
      .catch(() => wx.showToast({ title: '点赞失败', icon: 'none' }));
  },

  favoritePost(event) {
    const { id } = event.currentTarget.dataset;
    request(`/community/posts/${id}/favorite`, 'POST')
      .then((res) => {
        const postIndex = this.data.posts.findIndex((item) => item.id === id);
        const nextPost = mapPost(unwrap(res), Math.max(postIndex, 0), app.globalData.userInfo || {});
        const posts = this.data.posts.map((item) => (item.id === id ? nextPost : item));
        this.setData({ posts }, this.applyFilter);
      })
      .catch(() => wx.showToast({ title: '收藏失败', icon: 'none' }));
  },

  toggleFollow(event) {
    const { authorId, following } = event.currentTarget.dataset;
    const nextFollowing = Number(following) !== 1;
    request(`/users/${authorId}/follow`, 'PUT', { following: nextFollowing })
      .then((res) => {
        const data = unwrap(res);
        if (data.me) app.globalData.userInfo = data.me;
        const user = app.globalData.userInfo || {};
        const posts = this.data.posts.map((item, index) => mapPost(item, index, user));
        this.setData({ posts }, this.applyFilter);
      })
      .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
  },

  sharePost(event) {
    const { id } = event.currentTarget.dataset;
    this.setData({ shareVisible: true, sharePostId: id, shareLoading: true });
    request('/users/mutual-friends')
      .then((res) => this.setData({ shareFriends: listFrom(res).map(mapFriend), shareLoading: false }))
      .catch(() => {
        this.setData({ shareFriends: [], shareLoading: false });
        wx.showToast({ title: '好友加载失败', icon: 'none' });
      });
  },

  closeShareSheet() {
    this.setData({ shareVisible: false, sharePostId: '', sharing: false });
  },

  onShareVisibleChange(event) {
    const visible = typeof event.detail === 'boolean' ? event.detail : event.detail.visible;
    if (visible) return;
    this.closeShareSheet();
  },

  selectShareFriend(event) {
    if (this.data.sharing) return;
    const { userId } = event.currentTarget.dataset;
    const { sharePostId } = this.data;
    if (!userId || !sharePostId) return;
    this.setData({ sharing: true });
    request(`/community/posts/${sharePostId}/share`, 'POST', { targetUserId: userId })
      .then((res) => {
        const data = unwrap(res);
        if (data.post) {
          const postIndex = this.data.posts.findIndex((item) => item.id === sharePostId);
          const nextPost = mapPost(data.post, Math.max(postIndex, 0), app.globalData.userInfo || {});
          const posts = this.data.posts.map((item) => (item.id === sharePostId ? nextPost : item));
          this.setData({ posts }, this.applyFilter);
        }
        this.setData({ shareVisible: false, sharePostId: '', sharing: false });
        wx.showToast({ title: '已转发', icon: 'success' });
      })
      .catch(() => {
        this.setData({ sharing: false });
        wx.showToast({ title: '转发失败', icon: 'none' });
      });
  },
});
