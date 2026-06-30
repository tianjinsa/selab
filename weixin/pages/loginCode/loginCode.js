import request from '~/api/request';
import { unwrap } from '~/utils/api';

const app = getApp();

Page({
  data: {
    phoneNumber: '',
    sendCodeCount: 60,
    verifyCode: '',
  },

  timer: null,

  onLoad(options) {
    const { phoneNumber } = options;
    if (phoneNumber) {
      this.setData({ phoneNumber });
    }
    this.countDown();
  },

  onVerifycodeChange(e) {
    this.setData({
      verifyCode: e.detail.value,
    });
  },

  countDown() {
    this.setData({ sendCodeCount: 60 });
    this.timer = setInterval(() => {
      if (this.data.sendCodeCount <= 0) {
        this.setData({ isSend: false, sendCodeCount: 0 });
        clearInterval(this.timer);
      } else {
        this.setData({ sendCodeCount: this.data.sendCodeCount - 1 });
      }
    }, 1000);
  },

  sendCode() {
    if (this.data.sendCodeCount === 0) {
      this.countDown();
    }
  },

  async login() {
    if (this.data.verifyCode !== '123456') {
      wx.showToast({ title: '验证码为 123456', icon: 'none' });
      return;
    }
    try {
      const login = unwrap(await request('/auth/login', 'POST', { account: this.data.phoneNumber, password: '123456Aa' }));
      wx.setStorageSync('access_token', login.token);
      wx.removeStorageSync('manual_logout');
      app.globalData.userInfo = login.user;
      app.getUnreadNum();
      app.connect();
      wx.switchTab({ url: '/pages/my/index' });
    } catch (error) {
      wx.showToast({ title: '手机号未注册', icon: 'none' });
    }
  },
});
