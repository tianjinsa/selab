import { createStore } from '../src/data/store.js';
import { seedInitialData } from '../src/services/seed.js';
import {
  acceptApplication,
  applyTask,
  createTaskDraft,
  createTaskReport,
  publishTaskAfterPayment
} from '../src/services/tasks.js';
import {
  createComment,
  createForumReport,
  createPost,
  generateForumSummary,
  sharePost,
  togglePostFavorite,
  togglePostLike
} from '../src/services/forum.js';
import {
  acceptPurchase,
  applyPurchase,
  createProduct,
  createProductReport,
  payOrder
} from '../src/services/market.js';
import { getOrCreateConversation, sendMessage } from '../src/services/chat.js';
import { createNotification } from '../src/services/notifications.js';

function plusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

const store = await createStore();

try {
  await seedInitialData(store);
  const users = store.collection('users');
  const lin = users.find((user) => user.studentId === '202600000001');
  const zhou = users.find((user) => user.studentId === '202600000002');
  if (!lin || !zhou) throw new Error('Demo users are missing');

  if (store.collection('tasks').length === 0) {
    const task1 = await publishTaskAfterPayment(store, lin, (await createTaskDraft(store, lin, {
      title: '今晚 8 点前帮取东区快递',
      category: '跑腿代办',
      campusArea: '快递点',
      reward: 8,
      deadlineAt: plusDays(1),
      detail: '快递在东区驿站，体积不大，取到后送到 6 号宿舍楼下即可。',
      deliveryRequirement: '拍照确认取件码和放置位置。',
      contactNote: '到楼下后发私信。'
    })).id);
    const task2 = await publishTaskAfterPayment(store, zhou, (await createTaskDraft(store, zhou, {
      title: '高数期末资料整理成一页速记',
      category: '学业互助',
      campusArea: '图书馆',
      reward: 26,
      deadlineAt: plusDays(3),
      detail: '把老师给的重点整理成一页 A4 速记提纲，要求结构清楚、公式不要漏。',
      deliveryRequirement: '提交 PDF 或图片版。',
      contactNote: '可以先发目录给我确认。'
    })).id);
    const task3 = await publishTaskAfterPayment(store, lin, (await createTaskDraft(store, lin, {
      title: '帮社团招新 PPT 做版式美化',
      category: '技能服务',
      campusArea: '教学区',
      reward: 45,
      deadlineAt: plusDays(5),
      detail: '已有 12 页内容，希望统一字体、配色和版式，适合投影展示。',
      deliveryRequirement: '保留可编辑 PPT 文件。',
      contactNote: '需要看一下你的类似作品。'
    })).id);
    await applyTask(store, null, zhou, task1.id);
    const application = await applyTask(store, null, zhou, task3.id);
    await acceptApplication(store, null, lin, application.id);
    await createTaskReport(store, zhou, task2.id, { reason: '示例举报：任务说明需要管理员确认是否合规。' });
  }

  if (store.collection('posts').length === 0) {
    const post1 = await createPost(store, lin, {
      title: '东区快递点晚高峰避坑时间',
      type: '经验分享帖',
      tags: ['校园生活', '快递', '效率'],
      content: '最近几天 18:30-19:20 排队最长，20:00 后明显顺畅。取大件建议找同学一起去，驿站门口比较窄。'
    });
    const post2 = await createPost(store, zhou, {
      title: '有没有适合期末周互相监督的自习搭子',
      type: '求助帖',
      tags: ['自习', '期末', '图书馆'],
      content: '想找晚上在图书馆三楼自习的同学，互相提醒不要刷手机，可以顺便交流公共课资料。'
    });
    await createComment(store, null, zhou, post1.id, { content: '补充：雨天门口会更挤，最好提前一点去。' });
    await createComment(store, null, lin, post2.id, { content: '我一般 19 点后在三楼，可以一起。' });
    await togglePostLike(store, null, zhou, post1.id);
    await togglePostFavorite(store, null, zhou, post1.id);
    await togglePostLike(store, null, lin, post2.id);
    await sharePost(store, post1.id);
    await createForumReport(store, zhou, 'post', post1.id, '示例举报：标题可能需要管理员复核。');
    await generateForumSummary(store, true);
  }

  if (store.collection('products').length === 0) {
    const product1 = await createProduct(store, zhou, {
      title: '九成新小米显示器 24 寸',
      categoryId: 'cat-digital',
      price: 399,
      condition: '轻微使用',
      detail: '宿舍外接屏，屏幕无坏点，带 HDMI 线和原包装。',
      tradeMethod: '宿舍楼下',
      pickupLocation: '南区 3 号楼下',
      imageUrls: ['https://picsum.photos/seed/campus-monitor/900/620']
    });
    await createProduct(store, lin, {
      title: '公共课教材与习题册一套',
      categoryId: 'cat-book',
      price: 35,
      condition: '明显使用',
      detail: '有少量笔记，适合复习和查漏补缺。',
      tradeMethod: '校内面交',
      pickupLocation: '图书馆一楼大厅',
      imageUrls: ['https://picsum.photos/seed/campus-books/900/620']
    });
    await createProduct(store, zhou, {
      title: '宿舍折叠收纳箱两个',
      categoryId: 'cat-life',
      price: 22,
      condition: '功能正常',
      detail: '搬宿舍闲置，两个一起出，适合放衣物和杂物。',
      tradeMethod: '线下自提',
      pickupLocation: '西区生活广场',
      imageUrls: ['https://picsum.photos/seed/campus-storage/900/620']
    });
    const order = await applyPurchase(store, null, lin, product1.id);
    await acceptPurchase(store, null, zhou, order.id);
    await payOrder(store, lin, order.id);
    await createProductReport(store, lin, product1.id, '示例举报：价格和描述需要管理员复核。');
  }

  if (store.collection('messages').filter((message) => message.type === 'text').length === 0) {
    const conversation = await getOrCreateConversation(store, lin.id, zhou.id);
    await sendMessage(store, null, lin.id, conversation.id, { content: '你好，快递任务我已经发布了，可以看一下详情。' });
    await sendMessage(store, null, zhou.id, conversation.id, { content: '收到，我申请了其中一个任务，晚点去取。' });
  }

  if (store.collection('notifications').length === 0) {
    await createNotification(store, {
      userId: lin.id,
      type: 'system',
      title: '欢迎使用校园生活服务',
      body: '当前数据库已连接 SQL Server，演示内容已初始化。',
      link: '/',
      sourceId: 'demo-seed'
    });
  }

  if (store.collection('taskDisputes').length === 0) {
    const acceptedTask = store.collection('tasks').find((task) => task.status === 'accepted');
    if (acceptedTask) {
      await store.insert('taskDisputes', {
        taskId: acceptedTask.id,
        userId: zhou.id,
        reason: '示例纠纷：交付范围需要管理员协助确认。',
        evidenceUrls: [],
        status: 'pending'
      });
    }
  }

  if (store.collection('orderDisputes').length === 0) {
    const order = store.collection('orders').find((item) => ['waiting_delivery', 'waiting_receive'].includes(item.status));
    if (order) {
      await store.insert('orderDisputes', {
        orderId: order.id,
        userId: lin.id,
        reason: '示例纠纷：约定交付时间需要调整。',
        evidenceUrls: [],
        status: 'pending'
      });
    }
  }

  console.log(JSON.stringify({
    mode: store.status.mode,
    users: store.collection('users').length,
    tasks: store.collection('tasks').length,
    posts: store.collection('posts').length,
    products: store.collection('products').length,
    conversations: store.collection('conversations').length,
    messages: store.collection('messages').length,
    notifications: store.collection('notifications').length,
    reports: store.collection('reports').length,
    taskDisputes: store.collection('taskDisputes').length,
    orderDisputes: store.collection('orderDisputes').length
  }, null, 2));
} finally {
  await store.close();
}
