import request from '~/api/request';
import { getImage, listFrom, unwrap } from '~/utils/api';

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

function matchGoods(item, parent, child, children = []) {
  if (!parent || parent === '全部') return true;
  if (child) return item.category === child;
  return item.category === parent || children.includes(item.category);
}

Page({
  data: {
    categories: [{ name: '全部', children: [] }],
    activeParent: '全部',
    activeChild: '',
    activeChildren: [],
    goods: [],
    filteredGoods: [],
    loading: true,
  },

  goBack() {
    wx.navigateBack();
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
      const [goodsRes, categoryRes] = await Promise.all([request('/market/goods'), request('/settings/categories').catch(() => null)]);
      const goods = listFrom(goodsRes).map((item) => ({
        ...item,
        cover: getImage(item.images),
        sellerName: (item.seller && item.seller.nickname) || '卖家',
      }));
      const categoryData = unwrap(categoryRes) || {};
      const categories = normalizeGoodsCategories(categoryData.goodsCategories, goods);
      const activeParent = categories.some((item) => item.name === this.data.activeParent) ? this.data.activeParent : '全部';
      this.setData({ goods, categories, activeParent, loading: false }, this.applyFilter);
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: '分类加载失败', icon: 'none' });
    }
  },

  selectParent(event) {
    const activeParent = event.currentTarget.dataset.name;
    this.setData({ activeParent, activeChild: '' }, this.applyFilter);
  },

  selectChild(event) {
    this.setData({ activeChild: event.currentTarget.dataset.name || '' }, this.applyFilter);
  },

  applyFilter() {
    const category = this.data.categories.find((item) => item.name === this.data.activeParent) || { children: [] };
    const activeChildren = category.children || [];
    const filteredGoods = this.data.goods.filter((item) =>
      matchGoods(item, this.data.activeParent, this.data.activeChild, activeChildren),
    );
    this.setData({ activeChildren, filteredGoods });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/market/detail/index?id=${event.currentTarget.dataset.id}` });
  },
});
