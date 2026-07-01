export function createEmptyData() {
  return {
    users: [],
    userCreditLogs: [],
    conversations: [],
    messages: [],
    notifications: [],
    contentModerationItems: [],
    walletTransactions: [],
    fileAssets: [],
    adminLogs: [],
    knowledgeBases: [],
    settings: {
      taskCategories: ['跑腿代办', '学业互助', '技能服务', '其他互助'],
      productCategories: [
        { id: 'cat-life', name: '生活用品', parentId: null },
        { id: 'cat-book', name: '教材资料', parentId: null },
        { id: 'cat-digital', name: '数码电子', parentId: null }
      ],
      gradeCategoryMap: {
        freshman: ['生活用品', '教材资料'],
        middle: ['教材资料', '数码电子'],
        senior: ['生活用品', '数码电子'],
        unknown: ['生活用品', '教材资料', '数码电子']
      },
      sensitiveWords: ['诈骗', '赌博', '暴力'],
      taskRewardMin: 1,
      taskRewardMax: 500,
      mockEnabled: true,
      aiConfig: {
        baseUrl: '',
        apiKey: '',
        model: '',
        embeddingModel: 'text-embedding-3-small',
        includeReasoning: false,
        enableThinking: false,
        thinkingType: '',
        reasoningEffort: ''
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
  'contentModerationItems',
  'walletTransactions',
  'fileAssets',
  'adminLogs',
  'tasks',
  'taskApplications',
  'taskDeliveries',
  'taskReviews',
  'taskDisputes',
  'taskCategoryRequests',
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
  'productFavorites',
  'productCategories',
  'categoryRequests',
  'orders',
  'orderReviews',
  'orderDisputes',
  'reports',
  'knowledgeBases',
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
