import request from '~/api/request';
import { formatTime, getImage, unwrap } from '~/utils/api';

const app = getApp();

function mapPost(item) {
  return {
    ...item,
    cover: getImage(item.images),
    time: formatTime(item.createdAt),
    likeCount: (item.likes || []).length,
    favoriteCount: (item.favorites || []).length,
    commentCount: Number(item.commentCount || (item.comments || []).length || 0),
  };
}

Page({
  data: {
    activeTab: 'interacted',
    interactedPosts: [],
    publishedPosts: [],
    currentPosts: [],
    loading: true,
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      await app.ensureLogin();
      const data = unwrap(await request('/community/mine')) || {};
      this.setData(
        {
          interactedPosts: (data.interactedPosts || []).map(mapPost),
          publishedPosts: (data.publishedPosts || []).map(mapPost),
          loading: false,
        },
        this.refreshList,
      );
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '社区后台加载失败', icon: 'none' });
    }
  },

  refreshList() {
    const currentPosts = this.data.activeTab === 'interacted' ? this.data.interactedPosts : this.data.publishedPosts;
    this.setData({ currentPosts });
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.value }, this.refreshList);
  },

  publishPost() {
    wx.navigateTo({ url: '/pages/release/index' });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/community/detail/index?id=${event.currentTarget.dataset.id}` });
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/index' });
  },
});
