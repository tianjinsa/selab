<template>
  <div class="wallet-page">
    <section class="surface panel wallet-hero">
      <div>
        <span class="status-pill"><WalletCards :size="14" /> 主系统钱包</span>
        <h2>钱包余额</h2>
        <p class="muted">任务和二手交易的收款会先进入钱包，提现时再生成模拟提现流水。</p>
      </div>
      <div class="wallet-balance-card">
        <span>可提现余额</span>
        <strong>{{ formatMoney(balance) }}</strong>
        <n-button type="primary" :disabled="balance <= 0" @click="withdrawVisible = true">
          <template #icon><ArrowDownToLine :size="16" /></template>
          提现
        </n-button>
      </div>
    </section>

    <section class="wallet-stat-grid">
      <article class="metric-card wallet-stat">
        <span>累计入账</span>
        <strong>{{ formatMoney(stats.income) }}</strong>
        <small class="muted">任务完成和商品成交收入</small>
      </article>
      <article class="metric-card wallet-stat">
        <span>累计提现</span>
        <strong>{{ formatMoney(stats.withdrawn) }}</strong>
        <small class="muted">模拟提现成功金额</small>
      </article>
      <article class="metric-card wallet-stat">
        <span>钱包流水</span>
        <strong>{{ stats.transactionCount }}</strong>
        <small class="muted">收入与提现记录</small>
      </article>
    </section>

    <section class="surface panel">
      <n-space justify="space-between" align="center">
        <div>
          <h3 style="margin: 0;">钱包流水</h3>
          <p class="muted" style="margin: 6px 0 0;">只记录进入钱包和从钱包提现的资金变化，任务/订单详情仍保留在各自工作台。</p>
        </div>
        <n-button text type="primary" :loading="loading" @click="load">刷新</n-button>
      </n-space>

      <transition-group v-if="transactions.length" name="card-flow" tag="div" class="wallet-flow-list" appear>
        <article v-for="item in transactions" :key="item.id" class="wallet-flow-item">
          <span class="wallet-flow-icon" :class="item.direction">
            <component :is="item.direction === 'out' ? ArrowDownToLine : ArrowUpRight" :size="18" />
          </span>
          <span>
            <strong>{{ item.title }}</strong>
            <small>{{ item.serialNo }} · {{ formatTime(item.createdAt) }}</small>
            <small v-if="item.accountNote" class="muted">提现备注：{{ item.accountNote }}</small>
          </span>
          <strong :class="item.direction === 'out' ? 'money-out' : 'money-in'">
            {{ item.direction === 'out' ? '-' : '+' }}{{ formatMoney(item.amount) }}
          </strong>
        </article>
      </transition-group>
      <div v-else class="empty-state">暂无钱包流水</div>
    </section>

    <n-modal v-model:show="withdrawVisible" preset="card" title="模拟提现" class="wallet-withdraw-modal">
      <n-form :model="withdrawForm" label-placement="top">
        <n-form-item label="提现金额">
          <n-input-number v-model:value="withdrawForm.amount" :min="1" :max="balance" :precision="2" style="width: 100%;" />
        </n-form-item>
        <n-form-item label="提现方式">
          <n-select v-model:value="withdrawForm.method" :options="withdrawMethods" />
        </n-form-item>
        <n-form-item label="到账备注">
          <n-input v-model:value="withdrawForm.accountNote" placeholder="例如：支付宝尾号 1234 / 银行卡尾号 5678" />
        </n-form-item>
        <n-alert type="info" :show-icon="false">
          这是课程系统中的模拟提现：提交后钱包余额立即扣减，并生成一条提现成功流水。
        </n-alert>
        <n-space justify="end" style="margin-top: 14px;">
          <n-button secondary @click="withdrawVisible = false">取消</n-button>
          <n-button type="primary" :loading="withdrawing" @click="submitWithdraw">确认提现</n-button>
        </n-space>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { ArrowDownToLine, ArrowUpRight, WalletCards } from '@lucide/vue';
import { request } from '../../shared/http.js';
import { formatMoney } from './tasks/taskFormat.js';

const message = useMessage();
const loading = ref(false);
const withdrawing = ref(false);
const withdrawVisible = ref(false);
const balance = ref(0);
const stats = ref({ income: 0, withdrawn: 0, transactionCount: 0 });
const transactions = ref([]);
const withdrawForm = reactive({ amount: 1, method: '支付宝', accountNote: '' });
const withdrawMethods = ['支付宝', '微信', '银行卡', '现金登记'].map((item) => ({ label: item, value: item }));

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await request('/api/wallet');
    balance.value = Number(data.balance || 0);
    stats.value = { ...stats.value, ...(data.stats || {}) };
    transactions.value = data.transactions || [];
    if (!withdrawForm.amount || withdrawForm.amount > balance.value) {
      withdrawForm.amount = balance.value > 0 ? Math.min(balance.value, 50) : 1;
    }
  } finally {
    loading.value = false;
  }
}

async function submitWithdraw() {
  withdrawing.value = true;
  try {
    const data = await request('/api/wallet/withdrawals', {
      method: 'POST',
      body: {
        amount: withdrawForm.amount,
        method: withdrawForm.method,
        accountNote: withdrawForm.accountNote
      }
    });
    balance.value = Number(data.wallet?.balance || 0);
    stats.value = { ...stats.value, ...(data.wallet?.stats || {}) };
    transactions.value = data.wallet?.transactions || [];
    withdrawVisible.value = false;
    withdrawForm.accountNote = '';
    message.success('提现已模拟完成');
  } catch (error) {
    message.error(error.message || '提现失败');
  } finally {
    withdrawing.value = false;
  }
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '-';
}
</script>
