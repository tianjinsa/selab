const express = require('express');
const auth = require('../services/auth');
const agent = require('../services/agent');
const store = require('../services/store');
const { ok, fail } = require('../response');

const router = express.Router();

router.get('/knowledge', auth.requireAuth, (req, res) => ok(res, req.data.knowledgeBase));

router.post('/knowledge', auth.requireAdmin, (req, res) => {
  const item = {
    id: store.id('kb'),
    category: req.body.category,
    title: req.body.title,
    content: req.body.content,
    source: req.body.source || '管理员录入',
    version: Number(req.body.version || 1),
    updatedAt: store.now()
  };
  req.data.knowledgeBase.unshift(item);
  store.save(req.data);
  return ok(res, item, '知识库词条已创建');
});

router.put('/knowledge/:id', auth.requireAdmin, (req, res) => {
  const item = req.data.knowledgeBase.find((entry) => entry.id === req.params.id);
  if (!item) return fail(res, 404, '知识库词条不存在');
  ['category', 'title', 'content', 'source'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) item[key] = req.body[key];
  });
  item.version += 1;
  item.updatedAt = store.now();
  store.save(req.data);
  return ok(res, item, '知识库词条已更新');
});

router.get('/prompts', auth.requireAdmin, (req, res) => ok(res, req.data.prompts));

router.post('/prompts', auth.requireAdmin, (req, res) => {
  const prompt = {
    id: store.id('prompt'),
    scene: req.body.scene,
    content: req.body.content,
    version: Number(req.body.version || 1),
    active: Boolean(req.body.active ?? true),
    updatedAt: store.now()
  };
  req.data.prompts.unshift(prompt);
  store.save(req.data);
  return ok(res, prompt, '提示词已创建');
});

router.post('/chat', auth.requireAuth, (req, res) => {
  const result = agent.answer(req.data, req.body.question);
  const sessionId = req.body.sessionId || store.id('session');
  let session = req.data.agentSessions.find((item) => item.id === sessionId);
  if (!session) {
    session = { id: sessionId, userId: req.user.id, title: req.body.question || '新会话', messages: [], createdAt: store.now() };
    req.data.agentSessions.unshift(session);
  }
  session.messages.push({ role: 'user', content: req.body.question, createdAt: store.now() });
  session.messages.push({ role: 'assistant', content: result.answer, sources: result.sources, toolCall: result.toolCall, createdAt: store.now() });
  session.updatedAt = store.now();
  store.save(req.data);
  return ok(res, { sessionId, ...result });
});

router.get('/sessions', auth.requireAuth, (req, res) => {
  return ok(res, req.data.agentSessions.filter((item) => item.userId === req.user.id));
});

router.get('/functions/:tool', auth.requireAuth, (req, res) => {
  const question = req.query.q || req.params.tool;
  const result = agent.callTool(req.data, question);
  return ok(res, result || { tool: req.params.tool, result: [] });
});

module.exports = router;
