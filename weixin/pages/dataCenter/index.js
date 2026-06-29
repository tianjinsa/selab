import request from '~/api/request';
import { listFrom } from '~/utils/api';

Page({
  data: {
    totalSituationDataList: [],
    interactionSituationDataList: [],
    completeRateDataList: [],
    areaDataList: [],
  },

  onLoad() {
    this.init();
  },

  async init() {
    try {
      const [taskRes, postRes, goodsRes] = await Promise.all([
        request('/tasks'),
        request('/community/posts'),
        request('/market/goods'),
      ]);
      const tasks = listFrom(taskRes);
      const posts = listFrom(postRes);
      const goods = listFrom(goodsRes);
      const completedTasks = tasks.filter((item) => item.status === '已完成').length;
      const activeTasks = tasks.filter((item) => item.status !== '已完成' && item.status !== '已取消').length;
      const totalViews = posts.reduce((sum, item) => sum + Number(item.views || 0), 0);
      const totalComments = posts.reduce((sum, item) => sum + Number(item.commentCount || 0), 0);
      const totalConsults = goods.reduce((sum, item) => sum + Number(item.consults || 0), 0);
      this.setData({
        totalSituationDataList: [
          { name: '任务总数', number: tasks.length },
          { name: '社区帖子', number: posts.length },
          { name: '在售商品', number: goods.length },
        ],
        interactionSituationDataList: [
          { name: '帖子浏览', number: totalViews },
          { name: '评论互动', number: totalComments },
          { name: '商品咨询', number: totalConsults },
        ],
        completeRateDataList: [
          { time: '任务完成率', percentage: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0 },
          { time: '任务活跃率', percentage: tasks.length ? Math.round((activeTasks / tasks.length) * 100) : 0 },
          { time: '商品在售率', percentage: goods.length ? 100 : 0 },
        ],
        areaDataList: Array.from(new Set(goods.map((item) => item.location))).map((name) => ({ name })),
      });
    } catch (error) {
      wx.showToast({ title: '数据加载失败', icon: 'none' });
    }
  },
});
