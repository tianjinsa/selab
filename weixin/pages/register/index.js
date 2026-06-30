import request from '~/api/request';
import { unwrap } from '~/utils/api';

const app = getApp();

function getErrorMessage(error, fallback = '操作失败，请稍后重试') {
  const body = error && error.data;
  return (body && (body.message || body.detail)) || error.message || fallback;
}

Page({
  data: {
    invitationCode: 'CAMPUS2026',
    inviteHint: '默认演示邀请码，可由管理员生成新的邀请码。',
    account: '',
    nickname: '',
    password: '',
    confirmPassword: '',
    phone: '',
    studentNo: '',
    errorText: '',
    loading: false,
    checkingInvite: false,
  },

  onLoad() {
    this.checkInviteCode();
  },

  updateField(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [field]: event.detail.value || '', errorText: '' });
  },

  onInviteBlur() {
    this.checkInviteCode();
  },

  checkInviteCode() {
    const code = this.data.invitationCode.trim();
    if (!code) {
      this.setData({ inviteHint: '请输入管理员提供的邀请码。' });
      return;
    }
    this.setData({ checkingInvite: true, inviteHint: '邀请码验证中...' });
    request(`/auth/validate-invite-code?code=${encodeURIComponent(code)}`)
      .then((res) => {
        const data = unwrap(res);
        this.setData({
          inviteHint: data.valid ? `邀请码可用，剩余 ${Number(data.limit || 0) - Number(data.usedCount || 0)} 次。` : data.message || '邀请码不可用',
        });
      })
      .catch((error) => {
        this.setData({ inviteHint: getErrorMessage(error, '邀请码验证失败') });
      })
      .finally(() => this.setData({ checkingInvite: false }));
  },

  validateForm() {
    const account = this.data.account.trim();
    const nickname = this.data.nickname.trim();
    const password = this.data.password.trim();
    const confirmPassword = this.data.confirmPassword.trim();
    const invitationCode = this.data.invitationCode.trim();
    const phone = this.data.phone.trim();
    if (!invitationCode) return '请输入邀请码';
    if (!account) return '请输入账号';
    if (account.length < 3) return '账号至少 3 个字符';
    if (!nickname) return '请输入昵称';
    if (!password) return '请输入密码';
    if (password.length < 6) return '密码至少 6 位';
    if (password !== confirmPassword) return '两次密码输入不一致';
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) return '手机号格式不正确';
    return '';
  },

  submitRegister() {
    if (this.data.loading) return;
    const message = this.validateForm();
    if (message) {
      wx.showToast({ title: message, icon: 'none' });
      this.setData({ errorText: message });
      return;
    }
    const payload = {
      invitationCode: this.data.invitationCode.trim(),
      account: this.data.account.trim(),
      nickname: this.data.nickname.trim(),
      password: this.data.password.trim(),
      phone: this.data.phone.trim(),
      studentNo: this.data.studentNo.trim() || this.data.account.trim(),
    };
    this.setData({ loading: true, errorText: '' });
    request('/auth/register', 'POST', payload)
      .then((res) => {
        const data = unwrap(res);
        wx.setStorageSync('access_token', data.token);
        wx.removeStorageSync('manual_logout');
        app.globalData.userInfo = data.user;
        app.getUnreadNum();
        app.connect();
        wx.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => wx.switchTab({ url: '/pages/my/index' }), 600);
      })
      .catch((error) => {
        const text = getErrorMessage(error, '注册失败');
        this.setData({ errorText: text });
        wx.showToast({ title: text, icon: 'none' });
      })
      .finally(() => this.setData({ loading: false }));
  },
});
