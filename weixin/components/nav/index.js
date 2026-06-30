const app = getApp();

Component({
  options: {
    styleIsolation: 'shared',
  },
  data: {
    unreadNum: 0,
  },
  properties: {
    navType: {
      type: String,
      value: 'title',
    },
    titleText: String,
  },
  lifetimes: {
    attached() {
      this.unreadHandler = (unreadNum) => this.setData({ unreadNum });
      this.setData({ unreadNum: app.globalData.unreadNum || 0 });
      app.eventBus.on('unread-num-change', this.unreadHandler);
    },
    detached() {
      if (this.unreadHandler) app.eventBus.off('unread-num-change', this.unreadHandler);
    },
  },
  methods: {
    openMessage() {
      wx.navigateTo({ url: '/pages/message/index' });
    },

    searchTurn() {
      wx.navigateTo({ url: '/pages/search/index' });
    },
  },
});
