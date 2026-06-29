import { leaderboard, taskCategories, tasks } from '~/utils/campusData';

Page({
  data: {
    categories: taskCategories,
    activeCategory: '全部',
    keyword: '',
    tasks,
    filteredTasks: tasks,
    leaderboard,
    flow: ['发布托管', '报名沟通', '确认接单', '交付验收', '酬金结算'],
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
    wx.showModal({
      title: '模拟支付成功',
      content: '发布任务时酬金已进入平台托管账户，任务完成后自动结算给接单者。',
      showCancel: false,
    });
  },
  applyTask(event) {
    const { id } = event.currentTarget.dataset;
    const tasksNext = this.data.tasks.map((item) => (item.id === id ? { ...item, applicants: item.applicants + 1 } : item));
    this.setData({ tasks: tasksNext }, this.applyFilter);
    wx.showToast({ title: '已报名并发送私信卡片', icon: 'none' });
  },
  openChat() {
    wx.navigateTo({ url: '/pages/message/index' });
  },
  requestSettle() {
    wx.showToast({ title: '已发送验收结算卡片', icon: 'success' });
  },
});
