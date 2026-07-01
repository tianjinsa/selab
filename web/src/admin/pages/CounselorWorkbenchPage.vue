<template>
  <div class="grid">
    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>导员负责范围</h2>
          <p class="muted">{{ counselor?.college?.name || '未绑定学院' }}，学院范围 {{ counselor?.college?.startCode || '-' }}-{{ counselor?.college?.endCode || '-' }}</p>
        </div>
        <n-button type="primary" @click="saveRanges">保存范围</n-button>
      </div>
      <div class="range-list-editor">
        <div v-for="(range, index) in rangeForm" :key="index" class="range-row">
          <n-input v-model:value="range.startCode" maxlength="3" placeholder="起始段" />
          <span>-</span>
          <n-input v-model:value="range.endCode" maxlength="3" placeholder="结束段" />
          <n-button quaternary type="error" @click="removeRange(index)">删除</n-button>
        </div>
        <n-button secondary @click="addRange">添加负责范围</n-button>
      </div>
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>学生风险警告</h2>
          <p class="muted">只显示负责学号范围内学生在任务、帖子、商品、智能体对话中触发的问题。</p>
        </div>
        <n-space>
          <n-button secondary @click="load">刷新</n-button>
        </n-space>
      </div>
      <n-data-table :columns="alertColumns" :data="alerts" :pagination="{ pageSize: 8 }" />
    </section>

    <n-modal v-model:show="detailVisible" preset="card" title="学生风险详情" class="counselor-alert-modal">
      <n-spin :show="detailLoading">
        <n-descriptions bordered size="small" :column="2">
          <n-descriptions-item label="学生">{{ activeDetail?.alert?.studentName || '-' }}</n-descriptions-item>
          <n-descriptions-item label="学号">{{ activeDetail?.alert?.studentId || '-' }}</n-descriptions-item>
          <n-descriptions-item label="类型">{{ sourceText(activeDetail?.alert) }}</n-descriptions-item>
          <n-descriptions-item label="风险">{{ activeDetail?.alert?.riskLevel || '-' }}</n-descriptions-item>
          <n-descriptions-item label="原因" :span="2">{{ activeDetail?.alert?.reason || '-' }}</n-descriptions-item>
        </n-descriptions>

        <template v-if="activeDetail?.alert?.sourceType === 'ai_risk'">
          <div class="risk-conversation-grid">
            <div class="risk-conversation-panel">
              <div class="risk-panel-heading">
                <h3>报警时会话快照</h3>
                <span class="muted">{{ formatTime(activeDetail?.alert?.snapshot?.capturedAt) }}</span>
              </div>
              <div class="risk-message-list">
                <article
                  v-for="messageItem in activeDetail?.alert?.snapshot?.messages || []"
                  :key="`snapshot-${messageItem.id}`"
                  :class="['risk-message', messageItem.role, { active: messageItem.id === activeDetail?.alert?.snapshot?.alertMessageId }]"
                >
                  <div class="risk-message-meta">
                    <strong>{{ roleText(messageItem.role) }}</strong>
                    <span>{{ formatTime(messageItem.createdAt) }}</span>
                  </div>
                  <p v-if="messageItem.reasoningContent" class="risk-reasoning">{{ messageItem.reasoningContent }}</p>
                  <pre>{{ messageItem.content || '（空消息）' }}</pre>
                </article>
                <n-empty v-if="!activeDetail?.alert?.snapshot?.messages?.length" description="没有可用会话快照" />
              </div>
            </div>

            <div class="risk-conversation-panel">
              <div class="risk-panel-heading">
                <h3>当前会话内容</h3>
                <span class="muted">{{ formatTime(activeDetail?.current?.conversation?.capturedAt) }}</span>
              </div>
              <div class="risk-message-list">
                <article
                  v-for="messageItem in activeDetail?.current?.conversation?.messages || []"
                  :key="`current-${messageItem.id}`"
                  :class="['risk-message', messageItem.role, { active: messageItem.id === activeDetail?.current?.conversation?.alertMessageId }]"
                >
                  <div class="risk-message-meta">
                    <strong>{{ roleText(messageItem.role) }}</strong>
                    <span>{{ formatTime(messageItem.createdAt) }}</span>
                    <span v-if="messageItem.editedAt">已修改 {{ formatTime(messageItem.editedAt) }}</span>
                  </div>
                  <p v-if="messageItem.reasoningContent" class="risk-reasoning">{{ messageItem.reasoningContent }}</p>
                  <pre>{{ messageItem.content || '（空消息）' }}</pre>
                </article>
                <n-empty v-if="!activeDetail?.current?.conversation?.messages?.length" description="当前会话不可用" />
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="snapshot-block panel-content-offset">
            <h3>审核快照</h3>
            <pre>{{ activeDetail?.alert?.snapshot?.text || '-' }}</pre>
          </div>
          <div class="snapshot-block">
            <h3>原始数据</h3>
            <pre>{{ rawSnapshot }}</pre>
          </div>
        </template>
      </n-spin>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, h, onMounted, ref } from 'vue';
import { NButton, NTag, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const message = useMessage();
const counselor = ref(null);
const alerts = ref([]);
const rangeForm = ref([]);
const detailVisible = ref(false);
const detailLoading = ref(false);
const activeDetail = ref(null);

const rawSnapshot = computed(() => JSON.stringify(activeDetail.value?.alert?.snapshot?.raw || {}, null, 2));

const alertColumns = [
  { title: '状态', key: 'readAt', width: 80, render: (row) => h(NTag, { type: row.readAt ? 'default' : 'error', bordered: false }, { default: () => (row.readAt ? '已读' : '未读') }) },
  { title: '学生', key: 'studentName' },
  { title: '学号', key: 'studentId' },
  { title: '来源', key: 'sourceType', render: (row) => sourceText(row) },
  { title: '标题', key: 'title' },
  { title: '风险', key: 'riskLevel' },
  { title: '时间', key: 'createdAt', render: (row) => formatTime(row.createdAt) },
  { title: '操作', key: 'actions', render: (row) => h(NButton, { size: 'small', secondary: true, onClick: () => openDetail(row) }, { default: () => '查看内容' }) }
];

onMounted(load);

async function load() {
  const [me, data] = await Promise.all([
    request('/api/counselor/me', {}, 'admin'),
    request('/api/counselor/alerts', {}, 'admin')
  ]);
  counselor.value = me.counselor;
  rangeForm.value = cloneRanges(me.counselor?.ranges || []);
  alerts.value = data.alerts || [];
}

async function saveRanges() {
  const data = await request('/api/counselor/ranges', { method: 'PATCH', body: { ranges: rangeForm.value } }, 'admin');
  counselor.value = data.counselor;
  rangeForm.value = cloneRanges(data.counselor?.ranges || []);
  message.success('负责范围已保存');
}

function addRange() {
  rangeForm.value.push({
    startCode: counselor.value?.college?.startCode || '',
    endCode: counselor.value?.college?.endCode || ''
  });
}

function removeRange(index) {
  rangeForm.value.splice(index, 1);
}

async function openDetail(row) {
  detailVisible.value = true;
  detailLoading.value = true;
  activeDetail.value = null;
  try {
    activeDetail.value = await request(`/api/counselor/alerts/${row.id}`, {}, 'admin');
    await load();
  } catch (error) {
    message.error(error.message || '加载详情失败');
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function cloneRanges(ranges = []) {
  return (Array.isArray(ranges) ? ranges : []).map((item) => ({ startCode: item.startCode || '', endCode: item.endCode || '' }));
}

function sourceText(row = {}) {
  if (row.sourceType === 'ai_risk') return '智能体对话';
  if (row.entityType === 'post') return '社区帖子';
  if (row.entityType === 'task') return '任务互助';
  if (row.entityType === 'product') return '二手商品';
  return '系统';
}

function roleText(role = '') {
  if (role === 'user') return '学生';
  if (role === 'assistant') return '智能体';
  return role || '消息';
}

function formatTime(value = '') {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}
</script>
