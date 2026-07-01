import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { randomUUID } from 'node:crypto';
import { listTasks, getTaskDetail } from './tasks.js';
import { listProducts, getProductDetail } from './market.js';
import { listPosts, getPostDetail } from './forum.js';
import { searchKnowledgeVectors } from './vectorAi.js';
import { createCounselorAlertsForUser } from './counselor.js';

const activeRuns = new Map();
const categories = [
  '平台使用咨询',
  '任务互助咨询',
  '二手交易咨询',
  '社区论坛咨询',
  '校园办事咨询',
  '学习 / 学业咨询',
  '生活服务咨询',
  '心理 / 情绪相关',
  '违规 / 风险倾向',
  '其他'
];

const systemPrompt = `你是校园智能生活服务平台的服务端 AI Agent。
你只能查询公开任务、公开商品、公开帖子、公开评论和知识库。
你不能查询用户个人资料、手机号、私信、个人订单、个人任务或个人交易。
你不能替用户正式发布任务、购买商品、发帖、接单或修改业务状态。
当用户需要发布任务时，你只能生成任务发布草案卡片，引导用户进入可编辑表单和模拟支付。
回答尽量简洁，知识库回答需要说明来源；不确定时明确说明无法确定。`;

const silentToolNames = new Set(['report_risk']);
const MAX_TOOL_ROUNDS = 20;

function now() {
  return new Date().toISOString();
}

function isSilentToolName(name = '') {
  return silentToolNames.has(String(name || ''));
}

function isPotentialSilentToolName(name = '') {
  const value = String(name || '');
  if (!value) return false;
  return [...silentToolNames].some((toolName) => toolName === value || toolName.startsWith(value));
}

function createTransientAiMessage(store, item) {
  const message = {
    id: item.id || randomUUID(),
    createdAt: item.createdAt || now(),
    updatedAt: item.updatedAt || now(),
    ...item
  };
  store.collection('aiMessages').push(message);
  return message;
}

async function markSessionRunning(store, session, runId, userContent) {
  const patch = {
    status: 'running',
    currentRunId: runId
  };
  if (!session || session.titleSource === 'auto' || !session.titleSource) {
    const currentTitle = String(session?.title || '').trim();
    patch.title = currentTitle && currentTitle !== '新的咨询' ? currentTitle : userContent.slice(0, 18);
    patch.titleSource = 'auto';
    patch.titleStatus = 'pending';
  }
  return store.update('aiSessions', session.id, patch);
}

function publicUser(store, userId) {
  const user = store.collection('users').find((item) => item.id === userId);
  return user ? { id: user.id, nickname: user.nickname, studentId: user.studentId } : null;
}

function sanitizeAiConfig(settings) {
  const config = settings.aiConfig || {};
  return {
    baseUrl: config.baseUrl || '',
    model: config.model || '',
    embeddingModel: config.embeddingModel || 'text-embedding-3-small',
    hasApiKey: Boolean(config.apiKey),
    includeReasoning: Boolean(config.includeReasoning),
    enableThinking: Boolean(config.enableThinking),
    thinkingType: config.thinkingType || '',
    reasoningEffort: config.reasoningEffort || ''
  };
}

export function aiCategories() {
  return categories;
}

export function listAiSessions(store, userId) {
  return store.collection('aiSessions')
    .filter((item) => item.userId === userId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function createAiSession(store, userId, title = '新的咨询', options = {}) {
  const normalizedTitle = String(title || '新的咨询').trim() || '新的咨询';
  const autoTitle = normalizedTitle === '新的咨询';
  const titleSource = options.titleSource || (autoTitle ? 'auto' : 'manual');
  return store.insert('aiSessions', {
    userId,
    title: normalizedTitle,
    titleSource,
    titleStatus: options.titleStatus || (titleSource === 'manual' ? 'done' : 'pending'),
    status: 'idle',
    currentRunId: '',
    stoppedAt: ''
  });
}

function assertIdleSession(session) {
  if (session.status === 'running') throw badRequest('当前会话正在生成，请先停止后再操作');
}

export function getAiSession(store, userId, sessionId) {
  const session = store.collection('aiSessions').find((item) => item.id === sessionId && item.userId === userId);
  if (!session) throw notFound('AI 会话不存在');
  const messages = store.collection('aiMessages')
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return { session, messages };
}

function getAiSessionMessages(store, sessionId) {
  return store.collection('aiMessages')
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function sanitizeAdminAiMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content || '',
    reasoningContent: message.reasoningContent || '',
    status: message.status || '',
    runState: message.runState || '',
    cards: message.cards || [],
    toolEvents: message.toolEvents || [],
    createdAt: message.createdAt || '',
    updatedAt: message.updatedAt || '',
    editedAt: message.editedAt || ''
  };
}

function buildAiConversationSnapshot(store, sessionId, options = {}) {
  const session = store.collection('aiSessions').find((item) => item.id === sessionId);
  if (!session) return null;
  const messages = getAiSessionMessages(store, sessionId).map((item) => sanitizeAdminAiMessage(item));
  const user = publicUser(store, session.userId);
  return {
    capturedAt: options.capturedAt || now(),
    alertMessageId: options.alertMessageId || '',
    reconstructed: Boolean(options.reconstructed),
    session: {
      id: session.id,
      title: session.title || '',
      status: session.status || '',
      userId: session.userId,
      createdAt: session.createdAt || '',
      updatedAt: session.updatedAt || ''
    },
    user: user ? {
      id: user.id,
      nickname: user.nickname,
      studentId: user.studentId,
      avatarUrl: user.avatarUrl
    } : null,
    messages
  };
}

function sessionIdForRiskAlert(store, alert) {
  if (alert.sessionId) return alert.sessionId;
  if (alert.snapshot?.session?.id) return alert.snapshot.session.id;
  const message = store.collection('aiMessages').find((item) => item.id === alert.messageId);
  return message?.sessionId || '';
}

function summarizeRiskAlert(alert) {
  return {
    id: alert.id,
    messageId: alert.messageId || '',
    sessionId: alert.sessionId || alert.snapshot?.session?.id || '',
    userId: alert.userId,
    username: alert.username || '',
    studentId: alert.studentId || '',
    level: alert.level || '',
    reason: alert.reason || '',
    createdAt: alert.createdAt || '',
    updatedAt: alert.updatedAt || '',
    hasSnapshot: Boolean(alert.snapshot)
  };
}

export async function updateAiSession(store, userId, sessionId, body = {}) {
  const session = getAiSession(store, userId, sessionId).session;
  const title = String(body.title || '').trim();
  if (!title) throw badRequest('会话标题不能为空');
  const updated = await store.update('aiSessions', session.id, {
    title: title.slice(0, 40),
    titleSource: 'manual',
    titleStatus: 'done'
  });
  return updated;
}

export async function deleteAiSession(store, userId, sessionId) {
  const session = getAiSession(store, userId, sessionId).session;
  assertIdleSession(session);
  const messageIds = store.collection('aiMessages')
    .filter((item) => item.sessionId === sessionId)
    .map((item) => item.id);
  const messageIdSet = new Set(messageIds);
  await store.replaceCollection('aiSessions', store.collection('aiSessions').filter((item) => item.id !== sessionId));
  await store.replaceCollection('aiMessages', store.collection('aiMessages').filter((item) => item.sessionId !== sessionId));
  await store.replaceCollection('aiToolCalls', store.collection('aiToolCalls').filter((item) => !messageIdSet.has(item.messageId)));
  return { ok: true };
}

export async function startAiRun(store, realtime, userId, payload = {}) {
  const user = store.collection('users').find((item) => item.id === userId);
  if (!user) throw forbidden('用户不存在');
  const content = String(payload.content || '').trim();
  const clientMessageId = String(payload.clientMessageId || '').trim();
  if (!content) throw badRequest('请输入咨询内容');
  const session = payload.sessionId
    ? getAiSession(store, userId, payload.sessionId).session
    : await createAiSession(store, userId, content.slice(0, 18), { titleSource: 'auto', titleStatus: 'pending' });
  if (session.status === 'running') throw badRequest('当前会话已有回答在生成');

  const runId = randomUUID();
  const userMessage = await store.insert('aiMessages', {
    sessionId: session.id,
    role: 'user',
    content,
    status: 'done',
    cards: []
  });
  const assistant = createTransientAiMessage(store, {
    sessionId: session.id,
    role: 'assistant',
    content: '',
    status: 'running',
    runState: 'requesting',
    cards: [],
    toolEvents: [],
    streamParts: [],
    reasoningContent: '',
    runId
  });
  const runningSession = await markSessionRunning(store, session, runId, content);
  realtime.sendToUser(userId, 'ai.run.started', {
    sessionId: session.id,
    runId,
    assistantMessageId: assistant.id,
    userMessageId: userMessage.id,
    userMessage,
    clientMessageId,
    session: runningSession
  });

  const controller = new AbortController();
  activeRuns.set(runId, { controller, userId, sessionId: session.id, assistantMessageId: assistant.id, userContent: content });

  runAgent(store, realtime, user, session.id, assistant.id, content, runId, controller)
    .catch(async (error) => {
      const message = error.name === 'AbortError' ? '已停止生成' : (error.message || 'AI 运行失败');
      await finishAssistantMessage(store, realtime, userId, session.id, assistant.id, runId, message, error.name === 'AbortError' ? 'stopped' : 'error', false);
    })
    .finally(() => activeRuns.delete(runId));

  return { sessionId: session.id, runId, assistantMessageId: assistant.id, userMessageId: userMessage.id, userMessage, clientMessageId, session: runningSession };
}

export async function updateAiUserMessage(store, userId, sessionId, messageId, body = {}) {
  const session = getAiSession(store, userId, sessionId).session;
  assertIdleSession(session);
  const message = store.collection('aiMessages')
    .find((item) => item.id === messageId && item.sessionId === sessionId && item.role === 'user');
  if (!message) throw notFound('只能修改自己发送的用户消息');
  const content = String(body.content || '').trim();
  if (!content) throw badRequest('消息内容不能为空');
  const updated = await store.update('aiMessages', message.id, {
    content,
    editedAt: now()
  });
  await store.update('aiSessions', session.id, {
    title: session.title || content.slice(0, 18),
    titleSource: session.titleSource || 'auto',
    titleStatus: session.titleStatus || 'pending'
  });
  return updated;
}

export async function regenerateAiRun(store, realtime, userId, sessionId, body = {}) {
  const user = store.collection('users').find((item) => item.id === userId);
  if (!user) throw forbidden('用户不存在');
  const session = getAiSession(store, userId, sessionId).session;
  assertIdleSession(session);
  const ordered = store.collection('aiMessages')
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (!ordered.length) throw badRequest('当前会话没有可重新生成的消息');

  const targetId = body.messageId || '';
  const target = targetId ? ordered.find((item) => item.id === targetId) : null;
  let userMessage = null;
  let trimFromIndex = -1;
  if (!target) {
    userMessage = [...ordered].reverse().find((item) => item.role === 'user');
    trimFromIndex = ordered.findIndex((item) => item.id === userMessage?.id) + 1;
  } else if (target.role === 'user') {
    userMessage = target;
    trimFromIndex = ordered.findIndex((item) => item.id === target.id) + 1;
  } else if (target.role === 'assistant') {
    const targetIndex = ordered.findIndex((item) => item.id === target.id);
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      if (ordered[index].role === 'user') {
        userMessage = ordered[index];
        break;
      }
    }
    trimFromIndex = targetIndex;
  }
  if (!userMessage) throw badRequest('没有找到可重新生成的用户消息');

  const removed = ordered.slice(Math.max(0, trimFromIndex));
  const removedIds = new Set(removed.map((item) => item.id));
  if (removedIds.size) {
    await store.replaceCollection('aiMessages', store.collection('aiMessages').filter((item) => !removedIds.has(item.id)));
    await store.replaceCollection('aiToolCalls', store.collection('aiToolCalls').filter((item) => !removedIds.has(item.messageId)));
  }

  return createAssistantRun(store, realtime, user, session.id, userMessage.content, session.title || userMessage.content.slice(0, 18));
}

export async function cancelAiRun(store, userId, sessionId) {
  const session = store.collection('aiSessions').find((item) => item.id === sessionId && item.userId === userId);
  if (!session?.currentRunId) return { ok: true };
  const run = activeRuns.get(session.currentRunId);
  if (run) run.controller.abort();
  await store.update('aiSessions', sessionId, { status: 'stopped', currentRunId: '', stoppedAt: now() });
  return { ok: true };
}

async function createAssistantRun(store, realtime, user, sessionId, userContent, title = '') {
  const runId = randomUUID();
  const assistant = createTransientAiMessage(store, {
    sessionId,
    role: 'assistant',
    content: '',
    status: 'running',
    runState: 'requesting',
    cards: [],
    toolEvents: [],
    streamParts: [],
    reasoningContent: '',
    runId
  });
  const session = store.collection('aiSessions').find((item) => item.id === sessionId);
  await markSessionRunning(store, session || { id: sessionId, title, titleSource: 'auto' }, runId, userContent);
  realtime.sendToUser(user.id, 'ai.run.started', { sessionId, runId, assistantMessageId: assistant.id });

  const controller = new AbortController();
  activeRuns.set(runId, { controller, userId: user.id, sessionId, assistantMessageId: assistant.id, userContent });

  runAgent(store, realtime, user, sessionId, assistant.id, userContent, runId, controller)
    .catch(async (error) => {
      const message = error.name === 'AbortError' ? '已停止生成' : (error.message || 'AI 运行失败');
      await finishAssistantMessage(store, realtime, user.id, sessionId, assistant.id, runId, message, error.name === 'AbortError' ? 'stopped' : 'error', false);
    })
    .finally(() => activeRuns.delete(runId));

  return { sessionId, runId, assistantMessageId: assistant.id };
}

async function runAgent(store, realtime, user, sessionId, assistantMessageId, userContent, runId, controller) {
  await classifyConsultation(store, userContent);
  await detectRiskByText(store, user, assistantMessageId, userContent);
  const settings = store.collection('settings');
  const config = settings.aiConfig || {};
  if (!config.baseUrl || !config.model || !config.apiKey) {
    await runLocalFallback(store, realtime, user, sessionId, assistantMessageId, userContent, runId);
    return;
  }
  const history = store.collection('aiMessages')
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .filter((item) => item.role !== 'assistant' || item.id !== assistantMessageId)
    .map((item) => ({ role: item.role, content: item.content }));
  const messages = [{ role: 'system', content: systemPrompt }, ...history];
  const toolDefinitions = createToolDefinitions();
  const conversation = [...messages];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const hasToolContext = conversation.some((item) => item.role === 'tool');
    const result = await callChatCompletions(
      store,
      realtime,
      user,
      sessionId,
      assistantMessageId,
      config,
      conversation,
      toolDefinitions,
      controller,
      { allowThinking: !hasToolContext }
    );
    if (!result.toolCalls.length) {
      await markAssistantDone(store, realtime, user.id, sessionId, assistantMessageId, runId);
      scheduleSessionTitleGeneration(store, realtime, user, sessionId, userContent, assistantMessageId);
      return;
    }
    conversation.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.argumentsText || '{}' }
      }))
    });
    const toolMessages = [];
    for (const call of result.toolCalls) {
      const toolResult = await executeAiTool(store, realtime, user, assistantMessageId, call);
      toolMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
    }
    conversation.push(...toolMessages);
  }
  const limitMessage = `我已经连续调用了 ${MAX_TOOL_ROUNDS} 轮工具，但模型仍未给出最终回复。为了避免无限循环，本次已暂停。你可以缩小问题范围，或指定只查询知识库、任务、商品、帖子中的某一类信息后重试。`;
  const assistantMessage = store.collection('aiMessages').find((item) => item.id === assistantMessageId);
  await appendAssistantContent(store, realtime, user.id, assistantMessageId, `${assistantMessage?.content ? '\n\n' : ''}${limitMessage}`);
  throw new Error(limitMessage);
}

async function callChatCompletions(store, realtime, user, sessionId, assistantMessageId, config, messages, tools, controller, options = {}) {
  const body = buildChatCompletionBody(config, messages, tools, options);
  await setAssistantRunState(store, realtime, user.id, assistantMessageId, 'requesting');
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body),
    signal: controller.signal
  });
  if (!response.ok) throw new Error(`模型接口调用失败：${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let lastChannel = '';
  const toolCalls = new Map();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      const chunk = JSON.parse(data);
      const delta = chunk.choices?.[0]?.delta || {};
      const reasoningDelta = extractReasoningDelta(delta);
      if (reasoningDelta) {
        lastChannel = 'reasoning';
        await appendAssistantReasoning(store, realtime, user.id, assistantMessageId, reasoningDelta);
      }
      if (delta.content) {
        lastChannel = 'content';
        content += delta.content;
        await appendAssistantContent(store, realtime, user.id, assistantMessageId, delta.content);
      }
      for (const call of delta.tool_calls || []) {
        const key = call.index ?? toolCalls.size;
        const existing = toolCalls.get(key) || { id: call.id || `call_${key}`, name: '', argumentsText: '' };
        const wasNotified = Boolean(existing.notified);
        existing.id = call.id || existing.id;
        existing.name += call.function?.name || '';
        existing.argumentsText += call.function?.arguments || '';
        toolCalls.set(key, existing);
        if (existing.name && !wasNotified && !isPotentialSilentToolName(existing.name)) {
          existing.notified = true;
          existing.channel = lastChannel || 'content';
          await recordToolEvent(store, realtime, user.id, assistantMessageId, {
            id: existing.id,
            toolName: existing.name,
            channel: existing.channel,
            argumentsText: existing.argumentsText,
            arguments: parseToolArguments(existing.argumentsText),
            status: 'calling',
            summary: `正在调用 ${toolDisplayName(existing.name)}`
          });
        }
      }
      if (chunk.choices?.[0]?.finish_reason === 'tool_calls') {
        for (const call of toolCalls.values()) {
          call.channel = call.channel || lastChannel || 'content';
          if (call.notified) continue;
          if (!isSilentToolName(call.name)) {
            await recordToolEvent(store, realtime, user.id, assistantMessageId, {
              id: call.id,
              toolName: call.name,
              channel: call.channel,
              argumentsText: call.argumentsText,
              arguments: parseToolArguments(call.argumentsText),
              status: 'calling',
              summary: `正在调用 ${toolDisplayName(call.name)}`
            });
          }
          call.notified = true;
        }
      }
    }
  }
  return { content, toolCalls: [...toolCalls.values()] };
}

function buildChatCompletionBody(config, messages, tools, options = {}) {
  const body = {
    model: config.model,
    messages,
    tools,
    stream: true,
    stream_options: { include_usage: true }
  };
  const allowThinking = options.allowThinking !== false;
  if (allowThinking) {
    if (config.includeReasoning) body.include_reasoning = true;
    if (config.enableThinking) body.enable_thinking = true;
    if (config.thinkingType) body.thinking = { type: config.thinkingType };
    if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
  } else if (config.enableThinking) {
    body.enable_thinking = false;
  }
  return body;
}

function extractReasoningDelta(delta) {
  const parts = [
    stringifyReasoningDelta(delta.reasoning_content),
    stringifyReasoningDelta(delta.thinking_content),
    stringifyReasoningDelta(delta.reasoning),
    stringifyReasoningDelta(delta.thinking),
    stringifyReasoningDelta(delta.reasoning_details)
  ].filter(Boolean);
  return parts.join('');
}

function stringifyReasoningDelta(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(stringifyReasoningDelta).join('');
  if (typeof value === 'object') {
    return stringifyReasoningDelta(value.text)
      || stringifyReasoningDelta(value.content)
      || stringifyReasoningDelta(value.delta);
  }
  return '';
}

async function runLocalFallback(store, realtime, user, sessionId, assistantMessageId, userContent, runId) {
  const cards = [];
  const lower = userContent.toLowerCase();
  let answer = '当前未配置大模型接口，我使用服务端本地演示 Agent 帮你查询公开数据。';
  if (userContent.includes('任务')) {
    const tasks = await runLocalTool(store, realtime, user, assistantMessageId, 'search_public_tasks', { keyword: userContent }, () => (
      listTasks(store, { keyword: userContent }, user.id).slice(0, 3)
    ));
    cards.push(...tasks.map((task) => ({ type: 'task', title: task.title, id: task.id, reward: task.reward })));
    answer += tasks.length ? ` 找到 ${tasks.length} 个相关公开任务。` : ' 暂未找到相关公开任务。';
  } else if (userContent.includes('商品') || userContent.includes('二手')) {
    const products = await runLocalTool(store, realtime, user, assistantMessageId, 'search_public_products', { keyword: userContent }, () => (
      listProducts(store, { keyword: userContent }, user.id).slice(0, 3)
    ));
    cards.push(...products.map((product) => ({ type: 'product', title: product.title, id: product.id, price: product.price })));
    answer += products.length ? ` 找到 ${products.length} 个相关商品。` : ' 暂未找到相关商品。';
  } else if (userContent.includes('帖子') || userContent.includes('社区')) {
    const posts = await runLocalTool(store, realtime, user, assistantMessageId, 'search_public_posts', { keyword: userContent }, () => (
      listPosts(store, { keyword: userContent }, user.id).slice(0, 3)
    ));
    cards.push(...posts.map((post) => ({ type: 'post', title: post.title, id: post.id })));
    answer += posts.length ? ` 找到 ${posts.length} 个相关帖子。` : ' 暂未找到相关帖子。';
  } else if (lower.includes('help') || userContent.includes('怎么')) {
    const knowledge = await runLocalTool(store, realtime, user, assistantMessageId, 'search_knowledge', { keyword: userContent }, async () => (
      (await searchKnowledge(store, userContent)).slice(0, 3)
    ));
    answer += knowledge.length ? ` 知识库来源：${knowledge.map((item) => item.title).join('、')}。` : ' 知识库暂未匹配到明确条目。';
  }
  for (const char of answer) {
    await appendAssistantContent(store, realtime, user.id, assistantMessageId, char);
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  replaceAssistantCards(store, assistantMessageId, cards);
  realtime.sendToUser(user.id, 'ai.cards', { sessionId, messageId: assistantMessageId, cards });
  await markAssistantDone(store, realtime, user.id, sessionId, assistantMessageId, runId);
  scheduleSessionTitleGeneration(store, realtime, user, sessionId, userContent, assistantMessageId);
}

async function runLocalTool(store, realtime, user, assistantMessageId, toolName, args, handler) {
  const callId = `local_${randomUUID()}`;
  await recordToolEvent(store, realtime, user.id, assistantMessageId, {
    id: callId,
    toolName,
    channel: 'content',
    arguments: args,
    argumentsText: JSON.stringify(args),
    status: 'calling',
    summary: `正在调用 ${toolDisplayName(toolName)}`
  });
  try {
    const result = await handler();
    await store.insert('aiToolCalls', {
      userId: user.id,
      messageId: assistantMessageId,
      toolName,
      arguments: args,
      result,
      summary: summarizeToolResult(result)
    });
    await recordToolEvent(store, realtime, user.id, assistantMessageId, {
      id: callId,
      toolName,
      channel: 'content',
      arguments: args,
      argumentsText: JSON.stringify(args),
      status: 'done',
      result,
      summary: summarizeToolResult(result)
    });
    return result;
  } catch (error) {
    await recordToolEvent(store, realtime, user.id, assistantMessageId, {
      id: callId,
      toolName,
      channel: 'content',
      arguments: args,
      argumentsText: JSON.stringify(args),
      status: 'error',
      summary: error.message || '工具调用失败'
    });
    throw error;
  }
}

async function appendAssistantContent(store, realtime, userId, messageId, delta) {
  const message = store.collection('aiMessages').find((item) => item.id === messageId);
  if (!message) return;
  message.content = `${message.content || ''}${delta}`;
  message.runState = 'responding';
  const part = appendTextStreamPart(message, 'content', delta);
  message.updatedAt = now();
  realtime.sendToUser(userId, 'ai.token', { sessionId: message.sessionId, messageId, delta, partId: part.id, channel: 'content', runState: message.runState });
}

async function appendAssistantReasoning(store, realtime, userId, messageId, delta) {
  const message = store.collection('aiMessages').find((item) => item.id === messageId);
  if (!message) return;
  message.reasoningContent = `${message.reasoningContent || ''}${delta}`;
  message.runState = 'responding';
  const part = appendTextStreamPart(message, 'reasoning', delta);
  message.updatedAt = now();
  realtime.sendToUser(userId, 'ai.reasoning', { sessionId: message.sessionId, messageId, delta, partId: part.id, channel: 'reasoning', runState: message.runState });
}

function appendTextStreamPart(message, channel, delta) {
  const streamParts = Array.isArray(message.streamParts) ? [...message.streamParts] : [];
  const last = streamParts[streamParts.length - 1];
  if (last?.type === 'text' && last.channel === channel) {
    last.text = `${last.text || ''}${delta}`;
    last.updatedAt = now();
    message.streamParts = streamParts;
    return last;
  }
  const part = {
    id: `text_${randomUUID()}`,
    type: 'text',
    channel,
    text: String(delta || ''),
    createdAt: now(),
    updatedAt: now()
  };
  streamParts.push(part);
  message.streamParts = streamParts;
  return part;
}

async function recordToolEvent(store, realtime, userId, messageId, event) {
  if (isSilentToolName(event?.toolName)) return null;
  const message = store.collection('aiMessages').find((item) => item.id === messageId);
  if (!message) return null;
  const id = event.id || `${event.toolName || 'tool'}_${randomUUID()}`;
  const toolEvents = Array.isArray(message.toolEvents) ? [...message.toolEvents] : [];
  const index = toolEvents.findIndex((item) => item.id === id);
  const existing = index >= 0 ? toolEvents[index] : {};
  const next = {
    ...existing,
    id,
    toolName: event.toolName || existing.toolName || '',
    displayName: toolDisplayName(event.toolName || existing.toolName || ''),
    channel: event.channel || existing.channel || 'content',
    arguments: event.arguments ?? existing.arguments ?? {},
    argumentsText: event.argumentsText ?? existing.argumentsText ?? '',
    status: event.status || existing.status || 'calling',
    summary: event.summary || existing.summary || '',
    result: event.result ?? existing.result ?? null,
    createdAt: existing.createdAt || now(),
    updatedAt: now()
  };
  if (index >= 0) toolEvents.splice(index, 1, next);
  else toolEvents.push(next);
  message.toolEvents = toolEvents;
  ensureToolStreamPart(message, next);
  if (next.status === 'calling') message.runState = 'waiting_tool';
  else if (next.status === 'error') message.runState = 'error';
  else if (message.status === 'running') message.runState = 'responding';
  message.updatedAt = now();
  realtime.sendToUser(userId, 'ai.tool_call', {
    sessionId: message.sessionId,
    messageId,
    runState: message.runState,
    toolEvent: publicToolEvent(next)
  });
  return next;
}

function publicToolEvent(event) {
  return {
    id: event.id,
    toolName: event.toolName,
    displayName: event.displayName || toolDisplayName(event.toolName),
    channel: event.channel || 'content',
    arguments: event.arguments || {},
    status: event.status,
    summary: event.summary || '',
    resultPreview: previewToolResult(event.result),
    error: event.status === 'error' ? event.summary || '工具调用失败' : '',
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  };
}

function ensureToolStreamPart(message, event) {
  const streamParts = Array.isArray(message.streamParts) ? [...message.streamParts] : [];
  const existing = streamParts.find((part) => part.type === 'tool' && part.toolEventId === event.id);
  if (existing) {
    existing.channel = event.channel || existing.channel || 'content';
    existing.updatedAt = now();
    message.streamParts = streamParts;
    return existing;
  }
  const part = {
    id: `tool_${event.id}`,
    type: 'tool',
    channel: event.channel || 'content',
    toolEventId: event.id,
    createdAt: now(),
    updatedAt: now()
  };
  streamParts.push(part);
  message.streamParts = streamParts;
  return part;
}

async function finishAssistantMessage(store, realtime, userId, sessionId, messageId, runId, text, status, append = true) {
  if (append && text) await appendAssistantContent(store, realtime, userId, messageId, text);
  await store.update('aiMessages', messageId, { status, runState: status });
  await store.update('aiSessions', sessionId, { status, currentRunId: '', stoppedAt: status === 'stopped' ? now() : '' });
  realtime.sendToUser(userId, status === 'error' ? 'ai.run.error' : 'ai.run.done', { sessionId, runId, messageId, status });
}

async function markAssistantDone(store, realtime, userId, sessionId, messageId, runId) {
  await store.update('aiMessages', messageId, { status: 'done', runState: 'done' });
  await store.update('aiSessions', sessionId, { status: 'idle', currentRunId: '' });
  realtime.sendToUser(userId, 'ai.run.done', { sessionId, runId, messageId, status: 'done' });
}

function scheduleSessionTitleGeneration(store, realtime, user, sessionId, userContent, assistantMessageId) {
  setTimeout(() => {
    generateSessionTitle(store, realtime, user, sessionId, userContent, assistantMessageId)
      .catch(() => {});
  }, 0);
}

async function generateSessionTitle(store, realtime, user, sessionId, userContent, assistantMessageId) {
  const session = store.collection('aiSessions').find((item) => item.id === sessionId && item.userId === user.id);
  if (!shouldGenerateTitle(store, session)) return;
  await updateSessionTitleState(store, realtime, user.id, session.id, { titleStatus: 'generating' });
  const settings = store.collection('settings');
  const config = settings.aiConfig || {};
  const message = store.collection('aiMessages').find((item) => item.id === assistantMessageId);
  let generated = '';
  try {
    generated = await generateTitleByModel(config, userContent, message?.content || '');
  } catch {
    generated = '';
  }
  const aiTitle = sanitizeGeneratedTitle(generated);
  const title = aiTitle || fallbackTitle(userContent);
  const latest = store.collection('aiSessions').find((item) => item.id === sessionId && item.userId === user.id);
  if (!shouldGenerateTitle(store, latest)) return;
  await updateSessionTitleState(store, realtime, user.id, session.id, {
    title,
    titleSource: aiTitle ? 'ai' : 'auto',
    titleStatus: aiTitle ? 'done' : 'fallback'
  });
}

function shouldGenerateTitle(store, session) {
  if (!session || session.titleSource === 'manual' || session.titleSource === 'ai') return false;
  const userMessageCount = store.collection('aiMessages')
    .filter((item) => item.sessionId === session.id && item.role === 'user')
    .length;
  return userMessageCount <= 1;
}

async function updateSessionTitleState(store, realtime, userId, sessionId, patch) {
  const updated = await store.update('aiSessions', sessionId, patch);
  if (updated) realtime.sendToUser(userId, 'ai.session.updated', { session: updated });
  return updated;
}

async function generateTitleByModel(config, userContent, assistantContent) {
  if (!config.baseUrl || !config.model || !config.apiKey) return '';
  const prompt = [
    '请为这段校园服务智能体对话生成一个简洁中文标题。',
    '要求：6到14个字，不要引号，不要句号，不要使用“关于”。',
    `用户消息：${String(userContent || '').slice(0, 500)}`,
    `助手回复摘要：${String(assistantContent || '').slice(0, 800)}`
  ].join('\n');
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: '你只输出会话标题，不解释。' },
        { role: 'user', content: prompt }
      ],
      stream: false,
      temperature: 0.2
    })
  });
  if (!response.ok) return '';
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function sanitizeGeneratedTitle(value = '') {
  return String(value)
    .replace(/["'“”‘’]/g, '')
    .replace(/^标题[:：]/, '')
    .replace(/[。.!！?？：:，,、]+$/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 18);
}

function fallbackTitle(value = '') {
  const title = String(value || '').replace(/\s+/g, '').slice(0, 18);
  return title || '新的咨询';
}

async function setAssistantRunState(store, realtime, userId, messageId, runState) {
  const message = store.collection('aiMessages').find((item) => item.id === messageId);
  if (!message || message.runState === runState) return;
  message.runState = runState;
  message.updatedAt = now();
  realtime.sendToUser(userId, 'ai.message_state', {
    sessionId: message.sessionId,
    messageId,
    runState
  });
}

function createToolDefinitions() {
  return [
    tool('search_knowledge', '按关键词查询知识库', { keyword: 'string' }),
    tool('get_knowledge_detail', '查询知识库条目详情', { id: 'string' }),
    tool('search_public_tasks', '查询公开任务列表', { keyword: 'string', category: 'string', campusArea: 'string' }),
    tool('get_public_task_detail', '查询公开任务详情', { id: 'string' }),
    tool('create_task_draft_card', '生成任务发布草案卡片，不能正式发布任务', {
      title: 'string',
      detail: 'string',
      reward: 'number',
      category: 'string',
      campusArea: 'string',
      deliveryRequirement: 'string',
      contactNote: 'string'
    }),
    tool('search_public_products', '查询公开商品列表', { keyword: 'string', categoryId: 'string' }),
    tool('get_public_product_detail', '查询公开商品详情', { id: 'string' }),
    tool('search_public_posts', '查询公开帖子列表', { keyword: 'string', tag: 'string' }),
    tool('get_public_post_detail', '查询公开帖子详情', { id: 'string' }),
    tool('record_consultation_category', '记录用户咨询分类', { category: 'string' }),
    tool('report_risk', '上报心理风险或严重错误倾向', { level: 'string', reason: 'string' })
  ];
}

function tool(name, description, props) {
  const properties = {};
  for (const [key, type] of Object.entries(props)) {
    properties[key] = { type };
  }
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties
      }
    }
  };
}

async function executeAiTool(store, realtime, user, assistantMessageId, call) {
  const args = parseToolArguments(call.argumentsText);
  if (!call.notified) {
    await recordToolEvent(store, realtime, user.id, assistantMessageId, {
      id: call.id,
      toolName: call.name,
      channel: call.channel || 'content',
      arguments: args,
      argumentsText: call.argumentsText || '{}',
      status: 'calling',
      summary: `正在调用 ${toolDisplayName(call.name)}`
    });
  }
  try {
    const result = await runTool(store, realtime, user, assistantMessageId, call.name, args);
    await store.insert('aiToolCalls', {
      userId: user.id,
      messageId: assistantMessageId,
      toolName: call.name,
      arguments: args,
      result,
      summary: summarizeToolResult(result)
    });
    await recordToolEvent(store, realtime, user.id, assistantMessageId, {
      id: call.id,
      toolName: call.name,
      channel: call.channel || 'content',
      arguments: args,
      argumentsText: call.argumentsText || '{}',
      status: 'done',
      result,
      summary: summarizeToolResult(result)
    });
    return result;
  } catch (error) {
    await recordToolEvent(store, realtime, user.id, assistantMessageId, {
      id: call.id,
      toolName: call.name,
      channel: call.channel || 'content',
      arguments: args,
      argumentsText: call.argumentsText || '{}',
      status: 'error',
      summary: error.message || '工具调用失败'
    });
    throw error;
  }
}

function parseToolArguments(argumentsText = '{}') {
  try {
    const parsed = JSON.parse(argumentsText || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toolDisplayName(name = '') {
  const names = {
    search_knowledge: '知识库查询',
    get_knowledge_detail: '知识库详情',
    search_public_tasks: '公开任务查询',
    get_public_task_detail: '任务详情查询',
    create_task_draft_card: '任务草案生成',
    search_public_products: '公开商品查询',
    get_public_product_detail: '商品详情查询',
    search_public_posts: '公开帖子查询',
    get_public_post_detail: '帖子详情查询',
    record_consultation_category: '咨询分类记录',
    report_risk: '风险上报'
  };
  return names[name] || name || '工具';
}

function summarizeToolResult(result) {
  if (Array.isArray(result)) return result.length ? `返回 ${result.length} 条结果` : '没有匹配结果';
  if (!result) return '没有匹配结果';
  if (typeof result === 'string') return result.slice(0, 80);
  if (result.error) return String(result.error).slice(0, 80);
  if (result.card) return '已生成可编辑草案卡片';
  if (result.note) return String(result.note).slice(0, 80);
  if (result.title) return `命中：${String(result.title).slice(0, 48)}`;
  const keys = Object.keys(result);
  return keys.length ? `返回字段：${keys.slice(0, 4).join('、')}` : '调用完成';
}

function previewToolResult(result) {
  if (Array.isArray(result)) {
    return result.slice(0, 3).map((item) => ({
      id: item?.id,
      title: item?.title || item?.name || item?.category || ''
    }));
  }
  if (!result || typeof result !== 'object') return result || null;
  if (result.card) return result.card;
  return {
    id: result.id,
    title: result.title || result.name || '',
    note: result.note || result.error || ''
  };
}

async function runTool(store, realtime, user, assistantMessageId, name, args) {
  if (name === 'search_knowledge') return searchKnowledge(store, args.keyword);
  if (name === 'get_knowledge_detail') return store.collection('knowledgeEntries').find((item) => item.id === args.id && !item.deletedAt) || null;
  if (name === 'search_public_tasks') return listTasks(store, args, user.id).slice(0, 5);
  if (name === 'get_public_task_detail') return getTaskDetail(store, args.id, user.id);
  if (name === 'create_task_draft_card') {
    const card = {
      type: 'task_draft',
      title: args.title,
      detail: args.detail,
      reward: args.reward,
      category: args.category || '',
      campusArea: args.campusArea || '',
      deliveryRequirement: args.deliveryRequirement || '',
      contactNote: args.contactNote || ''
    };
    await addAiCard(store, realtime, user.id, assistantMessageId, card);
    return { card, note: '仅草案，用户必须在当前智能体页面确认并模拟支付后才会发布' };
  }
  if (name === 'search_public_products') return listProducts(store, args, user.id).slice(0, 5);
  if (name === 'get_public_product_detail') return getProductDetail(store, args.id, user.id);
  if (name === 'search_public_posts') return listPosts(store, args, user.id).slice(0, 5);
  if (name === 'get_public_post_detail') return getPostDetail(store, args.id, user.id);
  if (name === 'record_consultation_category') return classifyConsultation(store, '', args.category);
  if (name === 'report_risk') return reportRisk(store, user, assistantMessageId, args.level, args.reason);
  return { error: '未知工具' };
}

async function addAiCard(store, realtime, userId, messageId, card) {
  const message = store.collection('aiMessages').find((item) => item.id === messageId);
  if (!message) return;
  message.cards = [...(message.cards || []), card];
  message.updatedAt = now();
  realtime.sendToUser(userId, 'ai.cards', { sessionId: message.sessionId, messageId, cards: message.cards });
}

function replaceAssistantCards(store, messageId, cards) {
  const message = store.collection('aiMessages').find((item) => item.id === messageId);
  if (!message) return;
  message.cards = Array.isArray(cards) ? cards : [];
  message.updatedAt = now();
}

async function searchKnowledge(store, keyword = '') {
  const q = String(keyword || '').trim();
  const vectorMatches = await searchKnowledgeVectors(store, q).catch(() => []);
  if (vectorMatches.length) return vectorMatches;
  const enabledBaseIds = new Set(store.collection('knowledgeBases')
    .filter((base) => !base.deletedAt && base.enabled !== false)
    .map((base) => base.id));
  return store.collection('knowledgeEntries')
    .filter((item) => !item.deletedAt)
    .filter((item) => !item.knowledgeBaseId || !enabledBaseIds.size || enabledBaseIds.has(item.knowledgeBaseId))
    .filter((item) => !q || `${item.title} ${item.category} ${item.content}`.includes(q))
    .slice(0, 8)
    .map((item) => ({ id: item.id, title: item.title, category: item.category, source: item.source, content: item.content.slice(0, 120) }));
}

async function classifyConsultation(store, text, forcedCategory = '') {
  let category = categories.includes(forcedCategory) ? forcedCategory : '其他';
  if (!forcedCategory) {
    if (text.includes('任务')) category = '任务互助咨询';
    else if (text.includes('二手') || text.includes('商品')) category = '二手交易咨询';
    else if (text.includes('帖子') || text.includes('社区')) category = '社区论坛咨询';
    else if (text.includes('心理') || text.includes('难受')) category = '心理 / 情绪相关';
    else if (text.includes('违规') || text.includes('举报')) category = '违规 / 风险倾向';
    else if (text.includes('办事') || text.includes('快递')) category = '校园办事咨询';
  }
  const stats = store.collection('aiConsultationStats');
  const existing = stats.find((item) => item.category === category);
  if (existing) {
    existing.count = Number(existing.count || 0) + 1;
    existing.updatedAt = now();
    await store.saveCollection('aiConsultationStats');
    return existing;
  }
  return store.insert('aiConsultationStats', { category, count: 1 });
}

async function detectRiskByText(store, user, messageId, text) {
  const highRiskWords = ['自杀', '轻生', '伤害自己', '不想活'];
  const hit = highRiskWords.find((word) => text.includes(word));
  if (!hit) return null;
  return reportRisk(store, user, messageId, '高风险', `用户消息命中风险表达：${hit}`);
}

async function reportRisk(store, user, messageId, level = '中风险', reason = '') {
  const profile = publicUser(store, user.id);
  const message = store.collection('aiMessages').find((item) => item.id === messageId);
  const sessionId = message?.sessionId || '';
  const alert = await store.insert('aiRiskAlerts', {
    messageId,
    sessionId,
    userId: user.id,
    username: profile?.nickname || '',
    studentId: profile?.studentId || '',
    level,
    reason,
    snapshot: sessionId ? buildAiConversationSnapshot(store, sessionId, { alertMessageId: messageId }) : null
  });
  await createCounselorAlertsForUser(store, user.id, {
    sourceType: 'ai_risk',
    sourceId: alert.id,
    title: '智能体对话风险',
    reason,
    riskLevel: level,
    snapshot: alert.snapshot
  });
  return alert;
}

export function getAiRiskDetail(store, riskId) {
  const alert = store.collection('aiRiskAlerts').find((item) => item.id === riskId);
  if (!alert) throw notFound('风险报警不存在');
  const sessionId = sessionIdForRiskAlert(store, alert);
  const current = sessionId ? buildAiConversationSnapshot(store, sessionId, { alertMessageId: alert.messageId }) : null;
  const snapshot = alert.snapshot || (current ? {
    ...current,
    capturedAt: alert.createdAt || current.capturedAt,
    reconstructed: true
  } : null);
  return { alert: summarizeRiskAlert(alert), snapshot, current };
}

export function getAiAdminData(store) {
  const knowledgeBases = decoratedKnowledgeBases(store);
  return {
    config: sanitizeAiConfig(store.collection('settings')),
    sessions: store.collection('aiSessions').length,
    stats: store.collection('aiConsultationStats'),
    risks: store.collection('aiRiskAlerts')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((item) => summarizeRiskAlert(item)),
    toolCalls: store.collection('aiToolCalls').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100),
    knowledgeBases,
    knowledgeEntries: store.collection('knowledgeEntries')
      .filter((item) => !item.deletedAt)
      .map((item) => ({
        ...item,
        knowledgeBase: knowledgeBases.find((base) => base.id === knowledgeBaseIdForEntry(item)) || knowledgeBases[0] || null
      }))
  };
}

export async function updateAiConfig(store, body) {
  const current = store.collection('settings').aiConfig || {};
  const next = {
    ...current,
    baseUrl: body.baseUrl ?? current.baseUrl ?? '',
    apiKey: body.apiKey === undefined || body.apiKey === '' ? current.apiKey || '' : body.apiKey,
    model: body.model ?? current.model ?? '',
    embeddingModel: body.embeddingModel ?? current.embeddingModel ?? 'text-embedding-3-small',
    includeReasoning: Boolean(body.includeReasoning),
    enableThinking: Boolean(body.enableThinking),
    thinkingType: body.thinkingType ?? current.thinkingType ?? '',
    reasoningEffort: body.reasoningEffort ?? current.reasoningEffort ?? ''
  };
  const settings = await store.updateSettings({ aiConfig: next });
  return sanitizeAiConfig(settings);
}

export async function createKnowledgeEntry(store, body) {
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!title || !content) throw badRequest('知识库标题和内容不能为空');
  const base = resolveKnowledgeBase(store, body.knowledgeBaseId);
  return store.insert('knowledgeEntries', {
    title,
    knowledgeBaseId: base.id,
    category: String(body.category || base.name || '平台使用说明').trim(),
    content,
    source: String(body.source || '管理员维护').trim()
  });
}

export async function updateKnowledgeEntry(store, entryId, body) {
  const entry = store.collection('knowledgeEntries').find((item) => item.id === entryId && !item.deletedAt);
  if (!entry) throw notFound('知识库条目不存在');
  const title = String(body.title ?? entry.title ?? '').trim();
  const content = String(body.content ?? entry.content ?? '').trim();
  if (!title || !content) throw badRequest('知识库标题和内容不能为空');
  const base = resolveKnowledgeBase(store, body.knowledgeBaseId || entry.knowledgeBaseId);
  return store.update('knowledgeEntries', entry.id, {
    title,
    knowledgeBaseId: base.id,
    category: String(body.category ?? entry.category ?? base.name).trim(),
    content,
    source: String(body.source ?? entry.source ?? '管理员维护').trim()
  });
}

export async function deleteKnowledgeEntry(store, entryId) {
  const entry = store.collection('knowledgeEntries').find((item) => item.id === entryId && !item.deletedAt);
  if (!entry) throw notFound('知识库条目不存在');
  await store.update('knowledgeEntries', entry.id, { deletedAt: now() });
  return { ok: true };
}

export async function createKnowledgeBase(store, body) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('知识库名称不能为空');
  if (decoratedKnowledgeBases(store).some((item) => item.name === name)) throw badRequest('知识库名称已存在');
  return store.insert('knowledgeBases', {
    name,
    description: String(body.description || '').trim(),
    enabled: body.enabled !== false
  });
}

export async function updateKnowledgeBase(store, baseId, body) {
  const base = store.collection('knowledgeBases').find((item) => item.id === baseId && !item.deletedAt);
  if (!base) throw notFound('知识库不存在');
  const name = String(body.name ?? base.name ?? '').trim();
  if (!name) throw badRequest('知识库名称不能为空');
  return store.update('knowledgeBases', base.id, {
    name,
    description: String(body.description ?? base.description ?? '').trim(),
    enabled: body.enabled !== false
  });
}

export async function deleteKnowledgeBase(store, baseId) {
  const base = store.collection('knowledgeBases').find((item) => item.id === baseId && !item.deletedAt);
  if (!base) throw notFound('知识库不存在');
  const hasEntries = store.collection('knowledgeEntries')
    .some((item) => !item.deletedAt && knowledgeBaseIdForEntry(item) === base.id);
  if (hasEntries) throw badRequest('请先删除或移动该知识库下的条目');
  await store.update('knowledgeBases', base.id, { deletedAt: now(), enabled: false });
  return { ok: true };
}

function decoratedKnowledgeBases(store) {
  const bases = store.collection('knowledgeBases').filter((item) => !item.deletedAt);
  if (bases.length) return bases;
  const categories = [...new Set(store.collection('knowledgeEntries')
    .filter((item) => !item.deletedAt)
    .map((item) => item.category || '默认知识库'))];
  if (categories.length) {
    return categories.map((name, index) => ({
      id: index === 0 ? 'default' : `legacy-${index}`,
      name,
      description: '由旧知识库分类自动映射',
      enabled: true,
      legacy: true
    }));
  }
  return [{
    id: 'default',
    name: '默认知识库',
    description: '平台默认知识库',
    enabled: true,
    legacy: true
  }];
}

function knowledgeBaseIdForEntry(entry) {
  if (entry.knowledgeBaseId) return entry.knowledgeBaseId;
  return 'default';
}

function resolveKnowledgeBase(store, baseId = '') {
  const bases = decoratedKnowledgeBases(store);
  return bases.find((item) => item.id === baseId) || bases[0] || { id: 'default', name: '默认知识库' };
}
