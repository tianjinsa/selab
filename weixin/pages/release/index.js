import request from '~/api/request';

const defaultTopics = ['期末周', '校园跑', '课程设计', '二手教材', '搭子'];

Page({
  data: {
    form: {
      title: '',
      content: '',
      type: '校园生活',
      topics: ['期末周'],
      images: [],
    },
    originFiles: [],
    gridConfig: {
      column: 4,
      width: 160,
      height: 160,
    },
    types: ['校园生活', '求助', '经验分享', '活动组队'],
    topics: defaultTopics.map((item, index) => ({ value: item, active: index === 0 })),
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

  toggleTopic(event) {
    const { value } = event.currentTarget.dataset;
    const selectedTopics = this.data.form.topics.slice();
    const index = selectedTopics.indexOf(value);
    if (index >= 0) selectedTopics.splice(index, 1);
    else selectedTopics.push(value);
    const topics = this.data.topics.map((item) => ({ ...item, active: selectedTopics.includes(item.value) }));
    this.setData({ topics, form: { ...this.data.form, topics: selectedTopics } });
  },

  handleSuccess(event) {
    const files = event.detail.files || [];
    this.setData({
      originFiles: files,
      form: { ...this.data.form, images: files.map((item) => item.url).filter(Boolean) },
    });
  },

  handleRemove(event) {
    const { index } = event.detail;
    const originFiles = this.data.originFiles.slice();
    originFiles.splice(index, 1);
    this.setData({
      originFiles,
      form: { ...this.data.form, images: originFiles.map((item) => item.url).filter(Boolean) },
    });
  },

  submit() {
    const { form } = this.data;
    if (!form.title || !form.content) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    request('/community/posts', 'POST', form)
      .then(() => {
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch(() => wx.showToast({ title: '发布失败', icon: 'none' }))
      .finally(() => this.setData({ submitting: false }));
  },
});
