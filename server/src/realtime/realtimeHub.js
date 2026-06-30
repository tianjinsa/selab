import { WebSocketServer } from 'ws';
import { verifyUserToken } from '../services/auth.js';
import { markConversationRead, sendMessage } from '../services/chat.js';

export class RealtimeHub {
  constructor(store) {
    this.store = store;
    this.clients = new Map();
    this.wss = null;
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  sendToUser(userId, event, payload) {
    const sockets = this.clients.get(userId);
    if (!sockets) return;
    const message = JSON.stringify({ event, payload });
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(message);
    }
  }

  handleConnection(ws, req) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) throw new Error('missing token');
      const user = verifyUserToken(token, this.store);
      ws.userId = user.id;
      if (!this.clients.has(user.id)) this.clients.set(user.id, new Set());
      this.clients.get(user.id).add(ws);
      ws.send(JSON.stringify({ event: 'auth.ok', payload: { userId: user.id } }));
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
        const { conversationId, content, type, imageUrl, card } = packet.payload || {};
        const message = await sendMessage(this.store, this, ws.userId, conversationId, { content, type, imageUrl, card });
        ws.send(JSON.stringify({ event: 'chat.message.sent', payload: { conversationId, message } }));
        return;
      }
      if (packet.event === 'chat.message.read') {
        const { conversationId } = packet.payload || {};
        await markConversationRead(this.store, this, ws.userId, conversationId);
        return;
      }
      ws.send(JSON.stringify({ event: 'error', payload: { message: '未知 WebSocket 事件' } }));
    } catch (error) {
      ws.send(JSON.stringify({ event: 'error', payload: { message: error.message || 'WebSocket 操作失败' } }));
    }
  }
}
