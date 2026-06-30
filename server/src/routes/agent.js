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

router.post('/chat', auth.requireAuth, async (req, res) => {
  let result;
  try {
    result = await agent.answer(req.data, req.body.question, { agentKey: req.body.agentKey });
  } catch (error) {
    return fail(res, error.status || 502, error.message || '智能体模型请求失败');
  }
  const sessionId = req.body.sessionId || store.id('session');
  let session = req.data.agentSessions.find((item) => item.id === sessionId);
  if (session && session.userId !== req.user.id) return fail(res, 403, '无权访问该会话');
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

router.post('/runs', auth.requireAuth, (req, res) => {
  agent.ensureAgentData(req.data);
  const question = String(req.body.question || '').trim();
  if (!question) return fail(res, 400, '请输入问题');
  const sessionId = req.body.sessionId || store.id('session');
  let session = req.data.agentSessions.find((item) => item.id === sessionId);
  if (session && session.userId !== req.user.id) return fail(res, 403, '无权访问该会话');
  if (!session) {
    session = {
      id: sessionId,
      userId: req.user.id,
      agentKey: req.body.agentKey || 'campus',
      title: question,
      messages: [],
      createdAt: store.now(),
      updatedAt: store.now()
    };
    req.data.agentSessions.unshift(session);
  }

  const runId = store.id('run');
  const userMessage = {
    id: store.id('agent_msg'),
    runId,
    agentKey: req.body.agentKey || session.agentKey || 'campus',
    role: 'user',
    content: question,
    status: 'completed',
    createdAt: store.now()
  };
  const assistantMessage = {
    id: store.id('agent_msg'),
    runId,
    agentKey: userMessage.agentKey,
    role: 'assistant',
    content: '',
    status: 'running',
    sources: [],
    toolCall: null,
    toolResults: [],
    createdAt: store.now()
  };
  const run = {
    id: runId,
    userId: req.user.id,
    sessionId: session.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    agentKey: userMessage.agentKey,
    question,
    status: 'running',
    createdAt: store.now(),
    updatedAt: store.now()
  };
  session.agentKey = userMessage.agentKey;
  session.messages.push(userMessage, assistantMessage);
  session.updatedAt = run.updatedAt;
  req.data.agentRuns.unshift(run);
  store.save(req.data);
  setImmediate(() => agent.executeRun(run.id, req.user.id));
  return ok(res, { run, session }, '智能体任务已创建');
});

router.get('/sessions', auth.requireAuth, (req, res) => {
  agent.ensureAgentData(req.data);
  return ok(res, req.data.agentSessions.filter((item) => item.userId === req.user.id));
});

router.get('/sessions/:id', auth.requireAuth, (req, res) => {
  agent.ensureAgentData(req.data);
  const session = req.data.agentSessions.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!session) return fail(res, 404, '历史会话不存在');
  return ok(res, session);
});

router.delete('/sessions/:id', auth.requireAuth, (req, res) => {
  agent.ensureAgentData(req.data);
  const index = req.data.agentSessions.findIndex((item) => item.id === req.params.id && item.userId === req.user.id);
  if (index < 0) return fail(res, 404, '历史会话不存在');
  req.data.agentRuns = req.data.agentRuns.filter((item) => item.sessionId !== req.params.id || item.userId !== req.user.id);
  req.data.agentSessions.splice(index, 1);
  store.save(req.data);
  return ok(res, null, '历史会话已删除');
});

router.get('/runs/:id', auth.requireAuth, (req, res) => {
  agent.ensureAgentData(req.data);
  const run = req.data.agentRuns.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!run) return fail(res, 404, '智能体任务不存在');
  return ok(res, run);
});

router.get('/functions/:tool', auth.requireAuth, (req, res) => {
  const result = agent.callTool(req.data, req.params.tool, req.query);
  return ok(res, result || { tool: req.params.tool, result: [] });
});

module.exports = router;
