<template>
  <div class="grid">
    <section class="surface panel">
      <div class="panel-heading">
        <h2>模型接口配置</h2>
      </div>
      <n-form :model="configForm" label-placement="top">
        <n-grid :cols="3" :x-gap="12" responsive="screen">
          <n-form-item-gi label="API Base URL"><n-input v-model:value="configForm.baseUrl" placeholder="https://api.openai.com/v1" /></n-form-item-gi>
          <n-form-item-gi label="API Key"><n-input v-model:value="configForm.apiKey" type="password" show-password-on="click" placeholder="留空表示不修改" /></n-form-item-gi>
          <n-form-item-gi label="Model"><n-input v-model:value="configForm.model" placeholder="gpt-4.1-mini 或兼容模型名" /></n-form-item-gi>
        </n-grid>
        <n-grid :cols="4" :x-gap="12" responsive="screen">
          <n-form-item-gi label="Include Reasoning">
            <n-switch v-model:value="configForm.includeReasoning" />
          </n-form-item-gi>
          <n-form-item-gi label="Enable Thinking">
            <n-switch v-model:value="configForm.enableThinking" />
          </n-form-item-gi>
          <n-form-item-gi label="Thinking Type">
            <n-select v-model:value="configForm.thinkingType" :options="thinkingTypeOptions" clearable placeholder="不发送" />
          </n-form-item-gi>
          <n-form-item-gi label="Reasoning Effort">
            <n-select v-model:value="configForm.reasoningEffort" :options="reasoningEffortOptions" clearable placeholder="不发送" />
          </n-form-item-gi>
        </n-grid>
        <n-button type="primary" @click="saveConfig">保存配置</n-button>
      </n-form>
      <n-alert class="panel-content-offset" type="info" :show-icon="false">
        当前状态：Base URL {{ adminData?.config?.baseUrl || '未配置' }}，Model {{ adminData?.config?.model || '未配置' }}，API Key {{ adminData?.config?.hasApiKey ? '已保存' : '未保存' }}，思考 {{ adminData?.config?.enableThinking || adminData?.config?.includeReasoning ? '已开启' : '未开启' }}。
      </n-alert>
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>知识库</h2>
          <p class="muted">使用 SQL LIKE 风格模糊匹配，不使用向量检索。</p>
        </div>
        <n-button secondary @click="showKnowledgeForm = !showKnowledgeForm">新增条目</n-button>
      </div>
      <div v-if="showKnowledgeForm" class="inline-form-panel">
        <n-form :model="knowledgeForm" label-placement="top">
          <n-form-item label="标题"><n-input v-model:value="knowledgeForm.title" /></n-form-item>
          <n-form-item label="分类"><n-input v-model:value="knowledgeForm.category" /></n-form-item>
          <n-form-item label="来源"><n-input v-model:value="knowledgeForm.source" /></n-form-item>
          <n-form-item label="内容"><n-input v-model:value="knowledgeForm.content" type="textarea" /></n-form-item>
          <n-button type="primary" @click="addKnowledge">保存条目</n-button>
        </n-form>
      </div>
      <n-list class="panel-content-offset">
        <n-list-item v-for="item in adminData?.knowledgeEntries || []" :key="item.id">
          <strong>{{ item.title }}</strong>
          <p class="muted compact-meta">{{ item.category }} · {{ item.source }}</p>
        </n-list-item>
      </n-list>
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <h2>咨询分类统计</h2>
      </div>
      <div class="grid grid-3">
        <div v-for="item in adminData?.stats || []" :key="item.category" class="metric-card">
          <div class="metric-label">{{ item.category }}</div>
          <div class="metric-value">{{ item.count }}</div>
        </div>
      </div>
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <h2>风险报警记录</h2>
      </div>
      <n-data-table :columns="riskColumns" :data="adminData?.risks || []" :pagination="{ pageSize: 6 }" />
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <h2>工具调用日志</h2>
      </div>
      <n-data-table :columns="toolColumns" :data="adminData?.toolCalls || []" :pagination="{ pageSize: 6 }" />
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const message = useMessage();
const adminData = ref(null);
const showKnowledgeForm = ref(false);
const configForm = reactive({
  baseUrl: '',
  apiKey: '',
  model: '',
  includeReasoning: false,
  enableThinking: false,
  thinkingType: '',
  reasoningEffort: ''
});
const knowledgeForm = reactive({ title: '', category: '校园办事流程', source: '管理员维护', content: '' });

const thinkingTypeOptions = [
  { label: 'enabled', value: 'enabled' },
  { label: 'auto', value: 'auto' },
  { label: 'disabled', value: 'disabled' }
];

const reasoningEffortOptions = [
  { label: 'low', value: 'low' },
  { label: 'medium', value: 'medium' },
  { label: 'high', value: 'high' },
  { label: 'max', value: 'max' }
];

const riskColumns = [
  { title: '用户', key: 'username' },
  { title: '学号', key: 'studentId' },
  { title: '等级', key: 'level' },
  { title: '原因', key: 'reason' },
  { title: '时间', key: 'createdAt', render: (row) => new Date(row.createdAt).toLocaleString() }
];

const toolColumns = [
  { title: '工具', key: 'toolName' },
  { title: '时间', key: 'createdAt', render: (row) => new Date(row.createdAt).toLocaleString() }
];

onMounted(load);

async function load() {
  adminData.value = await request('/api/ai/admin', {}, 'admin');
  configForm.baseUrl = adminData.value.config.baseUrl;
  configForm.model = adminData.value.config.model;
  configForm.apiKey = '';
  configForm.includeReasoning = adminData.value.config.includeReasoning;
  configForm.enableThinking = adminData.value.config.enableThinking;
  configForm.thinkingType = adminData.value.config.thinkingType;
  configForm.reasoningEffort = adminData.value.config.reasoningEffort;
}

async function saveConfig() {
  await request('/api/ai/admin/config', { method: 'PATCH', body: configForm }, 'admin');
  message.success('AI 配置已保存');
  await load();
}

async function addKnowledge() {
  await request('/api/ai/admin/knowledge', { method: 'POST', body: knowledgeForm }, 'admin');
  Object.assign(knowledgeForm, { title: '', category: '校园办事流程', source: '管理员维护', content: '' });
  showKnowledgeForm.value = false;
  message.success('知识库条目已新增');
  await load();
}
</script>
