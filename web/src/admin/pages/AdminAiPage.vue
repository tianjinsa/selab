<template>
  <div class="grid">
    <section class="surface panel">
      <div class="panel-heading">
        <h2>模型接口配置</h2>
      </div>
      <n-form :model="configForm" label-placement="top">
        <n-grid :cols="4" :x-gap="12" responsive="screen">
          <n-form-item-gi label="API Base URL"><n-input v-model:value="configForm.baseUrl" placeholder="https://api.openai.com/v1" /></n-form-item-gi>
          <n-form-item-gi label="API Key"><n-input v-model:value="configForm.apiKey" type="password" show-password-on="click" placeholder="留空表示不修改" /></n-form-item-gi>
          <n-form-item-gi label="Model"><n-input v-model:value="configForm.model" placeholder="gpt-4.1-mini 或兼容模型名" /></n-form-item-gi>
          <n-form-item-gi label="Embedding Model"><n-input v-model:value="configForm.embeddingModel" placeholder="text-embedding-3-small" /></n-form-item-gi>
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
        当前状态：Base URL {{ adminData?.config?.baseUrl || '未配置' }}，Model {{ adminData?.config?.model || '未配置' }}，Embedding {{ adminData?.config?.embeddingModel || 'text-embedding-3-small' }}，API Key {{ adminData?.config?.hasApiKey ? '已保存' : '未保存' }}，思考 {{ adminData?.config?.enableThinking || adminData?.config?.includeReasoning ? '已开启' : '未开启' }}。
      </n-alert>
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>知识库</h2>
          <p class="muted">知识库条目可按知识库分组维护，智能体工具会查询真实后台数据。</p>
        </div>
        <n-space>
          <n-button secondary @click="openBaseForm()">新增知识库</n-button>
          <n-button secondary @click="openKnowledgeForm()">新增条目</n-button>
        </n-space>
      </div>

      <div v-if="showBaseForm" class="inline-form-panel">
        <n-form :model="baseForm" label-placement="top">
          <n-grid :cols="3" :x-gap="12" responsive="screen">
            <n-form-item-gi label="知识库名称"><n-input v-model:value="baseForm.name" /></n-form-item-gi>
            <n-form-item-gi label="描述"><n-input v-model:value="baseForm.description" /></n-form-item-gi>
            <n-form-item-gi label="启用"><n-switch v-model:value="baseForm.enabled" /></n-form-item-gi>
          </n-grid>
          <n-space>
            <n-button type="primary" @click="saveBase">{{ editingBaseId ? '保存知识库' : '创建知识库' }}</n-button>
            <n-button secondary @click="closeBaseForm">取消</n-button>
          </n-space>
        </n-form>
      </div>

      <div v-if="showKnowledgeForm" class="inline-form-panel">
        <n-form :model="knowledgeForm" label-placement="top">
          <n-grid :cols="2" :x-gap="12" responsive="screen">
            <n-form-item-gi label="所属知识库"><n-select v-model:value="knowledgeForm.knowledgeBaseId" :options="knowledgeBaseOptions" /></n-form-item-gi>
            <n-form-item-gi label="标题"><n-input v-model:value="knowledgeForm.title" /></n-form-item-gi>
            <n-form-item-gi label="分类"><n-input v-model:value="knowledgeForm.category" /></n-form-item-gi>
            <n-form-item-gi label="来源"><n-input v-model:value="knowledgeForm.source" /></n-form-item-gi>
          </n-grid>
          <n-form-item label="内容"><n-input v-model:value="knowledgeForm.content" type="textarea" /></n-form-item>
          <n-space>
            <n-button type="primary" @click="saveKnowledge">{{ editingKnowledgeId ? '保存修改' : '保存条目' }}</n-button>
            <n-button secondary @click="closeKnowledgeForm">取消</n-button>
          </n-space>
        </n-form>
      </div>

      <n-tabs v-model:value="activeKnowledgeBaseId" type="segment" animated class="panel-content-offset">
        <n-tab-pane v-for="base in adminData?.knowledgeBases || []" :key="base.id" :name="base.id" :tab="base.name" />
      </n-tabs>

      <div class="knowledge-base-toolbar">
        <p class="muted">{{ activeKnowledgeBase?.description || '暂无描述' }}</p>
        <n-space v-if="activeKnowledgeBase && !activeKnowledgeBase.legacy">
          <n-button size="small" secondary @click="openBaseForm(activeKnowledgeBase)">编辑知识库</n-button>
          <n-button size="small" secondary type="error" @click="deleteBase(activeKnowledgeBase)">删除知识库</n-button>
        </n-space>
      </div>

      <n-list class="panel-content-offset">
        <n-list-item v-for="item in filteredKnowledgeEntries" :key="item.id">
          <n-space justify="space-between" align="start">
            <div>
              <strong>{{ item.title }}</strong>
              <p class="muted compact-meta">{{ item.category }} · {{ item.source }} · {{ item.knowledgeBase?.name }}</p>
              <p>{{ shortText(item.content) }}</p>
            </div>
            <n-space>
              <n-button size="small" secondary @click="openKnowledgeForm(item)">编辑</n-button>
              <n-button size="small" secondary type="error" @click="deleteKnowledge(item)">删除</n-button>
            </n-space>
          </n-space>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const message = useMessage();
const dialog = useDialog();
const adminData = ref(null);
const showKnowledgeForm = ref(false);
const showBaseForm = ref(false);
const activeKnowledgeBaseId = ref('default');
const editingKnowledgeId = ref('');
const editingBaseId = ref('');
const configForm = reactive({
  baseUrl: '',
  apiKey: '',
  model: '',
  embeddingModel: 'text-embedding-3-small',
  includeReasoning: false,
  enableThinking: false,
  thinkingType: '',
  reasoningEffort: ''
});
const knowledgeForm = reactive({ title: '', category: '校园办事流程', source: '管理员维护', content: '' });
const baseForm = reactive({ name: '', description: '', enabled: true });

const knowledgeBaseOptions = computed(() => (adminData.value?.knowledgeBases || []).map((item) => ({
  label: item.name,
  value: item.id
})));
const activeKnowledgeBase = computed(() => (adminData.value?.knowledgeBases || []).find((item) => item.id === activeKnowledgeBaseId.value));
const filteredKnowledgeEntries = computed(() => (adminData.value?.knowledgeEntries || [])
  .filter((item) => (item.knowledgeBase?.id || item.knowledgeBaseId || 'default') === activeKnowledgeBaseId.value));

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
  if (!adminData.value.knowledgeBases?.some((item) => item.id === activeKnowledgeBaseId.value)) {
    activeKnowledgeBaseId.value = adminData.value.knowledgeBases?.[0]?.id || 'default';
  }
  configForm.baseUrl = adminData.value.config.baseUrl;
  configForm.model = adminData.value.config.model;
  configForm.embeddingModel = adminData.value.config.embeddingModel || 'text-embedding-3-small';
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

function openKnowledgeForm(item = null) {
  editingKnowledgeId.value = item?.id || '';
  Object.assign(knowledgeForm, item ? {
    title: item.title || '',
    knowledgeBaseId: item.knowledgeBase?.id || item.knowledgeBaseId || activeKnowledgeBaseId.value,
    category: item.category || '',
    source: item.source || '管理员维护',
    content: item.content || ''
  } : {
    title: '',
    knowledgeBaseId: activeKnowledgeBaseId.value,
    category: activeKnowledgeBase.value?.name || '校园办事流程',
    source: '管理员维护',
    content: ''
  });
  showKnowledgeForm.value = true;
}

function closeKnowledgeForm() {
  editingKnowledgeId.value = '';
  showKnowledgeForm.value = false;
}

async function saveKnowledge() {
  const wasEditing = Boolean(editingKnowledgeId.value);
  const path = editingKnowledgeId.value
    ? `/api/ai/admin/knowledge/${editingKnowledgeId.value}`
    : '/api/ai/admin/knowledge';
  await request(path, {
    method: editingKnowledgeId.value ? 'PATCH' : 'POST',
    body: knowledgeForm
  }, 'admin');
  closeKnowledgeForm();
  message.success(wasEditing ? '知识库条目已更新' : '知识库条目已新增');
  await load();
}

function deleteKnowledge(item) {
  dialog.warning({
    title: '删除知识库条目',
    content: `确认删除「${item.title}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/ai/admin/knowledge/${item.id}`, { method: 'DELETE' }, 'admin');
      message.success('条目已删除');
      await load();
    }
  });
}

function openBaseForm(base = null) {
  editingBaseId.value = base?.id || '';
  Object.assign(baseForm, base ? {
    name: base.name || '',
    description: base.description || '',
    enabled: base.enabled !== false
  } : { name: '', description: '', enabled: true });
  showBaseForm.value = true;
}

function closeBaseForm() {
  editingBaseId.value = '';
  showBaseForm.value = false;
}

async function saveBase() {
  const wasEditing = Boolean(editingBaseId.value);
  const path = editingBaseId.value
    ? `/api/ai/admin/knowledge-bases/${editingBaseId.value}`
    : '/api/ai/admin/knowledge-bases';
  const data = await request(path, {
    method: editingBaseId.value ? 'PATCH' : 'POST',
    body: baseForm
  }, 'admin');
  activeKnowledgeBaseId.value = data.base?.id || activeKnowledgeBaseId.value;
  closeBaseForm();
  message.success(wasEditing ? '知识库已更新' : '知识库已创建');
  await load();
}

function deleteBase(base) {
  dialog.warning({
    title: '删除知识库',
    content: `确认删除「${base.name}」？请先确保该知识库下没有条目。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/ai/admin/knowledge-bases/${base.id}`, { method: 'DELETE' }, 'admin');
      message.success('知识库已删除');
      await load();
    }
  });
}

function shortText(value = '') {
  const text = String(value || '');
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}
</script>
