import { badRequest } from './errors.js';

export function assertCleanContent(store, ...values) {
  const words = store.collection('settings').sensitiveWords || [];
  const content = values.filter(Boolean).join(' ');
  const hit = words.find((word) => word && content.includes(word));
  if (hit) throw badRequest(`内容包含敏感词：${hit}`);
}

export function extractTaskKeywords(text) {
  const source = String(text || '');
  const candidates = [
    '取快递',
    '取外卖',
    '代打印',
    '课程资料',
    '技能服务',
    '跑腿',
    '代办',
    '教材',
    '实验',
    '作业',
    '图书馆',
    '食堂'
  ];
  const hits = candidates.filter((keyword) => source.includes(keyword));
  if (hits.length) return hits.slice(0, 5);
  return source
    .replace(/[，。！？、,.!?]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 5);
}
