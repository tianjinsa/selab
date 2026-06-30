const DEFAULT_RETRY = {
  minDelay: 800,
  maxDelay: 8000,
  factor: 1.8,
  jitter: 0.25,
  maxQueue: 20
};

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;

export function createReconnectableWebSocket(options = {}) {
  const retry = { ...DEFAULT_RETRY, ...(options.retry || {}) };
  let socket = null;
  let reconnectTimer = null;
  let manuallyClosed = false;
  let attempt = 0;
  let connectionId = 0;
  let pendingMessages = [];
  let lastStatus = 'idle';

  function notify(status, detail = {}) {
    lastStatus = status;
    options.onStatusChange?.({
      status,
      attempt,
      queued: pendingMessages.length,
      ...detail
    });
  }

  function connect() {
    if (socket?.readyState === WS_OPEN || socket?.readyState === WS_CONNECTING) {
      return;
    }
    const WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
    if (!WebSocketImpl) {
      notify('error', { error: new Error('当前环境不支持 WebSocket') });
      return;
    }
    const url = typeof options.url === 'function' ? options.url() : options.url;
    if (!url) {
      notify('error', { error: new Error('缺少 WebSocket 地址') });
      return;
    }

    clearReconnectTimer();
    manuallyClosed = false;
    const id = connectionId + 1;
    connectionId = id;
    const isReconnect = attempt > 0 || lastStatus === 'reconnecting';
    notify(isReconnect ? 'reconnecting' : 'connecting');

    try {
      socket = new WebSocketImpl(url, options.protocols);
    } catch (error) {
      socket = null;
      scheduleReconnect(error);
      return;
    }

    socket.onopen = (event) => {
      if (id !== connectionId) return;
      const reconnected = attempt > 0;
      attempt = 0;
      notify('connected', { event, reconnected });
      flushQueue();
      options.onOpen?.({ event, reconnected });
    };

    socket.onmessage = (event) => {
      if (id !== connectionId) return;
      options.onMessage?.(event);
    };

    socket.onerror = (event) => {
      if (id !== connectionId) return;
      options.onError?.(event);
    };

    socket.onclose = (event) => {
      if (id !== connectionId) return;
      socket = null;
      options.onClose?.(event);
      if (manuallyClosed) {
        notify('closed', { event });
        return;
      }
      scheduleReconnect(event);
    };
  }

  function scheduleReconnect(reason) {
    if (manuallyClosed) return;
    clearReconnectTimer();
    attempt += 1;
    const baseDelay = Math.min(retry.maxDelay, retry.minDelay * Math.pow(retry.factor, attempt - 1));
    const jitterOffset = baseDelay * retry.jitter * Math.random();
    const delay = Math.round(baseDelay + jitterOffset);
    notify('reconnecting', { reason, nextRetryIn: delay });
    reconnectTimer = globalThis.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function send(data, sendOptions = {}) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    if (socket?.readyState === WS_OPEN) {
      socket.send(payload);
      return { sent: true, queued: false };
    }
    if (sendOptions.queue) {
      if (pendingMessages.length >= retry.maxQueue) pendingMessages.shift();
      pendingMessages.push(payload);
      connect();
      notify(lastStatus === 'connected' ? 'reconnecting' : lastStatus, { queued: pendingMessages.length });
      return { sent: false, queued: true };
    }
    return { sent: false, queued: false };
  }

  function flushQueue() {
    if (!socket || socket.readyState !== WS_OPEN || !pendingMessages.length) return;
    const queue = pendingMessages;
    pendingMessages = [];
    for (const payload of queue) {
      socket.send(payload);
    }
    options.onQueueFlushed?.(queue.length);
  }

  function reconnect() {
    closeSocketOnly();
    manuallyClosed = false;
    scheduleReconnect(new Error('manual reconnect'));
  }

  function close() {
    manuallyClosed = true;
    pendingMessages = [];
    clearReconnectTimer();
    closeSocketOnly();
    notify('closed');
  }

  function closeSocketOnly() {
    const current = socket;
    socket = null;
    connectionId += 1;
    if (current && current.readyState !== WS_CLOSED) {
      current.close();
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      globalThis.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  return {
    connect,
    reconnect,
    close,
    send,
    isOpen: () => socket?.readyState === WS_OPEN,
    status: () => lastStatus,
    queuedCount: () => pendingMessages.length
  };
}
