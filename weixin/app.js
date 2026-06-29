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

    await this.ensureLogin();
    this.getUnreadNum();
    this.connect();
  },

  globalData: {
    userInfo: null,
    unreadNum: 0,
    socket: null,
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
    const socket = wx.connectSocket({ url: `${config.socketUrl}?token=${token}` });
    socket.onMessage((event) => {
      const data = JSON.parse(event.data || '{}');
      if (data.type === 'message') this.setUnreadNum(this.globalData.unreadNum + 1);
      this.eventBus.emit('socket-message', data);
    });
    this.globalData.socket = socket;
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
