import { currentUser, myStats, notifications } from '~/utils/campusData';

Page({
  data: {
    user: currentUser,
    stats: myStats,
    notifications,
    services: [
      { title: '我的任务', desc: '发布、报名、验收', icon: 'root-list', color: 'blue' },
      { title: '我的闲置', desc: '在售、审核、订单', icon: 'shop', color: 'green' },
      { title: '我的帖子', desc: '发布、收藏、互动', icon: 'chat', color: 'yellow' },
      { title: '智能体会话', desc: '历史问答继续聊', icon: 'service', color: 'purple' },
    ],
    securityItems: [
      { title: '个人资料', desc: '头像、昵称、学号、联系方式', icon: 'user', action: 'profile' },
      { title: '账号安全', desc: '修改密码、异常登录提醒', icon: 'secured', action: 'setting' },
      { title: '消息免打扰', desc: '会话级提醒设置', icon: 'notification', action: 'message' },
      { title: '客服与举报', desc: '人工介入、纠纷仲裁', icon: 'service', action: 'support' },
    ],
  },
  onOpenMessage() {
    wx.navigateTo({ url: '/pages/message/index' });
  },
  onEditProfile() {
    wx.navigateTo({ url: '/pages/my/info-edit/index' });
  },
  onSecurityTap(event) {
    const { action } = event.currentTarget.dataset;
    if (action === 'profile') return this.onEditProfile();
    if (action === 'message') return this.onOpenMessage();
    if (action === 'setting') return wx.navigateTo({ url: '/pages/setting/index' });
    wx.showToast({ title: '已进入人工服务队列', icon: 'none' });
  },
  onServiceTap(event) {
    const { title } = event.currentTarget.dataset;
    wx.showToast({ title, icon: 'none' });
  },
});
