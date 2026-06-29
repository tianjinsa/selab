const app = getApp();

const tabs = [
  {
    icon: 'root-list',
    value: 'task',
    label: '任务互助',
    manageUrl: '/pages/task/manage/index',
  },
  {
    icon: 'shop',
    value: 'market',
    label: '二手市场',
    manageUrl: '/pages/market/manage/index',
  },
  {
    icon: 'home',
    value: 'home',
    label: '社区论坛',
    manageUrl: '/pages/community/manage/index',
  },
  {
    icon: 'service',
    value: 'agent',
    label: '智能体',
  },
  {
    icon: 'user',
    value: 'my',
    label: '我的',
  },
];

Component({
  data: {
    value: '', // 初始值设置为空，避免第一次加载时闪烁
    unreadNum: 0, // 未读消息数量
    list: tabs,
  },
  lifetimes: {
    ready() {
      this.refreshActiveTab();

      // 同步全局未读消息数量
      this.setUnreadNum(app.globalData.unreadNum);
      app.eventBus.on('unread-num-change', (unreadNum) => {
        this.setUnreadNum(unreadNum);
      });
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
          displayIcon: item.manageUrl && item.value === value ? 'setting' : item.icon,
          isManageEntry: item.manageUrl && item.value === value,
        })),
      });
    },

    handleChange(e) {
      const { value } = e.detail;
      const tab = tabs.find((item) => item.value === value);
      if (tab && tab.manageUrl && value === this.data.value) {
        wx.navigateTo({ url: tab.manageUrl });
        return;
      }
      wx.switchTab({ url: `/pages/${value}/index` });
    },

    /** 设置未读消息数量 */
    setUnreadNum(unreadNum) {
      this.setData({ unreadNum });
    },
  },
});
