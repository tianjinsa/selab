require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const store = require('./services/store');
const socketHub = require('./services/socketHub');
const { ok } = require('./response');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const communityRoutes = require('./routes/community');
const marketRoutes = require('./routes/market');
const messageRoutes = require('./routes/messages');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 8888);

store.load();
socketHub.createSocketServer(server);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => ok(res, { status: 'healthy', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);

const publicDir = path.resolve(__dirname, '../public');
app.use('/admin', express.static(publicDir));
app.use(express.static(publicDir));
app.get('/admin/*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use((req, res) => {
  res.status(404).json({ success: false, code: 404, message: '接口不存在' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ success: false, code: 500, message: '服务器内部错误', detail: error.message });
});

server.listen(port, () => {
  console.log(`Campus Smart Life API running at http://localhost:${port}`);
  console.log(`WebSocket endpoint ws://localhost:${port}/ws`);
});
