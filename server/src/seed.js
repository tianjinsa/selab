const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const now = new Date().toISOString();
const tomorrow = new Date(new Date(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
const passwordHash = bcrypt.hashSync('123456Aa', 10);

function makeId(prefix) {
  return `${prefix}_${uuid().slice(0, 8)}`;
}

const users = [
  {
    id: 'u_1001',
    account: '20260001',
    phone: '13800138001',
    role: 'student',
    passwordHash,
    nickname: '林知夏',
    avatar: '/static/avatar1.png',
    studentNo: '20260001',
    contact: '138****8001',
    schoolVerified: true,
    creditScore: 96,
    creditLevel: 'A',
    following: ['u_1002', 'u_1003'],
    muted: false,
    createdAt: now
  },
  {
    id: 'u_1002',
    account: '20260002',
    phone: '13800138002',
    role: 'student',
    passwordHash,
    nickname: '陈一鸣',
    avatar: '/static/chat/avatar-Sean.png',
    studentNo: '20260002',
    contact: '138****8002',
    schoolVerified: true,
    creditScore: 91,
    creditLevel: 'A',
    following: ['u_1001'],
    muted: false,
    createdAt: now
  },
  {
    id: 'u_1003',
    account: '20260003',
    phone: '13800138003',
    role: 'student',
    passwordHash,
    nickname: '周末末',
    avatar: '/static/chat/avatar-Mollymolly.png',
    studentNo: '20260003',
    contact: '138****8003',
    schoolVerified: true,
    creditScore: 88,
    creditLevel: 'B',
    following: ['u_1001'],
    muted: false,
    createdAt: now
  },
  {
    id: 'u_admin',
    account: 'admin',
    phone: '13900000000',
    role: 'admin',
    passwordHash,
    nickname: '平台管理员',
    avatar: '/static/icon_td.png',
    studentNo: 'ADMIN001',
    contact: 'admin@campus.local',
    schoolVerified: true,
    creditScore: 100,
    creditLevel: 'S',
    following: [],
    muted: false,
    createdAt: now
  }
];

const tasks = [
  {
    id: 'task_1001',
    title: '南门快递代取',
    type: '跑腿代办',
    reward: 8,
    deadline: '今天 20:00',
    distance: '0.8km',
    location: '南门驿站',
    detail: '取一个中号纸箱，送到梅园 3 栋楼下。',
    deliverable: '送达照片',
    publisherId: 'u_1001',
    assigneeId: '',
    applicants: ['u_1002'],
    status: '报名中',
    escrowPaid: true,
    views: 268,
    createdAt: '2026-06-29T09:20:00.000Z'
  },
  {
    id: 'task_1002',
    title: '高数期末重点串讲',
    type: '学业互助',
    reward: 35,
    deadline: '明天 18:30',
    distance: '图书馆',
    location: '图书馆二楼讨论室',
    detail: '帮忙梳理极限、积分、级数三章重点，1.5 小时左右。',
    deliverable: '线下讲解完成',
    publisherId: 'u_1003',
    assigneeId: 'u_1001',
    applicants: ['u_1001', 'u_1002'],
    status: '进行中',
    escrowPaid: true,
    views: 342,
    createdAt: '2026-06-28T15:10:00.000Z'
  },
  {
    id: 'task_1003',
    title: 'PPT 美化排版',
    type: '技能服务',
    reward: 28,
    deadline: '周五 22:00',
    distance: '线上',
    location: '线上交付',
    detail: '课程展示 PPT 共 18 页，需要统一配色和图表样式。',
    deliverable: 'PPT 文件',
    publisherId: 'u_1002',
    assigneeId: '',
    applicants: [],
    status: '报名中',
    escrowPaid: true,
    views: 198,
    createdAt: '2026-06-27T18:00:00.000Z'
  }
];

const posts = [
  {
    id: 'post_1001',
    authorId: 'u_1001',
    title: '期末周自习室避峰指南',
    content: '早上 7:30 前图书馆三楼还有不少靠窗位，晚上可以去教学楼 B 区。',
    type: '经验分享',
    topics: ['期末周', '自习室'],
    images: ['/static/home/card0.png'],
    likes: ['u_1002', 'u_1003'],
    favorites: ['u_1002'],
    shares: 16,
    views: 936,
    status: '已发布',
    createdAt: '2026-06-29T10:00:00.000Z'
  },
  {
    id: 'post_1002',
    authorId: 'u_1003',
    title: '有人一起拼校园跑打卡吗',
    content: '晚上 8 点操场集合，慢跑 3 公里，互相督促。',
    type: '求助',
    topics: ['校园跑', '搭子'],
    images: ['/static/home/card1.png'],
    likes: ['u_1001'],
    favorites: [],
    shares: 5,
    views: 418,
    status: '已发布',
    createdAt: '2026-06-28T19:30:00.000Z'
  }
];

const comments = [
  {
    id: 'comment_1001',
    postId: 'post_1001',
    authorId: 'u_1002',
    content: '补充：逸夫楼 5 楼下午人也少。',
    likes: ['u_1001'],
    parentId: '',
    createdAt: '2026-06-29T11:20:00.000Z'
  },
  {
    id: 'comment_1002',
    postId: 'post_1001',
    authorId: 'u_1003',
    content: '@林知夏 感谢，明天就去试试。',
    likes: [],
    parentId: 'comment_1001',
    createdAt: '2026-06-29T11:25:00.000Z'
  }
];

const goods = [
  {
    id: 'goods_1001',
    sellerId: 'u_1002',
    name: '九成新无线键盘',
    category: '数码',
    price: 79,
    condition: '九成新',
    tradeMode: '校内自提',
    location: '竹园食堂',
    description: '蓝牙双模，带防尘膜，适合平板和宿舍桌面使用。',
    images: ['/static/home/card2.png'],
    status: '在售',
    auditStatus: '通过',
    views: 520,
    consults: 14,
    favorites: ['u_1001'],
    createdAt: '2026-06-27T12:20:00.000Z'
  },
  {
    id: 'goods_1002',
    sellerId: 'u_1003',
    name: '数据结构教材+习题册',
    category: '书籍',
    price: 32,
    condition: '八成新',
    tradeMode: '校内自提',
    location: '图书馆门口',
    description: '笔记少，附重点页标签，适合复习。',
    images: ['/static/home/card3.png'],
    status: '在售',
    auditStatus: '通过',
    views: 386,
    consults: 9,
    favorites: [],
    createdAt: '2026-06-26T17:40:00.000Z'
  }
];

const orders = [
  {
    id: 'order_1001',
    goodsId: 'goods_1002',
    buyerId: 'u_1001',
    sellerId: 'u_1003',
    amount: 32,
    status: '待交付',
    escrowPaid: true,
    address: '图书馆门口',
    createdAt: '2026-06-29T12:00:00.000Z'
  }
];

const conversations = [
  {
    id: 'conv_1001',
    participantIds: ['u_1001', 'u_1002'],
    mutedBy: [],
    source: '任务互助',
    relatedCard: {
      type: 'task',
      id: 'task_1001',
      title: '南门快递代取',
      action: '报名沟通'
    },
    updatedAt: '2026-06-29T12:30:00.000Z'
  },
  {
    id: 'conv_1002',
    participantIds: ['u_1001', 'u_1003'],
    mutedBy: [],
    source: '二手市场',
    relatedCard: {
      type: 'goods',
      id: 'goods_1002',
      title: '数据结构教材+习题册',
      action: '交易咨询'
    },
    updatedAt: '2026-06-29T12:35:00.000Z'
  }
];

const messages = [
  {
    id: 'msg_1001',
    conversationId: 'conv_1001',
    fromUserId: 'u_1002',
    type: 'card',
    content: '我想报名这个任务，预计 30 分钟送达。',
    card: {
      type: 'taskApply',
      targetType: 'task',
      targetId: 'task_1001',
      title: '南门快递代取',
      summary: '陈一鸣 想接取该任务',
      requesterId: 'u_1002',
      ownerId: 'u_1001',
      status: 'pending',
      createdAt: now,
      expiresAt: tomorrow,
      actedAt: '',
      actionMessage: ''
    },
    readBy: ['u_1002'],
    createdAt: '2026-06-29T12:28:00.000Z'
  },
  {
    id: 'msg_1002',
    conversationId: 'conv_1002',
    fromUserId: 'u_1003',
    type: 'text',
    content: '教材还在，晚上 7 点图书馆门口方便吗？',
    card: null,
    readBy: ['u_1003'],
    createdAt: '2026-06-29T12:35:00.000Z'
  }
];

const notifications = [
  {
    id: 'notice_1001',
    userId: 'u_1001',
    type: '任务报名',
    title: '陈一鸣报名了你的快递代取任务',
    content: '可进入私信沟通细节并确认接单人。',
    read: false,
    relatedType: 'task',
    relatedId: 'task_1001',
    createdAt: '2026-06-29T12:28:00.000Z'
  },
  {
    id: 'notice_1002',
    userId: 'u_1001',
    type: '评论回复',
    title: '你的帖子收到新回复',
    content: '补充：逸夫楼 5 楼下午人也少。',
    read: false,
    relatedType: 'post',
    relatedId: 'post_1001',
    createdAt: '2026-06-29T11:20:00.000Z'
  }
];

const reports = [
  {
    id: 'report_1001',
    targetType: 'post',
    targetId: 'post_1002',
    reporterId: 'u_1002',
    reason: '疑似刷屏',
    status: '待审核',
    result: '',
    createdAt: '2026-06-29T13:00:00.000Z'
  }
];

const knowledgeBase = [
  {
    id: 'kb_1001',
    category: '校园办事',
    title: '校园卡挂失流程',
    content: '进入学校服务大厅，选择校园卡挂失，也可到一卡通中心人工办理。',
    source: '学生事务中心办事指南',
    version: 1,
    updatedAt: now
  },
  {
    id: 'kb_1002',
    category: '平台指引',
    title: '任务酬金托管规则',
    content: '发布任务时酬金进入平台托管，验收完成后支付给接单者，取消或超时则原路退回。',
    source: '校园智能生活服务平台规则',
    version: 1,
    updatedAt: now
  }
];

const prompts = [
  {
    id: 'prompt_1001',
    scene: '客服咨询',
    content: '你是校园智能生活服务平台客服，请优先回答校园场景和平台操作问题，并给出可追溯来源。',
    version: 1,
    active: true,
    updatedAt: now
  },
  {
    id: 'prompt_1002',
    scene: '内容生成',
    content: '你帮助学生生成清晰、友善、合规的帖子或任务描述，避免夸张和违规内容。',
    version: 1,
    active: true,
    updatedAt: now
  }
];

const settings = {
  taskCategories: ['跑腿代办', '学业互助', '技能服务', '其他互助'],
  taskRewardRange: [1, 300],
  taskTimeoutHours: 48,
  creditRules: {
    taskComplete: 2,
    lateDelivery: -5,
    violation: -20
  },
  communityCategories: ['求助', '经验分享', '校园生活', '活动组队'],
  sensitiveWords: ['违规交易', '代考', '作弊'],
  rankingRefresh: '每小时',
  goodsCategories: [
    { name: '数码', children: ['手机平板', '电脑配件', '影音设备'] },
    { name: '书籍', children: ['教材教辅', '考试资料', '课外读物'] },
    { name: '服饰', children: ['上衣', '鞋包', '配饰'] },
    { name: '生活用品', children: ['宿舍日用', '运动户外', '小家电'] }
  ],
  invitationRequired: true
};

const invitations = [
  {
    code: 'CAMPUS2026',
    createdBy: 'u_admin',
    usedBy: [],
    limit: 100,
    expiresAt: '2026-12-31T23:59:59.000Z'
  }
];

module.exports = {
  meta: { version: 1, seededAt: now },
  users,
  tasks,
  posts,
  comments,
  goods,
  orders,
  conversations,
  messages,
  notifications,
  reports,
  knowledgeBase,
  prompts,
  settings,
  invitations,
  agentSessions: [],
  audits: [
    {
      id: makeId('audit'),
      type: 'system',
      title: '演示数据初始化',
      actorId: 'u_admin',
      createdAt: now
    }
  ]
};
