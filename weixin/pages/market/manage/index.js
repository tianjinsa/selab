import request from '~/api/request';
import { formatTime, getImage, unwrap } from '~/utils/api';

const app = getApp();

function mapGoods(item, orders = []) {
  const order = orders.find((candidate) => candidate.goodsId === item.id);
  const favorites = Array.isArray(item.favorites) ? item.favorites : [];
  return {
    ...item,
    cover: getImage(item.images, '/static/home/card2.png'),
    time: formatTime(item.createdAt),
    sellerName: (item.seller && item.seller.nickname) || '卖家',
    favoriteCount: favorites.length,
    orderStatus: order ? order.status : '',
  };
}

function getTabValue(value) {
  return ['requested', 'published', 'favorites'].includes(value) ? value : 'requested';
}

Page({
  data: {
    activeTab: 'requested',
    requestedGoods: [],
    publishedGoods: [],
    favoriteGoods: [],
    currentGoods: [],
    summary: [
      { label: '我的求购', value: 0, tab: 'requested' },
      { label: '我的发布', value: 0, tab: 'published' },
      { label: '我的收藏', value: 0, tab: 'favorites' },
    ],
    emptyText: '暂无交易记录',
    loading: true,
  },

  onLoad(options = {}) {
    this.setData({ activeTab: getTabValue(options.tab) });
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      await app.ensureLogin();
      const data = unwrap(await request('/market/mine')) || {};
      const orders = data.orders || [];
      this.setData(
        {
          requestedGoods: (data.requestedGoods || []).map((item) => mapGoods(item, orders)),
          publishedGoods: (data.publishedGoods || []).map((item) => mapGoods(item, orders)),
          favoriteGoods: (data.favoriteGoods || []).map((item) => mapGoods(item, orders)),
          loading: false,
        },
        this.refreshList,
      );
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '交易后台加载失败', icon: 'none' });
    }
  },

  refreshList() {
    const lists = {
      requested: this.data.requestedGoods,
      published: this.data.publishedGoods,
      favorites: this.data.favoriteGoods,
    };
    const emptyTextMap = {
      requested: '暂无求购记录',
      published: '暂无发布记录',
      favorites: '暂无收藏商品',
    };
    this.setData({
      currentGoods: lists[this.data.activeTab] || [],
      emptyText: emptyTextMap[this.data.activeTab] || '暂无交易记录',
      summary: [
        { label: '我的求购', value: this.data.requestedGoods.length, tab: 'requested' },
        { label: '我的发布', value: this.data.publishedGoods.length, tab: 'published' },
        { label: '我的收藏', value: this.data.favoriteGoods.length, tab: 'favorites' },
      ],
    });
  },

  onTabChange(event) {
    const value = (event.detail && event.detail.value) || event.currentTarget.dataset.value;
    this.setData({ activeTab: getTabValue(value) }, this.refreshList);
  },

  publishGoods() {
    wx.navigateTo({ url: '/pages/market/publish/index' });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/market/detail/index?id=${event.currentTarget.dataset.id}` });
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/market/index' });
  },
});
