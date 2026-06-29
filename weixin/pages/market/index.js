import { goods, goodsCategories } from '~/utils/campusData';

Page({
  data: {
    categories: goodsCategories,
    activeCategory: '全部',
    keyword: '',
    goods,
    filteredGoods: goods,
    orderSteps: ['创建订单', '买家付款', '卖家交付', '确认收货', '双方评价'],
  },
  selectCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.name }, this.applyFilter);
  },
  onSearch(event) {
    this.setData({ keyword: event.detail.value }, this.applyFilter);
  },
  applyFilter() {
    const { activeCategory, keyword } = this.data;
    const key = keyword.trim();
    const filteredGoods = this.data.goods.filter((item) => {
      const matchedCategory = activeCategory === '全部' || item.category === activeCategory;
      const matchedKeyword = !key || `${item.name}${item.category}${item.location}`.includes(key);
      return matchedCategory && matchedKeyword;
    });
    this.setData({ filteredGoods });
  },
  publishGoods() {
    wx.showToast({ title: '商品已提交审核', icon: 'success' });
  },
  favoriteGoods(event) {
    const { id } = event.currentTarget.dataset;
    wx.showToast({ title: `已收藏 ${id.slice(-4)}`, icon: 'success' });
  },
  consultSeller() {
    wx.navigateTo({ url: '/pages/message/index' });
  },
  createOrder(event) {
    const { name } = event.currentTarget.dataset;
    wx.showModal({
      title: '订单已创建',
      content: `你正在购买「${name}」。平台担保交易将托管资金，确认收货后再打款给卖家。`,
      confirmText: '模拟支付',
      success: (res) => {
        if (res.confirm) wx.showToast({ title: '支付成功', icon: 'success' });
      },
    });
  },
});
