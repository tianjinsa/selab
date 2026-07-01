import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import chatRoutes from './routes/chat.js';
import notificationRoutes from './routes/notifications.js';
import fileRoutes, { serveUploadedFile } from './routes/files.js';
import taskRoutes from './routes/tasks.js';
import forumRoutes from './routes/forum.js';
import marketRoutes from './routes/market.js';
import aiRoutes from './routes/ai.js';
import walletRoutes from './routes/wallet.js';
import { ApiError } from './utils/errors.js';

export function createApp(store, realtime) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.get('/uploads/:filename', serveUploadedFile);

  app.use(async (req, _res, next) => {
    req.store = store;
    req.realtime = realtime;
    try {
      if (req.path.startsWith('/api')) {
        await store.refreshFromDatabase?.();
      }
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
  app.use('/api', chatRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/forum', forumRoutes);
  app.use('/api/market', marketRoutes);
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
