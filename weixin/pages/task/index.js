import request from '~/api/request';
import { listFrom, unwrap } from '~/utils/api';

Page({
  data: {
    categories: ['全部'],
    activeCategory: '全部',
    keyword: '',
    tasks: [],
    filteredTasks: [],
    leaderboard: [],
    loading: true,
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [taskRes, rankRes] = await Promise.all([request('/tasks'), request('/tasks/leaderboard')]);
      const tasks = listFrom(taskRes).map((item) => ({
        ...item,
        publisherName: (item.publisher && item.publisher.nickname) || '发布者',
        publisherAvatar: (item.publisher && item.publisher.avatar) || '/static/avatar1.png',
        applicantCount: (item.applicants && item.applicants.length) || 0,
      }));
      const categories = ['全部', ...Array.from(new Set(tasks.map((item) => item.type)))];
      const leaderboard = listFrom(rankRes).map((item) => ({
        name: item.user && item.user.nickname,
        level: item.user && item.user.creditLevel,
        completeRate: `${item.completionRate}%`,
        count: item.orderCount,
      }));
      this.setData({ tasks, categories, leaderboard, loading: false }, this.applyFilter);
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '任务加载失败', icon: 'none' });
    }
  },

  selectCategory(event) {
    this.setData({ activeCategory: event.currentTarget.dataset.name }, this.applyFilter);
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value }, this.applyFilter);
  },

  applyFilter() {
    const { activeCategory, keyword } = this.data;
    const key = keyword.trim();
    const filteredTasks = this.data.tasks.filter((item) => {
      const matchedCategory = activeCategory === '全部' || item.type === activeCategory;
      const matchedKeyword = !key || `${item.title}${item.detail}${item.location}`.includes(key);
      return matchedCategory && matchedKeyword;
    });
    this.setData({ filteredTasks });
  },

  publishTask() {
    wx.navigateTo({ url: '/pages/task/publish/index' });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/task/detail/index?id=${event.currentTarget.dataset.id}` });
  },

  applyTask(event) {
    const { id } = event.currentTarget.dataset;
    request(`/tasks/${id}/apply`, 'POST', { message: '我想报名这个任务，可以私信沟通细节。' })
      .then((res) => {
        const conversationId = unwrap(res).conversation.id;
        wx.showToast({ title: '已报名并发送私信卡片', icon: 'none' });
        wx.navigateTo({ url: `/pages/chat/index?conversationId=${conversationId}` });
      })
      .catch(() => wx.showToast({ title: '报名失败', icon: 'none' }));
  },

  openChat(event) {
    const { userId, taskId, title } = event.currentTarget.dataset;
    request('/messages/conversations', 'POST', {
      targetUserId: userId,
      source: '任务互助',
      relatedCard: { type: 'task', id: taskId, title, action: '任务咨询' },
      })
      .then((res) => {
        const conversation = unwrap(res);
        wx.navigateTo({ url: `/pages/chat/index?conversationId=${conversation.id}` });
      })
      .catch(() => wx.showToast({ title: '无法进入私信', icon: 'none' }));
  },
});
