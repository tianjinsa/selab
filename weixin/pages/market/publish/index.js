import request from '~/api/request';
import { unwrap } from '~/utils/api';

function flattenGoodsCategories(values) {
  return (Array.isArray(values) ? values : [])
    .reduce((result, item) => {
      if (typeof item === 'string') return result.concat(item);
      if (!item || !item.name) return result;
      return result.concat(item.name, Array.isArray(item.children) ? item.children : []);
    }, [])
    .filter(Boolean);
}

Page({
  data: {
    form: {
      name: '',
      category: '数码',
      price: '',
      condition: '九成新',
      tradeMode: '校内自提',
      location: '',
      description: '',
      images: ['/static/home/card2.png'],
    },
    categories: ['数码', '书籍', '服饰', '生活用品'],
    conditions: ['全新', '九成新', '八成新', '七成新'],
    tradeModes: ['校内自提', '同城配送'],
  },

  onLoad() {
    request('/settings/categories')
      .then((res) => {
        const data = unwrap(res) || {};
        const categories = Array.from(new Set(flattenGoodsCategories(data.goodsCategories)));
        if (!categories.length) return;
        const nextForm = categories.includes(this.data.form.category)
          ? this.data.form
          : { ...this.data.form, category: categories[0] };
        this.setData({ categories, form: nextForm });
      })
      .catch(() => {});
  },

  goBack() {
    wx.navigateBack();
  },

  updateField(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  chooseCategory(event) {
    this.setData({ form: { ...this.data.form, category: event.currentTarget.dataset.value } });
  },

  chooseCondition(event) {
    this.setData({ form: { ...this.data.form, condition: event.currentTarget.dataset.value } });
  },

  chooseTradeMode(event) {
    this.setData({ form: { ...this.data.form, tradeMode: event.currentTarget.dataset.value } });
  },

  submit() {
    const { form } = this.data;
    if (!form.name || !form.price || !form.description) {
      wx.showToast({ title: '请填写名称、价格和描述', icon: 'none' });
      return;
    }
    request('/market/goods', 'POST', { ...form, price: Number(form.price) })
      .then(() => {
        wx.showToast({ title: '已提交审核', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch(() => wx.showToast({ title: '提交失败', icon: 'none' }));
  },
});
