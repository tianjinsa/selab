import { agentQuickQuestions, agentTools, goods, posts, tasks } from '~/utils/campusData';

function makeAnswer(question) {
  if (question.includes('任务') || question.includes('跑腿')) {
    return {
      text: `我调用了任务互助工具，当前推荐「${tasks[0].title}」和「${tasks[2].title}」。发布任务会先进行身份与信用校验，并模拟托管酬金。`,
      source: '任务互助 function',
      tool: 'task.search',
    };
  }
  if (question.includes('二手') || question.includes('教材') || question.includes('担保')) {
    return {
      text: `二手市场采用平台担保交易：买家付款后资金托管，确认收货后打款给卖家。你可以先看「${goods[1].name}」。`,
      source: '二手市场交易规则',
      tool: 'market.search',
    };
  }
  if (question.includes('帖子') || question.includes('社区')) {
    return {
      text: `我检索到社区热帖「${posts[0].title}」。社区支持点赞、收藏、分享、关注作者和楼中楼回复。`,
      source: '社区论坛 function',
      tool: 'community.search',
    };
  }
  if (question.includes('校园卡') || question.includes('挂失')) {
    return {
      text: '校园卡可在学校服务大厅选择校园卡挂失，也可以到一卡通中心人工办理。建议先线上挂失，避免余额风险。',
      source: '学生事务中心办事指南',
      tool: 'knowledge.search',
    };
  }
  return {
    text: '我可以回答校园办事、平台使用、任务互助、二手交易和社区内容问题。当前问题我会建议转人工咨询，并保留这次会话记录。',
    source: '平台客服提示词',
    tool: 'fallback',
  };
}

Page({
  data: {
    tools: agentTools,
    quickQuestions: agentQuickQuestions,
    input: '',
    messages: [
      {
        role: 'assistant',
        text: '你好，我是校园信息智能体。可以帮你查任务、找二手商品、检索社区帖子，也能回答校园办事问题。',
        source: '客服咨询提示词 v1',
        tool: 'system',
      },
    ],
  },
  onInput(event) {
    this.setData({ input: event.detail.value });
  },
  askQuick(event) {
    this.ask(event.currentTarget.dataset.question);
  },
  sendQuestion() {
    const question = this.data.input.trim();
    if (!question) return;
    this.ask(question);
    this.setData({ input: '' });
  },
  ask(question) {
    const answer = makeAnswer(question);
    const messages = [
      ...this.data.messages,
      { role: 'user', text: question, source: '', tool: '' },
      { role: 'assistant', ...answer },
    ];
    this.setData({ messages });
  },
  useTool(event) {
    const { key } = event.currentTarget.dataset;
    const map = {
      task: '今天有哪些跑腿任务？',
      market: '二手教材怎么担保交易？',
      community: '社区有哪些热门帖子？',
      campus: '校园卡怎么挂失？',
    };
    this.ask(map[key]);
  },
});
