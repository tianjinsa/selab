<template>
  <section class="surface panel">
    <n-space justify="space-between" align="center" style="margin-bottom: 14px;">
      <n-input v-model:value="q" placeholder="搜索昵称 / 学号 / 手机号" clearable style="max-width: 360px;" @keyup.enter="load" />
      <n-button @click="load">搜索</n-button>
    </n-space>
    <n-data-table :columns="columns" :data="users" :pagination="{ pageSize: 8 }" />
  </section>
</template>

<script setup>
import { h, onMounted, ref } from 'vue';
import { NButton, NInputNumber, NSpace, NSwitch, NTag, useDialog, useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';

const users = ref([]);
const q = ref('');
const message = useMessage();
const dialog = useDialog();

const columns = [
  { title: '学号', key: 'studentId', width: 130 },
  { title: '昵称', key: 'nickname' },
  { title: '手机号', key: 'phone', width: 130 },
  {
    title: '信用分',
    key: 'creditScore',
    width: 150,
    render(row) {
      return h(NSpace, { align: 'center' }, {
        default: () => [
          h(NTag, { type: row.creditScore < 6 ? 'warning' : 'success' }, { default: () => row.creditScore }),
          h(NInputNumber, {
            size: 'small',
            value: row.creditScore,
            min: 0,
            max: 10,
            style: 'width: 86px;',
            'onUpdate:value': (value) => updateStatus(row, { creditScore: value, reason: '管理员调整信用分' })
          })
        ]
      });
    }
  },
  {
    title: '账号控制',
    key: 'status',
    render(row) {
      return h(NSpace, { vertical: true, size: 4 }, {
        default: () => [
          h(NSpace, { align: 'center' }, { default: () => ['封禁', h(NSwitch, { value: row.isBanned, 'onUpdate:value': (value) => confirmStatus(row, { isBanned: value }) })] }),
          h(NSpace, { align: 'center' }, { default: () => ['禁言', h(NSwitch, { value: row.isMuted, 'onUpdate:value': (value) => confirmStatus(row, { isMuted: value }) })] }),
          h(NSpace, { align: 'center' }, { default: () => ['限制发布', h(NSwitch, { value: row.isPublishRestricted, 'onUpdate:value': (value) => confirmStatus(row, { isPublishRestricted: value }) })] })
        ]
      });
    }
  },
  {
    title: '注册时间',
    key: 'createdAt',
    render(row) {
      return new Date(row.createdAt).toLocaleString();
    }
  }
];

onMounted(load);

async function load() {
  const data = await request(`/api/admin/users?q=${encodeURIComponent(q.value)}`, {}, 'admin');
  users.value = data.users;
}

function confirmStatus(row, patch) {
  dialog.warning({
    title: '确认管理员操作',
    content: '该操作会影响用户可用状态，并写入管理员操作日志。',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: () => updateStatus(row, patch)
  });
}

async function updateStatus(row, patch) {
  const data = await request(`/api/admin/users/${row.id}/status`, {
    method: 'PATCH',
    body: { ...patch, reason: '管理员后台操作' }
  }, 'admin');
  Object.assign(row, data.user);
  message.success('用户状态已更新');
}
</script>
