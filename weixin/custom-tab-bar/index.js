const app = getApp();
const routeDelay = 180;
const destinationHoldDelay = 420;
const destinationExitDelay = 180;

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

function getPendingTransition() {
  return app.globalData.pendingTabTransition || null;
}

function clearPendingTransition() {
  app.globalData.pendingTabTransition = null;
}

Component({
  data: {
    value: '', // 初始值设置为空，避免第一次加载时闪烁
    unreadNum: 0, // 未读消息数量
    list: tabs,
    pressedValue: '',
    transitionState: 'idle',
    transitionDirection: 'none',
    transitionText: '',
  },
  lifetimes: {
    attached() {
      this.routeTimer = null;
      this.transitionTimer = null;
      this.transitionExitTimer = null;
      this.unreadHandler = null;
    },
    ready() {
      this.refreshActiveTab();

      this.setUnreadNum(app.globalData.unreadNum);
      this.unreadHandler = (unreadNum) => {
        this.setUnreadNum(unreadNum);
      };
      app.eventBus.on('unread-num-change', this.unreadHandler);
    },
    detached() {
      this.clearTimers();
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
      this.playPendingTransition(value);
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
      this.startTabTransition(tab);
    },

    startTabTransition(tab) {
      if (!tab) return;
      const direction = this.getTransitionDirection(tab.value);
      app.globalData.pendingTabTransition = {
        value: tab.value,
        label: tab.label,
        direction,
        expiresAt: Date.now() + 1600,
      };
      this.setData({
        transitionState: 'source',
        transitionDirection: direction,
        transitionText: `前往${tab.label}`,
      });
      this.clearTimers();
      this.routeTimer = setTimeout(() => {
        wx.switchTab({
          url: `/pages/${tab.value}/index`,
          fail: () => {
            clearPendingTransition();
            this.setData({
              transitionState: 'failed',
              transitionDirection: direction,
              transitionText: '切换失败',
            });
            this.transitionTimer = setTimeout(() => {
              this.setData({ transitionState: 'idle', transitionText: '', transitionDirection: 'none' });
            }, destinationExitDelay);
          },
        });
      }, routeDelay);
    },

    playPendingTransition(value) {
      const pending = getPendingTransition();
      if (!pending || pending.value !== value || pending.expiresAt < Date.now()) {
        if (pending && pending.expiresAt < Date.now()) clearPendingTransition();
        return;
      }
      clearPendingTransition();
      this.clearTimers();
      this.setData({
        transitionState: 'destination',
        transitionDirection: pending.direction || 'none',
        transitionText: `已进入${pending.label}`,
      });
      this.transitionTimer = setTimeout(() => {
        this.setData({ transitionState: 'leaving' });
        this.transitionExitTimer = setTimeout(() => {
          this.setData({ transitionState: 'idle', transitionText: '', transitionDirection: 'none' });
        }, destinationExitDelay);
      }, destinationHoldDelay);
    },

    getTransitionDirection(nextValue) {
      const currentIndex = tabs.findIndex((item) => item.value === this.data.value);
      const nextIndex = tabs.findIndex((item) => item.value === nextValue);
      if (currentIndex < 0 || nextIndex < 0 || currentIndex === nextIndex) return 'none';
      return nextIndex > currentIndex ? 'forward' : 'backward';
    },

    clearTimers() {
      if (this.routeTimer) clearTimeout(this.routeTimer);
      if (this.transitionTimer) clearTimeout(this.transitionTimer);
      if (this.transitionExitTimer) clearTimeout(this.transitionExitTimer);
      this.routeTimer = null;
      this.transitionTimer = null;
      this.transitionExitTimer = null;
    },

    /** 设置未读消息数量 */
    setUnreadNum(unreadNum) {
      this.setData({ unreadNum });
    },
  },
});
