import { WebSocketServer } from 'ws';
import { verifyUserToken } from '../services/auth.js';
import { markConversationRead, sendMessage } from '../services/chat.js';
import { cancelAiRun, startAiRun } from '../services/ai.js';

const WS_OPEN = 1;

export class RealtimeHub {
  constructor(store) {
    this.store = store;
    this.clients = new Map();
    this.wss = null;
    this.heartbeatTimer = null;
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.heartbeatTimer = setInterval(() => this.pingClients(), 30 * 1000);
  }

  sendToUser(userId, event, payload) {
    const sockets = this.clients.get(userId);
    if (!sockets) return;
    const message = JSON.stringify({ event, payload });
    for (const ws of sockets) {
      if (ws.readyState === WS_OPEN) ws.send(message);
    }
  }

  handleConnection(ws, req) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) throw new Error('missing token');
      const user = verifyUserToken(token, this.store);
      ws.userId = user.id;
      ws.isAlive = true;
      if (!this.clients.has(user.id)) this.clients.set(user.id, new Set());
      this.clients.get(user.id).add(ws);
      ws.send(JSON.stringify({ event: 'auth.ok', payload: { userId: user.id } }));
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      ws.on('message', (raw) => this.handleMessage(ws, raw));
      ws.on('close', () => this.removeClient(ws));
      ws.on('error', () => this.removeClient(ws));
    } catch {
      ws.send(JSON.stringify({ event: 'auth.error', payload: { message: 'WebSocket 鉴权失败' } }));
      ws.close();
    }
  }

  removeClient(ws) {
    if (!ws.userId) return;
    const sockets = this.clients.get(ws.userId);
    if (!sockets) return;
    sockets.delete(ws);
    if (sockets.size === 0) this.clients.delete(ws.userId);
  }

  async handleMessage(ws, raw) {
    let packet;
    try {
      packet = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ event: 'error', payload: { message: '消息格式不正确' } }));
      return;
    }
    try {
      if (packet.event === 'chat.message.send') {
        const { conversationId, content, type, imageUrl, attachment, card } = packet.payload || {};
        const message = await sendMessage(this.store, this, ws.userId, conversationId, { content, type, imageUrl, attachment, card });
        ws.send(JSON.stringify({ event: 'chat.message.sent', payload: { conversationId, message } }));
        return;
      }
      if (packet.event === 'chat.message.read') {
        const { conversationId } = packet.payload || {};
        await markConversationRead(this.store, this, ws.userId, conversationId);
        return;
      }
      if (packet.event === 'ai.message.send') {
        const result = await startAiRun(this.store, this, ws.userId, packet.payload || {});
        ws.send(JSON.stringify({ event: 'ai.message.accepted', payload: result }));
        return;
      }
      if (packet.event === 'ai.run.cancel') {
        const { sessionId } = packet.payload || {};
        await cancelAiRun(this.store, ws.userId, sessionId);
        ws.send(JSON.stringify({ event: 'ai.run.cancelled', payload: { sessionId } }));
        return;
      }
      ws.send(JSON.stringify({ event: 'error', payload: { message: '未知 WebSocket 事件' } }));
    } catch (error) {
      ws.send(JSON.stringify({ event: 'error', payload: { message: error.message || 'WebSocket 操作失败' } }));
    }
  }

  pingClients() {
    if (!this.wss) return;
    for (const ws of this.wss.clients) {
      if (ws.isAlive === false) {
        this.removeClient(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        this.removeClient(ws);
        ws.terminate();
      }
    }
  }

  close() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.wss?.close();
    this.wss = null;
    this.clients.clear();
  }
}
