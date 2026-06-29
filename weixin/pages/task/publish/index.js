import request from '~/api/request';

Page({
  data: {
    form: {
      title: '',
      type: '跑腿代办',
      reward: '',
      deadline: '',
      distance: '校内',
      location: '',
      detail: '',
      deliverable: '交付凭证',
    },
    types: ['跑腿代办', '学业互助', '技能服务'],
    submitting: false,
  },

  goBack() {
    wx.navigateBack();
  },

  updateField(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  chooseType(event) {
    this.setData({ form: { ...this.data.form, type: event.currentTarget.dataset.value } });
  },

  submit() {
    const { form } = this.data;
    if (!form.title || !form.reward || !form.deadline || !form.location || !form.detail) {
      wx.showToast({ title: '请填写任务信息', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    request('/tasks', 'POST', { ...form, reward: Number(form.reward) })
      .then(() => {
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch(() => wx.showToast({ title: '发布失败', icon: 'none' }))
      .finally(() => this.setData({ submitting: false }));
  },
});
