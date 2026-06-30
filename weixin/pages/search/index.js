import request from '~/api/request';
import { getImage, listFrom, unwrap } from '~/utils/api';

const historyKey = 'campus_search_history';

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 10);
}

function normalizeGoodsCategories(values, goods) {
  const categories = (Array.isArray(values) ? values : [])
    .map((item) => {
      if (typeof item === 'string') return { name: item, children: [] };
      return { name: item && item.name, children: Array.isArray(item && item.children) ? item.children : [] };
    })
    .filter((item) => item.name);
  const names = new Set(categories.map((item) => item.name));
  goods.forEach((item) => {
    if (item.category && !names.has(item.category)) {
      categories.push({ name: item.category, children: [] });
      names.add(item.category);
    }
  });
  return [{ name: '全部', children: [] }].concat(categories);
}

function matchGoods(item, parent, child, keyword, children = []) {
  const matchedParent = !parent || parent === '全部' || item.category === parent || children.includes(item.category);
  const matchedChild = !child || item.category === child;
  const key = String(keyword || '').trim();
  const matchedKeyword = !key || `${item.name}${item.category}${item.location}${item.description}`.includes(key);
  return matchedParent && matchedChild && matchedKeyword;
}

Page({
  data: {
    marketMode: false,
    historyWords: [],
    popularWords: [],
    results: [],
    marketCategories: [{ name: '全部', children: [] }],
    activeMarketParent: '全部',
    activeMarketChild: '',
    activeMarketChildren: [],
    marketGoods: [],
    marketResults: [],
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

  onLoad(options) {
    if (options.mode === 'market') this.setData({ marketMode: true });
  },

  onShow() {
    this.setData({ historyWords: wx.getStorageSync(historyKey) || [] });
    if (this.data.marketMode) this.loadMarketSearchData();
    else this.queryPopular();
  },

  async loadMarketSearchData() {
    this.setData({ searching: true });
    try {
      const [goodsRes, categoryRes] = await Promise.all([request('/market/goods'), request('/settings/categories').catch(() => null)]);
      const goods = listFrom(goodsRes).map((item) => ({
        ...item,
        cover: getImage(item.images, '/static/home/card2.png'),
        sellerName: (item.seller && item.seller.nickname) || '卖家',
      }));
      const categoryData = unwrap(categoryRes) || {};
      const marketCategories = normalizeGoodsCategories(categoryData.goodsCategories, goods);
      this.setData({ marketGoods: goods, marketCategories, searching: false }, this.applyMarketFilter);
    } catch (error) {
      this.setData({ searching: false });
      wx.showToast({ title: '商品加载失败', icon: 'none' });
    }
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
    if (this.data.marketMode) {
      this.applyMarketFilter();
      return;
    }
    this.searchAll(searchValue);
  },

  selectMarketParent(event) {
    this.setData({ activeMarketParent: event.currentTarget.dataset.name, activeMarketChild: '' }, this.applyMarketFilter);
  },

  selectMarketChild(event) {
    this.setData({ activeMarketChild: event.currentTarget.dataset.name || '' }, this.applyMarketFilter);
  },

  applyMarketFilter() {
    const category = this.data.marketCategories.find((item) => item.name === this.data.activeMarketParent) || { children: [] };
    const activeMarketChildren = category.children || [];
    const marketResults = this.data.marketGoods.filter((item) =>
      matchGoods(item, this.data.activeMarketParent, this.data.activeMarketChild, this.data.searchValue, activeMarketChildren),
    );
    this.setData({ activeMarketChildren, marketResults });
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
    if (this.data.marketMode) {
      wx.switchTab({ url: '/pages/market/index' });
      return;
    }
    wx.switchTab({ url: '/pages/home/index' });
  },
});
