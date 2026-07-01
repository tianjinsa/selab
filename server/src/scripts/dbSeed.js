import { createStore } from '../data/store.js';
import { seedDemoData } from '../services/seed.js';
import { checkLabelSimilarity, closeSemanticVectorStorage } from '../services/vectorAi.js';

async function warmSemanticVectors(store) {
  const settings = store.collection('settings');
  const targets = [
    ['forumTag', store.collection('tags').map((item) => item.name)],
    ['taskTag', store.collection('taskKeywords').map((item) => item.keyword)],
    ['taskCategory', settings.taskCategories || []],
    ['productCategory', (settings.productCategories || []).map((item) => item.name)],
    ['knowledgeEntry', store.collection('knowledgeEntries').map((item) => item.title)]
  ];
  for (const [entityType, labels] of targets) {
    await checkLabelSimilarity(store, entityType, labels).catch((error) => {
      console.warn(`向量预热跳过 ${entityType}：${error.message || error}`);
    });
  }
}

const store = await createStore();
try {
  const result = await seedDemoData(store);
  await warmSemanticVectors(store);
  console.log('演示数据生成完成：');
  console.log(`- 用户 ${result.users} 个`);
  console.log(`- 帖子 ${result.posts} 篇`);
  console.log(`- 任务 ${result.tasks} 个`);
  console.log(`- 商品 ${result.products} 个`);
  console.log('演示账号手机号：13800000001 / 13800000002 / 13800000003 / 13800000004，密码均为 123456。');
} finally {
  await closeSemanticVectorStorage();
  await store.close();
}
