const app = getApp();

const tabs = [
  {
    icon: 'root-list',
    value: 'task',
    label: '任务互助',
    url: '/pages/task/index',
    manageUrl: '/pages/task/manage/index',
  },
  {
    icon: 'shop',
    value: 'market',
    label: '二手市场',
    url: '/pages/market/index',
    manageUrl: '/pages/market/manage/index',
  },
  {
    icon: 'home',
    value: 'home',
    label: '社区论坛',
    url: '/pages/home/index',
    manageUrl: '/pages/community/manage/index',
  },
  {
    icon: 'service',
    value: 'agent',
    label: '智能体',
    url: '/pages/agent/index',
  },
  {
    icon: 'user',
    value: 'my',
    label: '我的',
    url: '/pages/my/index',
  },
];

Component({
  data: {
    value: '',
    unreadNum: 0,
    list: tabs,
    pressedValue: '',
  },
  lifetimes: {
    attached() {
      this.unreadHandler = null;
    },
    ready() {
      this.refreshActiveTab();

      this.setUnreadNum(app.globalData.unreadNum);
      this.unreadHandler = (unreadNum) => this.setUnreadNum(unreadNum);
      app.eventBus.on('unread-num-change', this.unreadHandler);
    },
    detached() {
      if (this.unreadHandler) app.eventBus.off('unread-num-change', this.unreadHandler);
    },
  },
  pageLifetimes: {
    show() {
      this.refreshActiveTab();
    },
  },
  methods: {
    refreshActiveTab() {
      const pages = getCurrentPages();
      const curPage = pages[pages.length - 1];
      if (!curPage) return;
      const nameRe = /pages\/(\w+)\/index/.exec(curPage.route);
      if (nameRe === null || !nameRe[1]) return;
      const value = nameRe[1];
      this.setData({
        value,
        list: tabs.map((item) => ({
          ...item,
          isManageEntry: item.manageUrl && item.value === value,
        })),
      });
    },

    handlePressStart(event) {
      this.setData({ pressedValue: event.currentTarget.dataset.value || '' });
    },

    clearPress() {
      this.setData({ pressedValue: '' });
    },

    handleTap(event) {
      const { value } = event.currentTarget.dataset;
      const tab = tabs.find((item) => item.value === value);
      this.clearPress();
      if (tab && tab.manageUrl && value === this.data.value) {
        wx.navigateTo({ url: tab.manageUrl });
        return;
      }
      if (value === this.data.value) return;
      if (tab) wx.switchTab({ url: tab.url });
    },

    setUnreadNum(unreadNum) {
      this.setData({ unreadNum });
    },
  },
});
