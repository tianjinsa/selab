import { hashPassword } from './auth.js';
import { randomUUID } from 'node:crypto';

function now() {
  return new Date().toISOString();
}

export async function seedInitialData(store) {
  if (await store.count('users') === 0) {
    const passwordHash = await hashPassword('123456');
    await store.replaceCollection('users', [
      {
        id: randomUUID(),
        studentId: '202600000001',
        phone: '13800000001',
        passwordHash,
        nickname: '林同学',
        avatarUrl: '',
        coverUrl: '',
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
        coverUrl: '',
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
  if (await store.count('knowledgeEntries') === 0) {
    await store.replaceCollection('knowledgeBases', [
      {
        id: 'kb-default',
        name: '默认知识库',
        description: '校园办事、平台规则和常见问题',
        enabled: true,
        createdAt: now(),
        updatedAt: now()
      }
    ]);
    await store.replaceCollection('knowledgeEntries', [
      {
        id: randomUUID(),
        knowledgeBaseId: 'kb-default',
        title: '校园快递点开放时间',
        category: '校园办事流程',
        content: '快递点通常在 9:00-21:00 开放，节假日以学校通知为准。取件请携带取件码和校园卡。',
        source: '后勤服务中心',
        createdAt: now(),
        updatedAt: now()
      },
      {
        id: randomUUID(),
        knowledgeBaseId: 'kb-default',
        title: '平台任务互助说明',
        category: '平台使用说明',
        content: '用户发布任务需要完成模拟支付，任务完成后系统记录模拟结算流水。信用分低于 4 分不能接任务。',
        source: '平台规则',
        createdAt: now(),
        updatedAt: now()
      },
      {
        id: randomUUID(),
        knowledgeBaseId: 'kb-default',
        title: '二手市场担保流程',
        category: '平台使用说明',
        content: '买家申请购买后由卖家确认，买家模拟支付后卖家线下交付，买家确认收货后订单完成。',
        source: '平台规则',
        createdAt: now(),
        updatedAt: now()
      }
    ]);
  }
}
