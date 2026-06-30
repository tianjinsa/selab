import request from '~/api/request';
import { getImage, listFrom, unwrap } from '~/utils/api';

const app = getApp();

function mapGoods(item, user = {}, favoriteIds = new Set()) {
  const favorites = Array.isArray(item.favorites) ? item.favorites : [];
  return {
    ...item,
    cover: getImage(item.images),
    sellerName: (item.seller && item.seller.nickname) || '卖家',
    sellerCredit: (item.seller && item.seller.creditLevel) || 'A',
    favoriteCount: favorites.length,
    favorited: favorites.includes(user.id) || favoriteIds.has(item.id),
  };
}

function buildMineSummary(data = {}) {
  return [
    { label: '我的求购', value: (data.requestedGoods || []).length, tab: 'requested', icon: 'chat' },
    { label: '我的发布', value: (data.publishedGoods || []).length, tab: 'published', icon: 'shop' },
    { label: '我的收藏', value: (data.favoriteGoods || []).length, tab: 'favorites', icon: 'star' },
  ];
}

Page({
  data: {
    goods: [],
    filteredGoods: [],
    mineSummary: buildMineSummary(),
    loading: true,
  },

  onLoad() {
    this.loadGoods();
  },

  onShow() {
    this.loadGoods();
  },

  async loadGoods() {
    this.setData({ loading: true });
    try {
      const [goodsRes, mineRes] = await Promise.all([request('/market/goods'), request('/market/mine').catch(() => null)]);
      const user = app.globalData.userInfo || {};
      const mineData = unwrap(mineRes) || {};
      const favoriteIds = new Set((mineData.favoriteGoods || []).map((item) => item.id));
      const goods = listFrom(goodsRes).map((item) => mapGoods(item, user, favoriteIds));
      this.setData({
        goods,
        filteredGoods: goods,
        mineSummary: buildMineSummary(mineData),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '商品加载失败', icon: 'none' });
    }
  },

  openSearch() {
    wx.navigateTo({ url: '/pages/search/index?mode=market' });
  },

  openCategoryPage() {
    wx.navigateTo({ url: '/pages/market/category/index' });
  },

  publishGoods() {
    wx.navigateTo({ url: '/pages/market/publish/index' });
  },

  openMine(event) {
    wx.navigateTo({ url: `/pages/market/manage/index?tab=${event.currentTarget.dataset.tab || 'requested'}` });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/market/detail/index?id=${event.currentTarget.dataset.id}` });
  },

  favoriteGoods(event) {
    const { id } = event.currentTarget.dataset;
    app.ensureLogin()
      .then((user) => request(`/market/goods/${id}/favorite`, 'POST').then((res) => ({ res, user })))
      .then(({ res, user }) => {
        const nextGoods = mapGoods(unwrap(res), user);
        const goods = this.data.goods.map((item) => (item.id === id ? nextGoods : item));
        const filteredGoods = this.data.filteredGoods.map((item) => (item.id === id ? nextGoods : item));
        this.setData({ goods, filteredGoods });
        this.loadMineSummary();
        wx.showToast({ title: nextGoods.favorited ? '已收藏' : '已取消收藏', icon: 'success' });
      })
      .catch(() => wx.showToast({ title: '收藏失败', icon: 'none' }));
  },

  loadMineSummary() {
    request('/market/mine')
      .then((res) => {
        const data = unwrap(res) || {};
        const favoriteIds = new Set((data.favoriteGoods || []).map((item) => item.id));
        const user = app.globalData.userInfo || {};
        const goods = this.data.goods.map((item) => mapGoods(item, user, favoriteIds));
        const filteredGoods = this.data.filteredGoods.map((item) => mapGoods(item, user, favoriteIds));
        this.setData({ goods, filteredGoods, mineSummary: buildMineSummary(data) });
      })
      .catch(() => this.setData({ mineSummary: buildMineSummary() }));
  },

  consultSeller(event) {
    const { goodsId, name } = event.currentTarget.dataset;
    this.requestGoods(goodsId, `我想咨询「${name}」，可以聊聊交易细节吗？`);
  },

  createOrder(event) {
    const { id, name } = event.currentTarget.dataset;
    this.requestGoods(id, `我想购买「${name}」，等待卖家确认。`);
  },

  requestGoods(id, message) {
    request(`/market/goods/${id}/request`, 'POST', { message })
      .then((res) => {
        const data = unwrap(res);
        wx.showToast({ title: '已发送求购卡片', icon: 'none' });
        wx.navigateTo({ url: `/pages/chat/index?conversationId=${data.conversation.id}` });
      })
      .catch(() => wx.showToast({ title: '发送失败', icon: 'none' }));
  },
});
