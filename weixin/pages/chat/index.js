import request from '~/api/request';
import { listFrom, unwrap } from '~/utils/api';

const app = getApp();

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
      content: item.content,
      card: item.card,
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

  scrollToBottom() {
    this.setData({ anchor: 'bottom' });
  },
});
