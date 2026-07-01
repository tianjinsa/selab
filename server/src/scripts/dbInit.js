import sql from 'mssql';
import { config } from '../config.js';
import { createStore } from '../data/store.js';
import { seedCatalogData } from '../services/seed.js';
import { checkLabelSimilarity, closeSemanticVectorStorage } from '../services/vectorAi.js';

function sqlConfig(database) {
  return {
    server: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: config.db.trustServerCertificate
    },
    pool: {
      max: 1,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

function quoteSqlString(value) {
  return String(value).replaceAll("'", "''");
}

function quoteSqlIdentifier(value) {
  return String(value).replaceAll(']', ']]');
}

function assertSafeDatabaseName(name) {
  const value = String(name || '').trim();
  if (!value) throw new Error('DB_NAME 不能为空');
  if (['master', 'model', 'msdb', 'tempdb'].includes(value.toLowerCase())) {
    throw new Error(`拒绝删除系统数据库：${value}`);
  }
  return value;
}

async function dropDatabase() {
  const database = assertSafeDatabaseName(config.db.database);
  const pool = await new sql.ConnectionPool(sqlConfig('master')).connect();
  try {
    await pool.request().query(`
      IF DB_ID(N'${quoteSqlString(database)}') IS NOT NULL
      BEGIN
        ALTER DATABASE [${quoteSqlIdentifier(database)}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [${quoteSqlIdentifier(database)}];
      END
    `);
  } finally {
    await pool.close();
  }
}

async function warmSemanticVectors(store) {
  const settings = store.collection('settings');
  const targets = [
    ['forumTag', store.collection('tags').map((item) => item.name)],
    ['taskTag', store.collection('taskKeywords').map((item) => item.keyword)],
    ['taskCategory', settings.taskCategories || []],
    ['productCategory', (settings.productCategories || []).map((item) => item.name)]
  ];
  for (const [entityType, labels] of targets) {
    await checkLabelSimilarity(store, entityType, labels).catch((error) => {
      console.warn(`向量预热跳过 ${entityType}：${error.message || error}`);
    });
  }
}

console.log(`准备重建 SQL Server 数据库：${config.db.host}:${config.db.port}/${config.db.database}`);
await dropDatabase();
console.log('目标数据库已删除，开始重新建库和建表...');

const store = await createStore();
try {
  await seedCatalogData(store);
  await warmSemanticVectors(store);
  console.log('数据库初始化完成，已预置任务分类、商品分类、论坛 Tag 和任务标签。');
} finally {
  await closeSemanticVectorStorage();
  await store.close();
}
