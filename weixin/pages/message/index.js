import request from '~/api/request';
import { listFrom } from '~/utils/api';

const app = getApp();

Page({
  data: {
    conversations: [],
    loading: true,
  },

  onLoad() {
    this.socketMessageHandler = this.handleSocketMessage.bind(this);
    this.getMessageList();
    app.eventBus.on('socket-message', this.socketMessageHandler);
  },

  onUnload() {
    app.eventBus.off('socket-message', this.socketMessageHandler);
  },

  onShow() {
    this.getMessageList();
  },

  handleSocketMessage() {
    this.getMessageList();
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/my/index' });
  },

  getMessageList() {
    this.setData({ loading: true });
    request('/messages/conversations')
      .then((res) => {
        const conversations = listFrom(res).map((item) => ({
          ...item,
          title: (item.peer && item.peer.nickname) || '会话',
          avatar: (item.peer && item.peer.avatar) || '/static/avatar1.png',
          desc:
            (item.lastMessage && item.lastMessage.card && item.lastMessage.card.title) ||
            (item.lastMessage && item.lastMessage.content) ||
            (item.relatedCard && item.relatedCard.title) ||
            '暂无消息',
        }));
        const unreadNum = conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
        app.setUnreadNum(unreadNum);
        this.setData({ conversations, loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '消息加载失败', icon: 'none' });
      });
  },

  toChat(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/chat/index?conversationId=${id}` });
  },

  markAllRead() {
    Promise.all(this.data.conversations.map((item) => request(`/messages/conversations/${item.id}/read`, 'PUT')))
      .then(() => {
        wx.showToast({ title: '已全部标记已读', icon: 'success' });
        this.getMessageList();
      })
      .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }));
  },
});
