import request from '~/api/request';
import { getImage, listFrom, unwrap } from '~/utils/api';

Page({
  data: {
    categories: ['全部'],
    activeCategory: '全部',
    keyword: '',
    goods: [],
    filteredGoods: [],
    featured: null,
    metrics: [
      { label: '在售商品', value: 0 },
      { label: '担保订单', value: 1 },
      { label: '待审核', value: 0 },
    ],
    loading: true,
  },

  onLoad() {
    this.loadGoods();
  },

  onShow() {
    this.loadGoods();
  },

  loadGoods() {
    this.setData({ loading: true });
    request('/market/goods')
      .then((res) => {
        const goods = listFrom(res).map((item) => ({
          ...item,
          cover: getImage(item.images, '/static/home/card2.png'),
          sellerName: (item.seller && item.seller.nickname) || '卖家',
          sellerCredit: (item.seller && item.seller.creditLevel) || 'A',
        }));
        const categories = ['全部', ...Array.from(new Set(goods.map((item) => item.category)))];
        this.setData(
          {
            goods,
            categories,
            featured: goods[0] || null,
            metrics: [
              { label: '在售商品', value: goods.length },
              { label: '担保订单', value: 1 },
              { label: '待审核', value: goods.filter((item) => item.auditStatus === '待审核').length },
            ],
            loading: false,
          },
          this.applyFilter,
        );
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '商品加载失败', icon: 'none' });
      });
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
      const matchedKeyword = !key || `${item.name}${item.category}${item.location}${item.description}`.includes(key);
      return matchedCategory && matchedKeyword;
    });
    this.setData({ filteredGoods });
  },

  publishGoods() {
    wx.navigateTo({ url: '/pages/market/publish/index' });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/market/detail/index?id=${event.currentTarget.dataset.id}` });
  },

  favoriteGoods(event) {
    request(`/market/goods/${event.currentTarget.dataset.id}/favorite`, 'POST')
      .then(() => wx.showToast({ title: '已收藏', icon: 'success' }))
      .catch(() => wx.showToast({ title: '收藏失败', icon: 'none' }));
  },

  consultSeller(event) {
    const { sellerId, goodsId, name } = event.currentTarget.dataset;
    request('/messages/conversations', 'POST', {
      targetUserId: sellerId,
      source: '二手市场',
      relatedCard: { type: 'goods', id: goodsId, title: name, action: '商品咨询' },
    })
      .then((res) => wx.navigateTo({ url: `/pages/chat/index?conversationId=${unwrap(res).id}` }))
      .catch(() => wx.showToast({ title: '无法进入私信', icon: 'none' }));
  },

  createOrder(event) {
    const { id, name } = event.currentTarget.dataset;
    request(`/market/goods/${id}/orders`, 'POST')
      .then((res) => {
        const order = unwrap(res);
        wx.showModal({
          title: '订单已创建',
          content: `你正在购买「${name}」。平台担保交易将托管资金，确认收货后再打款给卖家。`,
          confirmText: '模拟支付',
          success: (modal) => {
            if (modal.confirm) {
              request(`/market/orders/${order.id}/pay`, 'POST', { method: '微信支付' }).then(() => {
                wx.showToast({ title: '支付成功', icon: 'success' });
              });
            }
          },
        });
      })
      .catch(() => wx.showToast({ title: '下单失败', icon: 'none' }));
  },
});
