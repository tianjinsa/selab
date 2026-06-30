const store = require('./store');
const socketHub = require('./socketHub');
const categories = require('./categories');

const agentDefinitions = [
  {
    key: 'campus',
    title: '校园助手',
    description: '校园办事、地点流程、平台规则和学生日常问题',
    prompt: '你是校园助手，专注回答校园办事、地点流程、平台规则和学生日常问题。'
  },
  {
    key: 'task',
    title: '任务助手',
    description: '任务互助、报名沟通、托管支付、交付验收和结算问题',
    prompt: '你是任务助手，专注回答任务互助、报名沟通、托管支付、交付验收和结算问题。'
  },
  {
    key: 'market',
    title: '交易助手',
    description: '二手商品、担保交易、订单支付、收货评价和纠纷处理问题',
    prompt: '你是交易助手，专注回答二手商品、担保交易、订单支付、收货评价和纠纷处理问题。'
  }
];

const agentPrompts = Object.fromEntries(agentDefinitions.map((agent) => [agent.key, agent.prompt]));
const defaultModelTimeoutMs = 45000;

function getAgentTypes() {
  return agentDefinitions.map((agent) => ({
    key: agent.key,
    title: agent.title,
    description: agent.description,
    prompt: agent.prompt
  }));
}

function getTaskStatuses(data) {
  return Array.from(
    new Set(['报名中', '进行中', '待验收', '已完成', '已取消', '已下架'].concat((data.tasks || []).map((item) => item.status)).filter(Boolean)),
  );
}

function getPlatformTaxonomy(data) {
  return {
    agents: getAgentTypes(),
    taskCategories: categories.normalizeTaskCategories(data.settings || {}, data.tasks || []).filter((item) => item !== '全部'),
    taskStatuses: getTaskStatuses(data),
    goodsCategories: categories.normalizeGoodsCategories(data.settings || {}, data.goods || [])
  };
}

function flattenGoodsCategories(goodsCategories) {
  return Array.from(
    new Set(
      (goodsCategories || [])
        .flatMap((item) => [item.name].concat(item.children || []))
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );
}

function withEnum(schema, values) {
  const enumValues = Array.from(new Set((values || []).filter(Boolean)));
  return enumValues.length ? { ...schema, enum: enumValues } : schema;
}

function buildTools(taxonomy) {
  const taskCategories = taxonomy.taskCategories || [];
  const taskStatuses = taxonomy.taskStatuses || [];
  const goodsCategoryNames = flattenGoodsCategories(taxonomy.goodsCategories);
  return [
    {
      type: 'function',
      function: {
        name: 'search_tasks',
        description: '搜索校园任务互助任务，适合查找跑腿、学业互助、技能服务等任务。任务分类和任务状态请优先从参数枚举中选择。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '任务关键词' },
            type: withEnum({ type: 'string', description: '任务分类' }, taskCategories),
            status: withEnum({ type: 'string', description: '任务状态' }, taskStatuses)
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_goods',
        description: '搜索二手市场商品，适合查找教材、数码、生活用品等商品。商品分类请优先从参数枚举中选择。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '商品关键词' },
            category: withEnum({ type: 'string', description: '商品分类，可为一级分类或子分类' }, goodsCategoryNames),
            maxPrice: { type: 'number', description: '最高价格' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_posts',
        description: '搜索社区论坛帖子，适合查找攻略、经验分享、求助和校园话题。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '帖子关键词' },
            topic: { type: 'string', description: '帖子话题' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_platform_taxonomy',
        description: '读取平台可用智能体、任务分类、任务状态、商品分类等枚举信息。无法确定分类或状态时先调用这个工具。',
        parameters: { type: 'object', properties: {} }
      }
    }
  ];
}

function getConfig() {
  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || process.env.AGENT_TIMEOUT_MS || defaultModelTimeoutMs);
  return {
    baseUrl: process.env.OPENAI_BASE_URL || process.env.OPENAI_URL || '',
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || '',
    model: process.env.OPENAI_MODEL || '',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultModelTimeoutMs
  };
}

function normalizeChatUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function configurationError(config) {
  const missing = [];
  if (!config.baseUrl) missing.push('OPENAI_BASE_URL');
  if (!config.apiKey) missing.push('OPENAI_API_KEY');
  if (!config.model) missing.push('OPENAI_MODEL');
  if (!missing.length) return null;
  const error = new Error(`智能体模型未配置：${missing.join('、')}`);
  error.status = 500;
  return error;
}

function modelTimeoutError(timeoutMs) {
  const seconds = Math.ceil(timeoutMs / 1000);
  const error = new Error(`智能体模型请求超时（${seconds} 秒），请检查模型服务地址、网络或模型响应速度。`);
  error.status = 504;
  return error;
}

function isAbortError(error) {
  return error && (error.name === 'AbortError' || error.code === 'ABORT_ERR');
}

function getQuestionTerms(question) {
  return String(question || '')
    .toLowerCase()
    .split(/\s+|，|。|、|\?|？/)
    .filter(Boolean);
}

function matchKnowledge(data, question) {
  const words = getQuestionTerms(question);
  const scored = data.knowledgeBase
    .map((item) => {
      const text = `${item.title} ${item.content} ${item.category}`.toLowerCase();
      const score = words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].item : data.knowledgeBase[0];
}

function textIncludes(item, keyword, fields) {
  const key = String(keyword || '').toLowerCase();
  if (!key) return true;
  return fields.map((field) => item[field] || '').join(' ').toLowerCase().includes(key);
}

function matchesGoodsCategory(data, itemCategory, queryCategory) {
  if (!queryCategory) return true;
  if (itemCategory === queryCategory) return true;
  const goodsCategories = categories.normalizeGoodsCategories(data.settings || {}, data.goods || []);
  const parent = goodsCategories.find((entry) => entry.name === queryCategory);
  if (parent && (parent.children || []).includes(itemCategory)) return true;
  const childParent = goodsCategories.find((entry) => (entry.children || []).includes(queryCategory));
  return Boolean(childParent && childParent.name === itemCategory);
}

function executeTool(data, name, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  if (name === 'search_tasks') {
    const list = data.tasks
      .filter((item) => !args.type || item.type === args.type)
      .filter((item) => !args.status || item.status === args.status)
      .filter((item) => textIncludes(item, args.keyword, ['title', 'detail', 'type', 'location']))
      .slice(0, 5)
      .map((item) => store.publicTask(data, item));
    return { tool: name, result: list };
  }
  if (name === 'search_goods') {
    const list = data.goods
      .filter((item) => item.auditStatus === '通过' && item.status !== '下架')
      .filter((item) => matchesGoodsCategory(data, item.category, args.category))
      .filter((item) => !args.maxPrice || item.price <= Number(args.maxPrice))
      .filter((item) => textIncludes(item, args.keyword, ['name', 'description', 'category', 'location']))
      .slice(0, 5)
      .map((item) => store.publicGoods(data, item));
    return { tool: name, result: list };
  }
  if (name === 'search_posts') {
    const list = data.posts
      .filter((item) => item.status === '已发布')
      .filter((item) => !args.topic || (item.topics || []).includes(args.topic))
      .filter((item) => textIncludes(item, args.keyword, ['title', 'content', 'type']))
      .slice(0, 5)
      .map((item) => store.publicPost(data, item));
    return { tool: name, result: list };
  }
  if (name === 'get_platform_taxonomy' || name === 'get_platform_categories') {
    return {
      tool: name,
      result: getPlatformTaxonomy(data)
    };
  }
  return { tool: name, result: null, error: '未知工具' };
}

function buildSystemContext(data, question, agentKey) {
  const knowledge = matchKnowledge(data, question);
  const taxonomy = getPlatformTaxonomy(data);
  const activePrompts = data.prompts
    .filter((item) => item.active)
    .map((item) => `${item.scene}：${item.content}`)
    .join('\n');
  const agentPrompt = agentPrompts[agentKey] || agentPrompts.campus;
  const content = [
    `当前智能体：${agentPrompt}`,
    '你可以自主判断是否调用工具。只读工具可用于查询平台任务、商品、帖子、分类、任务状态和智能体类型；不要编造平台数据。',
    '请用简洁中文回答。涉及平台数据时，优先依据工具结果、知识库和提示词；无法确定时说明需要进一步确认。',
    `平台枚举：\n${JSON.stringify(taxonomy)}`,
    activePrompts ? `平台提示词：\n${activePrompts}` : '',
    knowledge ? `知识库来源：${knowledge.title}（${knowledge.source}）\n${knowledge.content}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
  return { knowledge, message: { role: 'system', content } };
}

function buildMessages(data, question, options = {}) {
  const { knowledge, message } = buildSystemContext(data, question, options.agentKey);
  const history = Array.isArray(options.history) && options.history.length
    ? options.history
        .filter((item) => ['user', 'assistant'].includes(item.role) && item.content)
        .slice(-12)
        .map((item) => ({ role: item.role, content: String(item.content || '') }))
    : [{ role: 'user', content: String(question || '') }];
  return { knowledge, messages: [message, ...history] };
}

async function postChat(messages, options = {}) {
  const config = getConfig();
  const configError = configurationError(config);
  if (configError) throw configError;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const body = {
    model: config.model,
    messages,
    temperature: 0.4,
    stream: Boolean(options.stream)
  };
  if (options.includeTools !== false) {
    body.tools = buildTools(options.taxonomy || { taskCategories: [], taskStatuses: [], goodsCategories: [] });
    body.tool_choice = 'auto';
  }
  let response;
  try {
    response = await fetch(normalizeChatUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (isAbortError(error)) throw modelTimeoutError(config.timeoutMs);
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    clearTimeout(timer);
    const error = new Error(body.error?.message || body.message || '智能体模型请求失败');
    error.status = response.status || 502;
    throw error;
  }
  return {
    response,
    model: config.model,
    timeoutMs: config.timeoutMs,
    finish: () => clearTimeout(timer)
  };
}

async function readJsonCompletion(response) {
  const body = await response.json().catch(() => ({}));
  const message = body.choices?.[0]?.message || {};
  return {
    content: message.content || '',
    toolCalls: message.tool_calls || []
  };
}

async function readStreamCompletion(response, onDelta) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !response.body?.getReader) {
    const result = await readJsonCompletion(response);
    if (result.content && onDelta) onDelta(result.content);
    return result;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = [];
  let buffer = '';
  let content = '';

  function handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const body = JSON.parse(payload);
    const delta = body.choices?.[0]?.delta || {};
    if (delta.content) {
      content += delta.content;
      if (onDelta) onDelta(delta.content);
    }
    (delta.tool_calls || []).forEach((call) => {
      const index = call.index || 0;
      if (!toolCalls[index]) toolCalls[index] = { id: call.id || '', type: 'function', function: { name: '', arguments: '' } };
      if (call.id) toolCalls[index].id = call.id;
      if (call.function?.name) toolCalls[index].function.name += call.function.name;
      if (call.function?.arguments) toolCalls[index].function.arguments += call.function.arguments;
    });
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach((line) => {
      try {
        handleLine(line);
      } catch (error) {
        // Ignore malformed keepalive/provider-specific event lines.
      }
    });
  }
  if (buffer.trim()) {
    try {
      handleLine(buffer);
    } catch (error) {
      // Ignore trailing non-JSON text.
    }
  }
  return { content, toolCalls: toolCalls.filter(Boolean) };
}

async function readCompletion(chat, stream, onDelta) {
  try {
    return stream ? await readStreamCompletion(chat.response, onDelta) : await readJsonCompletion(chat.response);
  } catch (error) {
    if (isAbortError(error)) throw modelTimeoutError(chat.timeoutMs || defaultModelTimeoutMs);
    throw error;
  } finally {
    if (chat.finish) chat.finish();
  }
}

function parseToolArguments(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function normalizeToolCalls(toolCalls) {
  return (toolCalls || [])
    .filter((call) => call && call.function && call.function.name)
    .map((call, index) => ({
      id: call.id || `tool_call_${index + 1}`,
      type: call.type || 'function',
      function: {
        name: call.function.name,
        arguments: call.function.arguments || '{}'
      }
    }));
}

async function completeWithTools(data, question, options = {}, onDelta) {
  const taxonomy = getPlatformTaxonomy(data);
  const { knowledge, messages } = buildMessages(data, question, options);
  const toolResults = [];
  const first = await postChat(messages, { stream: Boolean(options.stream), taxonomy });
  const firstResult = options.stream
    ? await readCompletion(first, true, onDelta)
    : await readCompletion(first, false);
  const toolCalls = normalizeToolCalls(firstResult.toolCalls);
  if (!toolCalls.length) {
    if (!options.stream && firstResult.content && onDelta) onDelta(firstResult.content);
    return {
      answer: firstResult.content,
      sources: knowledge ? [{ id: knowledge.id, title: knowledge.title, source: knowledge.source }] : [],
      toolCall: null,
      toolResults,
      model: first.model
    };
  }

  const assistantMessage = {
    role: 'assistant',
    content: firstResult.content || '',
    tool_calls: toolCalls
  };
  const nextMessages = messages.concat([assistantMessage]);
  toolCalls.forEach((call) => {
    const result = executeTool(data, call.function?.name, parseToolArguments(call.function?.arguments));
    toolResults.push(result);
    nextMessages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  });

  nextMessages.push({
    role: 'user',
    content: '请基于以上工具结果回答用户问题。'
  });
  const final = await postChat(nextMessages, { stream: Boolean(options.stream), includeTools: false, taxonomy });
  const finalResult = options.stream
    ? await readCompletion(final, true, onDelta)
    : await readCompletion(final, false);
  return {
    answer: finalResult.content,
    sources: knowledge ? [{ id: knowledge.id, title: knowledge.title, source: knowledge.source }] : [],
    toolCall: toolResults[0] || null,
    toolResults,
    model: final.model
  };
}

async function answer(data, question, options = {}) {
  return completeWithTools(data, question, { ...options, stream: false });
}

function callTool(data, tool, args = {}) {
  if (tool && tool !== 'auto') return executeTool(data, tool, args);
  return executeTool(data, 'search_tasks', { keyword: args.keyword || args.q || '' });
}

function ensureAgentData(data) {
  if (!Array.isArray(data.agentSessions)) data.agentSessions = [];
  if (!Array.isArray(data.agentRuns)) data.agentRuns = [];
}

function updateRunResult(runId, userId, updater) {
  const data = store.load();
  ensureAgentData(data);
  const run = data.agentRuns.find((item) => item.id === runId && item.userId === userId);
  if (!run) return null;
  const session = data.agentSessions.find((item) => item.id === run.sessionId && item.userId === userId);
  const assistantMessage = session?.messages.find((item) => item.id === run.assistantMessageId);
  updater(data, run, session, assistantMessage);
  store.save(data);
  return { run, session, assistantMessage };
}

function expireStaleRun(data, run) {
  if (!run || run.status !== 'running') return false;
  const createdAt = new Date(run.createdAt || run.updatedAt || 0).getTime();
  if (!createdAt || Number.isNaN(createdAt)) return false;
  const staleMs = Math.max(getConfig().timeoutMs * 3, 90000);
  if (Date.now() - createdAt < staleMs) return false;
  const session = data.agentSessions.find((item) => item.id === run.sessionId && item.userId === run.userId);
  const assistantMessage = session?.messages.find((item) => item.id === run.assistantMessageId);
  const message = '智能体响应超时，请稍后重试。';
  if (assistantMessage) {
    assistantMessage.content = message;
    assistantMessage.status = 'failed';
    assistantMessage.updatedAt = store.now();
  }
  run.status = 'failed';
  run.error = message;
  run.completedAt = store.now();
  if (session) session.updatedAt = store.now();
  return true;
}

async function executeRun(runId, userId) {
  const data = store.load();
  ensureAgentData(data);
  const run = data.agentRuns.find((item) => item.id === runId && item.userId === userId);
  if (!run) return;
  const session = data.agentSessions.find((item) => item.id === run.sessionId && item.userId === userId);
  if (!session) return;
  const history = session.messages.filter((item) => item.id !== run.assistantMessageId);

  socketHub.broadcastToUser(userId, {
    type: 'agent_started',
    runId,
    sessionId: run.sessionId,
    messageId: run.assistantMessageId
  });

  try {
    const result = await completeWithTools(data, run.question, { agentKey: run.agentKey, history, stream: true }, (delta) => {
      socketHub.broadcastToUser(userId, {
        type: 'agent_delta',
        runId,
        sessionId: run.sessionId,
        messageId: run.assistantMessageId,
        delta
      });
    });

    if (!result.answer) throw new Error('智能体模型未返回有效内容');
    updateRunResult(runId, userId, (nextData, nextRun, nextSession, assistantMessage) => {
      if (assistantMessage) {
        assistantMessage.content = result.answer;
        assistantMessage.sources = result.sources;
        assistantMessage.toolCall = result.toolCall;
        assistantMessage.toolResults = result.toolResults;
        assistantMessage.model = result.model;
        assistantMessage.status = 'completed';
        assistantMessage.updatedAt = store.now();
      }
      nextRun.status = 'completed';
      nextRun.model = result.model;
      nextRun.completedAt = store.now();
      if (nextSession) nextSession.updatedAt = store.now();
    });

    socketHub.broadcastToUser(userId, {
      type: 'agent_done',
      runId,
      sessionId: run.sessionId,
      messageId: run.assistantMessageId
    });
  } catch (error) {
    updateRunResult(runId, userId, (nextData, nextRun, nextSession, assistantMessage) => {
      const message = error.message || '智能体模型请求失败';
      if (assistantMessage) {
        assistantMessage.content = message;
        assistantMessage.status = 'failed';
        assistantMessage.updatedAt = store.now();
      }
      nextRun.status = 'failed';
      nextRun.error = message;
      nextRun.completedAt = store.now();
      if (nextSession) nextSession.updatedAt = store.now();
    });

    socketHub.broadcastToUser(userId, {
      type: 'agent_error',
      runId,
      sessionId: run.sessionId,
      messageId: run.assistantMessageId,
      message: error.message || '智能体模型请求失败'
    });
  }
}

module.exports = {
  answer,
  callTool,
  executeTool,
  ensureAgentData,
  expireStaleRun,
  executeRun
};
