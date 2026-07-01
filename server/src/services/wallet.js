import { badRequest } from '../utils/errors.js';

function now() {
  return new Date().toISOString();
}

function serialNo(prefix = 'WAL') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function normalizeAmount(value) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('请输入有效金额');
  return amount;
}

export function walletBalance(store, userId) {
  return store.collection('walletTransactions')
    .filter((item) => item.userId === userId && item.status === 'success' && !item.deletedAt)
    .reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return item.direction === 'out' ? sum - amount : sum + amount;
    }, 0);
}

export function walletSummary(store, userId) {
  const transactions = store.collection('walletTransactions')
    .filter((item) => item.userId === userId && !item.deletedAt)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const successful = transactions.filter((item) => item.status === 'success');
  return {
    balance: walletBalance(store, userId),
    stats: {
      income: successful
        .filter((item) => item.direction === 'in')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      withdrawn: successful
        .filter((item) => item.type === 'withdrawal')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      transactionCount: transactions.length
    },
    transactions: transactions.slice(0, 100)
  };
}

export async function creditWallet(store, payload) {
  const amount = normalizeAmount(payload.amount);
  if (payload.relatedType && payload.relatedId) {
    const existing = store.collection('walletTransactions').find((item) => (
      item.userId === payload.userId
      && item.type === 'income'
      && item.relatedType === payload.relatedType
      && item.relatedId === payload.relatedId
      && item.status === 'success'
      && !item.deletedAt
    ));
    if (existing) return existing;
  }
  const before = walletBalance(store, payload.userId);
  return store.insert('walletTransactions', {
    userId: payload.userId,
    type: 'income',
    direction: 'in',
    amount,
    balanceBefore: before,
    balanceAfter: before + amount,
    status: 'success',
    title: payload.title || '钱包收入',
    relatedType: payload.relatedType || '',
    relatedId: payload.relatedId || '',
    source: payload.source || '',
    serialNo: serialNo()
  });
}

export async function withdrawWallet(store, user, body = {}) {
  const amount = normalizeAmount(body.amount);
  const balance = walletBalance(store, user.id);
  if (amount > balance) throw badRequest('钱包余额不足');
  const method = String(body.method || '模拟提现').trim().slice(0, 20) || '模拟提现';
  const accountNote = String(body.accountNote || '').trim().slice(0, 80);
  return store.insert('walletTransactions', {
    userId: user.id,
    type: 'withdrawal',
    direction: 'out',
    amount,
    balanceBefore: balance,
    balanceAfter: balance - amount,
    status: 'success',
    title: `钱包提现到${method}`,
    method,
    accountNote,
    relatedType: 'wallet',
    relatedId: '',
    source: 'user_withdrawal',
    serialNo: serialNo('WDR'),
    completedAt: now()
  });
}
