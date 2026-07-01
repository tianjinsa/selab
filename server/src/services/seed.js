import { hashPassword } from './auth.js';

const presetTaskCategories = ['跑腿代办', '学业互助', '技能服务', '资料共享', '校园办事', '活动协助', '其他互助'];
const presetTaskTags = ['取快递', '取外卖', '代打印', '课程资料', '作业辅导', '技能服务', '跑腿', '教材', '实验', '图书馆', '食堂'];
const presetForumTags = ['校园生活', '经验分享', '学习资料', '保研经验', '二手交易', '宿舍生活', '校园办事', '活动招募'];
const presetProductCategories = [
  { id: 'cat-life', name: '生活用品', parentId: null },
  { id: 'cat-book', name: '教材资料', parentId: null },
  { id: 'cat-digital', name: '数码电子', parentId: null },
  { id: 'cat-sport', name: '运动户外', parentId: null },
  { id: 'cat-stationery', name: '文具耗材', parentId: null },
  { id: 'cat-appliance', name: '宿舍电器', parentId: null }
];
const presetGradeCategoryMap = {
  freshman: ['生活用品', '教材资料', '文具耗材'],
  middle: ['教材资料', '数码电子', '运动户外'],
  senior: ['生活用品', '数码电子', '宿舍电器'],
  unknown: ['生活用品', '教材资料', '数码电子', '文具耗材']
};

function now() {
  return new Date().toISOString();
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function daysLater(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function demoId(type, suffix) {
  return `demo-${type}-${suffix}`;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function seedCatalogData(store) {
  const settings = store.collection('settings');
  const productById = new Map((settings.productCategories || []).map((item) => [item.id, item]));
  for (const category of presetProductCategories) {
    productById.set(category.id, { ...category, ...productById.get(category.id) });
  }
  const nextSettings = {
    taskCategories: [...new Set([...(settings.taskCategories || []), ...presetTaskCategories])],
    productCategories: [...productById.values()],
    gradeCategoryMap: { ...presetGradeCategoryMap, ...(settings.gradeCategoryMap || {}) }
  };
  const settingsChanged = !sameJson(settings.taskCategories || [], nextSettings.taskCategories)
    || !sameJson(settings.productCategories || [], nextSettings.productCategories)
    || !sameJson(settings.gradeCategoryMap || {}, nextSettings.gradeCategoryMap);
  if (settingsChanged) {
    await store.updateSettings(nextSettings);
  }

  const existingTags = store.collection('tags');
  const nextTags = [...existingTags];
  let tagsChanged = false;
  for (const name of presetForumTags) {
    if (!nextTags.some((item) => item.name === name)) {
      nextTags.push({
        id: demoId('tag', name),
        name,
        createdAt: now(),
        updatedAt: now()
      });
      tagsChanged = true;
    }
  }
  if (tagsChanged) {
    await store.replaceCollection('tags', nextTags);
  }

  const existingKeywords = store.collection('taskKeywords');
  const nextKeywords = [...existingKeywords];
  let keywordsChanged = false;
  for (const keyword of presetTaskTags) {
    if (!nextKeywords.some((item) => item.keyword === keyword && item.taskId === 'preset')) {
      nextKeywords.push({
        id: demoId('task-keyword', keyword),
        taskId: 'preset',
        keyword,
        createdAt: now(),
        updatedAt: now()
      });
      keywordsChanged = true;
    }
  }
  if (keywordsChanged) {
    await store.replaceCollection('taskKeywords', nextKeywords);
  }
}

export async function seedInitialData(store) {
  await seedCatalogData(store);
  if (await store.count('users') === 0) {
    await store.replaceCollection('users', initialUsers(await hashPassword('123456')));
  }
  if (await store.count('knowledgeEntries') === 0) {
    await seedKnowledge(store);
  }
}

export async function seedDemoData(store) {
  await seedCatalogData(store);
  const passwordHash = await hashPassword('123456');
  await replaceDemoCollection(store, 'users', demoUsers(passwordHash));
  await seedDemoKnowledge(store);

  await replaceDemoCollection(store, 'posts', demoPosts());
  await replaceDemoCollection(store, 'postTags', demoPostTags());
  await replaceDemoCollection(store, 'comments', demoComments());
  await replaceDemoCollection(store, 'postLikes', demoPostLikes());
  await replaceDemoCollection(store, 'postFavorites', demoPostFavorites());
  await replaceDemoCollection(store, 'follows', demoFollows());

  await replaceDemoCollection(store, 'tasks', demoTasks());
  await replaceDemoCollection(store, 'taskKeywords', [...store.collection('taskKeywords').filter((item) => item.taskId === 'preset'), ...demoTaskKeywords()]);
  await replaceDemoCollection(store, 'taskApplications', demoTaskApplications());

  await replaceDemoCollection(store, 'products', demoProducts());
  await replaceDemoCollection(store, 'productFavorites', demoProductFavorites());
  await replaceDemoCollection(store, 'orders', demoOrders());
  await replaceDemoCollection(store, 'paymentFlows', demoPaymentFlows());
  await replaceDemoCollection(store, 'walletTransactions', demoWalletTransactions());
  await replaceDemoCollection(store, 'notifications', demoNotifications());

  return {
    users: demoUsers(passwordHash).length,
    posts: demoPosts().length,
    tasks: demoTasks().length,
    products: demoProducts().length
  };
}

function initialUsers(passwordHash) {
  return [
    {
      id: demoId('user', 'lin'),
      studentId: '202431204001',
      phone: '13800000001',
      passwordHash,
      nickname: '林同学',
      avatarUrl: '',
      coverUrl: '',
      contact: 'QQ 10001',
      bio: '可以帮忙取快递，也喜欢逛二手市场。',
      creditScore: 10,
      isBanned: false,
      isMuted: false,
      isPublishRestricted: false,
      isDemo: true,
      createdAt: daysAgo(12),
      updatedAt: daysAgo(1),
      lastLoginAt: ''
    },
    {
      id: demoId('user', 'zhou'),
      studentId: '202431204099',
      phone: '13800000002',
      passwordHash,
      nickname: '周同学',
      avatarUrl: '',
      coverUrl: '',
      contact: '微信 campus-demo',
      bio: '学业互助和教材资料交流。',
      creditScore: 10,
      isBanned: false,
      isMuted: false,
      isPublishRestricted: false,
      isDemo: true,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(1),
      lastLoginAt: ''
    }
  ];
}

function demoUsers(passwordHash) {
  return [
    ...initialUsers(passwordHash),
    {
      id: demoId('user', 'chen'),
      studentId: '202431304088',
      phone: '13800000003',
      passwordHash,
      nickname: '陈同学',
      avatarUrl: '',
      coverUrl: '',
      contact: 'QQ 10003',
      bio: '数码和宿舍好物爱好者。',
      creditScore: 8,
      isBanned: false,
      isMuted: false,
      isPublishRestricted: false,
      isDemo: true,
      createdAt: daysAgo(8),
      updatedAt: daysAgo(1),
      lastLoginAt: ''
    },
    {
      id: demoId('user', 'wang'),
      studentId: '202431404066',
      phone: '13800000004',
      passwordHash,
      nickname: '王同学',
      avatarUrl: '',
      coverUrl: '',
      contact: '微信 demo-wang',
      bio: '擅长 Python、PPT 和实验报告排版。',
      creditScore: 9,
      isBanned: false,
      isMuted: false,
      isPublishRestricted: false,
      isDemo: true,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(1),
      lastLoginAt: ''
    }
  ];
}

async function seedKnowledge(store) {
  await store.replaceCollection('knowledgeBases', [
    {
      id: 'kb-default',
      name: '默认知识库',
      description: '校园办事、平台规则和常见问题',
      enabled: true,
      createdAt: daysAgo(15),
      updatedAt: now()
    }
  ]);
  await store.replaceCollection('knowledgeEntries', [
    {
      id: demoId('knowledge', 'express'),
      knowledgeBaseId: 'kb-default',
      title: '校园快递点开放时间',
      category: '校园办事流程',
      content: '快递点通常在 9:00-21:00 开放，节假日以学校通知为准。取件请携带取件码和校园卡。',
      source: '后勤服务中心',
      createdAt: daysAgo(15),
      updatedAt: now()
    },
    {
      id: demoId('knowledge', 'task-rule'),
      knowledgeBaseId: 'kb-default',
      title: '平台任务互助说明',
      category: '平台使用说明',
      content: '用户发布任务需要完成模拟支付，任务完成后系统记录模拟结算流水。信用分低于 4 分不能接任务。',
      source: '平台规则',
      createdAt: daysAgo(15),
      updatedAt: now()
    },
    {
      id: demoId('knowledge', 'market-rule'),
      knowledgeBaseId: 'kb-default',
      title: '二手市场担保流程',
      category: '平台使用说明',
      content: '买家申请购买后由卖家确认，买家模拟支付后卖家线下交付，买家确认收货后订单完成。',
      source: '平台规则',
      createdAt: daysAgo(15),
      updatedAt: now()
    }
  ]);
}

async function seedDemoKnowledge(store) {
  const existingBases = store.collection('knowledgeBases');
  let base = existingBases.find((item) => item.id === 'kb-default' && !item.deletedAt);
  if (!base) {
    base = {
      id: 'kb-default',
      name: '默认知识库',
      description: '校园办事、平台规则和常见问题',
      enabled: true,
      isDemo: true,
      createdAt: daysAgo(15),
      updatedAt: now()
    };
    await replaceDemoCollection(store, 'knowledgeBases', [base]);
  }
  await replaceDemoCollection(store, 'knowledgeEntries', [
    {
      id: demoId('knowledge', 'express'),
      knowledgeBaseId: base.id,
      title: '校园快递点开放时间',
      category: '校园办事流程',
      content: '快递点通常在 9:00-21:00 开放，节假日以学校通知为准。取件请携带取件码和校园卡。',
      source: '后勤服务中心',
      isDemo: true,
      createdAt: daysAgo(15),
      updatedAt: now()
    },
    {
      id: demoId('knowledge', 'task-rule'),
      knowledgeBaseId: base.id,
      title: '平台任务互助说明',
      category: '平台使用说明',
      content: '用户发布任务需要完成模拟支付，任务完成后系统记录模拟结算流水。信用分低于 4 分不能接任务。',
      source: '平台规则',
      isDemo: true,
      createdAt: daysAgo(15),
      updatedAt: now()
    },
    {
      id: demoId('knowledge', 'market-rule'),
      knowledgeBaseId: base.id,
      title: '二手市场担保流程',
      category: '平台使用说明',
      content: '买家申请购买后由卖家确认，买家模拟支付后卖家线下交付，买家确认收货后订单完成。',
      source: '平台规则',
      isDemo: true,
      createdAt: daysAgo(15),
      updatedAt: now()
    }
  ]);
}

function demoPosts() {
  return [
    {
      id: demoId('post', 'baoyan'),
      authorId: demoId('user', 'zhou'),
      title: '保研资料应该提前怎么准备',
      content: '整理了专业课成绩、科研经历和夏令营材料的准备顺序，建议从大二下开始维护简历。',
      type: '经验分享帖',
      imageUrls: [],
      visibility: 'public',
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: daysAgo(2),
      moderationRejectedAt: '',
      viewCount: 128,
      shareCount: 6,
      deletedAt: '',
      isDemo: true,
      createdAt: daysAgo(4),
      updatedAt: daysAgo(2)
    },
    {
      id: demoId('post', 'library'),
      authorId: demoId('user', 'lin'),
      title: '图书馆三楼自习位体验',
      content: '下午四点以后靠窗位置比较安静，插座也够用，适合写实验报告。',
      type: '校园生活',
      imageUrls: [],
      visibility: 'public',
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: daysAgo(1),
      moderationRejectedAt: '',
      viewCount: 76,
      shareCount: 2,
      deletedAt: '',
      isDemo: true,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1)
    }
  ];
}

function demoPostTags() {
  return [
    { id: demoId('post-tag', 'baoyan-1'), postId: demoId('post', 'baoyan'), name: '保研经验', isDemo: true, createdAt: daysAgo(4), updatedAt: daysAgo(4) },
    { id: demoId('post-tag', 'baoyan-2'), postId: demoId('post', 'baoyan'), name: '学习资料', isDemo: true, createdAt: daysAgo(4), updatedAt: daysAgo(4) },
    { id: demoId('post-tag', 'library-1'), postId: demoId('post', 'library'), name: '校园生活', isDemo: true, createdAt: daysAgo(2), updatedAt: daysAgo(2) }
  ];
}

function demoComments() {
  return [
    { id: demoId('comment', 'baoyan-1'), postId: demoId('post', 'baoyan'), parentId: '', authorId: demoId('user', 'wang'), content: '这个时间线很有用，夏令营材料可以再细讲一下吗？', likeUserIds: [demoId('user', 'lin')], deletedAt: '', isDemo: true, createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { id: demoId('comment', 'library-1'), postId: demoId('post', 'library'), parentId: '', authorId: demoId('user', 'chen'), content: '三楼靠窗下午阳光有点晒，但晚上确实很安静。', likeUserIds: [], deletedAt: '', isDemo: true, createdAt: daysAgo(1), updatedAt: daysAgo(1) }
  ];
}

function demoTasks() {
  return [
    {
      id: demoId('task', 'express'),
      publisherId: demoId('user', 'lin'),
      title: '今晚帮取快递到信息楼',
      category: '跑腿代办',
      campusArea: '主校区',
      reward: 8,
      deadlineAt: daysLater(1),
      detail: '快递在菜鸟驿站，小件文件袋，送到信息楼大厅即可。',
      deliveryRequirement: '拍照确认放置位置。',
      contactNote: '到楼下后私信我。',
      tags: ['取快递', '跑腿'],
      imageUrls: [],
      status: 'open',
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: daysAgo(1),
      moderationRejectedAt: '',
      publishedAt: daysAgo(1),
      acceptedAt: '',
      completedAt: '',
      hiddenAt: '',
      deletedAt: '',
      isDemo: true,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1)
    },
    {
      id: demoId('task', 'python'),
      publisherId: demoId('user', 'zhou'),
      title: 'Python 实验报告排版检查',
      category: '学业互助',
      campusArea: '东校区',
      reward: 25,
      deadlineAt: daysLater(2),
      detail: '帮忙检查实验报告格式、截图编号和代码说明，不需要代写。',
      deliveryRequirement: '标注需要修改的位置。',
      contactNote: '可以通过私信发 Word 文档。',
      tags: ['实验', '作业辅导', '课程资料'],
      imageUrls: [],
      status: 'open',
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: daysAgo(1),
      moderationRejectedAt: '',
      publishedAt: daysAgo(2),
      acceptedAt: '',
      completedAt: '',
      hiddenAt: '',
      deletedAt: '',
      isDemo: true,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1)
    },
    {
      id: demoId('task', 'poster'),
      publisherId: demoId('user', 'chen'),
      title: '社团活动海报简单设计',
      category: '技能服务',
      campusArea: '主校区',
      reward: 45,
      deadlineAt: daysLater(3),
      detail: '需要一张 A4 活动海报，已有文案和 logo。',
      deliveryRequirement: '交付 PNG 和可编辑源文件。',
      contactNote: '先私信沟通风格。',
      tags: ['技能服务', '活动协助'],
      imageUrls: [],
      status: 'accepted',
      assigneeId: demoId('user', 'wang'),
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: daysAgo(2),
      moderationRejectedAt: '',
      publishedAt: daysAgo(5),
      acceptedAt: daysAgo(1),
      completedAt: '',
      hiddenAt: '',
      deletedAt: '',
      isDemo: true,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(1)
    }
  ];
}

function demoTaskKeywords() {
  return demoTasks().flatMap((task) => task.tags.map((keyword) => ({
    id: demoId('task-keyword', `${task.id}-${keyword}`),
    taskId: task.id,
    keyword,
    isDemo: true,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  })));
}

function demoTaskApplications() {
  return [
    {
      id: demoId('task-application', 'poster'),
      taskId: demoId('task', 'poster'),
      publisherId: demoId('user', 'chen'),
      applicantId: demoId('user', 'wang'),
      status: 'accepted',
      message: '我可以今晚做初稿。',
      expiresAt: daysLater(1),
      isDemo: true,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1)
    }
  ];
}

function demoProducts() {
  return [
    {
      id: demoId('product', 'book'),
      sellerId: demoId('user', 'zhou'),
      title: '数据结构教材和习题册',
      categoryId: 'cat-book',
      price: 28,
      condition: '轻微使用',
      detail: '教材有少量笔记，习题册基本全新。',
      tradeMethod: '校内面交',
      pickupLocation: '图书馆门口',
      imageUrls: [],
      status: 'on_sale',
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: daysAgo(1),
      moderationRejectedAt: '',
      stock: 1,
      viewCount: 88,
      soldAt: '',
      lockedOrderId: '',
      hiddenAt: '',
      deletedAt: '',
      isDemo: true,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1)
    },
    {
      id: demoId('product', 'keyboard'),
      sellerId: demoId('user', 'chen'),
      title: '蓝牙机械键盘',
      categoryId: 'cat-digital',
      price: 99,
      condition: '几乎全新',
      detail: '宿舍用过两周，声音偏轻，带原盒。',
      tradeMethod: '宿舍楼下',
      pickupLocation: '6 号楼楼下',
      imageUrls: [],
      status: 'on_sale',
      moderationStatus: 'approved',
      moderationReason: '',
      moderationCheckedAt: daysAgo(1),
      moderationRejectedAt: '',
      stock: 1,
      viewCount: 156,
      soldAt: '',
      lockedOrderId: '',
      hiddenAt: '',
      deletedAt: '',
      isDemo: true,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1)
    }
  ];
}

function demoOrders() {
  return [
    {
      id: demoId('order', 'book'),
      productId: demoId('product', 'book'),
      buyerId: demoId('user', 'lin'),
      sellerId: demoId('user', 'zhou'),
      status: 'applying',
      price: 28,
      expiresAt: daysLater(1),
      cancelReason: '',
      paidAt: '',
      deliveredAt: '',
      completedAt: '',
      isDemo: true,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1)
    }
  ];
}

function demoPaymentFlows() {
  return [
    {
      id: demoId('payment-flow', 'task-express'),
      userId: demoId('user', 'lin'),
      relatedType: 'task',
      relatedId: demoId('task', 'express'),
      type: 'task_publish_payment',
      amount: 8,
      status: 'success',
      title: '任务发布支付：今晚帮取快递到信息楼',
      serialNo: 'PAY-DEMO-TASK-EXPRESS',
      isDemo: true,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1)
    },
    {
      id: demoId('payment-flow', 'task-python'),
      userId: demoId('user', 'zhou'),
      relatedType: 'task',
      relatedId: demoId('task', 'python'),
      type: 'task_publish_payment',
      amount: 25,
      status: 'success',
      title: '任务发布支付：Python 实验报告排版检查',
      serialNo: 'PAY-DEMO-TASK-PYTHON',
      isDemo: true,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2)
    },
    {
      id: demoId('payment-flow', 'task-poster'),
      userId: demoId('user', 'chen'),
      relatedType: 'task',
      relatedId: demoId('task', 'poster'),
      type: 'task_publish_payment',
      amount: 45,
      status: 'success',
      title: '任务发布支付：社团活动海报简单设计',
      serialNo: 'PAY-DEMO-TASK-POSTER',
      isDemo: true,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5)
    }
  ];
}

function demoProductFavorites() {
  return [
    { id: demoId('product-favorite', 'keyboard'), productId: demoId('product', 'keyboard'), userId: demoId('user', 'lin'), isDemo: true, createdAt: daysAgo(1), updatedAt: daysAgo(1) }
  ];
}

function demoPostLikes() {
  return [
    { id: demoId('post-like', 'baoyan-lin'), postId: demoId('post', 'baoyan'), userId: demoId('user', 'lin'), isDemo: true, createdAt: daysAgo(2), updatedAt: daysAgo(2) }
  ];
}

function demoPostFavorites() {
  return [
    { id: demoId('post-favorite', 'baoyan-chen'), postId: demoId('post', 'baoyan'), userId: demoId('user', 'chen'), isDemo: true, createdAt: daysAgo(2), updatedAt: daysAgo(2) }
  ];
}

function demoFollows() {
  return [
    { id: demoId('follow', 'lin-zhou'), followerId: demoId('user', 'lin'), followingId: demoId('user', 'zhou'), isDemo: true, createdAt: daysAgo(2), updatedAt: daysAgo(2) },
    { id: demoId('follow', 'chen-wang'), followerId: demoId('user', 'chen'), followingId: demoId('user', 'wang'), isDemo: true, createdAt: daysAgo(1), updatedAt: daysAgo(1) }
  ];
}

function demoWalletTransactions() {
  return [
    {
      id: demoId('wallet', 'lin-topup'),
      userId: demoId('user', 'lin'),
      type: 'income',
      direction: 'in',
      amount: 100,
      balanceBefore: 0,
      balanceAfter: 100,
      title: '演示充值',
      status: 'success',
      relatedType: 'demo',
      relatedId: '',
      source: 'demo_seed',
      serialNo: 'WAL-DEMO-LIN-TOPUP',
      isDemo: true,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2)
    }
  ];
}

function demoNotifications() {
  return [
    { id: demoId('notification', 'lin'), userId: demoId('user', 'lin'), type: 'system', title: '演示数据已生成', body: '可以从任务、论坛和二手市场页面查看演示内容。', link: '/', sourceId: 'demo', isRead: false, isDemo: true, createdAt: now(), updatedAt: now() }
  ];
}

async function replaceDemoCollection(store, name, demoItems) {
  const kept = store.collection(name).filter((item) => !item.isDemo && !String(item.id || '').startsWith('demo-'));
  await store.replaceCollection(name, [...kept, ...demoItems]);
}
