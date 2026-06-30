import { hashPassword } from './auth.js';
import { randomUUID } from 'node:crypto';

function now() {
  return new Date().toISOString();
}

export async function seedInitialData(store) {
  const users = store.collection('users');
  if (users.length === 0) {
    const passwordHash = await hashPassword('123456');
    await store.replaceCollection('users', [
      {
        id: randomUUID(),
        studentId: '202600000001',
        phone: '13800000001',
        passwordHash,
        nickname: '林同学',
        avatarUrl: '',
        contact: 'QQ 10001',
        bio: '可以帮忙取快递，也喜欢逛二手市场。',
        creditScore: 10,
        isBanned: false,
        isMuted: false,
        isPublishRestricted: false,
        isDemo: true,
        createdAt: now(),
        updatedAt: now(),
        lastLoginAt: ''
      },
      {
        id: randomUUID(),
        studentId: '202600000002',
        phone: '13800000002',
        passwordHash,
        nickname: '周同学',
        avatarUrl: '',
        contact: '微信 campus-demo',
        bio: '学业互助和教材资料交流。',
        creditScore: 10,
        isBanned: false,
        isMuted: false,
        isPublishRestricted: false,
        isDemo: true,
        createdAt: now(),
        updatedAt: now(),
        lastLoginAt: ''
      }
    ]);
  }
}
