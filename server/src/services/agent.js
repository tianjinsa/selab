const store = require('./store');

const agentPrompts = {
  campus: '你是校园助手，专注回答校园办事、地点流程、平台规则和学生日常问题。',
  task: '你是任务助手，专注回答任务互助、报名沟通、托管支付、交付验收和结算问题。',
  market: '你是交易助手，专注回答二手商品、担保交易、订单支付、收货评价和纠纷处理问题。'
};

function getConfig() {
  return {
    baseUrl: process.env.OPENAI_BASE_URL || process.env.OPENAI_URL || '',
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || '',
    model: process.env.OPENAI_MODEL || ''
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

function matchKnowledge(data, question) {
  const q = String(question || '').toLowerCase();
  const scored = data.knowledgeBase
    .map((item) => {
      const text = `${item.title} ${item.content} ${item.category}`.toLowerCase();
      const score = q
        .split(/\s+|，|。|、|\?|？/)
        .filter(Boolean)
        .reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].item : data.knowledgeBase[0];
}

function callTool(data, question) {
  const text = String(question || '');
  if (text.includes('任务') || text.includes('跑腿') || text.includes('互助')) {
    return {
      tool: 'task.search',
      result: data.tasks.slice(0, 3).map((item) => store.publicTask(data, item))
    };
  }
  if (text.includes('二手') || text.includes('商品') || text.includes('教材')) {
    return {
      tool: 'market.search',
      result: data.goods.slice(0, 3).map((item) => store.publicGoods(data, item))
    };
  }
  if (text.includes('帖子') || text.includes('社区') || text.includes('攻略')) {
    return {
      tool: 'community.search',
      result: data.posts.slice(0, 3).map((item) => store.publicPost(data, item))
    };
  }
  return null;
}

function summarizeToolCall(toolCall) {
  if (!toolCall) return '无相关工具检索结果。';
  const titles = toolCall.result
    .map((item) => item.title || item.name || item.content || item.id)
    .filter(Boolean)
    .slice(0, 3)
    .join('；');
  return `${toolCall.tool} 返回 ${toolCall.result.length} 条结果：${titles || '无标题结果'}`;
}

function buildMessages(data, question, options = {}) {
  const knowledge = matchKnowledge(data, question);
  const toolCall = callTool(data, question);
  const activePrompts = data.prompts
    .filter((item) => item.active)
    .map((item) => `${item.scene}：${item.content}`)
    .join('\n');
  const agentPrompt = agentPrompts[options.agentKey] || agentPrompts.campus;
  const context = [
    `当前智能体：${agentPrompt}`,
    '请用简洁中文回答。涉及平台数据时，优先依据下方知识库和检索结果；无法确定时说明需要进一步确认。',
    activePrompts ? `平台提示词：\n${activePrompts}` : '',
    knowledge ? `知识库来源：${knowledge.title}（${knowledge.source}）\n${knowledge.content}` : '',
    `工具检索：${summarizeToolCall(toolCall)}`
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    knowledge,
    toolCall,
    messages: [
      { role: 'system', content: context },
      { role: 'user', content: String(question || '') }
    ]
  };
}

async function answer(data, question, options = {}) {
  const config = getConfig();
  const configError = configurationError(config);
  if (configError) throw configError;

  const url = normalizeChatUrl(config.baseUrl);
  const { knowledge, toolCall, messages } = buildMessages(data, question, options);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.4
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || body.message || '智能体模型请求失败');
    error.status = response.status || 502;
    throw error;
  }

  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    const error = new Error('智能体模型未返回有效内容');
    error.status = 502;
    throw error;
  }

  return {
    answer: content,
    sources: knowledge ? [{ id: knowledge.id, title: knowledge.title, source: knowledge.source }] : [],
    toolCall,
    model: config.model
  };
}

module.exports = {
  answer,
  callTool
};
