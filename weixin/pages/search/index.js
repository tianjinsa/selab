import request from '~/api/request';
import { listFrom } from '~/utils/api';

const historyKey = 'campus_search_history';

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 10);
}

Page({
  data: {
    historyWords: [],
    popularWords: [],
    results: [],
    searchValue: '',
    dialog: {
      title: '确认删除当前历史记录',
      showCancelButton: true,
      message: '',
    },
    dialogShow: false,
    searching: false,
  },

  deleteType: 0,
  deleteIndex: '',

  onShow() {
    this.setData({ historyWords: wx.getStorageSync(historyKey) || [] });
    this.queryPopular();
  },

  async queryPopular() {
    try {
      const [postRes, taskRes, goodsRes] = await Promise.all([
        request('/community/posts?rank=hot'),
        request('/tasks'),
        request('/market/goods'),
      ]);
      const words = []
        .concat(listFrom(postRes).map((item) => item.topics || []).reduce((result, item) => result.concat(item), []))
        .concat(listFrom(taskRes).map((item) => item.type))
        .concat(listFrom(goodsRes).map((item) => item.category));
      this.setData({ popularWords: unique(words) });
    } catch (error) {
      this.setData({ popularWords: [] });
    }
  },

  setHistoryWords(searchValue) {
    if (!searchValue) return;

    const historyWords = this.data.historyWords.slice();
    const index = historyWords.indexOf(searchValue);
    if (index !== -1) historyWords.splice(index, 1);
    historyWords.unshift(searchValue);
    const nextHistory = historyWords.slice(0, 12);

    wx.setStorageSync(historyKey, nextHistory);
    this.setData({
      searchValue,
      historyWords: nextHistory,
    });
    this.searchAll(searchValue);
  },

  async searchAll(keyword) {
    this.setData({ searching: true });
    try {
      const [postRes, taskRes, goodsRes] = await Promise.all([
        request(`/community/functions/search?keyword=${encodeURIComponent(keyword)}`),
        request(`/tasks/functions/search?keyword=${encodeURIComponent(keyword)}`),
        request(`/market/functions/search?keyword=${encodeURIComponent(keyword)}`),
      ]);
      const results = []
        .concat(listFrom(postRes).map((item) => ({ type: '帖子', title: item.title, desc: item.content, id: item.id, route: 'post' })))
        .concat(listFrom(taskRes).map((item) => ({ type: '任务', title: item.title, desc: item.detail, id: item.id, route: 'task' })))
        .concat(listFrom(goodsRes).map((item) => ({ type: '商品', title: item.name, desc: item.description, id: item.id, route: 'goods' })));
      this.setData({ results, searching: false });
    } catch (error) {
      this.setData({ results: [], searching: false });
      wx.showToast({ title: '搜索失败', icon: 'none' });
    }
  },

  confirm() {
    const historyWords = this.data.historyWords.slice();
    const { deleteType, deleteIndex } = this;

    if (deleteType === 0) {
      historyWords.splice(deleteIndex, 1);
      wx.setStorageSync(historyKey, historyWords);
      this.setData({
        historyWords,
        dialogShow: false,
      });
    } else {
      wx.setStorageSync(historyKey, []);
      this.setData({ historyWords: [], dialogShow: false });
    }
  },

  close() {
    this.setData({ dialogShow: false });
  },

  handleClearHistory() {
    const { dialog } = this.data;
    this.deleteType = 1;
    this.setData({
      dialog: {
        ...dialog,
        message: '确认删除所有历史记录',
      },
      dialogShow: true,
    });
  },

  deleteCurr(event) {
    const { index } = event.currentTarget.dataset;
    const { dialog } = this.data;
    this.deleteIndex = index;
    this.deleteType = 0;
    this.setData({
      dialog: {
        ...dialog,
        message: '确认删除当前历史记录',
      },
      dialogShow: true,
    });
  },

  handleHistoryTap(event) {
    const { historyWords } = this.data;
    const { index } = event.currentTarget.dataset;
    const searchValue = historyWords[index || 0] || '';
    this.setHistoryWords(searchValue);
  },

  handlePopularTap(event) {
    const { popularWords } = this.data;
    const { index } = event.currentTarget.dataset;
    const searchValue = popularWords[index || 0] || '';
    this.setHistoryWords(searchValue);
  },

  handleSubmit(event) {
    const { value } = event.detail;
    if (!value) return;
    this.setHistoryWords(value);
  },

  openResult(event) {
    const { route, id } = event.currentTarget.dataset;
    const routes = {
      post: `/pages/community/detail/index?id=${id}`,
      task: `/pages/task/detail/index?id=${id}`,
      goods: `/pages/market/detail/index?id=${id}`,
    };
    if (routes[route]) wx.navigateTo({ url: routes[route] });
  },

  actionHandle() {
    this.setData({
      searchValue: '',
      results: [],
    });
    wx.switchTab({ url: '/pages/home/index' });
  },
});
