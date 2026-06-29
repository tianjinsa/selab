import request from '~/api/request';
import { getImage, unwrap } from '~/utils/api';

Page({
  data: {
    goods: null,
    cover: '',
  },

  onLoad(options) {
    this.loadGoods(options.id);
  },

  loadGoods(id) {
    request(`/market/goods/${id}`)
      .then((res) => {
        const goods = unwrap(res);
        this.setData({ goods, cover: getImage(goods.images, '/static/home/card2.png') });
      })
      .catch(() => wx.showToast({ title: '商品不存在', icon: 'none' }));
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/market/index' });
  },

  consultSeller() {
    const { goods } = this.data;
    if (!goods || !goods.seller) return;
    request('/messages/conversations', 'POST', {
      targetUserId: goods.seller.id,
      source: '二手市场',
      relatedCard: { type: 'goods', id: goods.id, title: goods.name, action: '商品咨询' },
    })
      .then((res) => wx.navigateTo({ url: `/pages/chat/index?conversationId=${unwrap(res).id}` }))
      .catch(() => wx.showToast({ title: '无法进入私信', icon: 'none' }));
  },

  createOrder() {
    const { goods } = this.data;
    if (!goods) return;
    request(`/market/goods/${goods.id}/orders`, 'POST')
      .then((res) => {
        const order = unwrap(res);
        wx.showModal({
          title: '订单已创建',
          content: '平台将先托管付款，确认收货后再打款给卖家。',
          confirmText: '模拟支付',
          success: (modal) => {
            if (modal.confirm) request(`/market/orders/${order.id}/pay`, 'POST').then(() => wx.showToast({ title: '支付成功', icon: 'success' }));
          },
        });
      })
      .catch(() => wx.showToast({ title: '下单失败', icon: 'none' }));
  },
});
