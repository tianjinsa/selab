export const currentUser = {
  id: 'u_1001',
  nickname: '林知夏',
  studentNo: '20260001',
  avatar: '/static/avatar1.png',
  creditScore: 96,
  creditLevel: 'A',
  phone: '138****8001',
};

export const taskCategories = ['全部', '跑腿代办', '学业互助', '技能服务', '其他互助'];

export const tasks = [
  {
    id: 'task_1001',
    title: '南门快递代取',
    type: '跑腿代办',
    reward: 8,
    deadline: '今天 20:00',
    location: '南门驿站 -> 梅园 3 栋',
    distance: '0.8km',
    status: '报名中',
    publisher: '林知夏',
    detail: '中号纸箱，送到宿舍楼下即可，平台已托管酬金。',
    applicants: 3,
    tags: ['酬金托管', '可私信'],
  },
  {
    id: 'task_1002',
    title: '高数期末重点串讲',
    type: '学业互助',
    reward: 35,
    deadline: '明天 18:30',
    location: '图书馆二楼讨论室',
    distance: '校内',
    status: '进行中',
    publisher: '周末末',
    detail: '梳理极限、积分、级数三章重点，预计 1.5 小时。',
    applicants: 6,
    tags: ['线下', '验收结算'],
  },
  {
    id: 'task_1003',
    title: 'PPT 美化排版',
    type: '技能服务',
    reward: 28,
    deadline: '周五 22:00',
    location: '线上交付',
    distance: '线上',
    status: '报名中',
    publisher: '陈一鸣',
    detail: '课程展示 PPT 共 18 页，需要统一配色和图表样式。',
    applicants: 2,
    tags: ['技能服务', '可线上'],
  },
];

export const leaderboard = [
  { name: '林知夏', level: 'A', completeRate: '98%', count: 42 },
  { name: '陈一鸣', level: 'A', completeRate: '96%', count: 37 },
  { name: '周末末', level: 'B', completeRate: '92%', count: 25 },
];

export const postTabs = ['推荐', '最新', '关注'];

export const posts = [
  {
    id: 'post_1001',
    author: '林知夏',
    avatar: '/static/avatar1.png',
    title: '期末周自习室避峰指南',
    content: '早上 7:30 前图书馆三楼还有不少靠窗位，晚上可以去教学楼 B 区。',
    image: '/static/home/card0.png',
    topics: ['期末周', '自习室'],
    likes: 128,
    comments: 26,
    views: 936,
    type: '经验分享',
  },
  {
    id: 'post_1002',
    author: '周末末',
    avatar: '/static/chat/avatar-Mollymolly.png',
    title: '有人一起拼校园跑打卡吗',
    content: '晚上 8 点操场集合，慢跑 3 公里，互相督促。',
    image: '/static/home/card1.png',
    topics: ['校园跑', '搭子'],
    likes: 76,
    comments: 18,
    views: 418,
    type: '求助',
  },
  {
    id: 'post_1003',
    author: '陈一鸣',
    avatar: '/static/chat/avatar-Sean.png',
    title: '软件工程课设资料整理',
    content: '整理了一份需求、接口、测试和答辩分工清单，适合小组推进。',
    image: '/static/home/card4.png',
    topics: ['课程设计', '资料'],
    likes: 94,
    comments: 11,
    views: 620,
    type: '经验分享',
  },
];

export const goodsCategories = ['全部', '数码', '书籍', '服饰', '生活用品'];

export const goods = [
  {
    id: 'goods_1001',
    name: '九成新无线键盘',
    category: '数码',
    price: 79,
    condition: '九成新',
    seller: '陈一鸣',
    sellerCredit: 'A',
    tradeMode: '校内自提',
    location: '竹园食堂',
    image: '/static/home/card2.png',
    status: '在售',
    views: 520,
    consults: 14,
  },
  {
    id: 'goods_1002',
    name: '数据结构教材+习题册',
    category: '书籍',
    price: 32,
    condition: '八成新',
    seller: '周末末',
    sellerCredit: 'B',
    tradeMode: '校内自提',
    location: '图书馆门口',
    image: '/static/home/card3.png',
    status: '在售',
    views: 386,
    consults: 9,
  },
  {
    id: 'goods_1003',
    name: '宿舍收纳推车',
    category: '生活用品',
    price: 45,
    condition: '九成新',
    seller: '林知夏',
    sellerCredit: 'A',
    tradeMode: '同城配送',
    location: '梅园 3 栋',
    image: '/static/home/card1.png',
    status: '在售',
    views: 244,
    consults: 6,
  },
];

export const notifications = [
  { type: '任务报名', title: '陈一鸣报名了你的快递代取任务', time: '12:28', unread: true },
  { type: '评论回复', title: '你的自习室帖子收到新回复', time: '11:20', unread: true },
  { type: '交易提醒', title: '数据结构教材订单待交付', time: '昨天', unread: false },
  { type: '系统公告', title: '平台敏感词规则已更新', time: '周五', unread: false },
];

export const agentTools = [
  { key: 'task', title: '任务推荐', icon: 'root-list', desc: '查找互助任务、状态和信用' },
  { key: 'market', title: '二手导购', icon: 'shop', desc: '查询商品、订单和卖家信用' },
  { key: 'community', title: '社区检索', icon: 'chat', desc: '搜索帖子、话题和评论' },
  { key: 'campus', title: '校园办事', icon: 'service', desc: '查询流程、规则和常见问题' },
];

export const agentQuickQuestions = ['今天有哪些跑腿任务？', '二手教材怎么担保交易？', '校园卡怎么挂失？'];

export const myStats = [
  { label: '信用分', value: '96' },
  { label: '任务完成', value: '42' },
  { label: '社区获赞', value: '128' },
  { label: '交易订单', value: '6' },
];
