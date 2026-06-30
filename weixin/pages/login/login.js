import request from '~/api/request';
import { unwrap } from '~/utils/api';

const app = getApp();

function getErrorMessage(error, fallback = '操作失败，请稍后重试') {
  const body = error && error.data;
  return (body && (body.message || body.detail)) || error.message || fallback;
}

Page({
  data: {
    account: '',
    password: '',
    errorText: '',
    loading: false,
    demoAccounts: [
      { label: '学生演示', account: '20260001', password: '123456Aa' },
      { label: '管理员', account: 'admin', password: '123456Aa' },
    ],
  },

  onAccountInput(event) {
    this.setData({ account: event.detail.value || '', errorText: '' });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value || '', errorText: '' });
  },

  useDemoAccount(event) {
    const { index } = event.currentTarget.dataset;
    const demo = this.data.demoAccounts[Number(index)] || this.data.demoAccounts[0];
    this.setData({ account: demo.account, password: demo.password, errorText: '' });
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/index' });
  },

  submitLogin() {
    if (this.data.loading) return;
    const account = this.data.account.trim();
    const password = this.data.password.trim();
    if (!account) {
      wx.showToast({ title: '请输入账号', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true, errorText: '' });
    request('/auth/login', 'POST', { account, password })
      .then((res) => {
        const login = unwrap(res);
        wx.setStorageSync('access_token', login.token);
        wx.removeStorageSync('manual_logout');
        app.globalData.userInfo = login.user;
        app.getUnreadNum();
        app.connect();
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/my/index' });
        }, 500);
      })
      .catch((error) => {
        const message = getErrorMessage(error, '登录失败，请检查账号和密码');
        this.setData({ errorText: message });
        wx.showToast({ title: message, icon: 'none' });
      })
      .finally(() => this.setData({ loading: false }));
  },
});
