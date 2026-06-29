import request from '~/api/request';
import { listFrom, unwrap } from '~/utils/api';

const app = getApp();

const statusTextMap = {
  pending: '待处理',
  accepted: '已同意',
  rejected: '已拒绝',
  expired: '已过期',
  superseded: '已过期',
};

const cardTypeTextMap = {
  taskApply: '任务申请',
  goodsPurchase: '商品求购',
  postShare: '帖子分享',
};

const statusThemeMap = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  expired: 'default',
  superseded: 'default',
};

function mapCard(card, myUserId, content = '') {
  if (!card) return null;
  if (card.type === 'postShare') {
    return {
      ...card,
      targetType: 'post',
      status: 'shared',
      typeText: cardTypeTextMap[card.type],
      statusText: '点击查看',
      statusTheme: 'primary',
      summaryText: card.summary || content,
      passive: true,
      canAct: false,
      waiting: false,
      expiredLike: false,
    };
  }
  const status = card.status || 'pending';
  const isOwner = card.ownerId === myUserId;
  const isRequester = card.requesterId === myUserId;
  const targetType = card.targetType || (card.type === 'goodsPurchase' ? 'goods' : 'task');
  return {
    ...card,
    targetType,
    status,
    typeText: cardTypeTextMap[card.type] || '特殊消息',
    statusText: card.actionMessage || statusTextMap[status] || '待处理',
    statusTheme: statusThemeMap[status] || 'default',
    summaryText: card.summary || content,
    isOwner,
    isRequester,
    canAct: isOwner && status === 'pending',
    waiting: isRequester && status === 'pending',
    expiredLike: status === 'expired' || status === 'superseded',
  };
}

Page({
  data: {
    myAvatar: '/static/chat/avatar.png',
    myUserId: '',
    conversationId: '',
    avatar: '',
    name: '会话',
    messages: [],
    input: '',
    anchor: '',
    keyboardHeight: 0,
  },

  async onLoad(options) {
    await app.ensureLogin();
    const user = app.globalData.userInfo || {};
    this.socketMessageHandler = this.handleSocketMessage.bind(this);
    this.setData({
      myUserId: user.id,
      myAvatar: user.avatar || '/static/chat/avatar.png',
      conversationId: options.conversationId || '',
      name: options.name ? decodeURIComponent(options.name) : '会话',
      avatar: options.avatar ? decodeURIComponent(options.avatar) : '',
    });
    this.loadConversation();
    app.eventBus.on('socket-message', this.socketMessageHandler);
  },

  onUnload() {
    app.eventBus.off('socket-message', this.socketMessageHandler);
  },

  handleSocketMessage(data) {
    if (data && data.data && data.data.conversationId === this.data.conversationId) this.loadMessages();
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.navigateTo({ url: '/pages/message/index' });
  },

  async loadConversation() {
    const conversations = listFrom(await request('/messages/conversations'));
    const conversation = conversations.find((item) => item.id === this.data.conversationId);
    if (conversation) {
      const peer = conversation.peer || {};
      this.setData({
        name: peer.nickname || this.data.name,
        avatar: peer.avatar || this.data.avatar,
      });
    }
    await this.loadMessages();
    request(`/messages/conversations/${this.data.conversationId}/read`, 'PUT').then(() => app.getUnreadNum());
  },

  async loadMessages() {
    const data = unwrap(await request(`/messages/conversations/${this.data.conversationId}/messages?pageSize=80`));
    const messages = (data.list || []).map((item) => ({
      id: item.id,
      from: item.fromUserId === this.data.myUserId ? 0 : 1,
      type: item.type || 'text',
      content: item.content,
      card: mapCard(item.card, this.data.myUserId, item.content),
      time: new Date(item.createdAt).getTime(),
    }));
    this.setData({ messages });
    wx.nextTick(() => this.scrollToBottom());
  },

  handleKeyboardHeightChange(event) {
    const { height } = event.detail;
    if (!height) return;
    this.setData({ keyboardHeight: height });
    wx.nextTick(() => this.scrollToBottom());
  },

  handleBlur() {
    this.setData({ keyboardHeight: 0 });
  },

  handleInput(event) {
    this.setData({ input: event.detail.value });
  },

  sendMessage() {
    const content = this.data.input.trim();
    if (!content) return;
    request(`/messages/conversations/${this.data.conversationId}/messages`, 'POST', { content, type: 'text' })
      .then(() => {
        this.setData({ input: '' });
        return this.loadMessages();
      })
      .catch(() => wx.showToast({ title: '发送失败', icon: 'none' }));
  },

  openCardDetail(event) {
    const { targetType, targetId } = event.currentTarget.dataset;
    if (!targetId) return;
    const routes = {
      goods: `/pages/market/detail/index?id=${targetId}`,
      post: `/pages/community/detail/index?id=${targetId}`,
      task: `/pages/task/detail/index?id=${targetId}`,
    };
    const url = routes[targetType] || routes.task;
    wx.navigateTo({ url });
  },

  handleCardAction(event) {
    const { messageId, action } = event.currentTarget.dataset;
    if (!messageId || !action) return;
    request(`/messages/conversations/${this.data.conversationId}/messages/${messageId}/card-action`, 'POST', { action })
      .then(() => this.loadMessages())
      .catch((error) => {
        const message = (error.data && error.data.message) || '操作失败';
        wx.showToast({ title: message, icon: 'none' });
        this.loadMessages();
      });
  },

  scrollToBottom() {
    this.setData({ anchor: 'bottom' });
  },
});
