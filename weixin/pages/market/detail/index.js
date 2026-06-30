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
        this.setData({ goods, cover: getImage(goods.images) });
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
    this.requestGoods(`我想咨询「${goods.name}」，可以聊聊交易细节吗？`);
  },

  createOrder() {
    const { goods } = this.data;
    if (!goods) return;
    this.requestGoods(`我想购买「${goods.name}」，等待卖家确认。`);
  },

  requestGoods(message) {
    const { goods } = this.data;
    request(`/market/goods/${goods.id}/request`, 'POST', { message })
      .then((res) => {
        const data = unwrap(res);
        wx.showToast({ title: '已发送求购卡片', icon: 'none' });
        wx.navigateTo({ url: `/pages/chat/index?conversationId=${data.conversation.id}` });
      })
      .catch(() => wx.showToast({ title: '发送失败', icon: 'none' }));
  },
});
