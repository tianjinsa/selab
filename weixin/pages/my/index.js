import request from '~/api/request';
import { formatTime, listFrom, unwrap } from '~/utils/api';

const app = getApp();

const emptyUser = {
  nickname: '未登录',
  avatar: '/static/avatar1.png',
  studentNo: '-',
  contact: '-',
  creditLevel: '-',
  creditScore: 0,
};

Page({
  data: {
    user: emptyUser,
    stats: [
      { label: '信用分', value: 0 },
      { label: '发布任务', value: 0 },
      { label: '我的帖子', value: 0 },
      { label: '未读通知', value: 0 },
    ],
    unreadCount: 0,
    notifications: [],
    services: [
      { title: '我的任务', desc: '发布、报名、验收', icon: 'root-list', color: 'blue', action: 'tasks' },
      { title: '我的闲置', desc: '在售、审核、订单', icon: 'shop', color: 'green', action: 'market' },
      { title: '我的帖子', desc: '发布、收藏、互动', icon: 'chat', color: 'yellow', action: 'posts' },
      { title: '智能体会话', desc: '历史问答继续聊', icon: 'service', color: 'purple', action: 'agent' },
    ],
    securityItems: [
      { title: '个人资料', desc: '头像、昵称、学号、联系方式', icon: 'user', action: 'profile' },
      { title: '账号安全', desc: '修改密码、异常登录提醒', icon: 'secured', action: 'setting' },
      { title: '消息免打扰', desc: '会话级提醒设置', icon: 'notification', action: 'message' },
      { title: '客服与举报', desc: '人工介入、纠纷仲裁', icon: 'service', action: 'support' },
    ],
  },

  onShow() {
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const user = await app.ensureLogin();
      const [taskRes, postRes, noticeRes, conversationRes] = await Promise.all([
        request('/tasks'),
        request(`/community/posts?authorId=${user.id}`),
        request('/messages/notifications'),
        request('/messages/conversations'),
      ]);
      const tasks = listFrom(taskRes);
      const posts = listFrom(postRes);
      const notifications = listFrom(noticeRes).slice(0, 4).map((item) => ({
        ...item,
        time: formatTime(item.createdAt),
        unread: !item.read,
      }));
      const unreadCount = listFrom(conversationRes).reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
      app.setUnreadNum(unreadCount);
      this.setData({
        user: { ...emptyUser, ...unwrap(await request('/auth/me')) },
        unreadCount,
        notifications,
        stats: [
          { label: '信用分', value: user.creditScore },
          { label: '发布任务', value: tasks.filter((item) => item.publisherId === user.id).length },
          { label: '我的帖子', value: posts.length },
          { label: '未读通知', value: notifications.filter((item) => item.unread).length },
        ],
      });
    } catch (error) {
      wx.showToast({ title: '个人数据加载失败', icon: 'none' });
    }
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
    const { action } = event.currentTarget.dataset;
    const routes = {
      tasks: '/pages/task/index',
      market: '/pages/market/index',
      posts: '/pages/home/index',
      agent: '/pages/agent/index',
    };
    if (routes[action]) wx.switchTab({ url: routes[action] });
  },
});
