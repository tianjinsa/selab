const store = require('./store');

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

function answer(data, question) {
  const knowledge = matchKnowledge(data, question);
  const toolCall = callTool(data, question);
  const toolText = toolCall ? `我还调用了 ${toolCall.tool}，找到 ${toolCall.result.length} 条相关结果。` : '';
  return {
    answer: `${knowledge.content}${toolText ? ` ${toolText}` : ''}`,
    sources: [{ id: knowledge.id, title: knowledge.title, source: knowledge.source }],
    toolCall
  };
}

module.exports = {
  answer,
  callTool
};
