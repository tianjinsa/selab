export function createEmptyData() {
  return {
    users: [],
    userCreditLogs: [],
    conversations: [],
    messages: [],
    notifications: [],
    fileAssets: [],
    adminLogs: [],
    settings: {
      taskCategories: ['跑腿代办', '学业互助', '技能服务', '其他互助'],
      productCategories: [
        { id: 'cat-life', name: '生活用品', parentId: null },
        { id: 'cat-book', name: '教材资料', parentId: null },
        { id: 'cat-digital', name: '数码电子', parentId: null }
      ],
      sensitiveWords: ['诈骗', '赌博', '暴力'],
      taskRewardMin: 1,
      taskRewardMax: 500,
      mockEnabled: true,
      aiConfig: {
        baseUrl: '',
        apiKey: '',
        model: ''
      }
    }
  };
}

export const collectionNames = [
  'users',
  'userCreditLogs',
  'conversations',
  'messages',
  'notifications',
  'fileAssets',
  'adminLogs',
  'tasks',
  'taskApplications',
  'taskDeliveries',
  'taskReviews',
  'taskDisputes',
  'taskKeywords',
  'paymentFlows',
  'posts',
  'comments',
  'tags',
  'postTags',
  'postLikes',
  'postFavorites',
  'follows',
  'products',
  'productCategories',
  'categoryRequests',
  'orders',
  'orderReviews',
  'orderDisputes',
  'reports',
  'knowledgeEntries',
  'aiSessions',
  'aiMessages',
  'aiToolCalls',
  'aiRiskAlerts',
  'aiConsultationStats',
  'forumWordClouds',
  'forumAiSummaries'
];

export function normalizeData(raw) {
  const data = { ...createEmptyData(), ...(raw || {}) };
  for (const name of collectionNames) {
    if (!Array.isArray(data[name])) data[name] = [];
  }
  if (!data.settings || typeof data.settings !== 'object') {
    data.settings = createEmptyData().settings;
  }
  data.settings = { ...createEmptyData().settings, ...data.settings };
  return data;
}
