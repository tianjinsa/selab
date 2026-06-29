const WebSocket = require('ws');
const auth = require('./auth');

const clients = new Map();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastToUser(userId, payload) {
  const set = clients.get(userId);
  if (!set) return;
  set.forEach((ws) => send(ws, payload));
}

function createSocketServer(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    let userId = 'anonymous';
    try {
      if (token) userId = auth.verify(token).sub;
    } catch (error) {
      send(ws, { type: 'error', message: '登录状态已失效' });
    }

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);

    ws.on('close', () => {
      const set = clients.get(userId);
      if (!set) return;
      set.delete(ws);
      if (!set.size) clients.delete(userId);
    });

    send(ws, { type: 'connected', userId });
  });

  return wss;
}

module.exports = {
  createSocketServer,
  broadcastToUser
};
