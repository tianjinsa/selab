import request from '~/api/request';
import { formatTime, listFrom, unwrap } from '~/utils/api';

const app = getApp();

const agents = [
  {
    key: 'campus',
    title: '校园助手',
    short: '校园',
    badge: '校',
    desc: '校园办事、地点流程、平台规则',
    greeting: '你好，我是校园助手。可以帮你查校园办事流程、平台规则和常见问题。',
  },
  {
    key: 'task',
    title: '任务助手',
    short: '任务',
    badge: '任',
    desc: '跑腿任务、报名沟通、托管结算',
    greeting: '你好，我是任务助手。可以帮你查任务、理解报名和结算流程。',
  },
  {
    key: 'market',
    title: '交易助手',
    short: '交易',
    badge: '市',
    desc: '二手商品、担保交易、订单咨询',
    greeting: '你好，我是交易助手。可以帮你查二手商品和担保交易规则。',
  },
];

function getAgent(key) {
  return agents.find((item) => item.key === key) || agents[0];
}

function buildGreeting(agent) {
  return [
    {
      id: 'welcome',
      role: 'assistant',
      text: agent.greeting,
      source: '智能体提示词',
      tool: 'system',
    },
  ];
}

function mapAnswer(data) {
  const sources = data.sources || [];
  const source = sources.length ? sources[0] : {};
  const toolCall = data.toolCall || {};
  return {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    text: data.answer || '暂时没有找到答案，请换个说法再试。',
    source: source.title ? `${source.title} · ${source.source || '知识库'}` : '平台知识库',
    tool: toolCall.tool || 'knowledge.search',
  };
}

function mapSessionMessage(message, index) {
  const sources = message.sources || [];
  const source = sources.length ? sources[0] : {};
  const toolCall = message.toolCall || {};
  return {
    id: `${message.role}-${index}`,
    role: message.role,
    text: message.content,
    source: source.title ? `${source.title} · ${source.source || '知识库'}` : '',
    tool: toolCall.tool || '',
  };
}

function mapSessionItem(session) {
  return {
    title: session.title || '未命名会话',
    sessionId: session.id,
    updatedAt: formatTime(session.updatedAt || session.createdAt),
  };
}

Page({
  data: {
    statusHeight: 0,
    headerRightInset: 20,
    activeAgentKey: 'campus',
    activeAgent: agents[0],
    agentItems: agents.map((item) => ({ title: `${item.title} · ${item.desc}`, key: item.key })),
    historyVisible: false,
    agentVisible: false,
    sessions: [],
    historyItems: [],
    sessionId: '',
    sessionTitle: '新对话',
    input: '',
    messages: buildGreeting(agents[0]),
    loading: false,
    anchor: 'bottom',
  },

  async onLoad() {
    const windowInfo = wx.getWindowInfo();
    let headerRightInset = 20;
    const menuButton = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
    if (menuButton && menuButton.left) headerRightInset = Math.max(20, windowInfo.windowWidth - menuButton.left + 8);
    this.setData({ statusHeight: windowInfo.statusBarHeight, headerRightInset });
    await app.ensureLogin();
    this.loadSessions();
  },

  onShow() {
    this.loadSessions();
  },

  loadSessions() {
    request('/agent/sessions')
      .then((res) => {
        const sessions = listFrom(res);
        const historyItems = sessions.map(mapSessionItem);
        this.setData({ sessions, historyItems });
      })
      .catch(() => this.setData({ sessions: [], historyItems: [] }));
  },

  openHistory() {
    this.loadSessions();
    this.setData({ historyVisible: true });
  },

  closeHistory() {
    this.setData({ historyVisible: false });
  },

  openAgentSwitcher() {
    this.setData({ agentVisible: true });
  },

  closeAgentSwitcher() {
    this.setData({ agentVisible: false });
  },

  selectAgent(event) {
    const { key } = event.detail.item;
    const activeAgent = getAgent(key);
    const shouldResetGreeting = !this.data.sessionId && this.data.messages.length === 1;
    this.setData({
      activeAgentKey: key,
      activeAgent,
      agentVisible: false,
      messages: shouldResetGreeting ? buildGreeting(activeAgent) : this.data.messages,
    });
  },

  selectSession(event) {
    const { sessionId } = event.detail.item;
    const session = this.data.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const messages = (session.messages || []).map(mapSessionMessage);
    this.setData({
      sessionId: session.id,
      sessionTitle: session.title || '历史对话',
      messages: messages.length ? messages : buildGreeting(this.data.activeAgent),
      historyVisible: false,
    });
    wx.nextTick(() => this.scrollToBottom());
  },

  newConversation() {
    const { activeAgent } = this.data;
    this.setData({
      sessionId: '',
      sessionTitle: '新对话',
      input: '',
      messages: buildGreeting(activeAgent),
      historyVisible: false,
    });
    wx.nextTick(() => this.scrollToBottom());
  },

  onInput(event) {
    this.setData({ input: event.detail.value });
  },

  sendQuestion() {
    const question = this.data.input.trim();
    if (!question || this.data.loading) return;
    this.ask(question);
  },

  ask(question) {
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
      source: '',
      tool: '',
    };
    this.setData({
      input: '',
      loading: true,
      messages: this.data.messages.concat([userMessage]),
    });
    wx.nextTick(() => this.scrollToBottom());

    request('/agent/chat', 'POST', {
      question,
      sessionId: this.data.sessionId,
      agentKey: this.data.activeAgentKey,
    })
      .then((res) => {
        const data = unwrap(res);
        const messages = this.data.messages.concat([mapAnswer(data)]);
        this.setData({
          sessionId: data.sessionId || this.data.sessionId,
          sessionTitle: this.data.sessionId ? this.data.sessionTitle : question,
          messages,
        });
        this.loadSessions();
        wx.nextTick(() => this.scrollToBottom());
      })
      .catch(() => {
        this.setData({
          messages: this.data.messages.concat([
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              text: '智能体服务暂时不可用，请稍后再试。',
              source: '系统提示',
              tool: 'fallback',
            },
          ]),
        });
      })
      .finally(() => {
        this.setData({ loading: false });
        wx.nextTick(() => this.scrollToBottom());
      });
  },

  scrollToBottom() {
    this.setData({ anchor: 'bottom' });
  },
});
