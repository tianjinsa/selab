import { posts, postTabs } from '~/utils/campusData';

Page({
  data: {
    tabs: postTabs,
    activeTab: '推荐',
    posts,
    hotTopics: ['期末周', '校园跑', '课程设计', '二手教材', '搭子'],
    stats: [
      { label: '今日新帖', value: 36 },
      { label: '活跃话题', value: 18 },
      { label: '待回复求助', value: 7 },
    ],
  },
  onLoad(option) {
    if (option.oper) {
      wx.showToast({ title: option.oper === 'release' ? '发布成功' : '保存成功', icon: 'success' });
    }
  },
  onTabChange(event) {
    this.setData({ activeTab: event.detail.value });
  },
  goRelease() {
    wx.navigateTo({ url: '/pages/release/index' });
  },
  likePost(event) {
    const { id } = event.currentTarget.dataset;
    const nextPosts = this.data.posts.map((item) => (item.id === id ? { ...item, likes: item.likes + 1 } : item));
    this.setData({ posts: nextPosts });
    wx.showToast({ title: '已点赞', icon: 'success' });
  },
  favoritePost() {
    wx.showToast({ title: '已收藏', icon: 'success' });
  },
  sharePost() {
    wx.showToast({ title: '已生成分享卡片', icon: 'none' });
  },
});
