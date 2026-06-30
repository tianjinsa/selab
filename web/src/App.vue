<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">校</div>
        <div>
          <strong>校园生活平台</strong>
          <span>Admin Console</span>
        </div>
      </div>
      <el-menu :default-active="active" class="nav" @select="active = $event">
        <el-menu-item index="overview"><el-icon><DataBoard /></el-icon><span>运营概览</span></el-menu-item>
        <el-menu-item index="tasks"><el-icon><Checked /></el-icon><span>任务互助</span></el-menu-item>
        <el-menu-item index="community"><el-icon><ChatLineRound /></el-icon><span>社区论坛</span></el-menu-item>
        <el-menu-item index="market"><el-icon><Goods /></el-icon><span>二手市场</span></el-menu-item>
        <el-menu-item index="users"><el-icon><User /></el-icon><span>用户信用</span></el-menu-item>
        <el-menu-item index="reports"><el-icon><Warning /></el-icon><span>举报审核</span></el-menu-item>
        <el-menu-item index="agent"><el-icon><Cpu /></el-icon><span>智能体</span></el-menu-item>
        <el-menu-item index="settings"><el-icon><Setting /></el-icon><span>系统参数</span></el-menu-item>
      </el-menu>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">统一管理后台</p>
          <h1>{{ pageTitle }}</h1>
        </div>
        <div class="top-actions">
          <el-tag type="success" effect="plain">API {{ apiState }}</el-tag>
          <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
          <el-button v-if="loggedIn" :icon="SwitchButton" @click="logout">退出</el-button>
        </div>
      </header>

      <section v-if="!loggedIn" class="login-panel">
        <el-form :model="loginForm" label-position="top" @submit.prevent>
          <el-form-item label="管理员账号">
            <el-input v-model="loginForm.account" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="loginForm.password" type="password" autocomplete="current-password" show-password />
          </el-form-item>
          <el-button type="primary" :loading="loading" @click="login">登录管理后台</el-button>
        </el-form>
      </section>

      <template v-else>
        <section v-if="active === 'overview'" class="panel">
          <div class="metric-grid">
            <article v-for="metric in metrics" :key="metric.label" class="metric">
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <small>{{ metric.hint }}</small>
            </article>
          </div>
          <el-table :data="overview.latestAudits || []" height="340">
            <el-table-column prop="type" label="类型" width="120" />
            <el-table-column prop="title" label="操作" />
            <el-table-column prop="actorId" label="操作者" width="160" />
            <el-table-column prop="createdAt" label="时间" width="220" />
          </el-table>
        </section>

        <section v-if="active === 'tasks'" class="panel">
          <el-table :data="tasks" height="640">
            <el-table-column prop="title" label="任务" min-width="220" />
            <el-table-column prop="type" label="类型" width="120" />
            <el-table-column prop="reward" label="酬金" width="90" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column prop="publisher.nickname" label="发布者" width="120" />
            <el-table-column label="操作" width="240">
              <template #default="{ row }">
                <el-button size="small" @click="updateTask(row, '报名中')">恢复</el-button>
                <el-button size="small" type="success" @click="updateTask(row, '已完成')">完成</el-button>
                <el-button size="small" type="danger" @click="updateTask(row, '已下架')">下架</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="active === 'community'" class="panel">
          <el-table :data="posts" height="640">
            <el-table-column prop="title" label="帖子" min-width="240" />
            <el-table-column prop="type" label="类型" width="120" />
            <el-table-column prop="author.nickname" label="作者" width="120" />
            <el-table-column label="互动" width="150">
              <template #default="{ row }">{{ row.likes.length }} 赞 / {{ row.commentCount }} 评</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button size="small" type="success" @click="updatePost(row, '已发布')">通过</el-button>
                <el-button size="small" type="danger" @click="updatePost(row, '已删除')">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="active === 'market'" class="panel">
          <el-table :data="goods" height="640">
            <el-table-column prop="name" label="商品" min-width="220" />
            <el-table-column prop="category" label="分类" width="110" />
            <el-table-column prop="price" label="价格" width="90" />
            <el-table-column prop="seller.nickname" label="卖家" width="120" />
            <el-table-column prop="auditStatus" label="审核" width="110" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="操作" width="210">
              <template #default="{ row }">
                <el-button size="small" type="success" @click="auditGoods(row, '通过')">通过</el-button>
                <el-button size="small" type="warning" @click="auditGoods(row, '驳回')">驳回</el-button>
                <el-button size="small" type="danger" @click="auditGoods(row, '下架')">下架</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="active === 'users'" class="panel">
          <el-table :data="users" height="640">
            <el-table-column prop="nickname" label="昵称" min-width="160" />
            <el-table-column prop="account" label="账号" width="140" />
            <el-table-column prop="studentNo" label="学号" width="140" />
            <el-table-column prop="role" label="角色" width="100" />
            <el-table-column label="信用" width="160">
              <template #default="{ row }">
                <el-slider v-model="row.creditScore" :min="0" :max="100" @change="updateUser(row)" />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="140">
              <template #default="{ row }">
                <el-switch v-model="row.muted" active-text="禁言" inactive-text="正常" @change="updateUser(row)" />
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="active === 'reports'" class="panel split">
          <el-table :data="reports" height="640">
            <el-table-column prop="targetType" label="对象" width="100" />
            <el-table-column prop="targetId" label="对象ID" width="160" />
            <el-table-column prop="reason" label="原因" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button size="small" type="success" @click="handleReport(row, '已处理')">处理</el-button>
                <el-button size="small" @click="handleReport(row, '无需处理')">忽略</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="active === 'agent'" class="panel agent-grid">
          <div class="agent-card">
            <h2>知识库</h2>
            <el-table :data="knowledge" height="460">
              <el-table-column prop="category" label="分类" width="120" />
              <el-table-column prop="title" label="标题" />
              <el-table-column prop="version" label="版本" width="80" />
            </el-table>
          </div>
          <div class="agent-card">
            <h2>提示词配置</h2>
            <el-table :data="prompts" height="460">
              <el-table-column prop="scene" label="场景" width="120" />
              <el-table-column prop="content" label="内容" />
              <el-table-column prop="active" label="启用" width="80" />
            </el-table>
          </div>
        </section>

        <section v-if="active === 'settings'" class="panel settings-grid">
          <el-form :model="settings" label-width="140px">
            <el-form-item label="邀请码注册">
              <el-switch v-model="settings.invitationRequired" />
            </el-form-item>
            <el-form-item label="任务酬金下限">
              <el-input-number v-model="settings.taskRewardRange[0]" :min="0" />
            </el-form-item>
            <el-form-item label="任务酬金上限">
              <el-input-number v-model="settings.taskRewardRange[1]" :min="1" />
            </el-form-item>
            <el-form-item label="任务超时小时">
              <el-input-number v-model="settings.taskTimeoutHours" :min="1" />
            </el-form-item>
            <el-form-item label="敏感词">
              <el-select v-model="settings.sensitiveWords" multiple filterable allow-create default-first-option>
                <el-option v-for="word in settings.sensitiveWords" :key="word" :label="word" :value="word" />
              </el-select>
            </el-form-item>
            <el-form-item label="任务分类">
              <div class="category-editor">
                <div v-for="(category, index) in settings.taskCategories" :key="`task-${index}`" class="category-row">
                  <el-input v-model="settings.taskCategories[index]" placeholder="任务分类名称" />
                  <el-button :disabled="index === 0" @click="moveTaskCategory(index, -1)">上移</el-button>
                  <el-button :disabled="index === settings.taskCategories.length - 1" @click="moveTaskCategory(index, 1)">下移</el-button>
                  <el-button type="danger" @click="removeTaskCategory(index)">删除</el-button>
                </div>
                <el-button type="primary" plain @click="addTaskCategory">新增任务分类</el-button>
              </div>
            </el-form-item>
            <el-form-item label="市场分类">
              <div class="category-editor">
                <div v-for="(category, index) in settings.goodsCategories" :key="`goods-${index}`" class="goods-category-box">
                  <div class="category-row">
                    <el-input v-model="category.name" placeholder="一级分类名称" />
                    <el-button :disabled="index === 0" @click="moveGoodsCategory(index, -1)">上移</el-button>
                    <el-button :disabled="index === settings.goodsCategories.length - 1" @click="moveGoodsCategory(index, 1)">下移</el-button>
                    <el-button type="danger" @click="removeGoodsCategory(index)">删除</el-button>
                  </div>
                  <div class="child-category-list">
                    <div v-for="(child, childIndex) in category.children" :key="`goods-${index}-${childIndex}`" class="category-row child-row">
                      <el-input v-model="category.children[childIndex]" placeholder="子分类名称" />
                      <el-button type="danger" plain @click="removeGoodsChild(index, childIndex)">删除子类</el-button>
                    </div>
                    <el-button size="small" plain @click="addGoodsChild(index)">新增子分类</el-button>
                  </div>
                </div>
                <el-button type="primary" plain @click="addGoodsCategory">新增一级分类</el-button>
              </div>
            </el-form-item>
            <el-button type="primary" @click="saveSettings">保存参数</el-button>
          </el-form>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, SwitchButton } from '@element-plus/icons-vue';
import { api, getToken, setToken } from './api';

const active = ref('overview');
const loading = ref(false);
const loggedIn = ref(Boolean(getToken()));
const apiState = ref('checking');
const overview = ref({});
const tasks = ref([]);
const posts = ref([]);
const goods = ref([]);
const users = ref([]);
const reports = ref([]);
const knowledge = ref([]);
const prompts = ref([]);
const settings = reactive({
  taskCategories: ['跑腿代办', '学业互助', '技能服务', '其他互助'],
  goodsCategories: [
    { name: '数码', children: ['手机平板', '电脑配件', '影音设备'] },
    { name: '书籍', children: ['教材教辅', '考试资料', '课外读物'] }
  ],
  taskRewardRange: [1, 300],
  sensitiveWords: [],
  invitationRequired: true,
  taskTimeoutHours: 48
});
const loginForm = reactive({ account: 'admin', password: '123456Aa' });

const pageTitle = computed(() => {
  const map = {
    overview: '运营概览',
    tasks: '任务互助管理',
    community: '社区内容管理',
    market: '二手市场管理',
    users: '用户与信用管理',
    reports: '举报与审核',
    agent: '智能体知识库',
    settings: '系统参数配置'
  };
  return map[active.value];
});

const metrics = computed(() => [
  { label: '注册用户', value: overview.value.users || 0, hint: '统一用户体系' },
  { label: '活跃任务', value: overview.value.activeTasks || 0, hint: '报名/进行/待验收' },
  { label: '社区帖子', value: overview.value.posts || 0, hint: '含审核内容' },
  { label: '在库商品', value: overview.value.goods || 0, hint: '审核与在售商品' },
  { label: '待审举报', value: overview.value.unreadReports || 0, hint: '人工处理队列' },
  { label: '智能问答', value: overview.value.questionCount || 0, hint: '累计用户提问' }
]);

function normalizeGoodsCategory(item) {
  if (typeof item === 'string') return { name: item, children: [] };
  return {
    name: item?.name || '',
    children: Array.isArray(item?.children) ? item.children : []
  };
}

function normalizeSettings(data = {}) {
  Object.assign(settings, data);
  if (!Array.isArray(settings.taskCategories)) settings.taskCategories = [];
  if (!settings.taskCategories.length) settings.taskCategories = ['跑腿代办', '学业互助', '技能服务', '其他互助'];
  if (!Array.isArray(settings.goodsCategories)) settings.goodsCategories = [];
  settings.goodsCategories = settings.goodsCategories.map(normalizeGoodsCategory);
  if (!settings.goodsCategories.length) settings.goodsCategories = [{ name: '数码', children: [] }];
  if (!Array.isArray(settings.sensitiveWords)) settings.sensitiveWords = [];
  if (!Array.isArray(settings.taskRewardRange)) settings.taskRewardRange = [1, 300];
}

function moveItem(list, index, offset) {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(nextIndex, 0, item);
}

function addTaskCategory() {
  settings.taskCategories.push('新任务分类');
}

function removeTaskCategory(index) {
  settings.taskCategories.splice(index, 1);
}

function moveTaskCategory(index, offset) {
  moveItem(settings.taskCategories, index, offset);
}

function addGoodsCategory() {
  settings.goodsCategories.push({ name: '新一级分类', children: [] });
}

function removeGoodsCategory(index) {
  settings.goodsCategories.splice(index, 1);
}

function moveGoodsCategory(index, offset) {
  moveItem(settings.goodsCategories, index, offset);
}

function addGoodsChild(index) {
  settings.goodsCategories[index].children.push('新子分类');
}

function removeGoodsChild(index, childIndex) {
  settings.goodsCategories[index].children.splice(childIndex, 1);
}

function settingsPayload() {
  return {
    ...settings,
    taskCategories: settings.taskCategories.map((item) => String(item || '').trim()).filter(Boolean),
    goodsCategories: settings.goodsCategories
      .map((item) => ({
        name: String(item.name || '').trim(),
        children: (item.children || []).map((child) => String(child || '').trim()).filter(Boolean)
      }))
      .filter((item) => item.name)
  };
}

async function login() {
  loading.value = true;
  try {
    const data = await api('/auth/login', { method: 'POST', body: loginForm });
    setToken(data.token);
    loggedIn.value = true;
    await loadAll();
    ElMessage.success('登录成功');
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function logout() {
  setToken('');
  loggedIn.value = false;
}

async function loadAll() {
  try {
    await api('/health');
    apiState.value = 'online';
  } catch (error) {
    apiState.value = 'offline';
    if (!loggedIn.value) return;
  }
  if (!loggedIn.value) return;
  const [overviewData, taskData, postData, goodsData, userData, reportData, knowledgeData, promptData, settingsData] =
    await Promise.all([
      api('/admin/overview'),
      api('/admin/tasks'),
      api('/admin/posts'),
      api('/admin/goods'),
      api('/admin/users'),
      api('/admin/reports'),
      api('/agent/knowledge'),
      api('/agent/prompts'),
      api('/admin/settings')
    ]);
  overview.value = overviewData;
  tasks.value = taskData;
  posts.value = postData;
  goods.value = goodsData;
  users.value = userData;
  reports.value = reportData;
  knowledge.value = knowledgeData;
  prompts.value = promptData;
  normalizeSettings(settingsData);
}

async function updateTask(row, status) {
  await api(`/admin/tasks/${row.id}`, { method: 'PUT', body: { status } });
  ElMessage.success('任务状态已更新');
  await loadAll();
}

async function updatePost(row, status) {
  await api(`/admin/posts/${row.id}`, { method: 'PUT', body: { status } });
  ElMessage.success('帖子状态已更新');
  await loadAll();
}

async function auditGoods(row, auditStatus) {
  await api(`/admin/goods/${row.id}/audit`, { method: 'PUT', body: { auditStatus } });
  ElMessage.success('商品审核已处理');
  await loadAll();
}

async function updateUser(row) {
  await api(`/admin/users/${row.id}`, {
    method: 'PUT',
    body: { muted: row.muted, creditScore: row.creditScore, creditLevel: row.creditScore >= 90 ? 'A' : 'B' }
  });
  ElMessage.success('用户状态已更新');
}

async function handleReport(row, status) {
  await api(`/admin/reports/${row.id}`, { method: 'PUT', body: { status, result: status } });
  ElMessage.success('举报已处理');
  await loadAll();
}

async function saveSettings() {
  await api('/admin/settings', { method: 'PUT', body: settingsPayload() });
  ElMessage.success('系统参数已保存');
  await loadAll();
}

onMounted(loadAll);
</script>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: 248px 1fr;
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 22px 14px;
  border-right: 1px solid #d9e1eb;
  background: #111827;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 24px;
}

.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 8px;
  background: #39c5bb;
  color: #08111f;
  font-weight: 800;
}

.brand strong,
.brand span {
  display: block;
}

.brand span {
  margin-top: 4px;
  color: #9ca3af;
  font-size: 12px;
}

.nav {
  border: 0;
  background: transparent;
}

.nav :deep(.el-menu-item) {
  height: 44px;
  margin: 4px 0;
  border-radius: 8px;
  color: #cbd5e1;
}

.nav :deep(.el-menu-item.is-active) {
  background: #233145;
  color: #ffffff;
}

.workspace {
  padding: 28px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.eyebrow {
  margin: 0 0 6px;
  color: #64748b;
  font-size: 13px;
}

h1,
h2 {
  margin: 0;
  letter-spacing: 0;
}

h1 {
  font-size: 28px;
}

h2 {
  margin-bottom: 14px;
  font-size: 18px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.login-panel,
.panel {
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
}

.login-panel {
  width: 420px;
  padding: 28px;
}

.panel {
  padding: 18px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.metric {
  min-height: 104px;
  padding: 16px;
  border: 1px solid #e1e8f2;
  border-radius: 8px;
  background: #f8fafc;
}

.metric span,
.metric small {
  display: block;
  color: #64748b;
}

.metric strong {
  display: block;
  margin: 10px 0 4px;
  font-size: 30px;
}

.agent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.agent-card {
  min-width: 0;
}

.settings-grid {
  max-width: 760px;
}

.category-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.category-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
}

.goods-category-box {
  padding: 12px;
  border: 1px solid #e1e8f2;
  border-radius: 8px;
  background: #f8fafc;
}

.child-category-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding-left: 24px;
}

.child-row {
  grid-template-columns: minmax(0, 1fr) auto;
}
</style>
