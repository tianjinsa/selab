import request from '~/api/request';
import { unwrap } from '~/utils/api';

Page({
  data: {
    task: null,
    flow: ['报名中', '进行中', '待验收', '已完成'],
  },

  onLoad(options) {
    this.loadTask(options.id);
  },

  loadTask(id) {
    request(`/tasks/${id}`)
      .then((res) => {
        this.setData({ task: unwrap(res) });
      })
      .catch(() => wx.showToast({ title: '任务不存在', icon: 'none' }));
  },

  goBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/task/index' });
  },

  applyTask() {
    if (!this.data.task) return;
    request(`/tasks/${this.data.task.id}/apply`, 'POST', { message: '我想报名这个任务，可以私信沟通细节。' })
      .then((res) => {
        const data = unwrap(res);
        wx.showToast({ title: '已报名', icon: 'success' });
        wx.navigateTo({ url: `/pages/chat/index?conversationId=${data.conversation.id}` });
      })
      .catch(() => wx.showToast({ title: '报名失败', icon: 'none' }));
  },

  openChat() {
    const { task } = this.data;
    if (!task || !task.publisher) return;
    request('/messages/conversations', 'POST', {
      targetUserId: task.publisher.id,
      source: '任务互助',
      relatedCard: { type: 'task', id: task.id, title: task.title, action: '任务咨询' },
    })
      .then((res) => wx.navigateTo({ url: `/pages/chat/index?conversationId=${unwrap(res).id}` }))
      .catch(() => wx.showToast({ title: '无法进入私信', icon: 'none' }));
  },
});
