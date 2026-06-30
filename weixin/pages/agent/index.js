import request from '~/api/request';
import { formatTime, listFrom, unwrap } from '~/utils/api';

const app = getApp();

const agents = [
  {
    key: 'campus',
    title: '校园助手',
    short: '校园',
    badge: '校',
    accent: '#0052d9',
    softColor: '#edf4ff',
    borderColor: '#cfe0ff',
    desc: '校园办事、地点流程、平台规则',
    greeting: '你好，我是校园助手。可以帮你查校园办事流程、平台规则和常见问题。',
  },
  {
    key: 'task',
    title: '任务助手',
    short: '任务',
    badge: '任',
    accent: '#176b87',
    softColor: '#ecf8fb',
    borderColor: '#caeaf2',
    desc: '跑腿任务、报名沟通、托管结算',
    greeting: '你好，我是任务助手。可以帮你查任务、理解报名和结算流程。',
  },
  {
    key: 'market',
    title: '交易助手',
    short: '交易',
    badge: '市',
    accent: '#2d7d79',
    softColor: '#edf8f6',
    borderColor: '#cce9e5',
    desc: '二手商品、担保交易、订单咨询',
    greeting: '你好，我是交易助手。可以帮你查二手商品和担保交易规则。',
  },
];

const quickPrompts = ['论文选题清单', '拆解写作步骤', '解释文献观点'];

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

function isEmptyConversation(messages) {
  return messages.length === 1 && messages[0].id === 'welcome';
}

function mapSessionMessage(message, index) {
  const sources = message.sources || [];
  const source = sources.length ? sources[0] : {};
  const toolCall = message.toolCall || {};
  return {
    id: message.id || `${message.role}-${index}`,
    runId: message.runId || '',
    status: message.status || 'completed',
    role: message.role,
    text: message.content || '',
    source: source.title ? `${source.title} · ${source.source || '知识库'}` : '',
    tool: toolCall.tool || (message.toolResults && message.toolResults[0] && message.toolResults[0].tool) || '',
  };
}

function mapSessionItem(session) {
  const messages = session.messages || [];
  const last = messages[messages.length - 1] || {};
  const preview = last.content || (last.status === 'running' ? '正在生成回复...' : '暂无对话内容');
  return {
    title: session.title || '未命名会话',
    sessionId: session.id,
    preview,
    updatedAt: formatTime(session.updatedAt || session.createdAt),
  };
}

function getErrorMessage(error, fallback = '智能体服务暂时不可用，请稍后再试。') {
  const body = error && error.data;
  return (body && (body.message || body.detail)) || error.message || fallback;
}

Page({
  data: {
    statusHeight: 0,
    headerRightInset: 20,
    agents,
    agentIndex: 0,
    activeAgentKey: 'campus',
    activeAgent: agents[0],
    historyVisible: false,
    agentVisible: false,
    sessions: [],
    historyItems: [],
    sessionId: '',
    sessionTitle: '新会话',
    activeRunId: '',
    assistantMessageId: '',
    input: '',
    messages: buildGreeting(agents[0]),
    isEmptyConversation: true,
    quickPrompts,
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
    this.socketMessageHandler = this.handleSocketMessage.bind(this);
    app.eventBus.on('socket-message', this.socketMessageHandler);
    this.loadSessions();
  },

  onUnload() {
    if (this.socketMessageHandler) app.eventBus.off('socket-message', this.socketMessageHandler);
    this.stopRunPolling();
  },

  onShow() {
    if (this.data.sessionId && !this.data.loading) this.loadSession(this.data.sessionId);
    else this.loadSessions();
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

  goMessageCenter() {
    wx.navigateTo({ url: '/pages/message/index' });
  },

  openAgentSwitcher() {
    const agentIndex = agents.findIndex((item) => item.key === this.data.activeAgentKey);
    this.setData({ agentVisible: true, agentIndex: Math.max(agentIndex, 0) });
  },

  closeAgentSwitcher() {
    this.setData({ agentVisible: false });
  },

  renderSession(session, extra = {}) {
    const activeAgent = getAgent(session.agentKey || this.data.activeAgentKey);
    const agentIndex = agents.findIndex((item) => item.key === activeAgent.key);
    const messages = (session.messages || []).map(mapSessionMessage);
    const running = messages.find((item) => item.status === 'running');
    this.setData({
      activeAgentKey: activeAgent.key,
      activeAgent,
      agentIndex: Math.max(agentIndex, 0),
      sessionId: session.id,
      sessionTitle: session.title || '历史对话',
      messages: messages.length ? messages : buildGreeting(activeAgent),
      isEmptyConversation: !messages.length,
      activeRunId: running ? running.runId : extra.activeRunId || '',
      assistantMessageId: running ? running.id : extra.assistantMessageId || '',
      loading: Boolean(running),
      ...extra,
    });
    wx.nextTick(() => this.scrollToBottom());
  },

  loadSession(sessionId) {
    return request(`/agent/sessions/${sessionId}`)
      .then((res) => {
        const session = unwrap(res);
        this.renderSession(session, { historyVisible: false });
        this.loadSessions();
        return session;
      })
      .catch(() => wx.showToast({ title: '会话加载失败', icon: 'none' }));
  },

  applyAgent(activeAgent) {
    const shouldResetGreeting = !this.data.sessionId && this.data.messages.length === 1;
    const messages = shouldResetGreeting ? buildGreeting(activeAgent) : this.data.messages;
    this.setData({
      activeAgentKey: activeAgent.key,
      activeAgent,
      messages,
      isEmptyConversation: isEmptyConversation(messages),
    });
  },

  onAgentSwiperChange(event) {
    const agentIndex = event.detail.current;
    const activeAgent = agents[agentIndex] || agents[0];
    this.setData({ agentIndex });
    this.applyAgent(activeAgent);
  },

  selectAgentCard(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const activeAgent = agents[index] || agents[0];
    this.setData({ agentIndex: index });
    this.applyAgent(activeAgent);
  },

  selectSession(event) {
    const { sessionId } = event.currentTarget.dataset;
    if (!sessionId) return;
    this.loadSession(sessionId);
  },

  deleteSession(event) {
    const { sessionId } = event.currentTarget.dataset;
    if (!sessionId) return;
    request(`/agent/sessions/${sessionId}`, 'DELETE')
      .then(() => {
        const sessions = this.data.sessions.filter((item) => item.id !== sessionId);
        const historyItems = sessions.map(mapSessionItem);
        const nextData = { sessions, historyItems };
        if (this.data.sessionId === sessionId) {
          Object.assign(nextData, {
            sessionId: '',
            sessionTitle: '新会话',
            activeRunId: '',
            assistantMessageId: '',
            input: '',
            messages: buildGreeting(this.data.activeAgent),
            isEmptyConversation: true,
            loading: false,
          });
          this.stopRunPolling();
        }
        this.setData(nextData);
        wx.showToast({ title: '已删除', icon: 'success' });
      })
      .catch((error) => wx.showToast({ title: getErrorMessage(error, '删除失败'), icon: 'none' }));
  },

  stopTap() {},

  newConversation() {
    const { activeAgent } = this.data;
    this.setData({
      sessionId: '',
      sessionTitle: '新会话',
      activeRunId: '',
      assistantMessageId: '',
      input: '',
      messages: buildGreeting(activeAgent),
      isEmptyConversation: true,
      historyVisible: false,
      loading: false,
    });
    this.stopRunPolling();
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

  useQuickPrompt(event) {
    const { prompt } = event.currentTarget.dataset;
    if (!prompt || this.data.loading) return;
    this.ask(prompt);
  },

  ask(question) {
    this.setData({
      input: '',
      loading: true,
      isEmptyConversation: false,
    });
    wx.nextTick(() => this.scrollToBottom());

    request('/agent/runs', 'POST', {
      question,
      sessionId: this.data.sessionId,
      agentKey: this.data.activeAgentKey,
    })
      .then((res) => {
        const data = unwrap(res);
        this.renderSession(data.session, {
          activeRunId: data.run.id,
          assistantMessageId: data.run.assistantMessageId,
          loading: true,
        });
        this.startRunPolling(data.run.id, data.session.id);
        this.loadSessions();
      })
      .catch((error) => {
        this.setData({
          messages: this.data.messages.concat([
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              text: getErrorMessage(error, '智能体模型未配置或请求失败，请检查后端 OPENAI_BASE_URL、OPENAI_API_KEY、OPENAI_MODEL。'),
              source: '系统提示',
              tool: 'fallback',
            },
          ]),
          isEmptyConversation: false,
          loading: false,
        });
        wx.nextTick(() => this.scrollToBottom());
      });
  },

  handleSocketMessage(data) {
    if (!data || !data.type || data.sessionId !== this.data.sessionId) return;
    if (data.type === 'agent_delta') this.appendAgentDelta(data.messageId, data.delta || '');
    if (data.type === 'agent_done') {
      this.stopRunPolling();
      this.setData({ loading: false, activeRunId: '', assistantMessageId: '' });
      this.loadSession(data.sessionId);
    }
    if (data.type === 'agent_error') {
      this.stopRunPolling();
      this.applyAgentError(data.messageId, data.message || '智能体模型请求失败');
    }
  },

  appendAgentDelta(messageId, delta) {
    if (!delta) return;
    const messages = this.data.messages.map((item) => {
      if (item.id !== messageId) return item;
      return { ...item, text: `${item.text || ''}${delta}`, status: 'running' };
    });
    this.setData({ messages, isEmptyConversation: false });
    wx.nextTick(() => this.scrollToBottom());
  },

  applyAgentError(messageId, message) {
    const messages = this.data.messages.map((item) => {
      if (item.id !== messageId) return item;
      return { ...item, text: message, status: 'failed', source: '系统提示', tool: 'error' };
    });
    this.setData({ messages, loading: false, activeRunId: '', assistantMessageId: '' });
    wx.nextTick(() => this.scrollToBottom());
  },

  startRunPolling(runId, sessionId) {
    this.stopRunPolling();
    this.runPollTimer = setInterval(() => {
      request(`/agent/runs/${runId}`)
        .then((res) => {
          const run = unwrap(res);
          if (run.status === 'completed') {
            this.stopRunPolling();
            this.setData({ loading: false, activeRunId: '', assistantMessageId: '' });
            this.loadSession(sessionId);
          }
          if (run.status === 'failed') {
            this.stopRunPolling();
            this.applyAgentError(run.assistantMessageId, run.error || '智能体模型请求失败');
          }
        })
        .catch(() => {});
    }, 2500);
  },

  stopRunPolling() {
    if (!this.runPollTimer) return;
    clearInterval(this.runPollTimer);
    this.runPollTimer = null;
  },

  scrollToBottom() {
    this.setData({ anchor: 'bottom' });
  },
});
