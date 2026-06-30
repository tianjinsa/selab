<template>
  <div class="grid grid-2">
    <section class="surface panel">
      <h2 style="margin-top: 0;">资料维护</h2>
      <n-form :model="form" label-placement="top">
        <n-form-item label="头像地址">
          <n-input-group>
            <n-input v-model:value="form.avatarUrl" placeholder="上传后自动填入，也可使用图片地址" />
            <n-upload :show-file-list="false" :custom-request="uploadAvatar">
              <n-button>上传</n-button>
            </n-upload>
          </n-input-group>
        </n-form-item>
        <n-form-item label="昵称">
          <n-input v-model:value="form.nickname" />
        </n-form-item>
        <n-form-item label="手机号">
          <n-input v-model:value="form.phone" maxlength="11" />
        </n-form-item>
        <n-form-item label="联系方式">
          <n-input v-model:value="form.contact" />
        </n-form-item>
        <n-form-item label="个人简介">
          <n-input v-model:value="form.bio" type="textarea" />
        </n-form-item>
        <n-button type="primary" :loading="saving" @click="saveProfile">保存资料</n-button>
      </n-form>
    </section>

    <section class="surface panel">
      <h2 style="margin-top: 0;">账号安全</h2>
      <n-descriptions bordered :column="1">
        <n-descriptions-item label="学号">{{ session.user?.studentId }}</n-descriptions-item>
        <n-descriptions-item label="信用分">{{ session.user?.creditScore }}</n-descriptions-item>
        <n-descriptions-item label="账号状态">
          <n-space>
            <n-tag :type="session.user?.isBanned ? 'error' : 'success'">{{ session.user?.isBanned ? '封禁' : '正常' }}</n-tag>
            <n-tag :type="session.user?.isMuted ? 'warning' : 'success'">{{ session.user?.isMuted ? '禁言' : '可发言' }}</n-tag>
            <n-tag :type="session.user?.isPublishRestricted ? 'warning' : 'success'">{{ session.user?.isPublishRestricted ? '限制发布' : '可发布' }}</n-tag>
          </n-space>
        </n-descriptions-item>
      </n-descriptions>

      <n-divider />
      <n-form :model="passwordForm" label-placement="top">
        <n-form-item label="原密码">
          <n-input v-model:value="passwordForm.oldPassword" type="password" show-password-on="click" />
        </n-form-item>
        <n-form-item label="新密码">
          <n-input v-model:value="passwordForm.newPassword" type="password" show-password-on="click" />
        </n-form-item>
        <n-button secondary :loading="changing" @click="changePassword">修改密码</n-button>
      </n-form>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';
import { loadUserSession, userSession as session } from '../session.js';

const message = useMessage();
const saving = ref(false);
const changing = ref(false);
const form = reactive({ avatarUrl: '', nickname: '', phone: '', contact: '', bio: '' });
const passwordForm = reactive({ oldPassword: '', newPassword: '' });

function syncForm() {
  Object.assign(form, {
    avatarUrl: session.user?.avatarUrl || '',
    nickname: session.user?.nickname || '',
    phone: session.user?.phone || '',
    contact: session.user?.contact || '',
    bio: session.user?.bio || ''
  });
}

onMounted(async () => {
  await loadUserSession();
  syncForm();
});

async function uploadAvatar({ file, onFinish, onError }) {
  try {
    const body = new FormData();
    body.append('file', file.file);
    const data = await request('/api/files/upload', { method: 'POST', body });
    form.avatarUrl = data.url;
    message.success('头像已上传');
    onFinish();
  } catch (error) {
    message.error(error.message || '上传失败');
    onError();
  }
}

async function saveProfile() {
  saving.value = true;
  try {
    const data = await request('/api/profile', { method: 'PATCH', body: form });
    session.user = data.user;
    syncForm();
    message.success('资料已保存');
  } catch (error) {
    message.error(error.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function changePassword() {
  changing.value = true;
  try {
    await request('/api/profile/password', { method: 'POST', body: passwordForm });
    passwordForm.oldPassword = '';
    passwordForm.newPassword = '';
    message.success('密码已更新');
  } catch (error) {
    message.error(error.message || '修改失败');
  } finally {
    changing.value = false;
  }
}
</script>
