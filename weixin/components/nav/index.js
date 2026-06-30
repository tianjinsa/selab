Component({
  options: {
    styleIsolation: 'shared',
  },
  properties: {
    navType: {
      type: String,
      value: 'title',
    },
    titleText: String,
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
