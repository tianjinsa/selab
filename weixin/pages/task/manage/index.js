import request from '~/api/request';
import { formatTime, unwrap } from '~/utils/api';

function mapTask(item) {
  return {
    ...item,
    time: formatTime(item.createdAt),
    applicantCount: (item.applicants || []).length,
    publisherName: (item.publisher && item.publisher.nickname) || '发布者',
    assigneeName: (item.assignee && item.assignee.nickname) || '待确认',
  };
}

Page({
  data: {
    activeTab: 'taken',
    takenTasks: [],
    publishedTasks: [],
    currentTasks: [],
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
      const data = unwrap(await request('/tasks/mine')) || {};
      this.setData(
        {
          takenTasks: (data.takenTasks || []).map(mapTask),
          publishedTasks: (data.publishedTasks || []).map(mapTask),
          loading: false,
        },
        this.refreshList,
      );
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '任务后台加载失败', icon: 'none' });
    }
  },

  refreshList() {
    const currentTasks = this.data.activeTab === 'taken' ? this.data.takenTasks : this.data.publishedTasks;
    this.setData({ currentTasks });
  },

  onTabChange(event) {
    this.setData({ activeTab: event.detail.value }, this.refreshList);
  },

  publishTask() {
    wx.navigateTo({ url: '/pages/task/publish/index' });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/task/detail/index?id=${event.currentTarget.dataset.id}` });
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/task/index' });
  },
});
