<template>
  <div class="grid">
    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>学院学号段</h2>
          <p class="muted">按学号第 5-7 位划分学院，例如 202431204099 对应学院段 312。</p>
        </div>
        <n-button secondary @click="openCollegeForm()">新增学院</n-button>
      </div>
      <div v-if="showCollegeForm" class="inline-form-panel">
        <n-form :model="collegeForm" label-placement="top">
          <n-grid :cols="4" :x-gap="12" responsive="screen">
            <n-form-item-gi label="学院名称"><n-input v-model:value="collegeForm.name" /></n-form-item-gi>
            <n-form-item-gi label="起始段" :validation-status="collegeCodeStatus(collegeForm.startCode)" :feedback="collegeCodeFeedback(collegeForm.startCode, '例如 312')">
              <n-input v-model:value="collegeForm.startCode" maxlength="3" placeholder="例如 312" />
            </n-form-item-gi>
            <n-form-item-gi label="结束段" :validation-status="collegeCodeStatus(collegeForm.endCode)" :feedback="collegeCodeFeedback(collegeForm.endCode, '例如 500')">
              <n-input v-model:value="collegeForm.endCode" maxlength="3" placeholder="例如 500" />
            </n-form-item-gi>
            <n-form-item-gi label="说明"><n-input v-model:value="collegeForm.description" /></n-form-item-gi>
          </n-grid>
          <n-space>
            <n-button type="primary" @click="saveCollege">{{ editingCollegeId ? '保存学院' : '创建学院' }}</n-button>
            <n-button secondary @click="closeCollegeForm">取消</n-button>
          </n-space>
        </n-form>
      </div>
      <n-data-table :columns="collegeColumns" :data="colleges" :pagination="{ pageSize: 6 }" />
    </section>

    <section class="surface panel">
      <div class="panel-heading">
        <div>
          <h2>学院导员账号</h2>
          <p class="muted">导员使用同一个后台登录入口，登录后只进入导员端。</p>
        </div>
        <n-button secondary @click="openCounselorForm()">新增导员</n-button>
      </div>
      <div v-if="showCounselorForm" class="inline-form-panel">
        <n-form :model="counselorForm" label-placement="top">
          <n-grid :cols="4" :x-gap="12" responsive="screen">
            <n-form-item-gi label="账号"><n-input v-model:value="counselorForm.username" :disabled="Boolean(editingCounselorId)" /></n-form-item-gi>
            <n-form-item-gi label="姓名"><n-input v-model:value="counselorForm.name" /></n-form-item-gi>
            <n-form-item-gi label="所属学院"><n-select v-model:value="counselorForm.collegeId" :options="collegeOptions" @update:value="resetCounselorRangesForCollege" /></n-form-item-gi>
            <n-form-item-gi label="启用"><n-switch v-model:value="counselorForm.enabled" /></n-form-item-gi>
          </n-grid>
          <n-form-item label="密码">
            <n-input v-model:value="counselorForm.password" type="password" show-password-on="click" :placeholder="editingCounselorId ? '留空表示不修改' : '初始密码'" />
          </n-form-item>
          <n-form-item label="负责学号后 8 位范围">
            <div class="range-list-editor">
              <div v-for="(range, index) in counselorForm.ranges" :key="index" class="range-row">
                <n-input v-model:value="range.startCode" maxlength="8" placeholder="例如 31204000" />
                <span>-</span>
                <n-input v-model:value="range.endCode" maxlength="8" placeholder="例如 31204999" />
                <n-button quaternary type="error" @click="removeCounselorRange(index)">删除</n-button>
                <small v-if="rangeError(range)" class="range-error-text">{{ rangeError(range) }}</small>
              </div>
              <n-button secondary @click="addCounselorRange">添加范围</n-button>
            </div>
          </n-form-item>
          <n-space>
            <n-button type="primary" @click="saveCounselor">{{ editingCounselorId ? '保存导员' : '创建导员' }}</n-button>
            <n-button secondary @click="closeCounselorForm">取消</n-button>
          </n-space>
        </n-form>
      </div>
      <n-data-table :columns="counselorColumns" :data="counselors" :pagination="{ pageSize: 8 }" />
    </section>
  </div>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue';
import { NButton, NSpace, NSwitch, useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const message = useMessage();
const dialog = useDialog();
const colleges = ref([]);
const counselors = ref([]);
const showCollegeForm = ref(false);
const showCounselorForm = ref(false);
const editingCollegeId = ref('');
const editingCounselorId = ref('');
const collegeForm = reactive({ name: '', startCode: '', endCode: '', description: '' });
const counselorForm = reactive({ username: '', name: '', password: '', collegeId: '', ranges: [], enabled: true });

const collegeOptions = computed(() => colleges.value.map((item) => ({ label: `${item.name}（${item.startCode}-${item.endCode}）`, value: item.id })));
const selectedCollege = computed(() => colleges.value.find((item) => item.id === counselorForm.collegeId));

const collegeColumns = [
  { title: '学院', key: 'name' },
  { title: '学号段', key: 'range', render: (row) => `${row.startCode}-${row.endCode}` },
  { title: '说明', key: 'description' },
  {
    title: '操作',
    key: 'actions',
    render: (row) => h(NSpace, null, {
      default: () => [
        h(NButton, { size: 'small', secondary: true, onClick: () => openCollegeForm(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', secondary: true, type: 'error', onClick: () => deleteCollege(row) }, { default: () => '删除' })
      ]
    })
  }
];

const counselorColumns = [
  { title: '账号', key: 'username' },
  { title: '姓名', key: 'name' },
  { title: '学院', key: 'college', render: (row) => row.college?.name || '-' },
  { title: '负责范围', key: 'ranges', render: (row) => rangeText(row.ranges) },
  { title: '启用', key: 'enabled', render: (row) => h(NSwitch, { value: row.enabled !== false, disabled: true }) },
  {
    title: '操作',
    key: 'actions',
    render: (row) => h(NSpace, null, {
      default: () => [
        h(NButton, { size: 'small', secondary: true, onClick: () => openCounselorForm(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', secondary: true, type: 'error', onClick: () => deleteCounselor(row) }, { default: () => '删除' })
      ]
    })
  }
];

onMounted(load);

async function load() {
  const [collegeData, counselorData] = await Promise.all([
    request('/api/admin/colleges', {}, 'admin'),
    request('/api/admin/counselors', {}, 'admin')
  ]);
  colleges.value = collegeData.colleges || [];
  counselors.value = counselorData.counselors || [];
}

function openCollegeForm(item = null) {
  editingCollegeId.value = item?.id || '';
  Object.assign(collegeForm, item ? {
    name: item.name || '',
    startCode: item.startCode || '',
    endCode: item.endCode || '',
    description: item.description || ''
  } : { name: '', startCode: '', endCode: '', description: '' });
  showCollegeForm.value = true;
}

function closeCollegeForm() {
  editingCollegeId.value = '';
  showCollegeForm.value = false;
}

async function saveCollege() {
  const error = collegeFormError();
  if (error) {
    message.error(error);
    return;
  }
  try {
    const path = editingCollegeId.value ? `/api/admin/colleges/${editingCollegeId.value}` : '/api/admin/colleges';
    await request(path, { method: editingCollegeId.value ? 'PATCH' : 'POST', body: collegeForm }, 'admin');
    message.success(editingCollegeId.value ? '学院已更新' : '学院已创建');
    closeCollegeForm();
    await load();
  } catch (error) {
    message.error(error.message || '保存学院失败');
  }
}

function deleteCollege(row) {
  dialog.warning({
    title: '删除学院',
    content: `确认删除「${row.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/admin/colleges/${row.id}`, { method: 'DELETE' }, 'admin');
      message.success('学院已删除');
      await load();
    }
  });
}

function openCounselorForm(item = null) {
  editingCounselorId.value = item?.id || '';
  Object.assign(counselorForm, item ? {
    username: item.username || '',
    name: item.name || '',
    password: '',
    collegeId: item.collegeId || '',
    ranges: cloneRanges(item.ranges),
    enabled: item.enabled !== false
  } : {
    username: '',
    name: '',
    password: '',
    collegeId: colleges.value[0]?.id || '',
    ranges: colleges.value[0] ? [fullCollegeTailRange(colleges.value[0])] : [],
    enabled: true
  });
  showCounselorForm.value = true;
}

function closeCounselorForm() {
  editingCounselorId.value = '';
  showCounselorForm.value = false;
}

async function saveCounselor() {
  const error = counselorFormError();
  if (error) {
    message.error(error);
    return;
  }
  try {
    const path = editingCounselorId.value ? `/api/admin/counselors/${editingCounselorId.value}` : '/api/admin/counselors';
    await request(path, { method: editingCounselorId.value ? 'PATCH' : 'POST', body: counselorForm }, 'admin');
    message.success(editingCounselorId.value ? '导员已更新' : '导员已创建');
    closeCounselorForm();
    await load();
  } catch (error) {
    message.error(error.message || '保存导员失败');
  }
}

function deleteCounselor(row) {
  dialog.warning({
    title: '删除导员',
    content: `确认删除「${row.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await request(`/api/admin/counselors/${row.id}`, { method: 'DELETE' }, 'admin');
      message.success('导员已删除');
      await load();
    }
  });
}

function addCounselorRange() {
  counselorForm.ranges.push(selectedCollege.value ? fullCollegeTailRange(selectedCollege.value) : { startCode: '', endCode: '' });
}

function removeCounselorRange(index) {
  counselorForm.ranges.splice(index, 1);
}

function cloneRanges(ranges = []) {
  return (Array.isArray(ranges) ? ranges : []).map((item) => ({ startCode: item.startCode || '', endCode: item.endCode || '' }));
}

function rangeText(ranges = []) {
  return ranges?.length ? ranges.map((item) => `${item.startCode}-${item.endCode}`).join('，') : '-';
}

function fullCollegeTailRange(college) {
  return { startCode: `${college.startCode}00000`, endCode: `${college.endCode}99999` };
}

function resetCounselorRangesForCollege(collegeId) {
  const college = colleges.value.find((item) => item.id === collegeId);
  counselorForm.ranges = college ? [fullCollegeTailRange(college)] : [];
}

function collegeCodeStatus(value) {
  return value && !/^\d{3}$/.test(String(value)) ? 'error' : undefined;
}

function collegeCodeFeedback(value, sample) {
  if (!value) return sample;
  return /^\d{3}$/.test(String(value)) ? sample : '必须填写 3 位数字';
}

function collegeFormError() {
  if (!collegeForm.name.trim()) return '请输入学院名称';
  if (!/^\d{3}$/.test(collegeForm.startCode) || !/^\d{3}$/.test(collegeForm.endCode)) return '学院学号段必须是 3 位数字，例如 312-500';
  if (collegeForm.startCode > collegeForm.endCode) return '起始段不能大于结束段';
  return '';
}

function rangeError(range) {
  if (!range.startCode && !range.endCode) return '';
  if (!/^\d{8}$/.test(range.startCode || '') || !/^\d{8}$/.test(range.endCode || '')) return '负责范围必须填写学号后 8 位，例如 31204000-31204999';
  if (range.startCode > range.endCode) return '起始范围不能大于结束范围';
  const college = selectedCollege.value;
  if (college && (range.startCode.slice(0, 3) < college.startCode || range.endCode.slice(0, 3) > college.endCode)) {
    return `必须在学院范围 ${college.startCode}00000-${college.endCode}99999 内`;
  }
  return '';
}

function counselorFormError() {
  if (!counselorForm.username.trim()) return '请输入导员账号';
  if (!counselorForm.name.trim()) return '请输入导员姓名';
  if (!editingCounselorId.value && !counselorForm.password.trim()) return '请输入导员初始密码';
  if (!selectedCollege.value) return '请选择所属学院';
  if (!counselorForm.ranges.length) return '请至少添加一个负责范围';
  return counselorForm.ranges.map(rangeError).find(Boolean) || '';
}
</script>
