import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import counselorRoutes from './routes/counselor.js';
import chatRoutes from './routes/chat.js';
import notificationRoutes from './routes/notifications.js';
import fileRoutes, { serveUploadedFile } from './routes/files.js';
import taskRoutes from './routes/tasks.js';
import forumRoutes from './routes/forum.js';
import marketRoutes from './routes/market.js';
import aiRoutes from './routes/ai.js';
import walletRoutes from './routes/wallet.js';
import semanticRoutes from './routes/semantic.js';
import { ApiError } from './utils/errors.js';
import { collectionNames } from './data/defaultData.js';

const BASE_COLLECTIONS = ['settings', 'users'];
const CHAT_COLLECTIONS = ['conversations', 'messages', 'notifications'];
const FORUM_COLLECTIONS = [
  'posts',
  'comments',
  'tags',
  'postTags',
  'postLikes',
  'postFavorites',
  'follows',
  'reports',
  'contentModerationItems',
  'forumWordClouds',
  'forumAiSummaries',
  'notifications',
  'userCreditLogs'
];
const TASK_COLLECTIONS = [
  'tasks',
  'taskApplications',
  'taskDeliveries',
  'taskReviews',
  'taskDisputes',
  'taskCategoryRequests',
  'taskKeywords',
  'paymentFlows',
  'reports',
  'contentModerationItems',
  'walletTransactions',
  'notifications',
  ...CHAT_COLLECTIONS
];
const MARKET_COLLECTIONS = [
  'products',
  'productFavorites',
  'categoryRequests',
  'orders',
  'orderReviews',
  'orderDisputes',
  'paymentFlows',
  'reports',
  'contentModerationItems',
  'walletTransactions',
  'notifications',
  ...CHAT_COLLECTIONS
];
const AI_COLLECTIONS = [
  'aiSessions',
  'aiMessages',
  'aiToolCalls',
  'aiRiskAlerts',
  'aiConsultationStats',
  'colleges',
  'counselorAccounts',
  'counselorAlerts',
  'knowledgeBases',
  'knowledgeEntries',
  'tasks',
  'products',
  'posts',
  'contentModerationItems',
  'notifications'
];
const COUNSELOR_COLLECTIONS = [
  'colleges',
  'counselorAccounts',
  'counselorAlerts',
  'users',
  'contentModerationItems',
  'aiRiskAlerts',
  'aiSessions',
  'aiMessages',
  'posts',
  'tasks',
  'products'
];

function collectionsForRequest(req) {
  const pathName = req.path;
  if (!pathName.startsWith('/api')) return [];
  if (pathName === '/api/health') return ['settings'];
  if (pathName.startsWith('/api/admin')) return ['settings', ...collectionNames];
  if (pathName.startsWith('/api/counselor')) return ['settings', ...COUNSELOR_COLLECTIONS];
  if (pathName.startsWith('/api/auth') || pathName.startsWith('/api/profile')) return BASE_COLLECTIONS;
  if (pathName.startsWith('/api/notifications')) return [...BASE_COLLECTIONS, 'notifications'];
  if (pathName.startsWith('/api/files')) return [...BASE_COLLECTIONS, 'fileAssets'];
  if (pathName.startsWith('/api/wallet')) return [...BASE_COLLECTIONS, 'walletTransactions'];
  if (pathName.startsWith('/api/forum')) return [...BASE_COLLECTIONS, ...FORUM_COLLECTIONS];
  if (pathName.startsWith('/api/tags')) return [...BASE_COLLECTIONS, ...FORUM_COLLECTIONS];
  if (pathName.startsWith('/api/tasks')) return [...BASE_COLLECTIONS, ...TASK_COLLECTIONS];
  if (pathName.startsWith('/api/market')) return [...BASE_COLLECTIONS, ...MARKET_COLLECTIONS];
  if (pathName.startsWith('/api/products') || pathName.startsWith('/api/categories') || pathName.startsWith('/api/task-categories') || pathName.startsWith('/api/task-tags')) {
    return [...BASE_COLLECTIONS, ...TASK_COLLECTIONS, ...MARKET_COLLECTIONS, ...FORUM_COLLECTIONS];
  }
  if (pathName.startsWith('/api/ai')) return [...BASE_COLLECTIONS, ...AI_COLLECTIONS, ...TASK_COLLECTIONS, ...MARKET_COLLECTIONS, ...FORUM_COLLECTIONS];
  if (pathName.startsWith('/api/users')) {
    return [...BASE_COLLECTIONS, ...CHAT_COLLECTIONS, ...FORUM_COLLECTIONS, ...TASK_COLLECTIONS, ...MARKET_COLLECTIONS];
  }
  if (pathName.startsWith('/api/conversations') || pathName.startsWith('/api/messages')) {
    return [...BASE_COLLECTIONS, ...CHAT_COLLECTIONS];
  }
  return ['settings', ...collectionNames];
}

export function createApp(store, realtime) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.get('/uploads/:filename', serveUploadedFile);

  app.use(async (req, _res, next) => {
    req.store = store;
    req.realtime = realtime;
    try {
      await store.loadCollections?.(collectionsForRequest(req), { checkVersions: true });
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'campus-life-service',
      db: store.status,
      time: new Date().toISOString()
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/counselor', counselorRoutes);
  app.use('/api', chatRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/forum', forumRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api', semanticRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/wallet', walletRoutes);

  if (fs.existsSync(config.publicDir)) {
    app.use(express.static(config.publicDir));
    app.get('/admin*', (_req, res) => {
      res.sendFile(path.join(config.publicDir, 'admin.html'));
    });
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(config.publicDir, 'index.html'));
    });
  }

  app.use((req, _res, next) => {
    if (req.path.startsWith('/api')) return next(new ApiError(404, '接口不存在'));
    next();
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) {
      console.error(error);
    }
    res.status(status).json({
      error: {
        message: error.message || '服务器内部错误',
        details: error.details || null
      }
    });
  });

  return app;
}
