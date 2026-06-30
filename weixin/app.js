import config from './config';
import request from './api/request';
import createBus from './utils/eventBus';
import { listFrom, unwrap } from './utils/api';

App({
  async onLaunch() {
    const updateManager = wx.getUpdateManager();

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) updateManager.applyUpdate();
        },
      });
    });

    try {
      await this.ensureLogin();
      this.getUnreadNum();
      this.connect();
    } catch (error) {
      this.setUnreadNum(0);
    }
  },

  globalData: {
    userInfo: null,
    unreadNum: 0,
    socket: null,
    socketReconnectTimer: null,
    pendingTabTransition: null,
  },

  eventBus: createBus(),

  async ensureLogin() {
    const token = wx.getStorageSync('access_token');
    if (token) {
      try {
        const me = unwrap(await request('/auth/me'));
        this.globalData.userInfo = me;
        return me;
      } catch (error) {
        wx.removeStorageSync('access_token');
      }
    }

    if (wx.getStorageSync('manual_logout')) {
      const error = new Error('请先登录');
      error.needLogin = true;
      throw error;
    }

    const login = unwrap(
      await request('/auth/login', 'POST', {
        account: config.demoAccount,
        password: config.demoPassword,
      }),
    );
    wx.setStorageSync('access_token', login.token);
    this.globalData.userInfo = login.user;
    return login.user;
  },

  connect() {
    const token = wx.getStorageSync('access_token');
    if (!token) return;
    if (this.globalData.socketReconnectTimer) {
      clearTimeout(this.globalData.socketReconnectTimer);
      this.globalData.socketReconnectTimer = null;
    }
    if (this.globalData.socket && this.globalData.socket.close) this.globalData.socket.close({});
    const socket = wx.connectSocket({ url: `${config.socketUrl}?token=${token}` });
    socket.onMessage((event) => {
      const data = JSON.parse(event.data || '{}');
      if (data.type === 'message') this.setUnreadNum(this.globalData.unreadNum + 1);
      this.eventBus.emit('socket-message', data);
    });
    socket.onClose(() => {
      if (this.globalData.socket !== socket) return;
      if (!wx.getStorageSync('access_token') || wx.getStorageSync('manual_logout')) return;
      this.globalData.socketReconnectTimer = setTimeout(() => this.connect(), 1600);
    });
    this.globalData.socket = socket;
  },

  logout() {
    if (this.globalData.socketReconnectTimer) {
      clearTimeout(this.globalData.socketReconnectTimer);
      this.globalData.socketReconnectTimer = null;
    }
    if (this.globalData.socket && this.globalData.socket.close) this.globalData.socket.close({});
    wx.removeStorageSync('access_token');
    wx.setStorageSync('manual_logout', true);
    this.globalData.userInfo = null;
    this.globalData.socket = null;
    this.setUnreadNum(0);
    wx.navigateTo({ url: '/pages/login/login' });
  },

  getUnreadNum() {
    request('/messages/conversations')
      .then((res) => {
        const unreadNum = listFrom(res).reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
        this.setUnreadNum(unreadNum);
      })
      .catch(() => this.setUnreadNum(0));
  },

  setUnreadNum(unreadNum) {
    this.globalData.unreadNum = unreadNum;
    this.eventBus.emit('unread-num-change', unreadNum);
  },
});
