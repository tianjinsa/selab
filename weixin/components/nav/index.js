const defaultContext = {
  title: '快捷工作台',
  items: [
    { title: '消息中心', url: 'pages/message/index', openType: 'navigateTo' },
    { title: '发布任务', url: 'pages/task/publish/index', openType: 'navigateTo' },
    { title: '发布闲置', url: 'pages/market/publish/index', openType: 'navigateTo' },
    { title: '发布帖子', url: 'pages/release/index', openType: 'navigateTo' },
    { title: '我的', url: 'pages/my/index', openType: 'switchTab' },
  ],
};

const contextMap = {
  'pages/task/index': {
    title: '任务工作台',
    items: [
      { title: '我的任务后台', url: 'pages/task/manage/index', openType: 'navigateTo' },
      { title: '发布任务', url: 'pages/task/publish/index', openType: 'navigateTo' },
      { title: '消息中心', url: 'pages/message/index', openType: 'navigateTo' },
      { title: '任务市场', url: 'pages/task/index', openType: 'switchTab' },
    ],
  },
  'pages/market/index': {
    title: '交易工作台',
    items: [
      { title: '我的交易后台', url: 'pages/market/manage/index', openType: 'navigateTo' },
      { title: '发布闲置', url: 'pages/market/publish/index', openType: 'navigateTo' },
      { title: '消息中心', url: 'pages/message/index', openType: 'navigateTo' },
      { title: '二手市场', url: 'pages/market/index', openType: 'switchTab' },
    ],
  },
  'pages/home/index': {
    title: '社区工作台',
    items: [
      { title: '我的社区后台', url: 'pages/community/manage/index', openType: 'navigateTo' },
      { title: '发布帖子', url: 'pages/release/index', openType: 'navigateTo' },
      { title: '消息中心', url: 'pages/message/index', openType: 'navigateTo' },
      { title: '社区论坛', url: 'pages/home/index', openType: 'switchTab' },
    ],
  },
};

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
  data: {
    visible: false,
    drawerTitle: defaultContext.title,
    sidebar: defaultContext.items,
    statusHeight: 0,
  },
  lifetimes: {
    ready() {
      const statusHeight = wx.getWindowInfo().statusBarHeight;
      this.setData({ statusHeight });
      this.refreshContext();
    },
  },
  pageLifetimes: {
    show() {
      this.refreshContext();
    },
  },
  methods: {
    refreshContext() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      const context = (current && contextMap[current.route]) || defaultContext;
      this.setData({ drawerTitle: context.title, sidebar: context.items });
    },

    openDrawer() {
      this.setData({
        visible: true,
      });
    },
    itemClick(e) {
      const that = this;
      const { openType, url } = e.detail.item;
      const closeDrawer = () => {
        that.setData({
          visible: false,
        });
      };
      if (openType === 'switchTab') {
        wx.switchTab({
          url: `/${url}`,
        }).then(closeDrawer);
      } else {
        wx.navigateTo({
          url: `/${url}`,
        }).then(closeDrawer);
      }
    },

    searchTurn() {
      wx.navigateTo({
        url: `/pages/search/index`,
      });
    },
  },
});
