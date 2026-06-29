import request from '~/api/request';
import { formatTime, getImage, unwrap } from '~/utils/api';

function mapGoods(item, orders = []) {
  const order = orders.find((candidate) => candidate.goodsId === item.id);
  return {
    ...item,
    cover: getImage(item.images, '/static/home/card2.png'),
    time: formatTime(item.createdAt),
    sellerName: (item.seller && item.seller.nickname) || '卖家',
    orderStatus: order ? order.status : '',
  };
}

Page({
  data: {
    activeTab: 'requested',
    requestedGoods: [],
    publishedGoods: [],
    currentGoods: [],
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
      const data = unwrap(await request('/market/mine')) || {};
      const orders = data.orders || [];
      this.setData(
        {
          requestedGoods: (data.requestedGoods || []).map((item) => mapGoods(item, orders)),
          publishedGoods: (data.publishedGoods || []).map((item) => mapGoods(item, orders)),
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
    const currentGoods = this.data.activeTab === 'requested' ? this.data.requestedGoods : this.data.publishedGoods;
    this.setData({ currentGoods });
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.value }, this.refreshList);
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
