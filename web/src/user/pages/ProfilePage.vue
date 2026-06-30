<template>
  <div class="grid grid-2">
    <section class="surface panel">
      <h2 style="margin-top: 0;">资料维护</h2>
      <n-form :model="form" label-placement="top">
        <n-form-item label="主页背景">
          <div class="profile-cover-editor" :style="coverPreviewStyle">
            <div class="profile-cover-shade">
              <strong>主页背景</strong>
              <span>建议使用横向图片，支持 jpg、png、webp</span>
            </div>
            <n-upload
              accept="image/jpeg,image/png,image/webp"
              :show-file-list="false"
              :custom-request="uploadCover"
            >
              <n-button secondary :loading="coverUploading">
                <template #icon><ImagePlus :size="16" /></template>
                更换背景
              </n-button>
            </n-upload>
          </div>
        </n-form-item>
        <n-form-item label="头像">
          <div class="avatar-upload-row">
            <n-upload
              accept="image/jpeg,image/png,image/webp"
              :show-file-list="false"
              :custom-request="uploadAvatar"
            >
              <button type="button" class="avatar-upload-trigger" :class="{ loading: avatarUploading }">
                <n-avatar round :size="72" :src="form.avatarUrl || undefined">
                  {{ avatarText(form.nickname) }}
                </n-avatar>
                <span><Camera :size="15" />点击更换</span>
              </button>
            </n-upload>
            <div>
              <strong>点击头像即可上传</strong>
              <p class="muted">头像会直接保存并同步到帖子、私信和任务信息中。</p>
            </div>
          </div>
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
        <n-space>
          <n-button type="primary" :loading="saving" @click="saveProfile">保存资料</n-button>
          <n-button secondary @click="$router.push(`/users/${session.user?.id}`)">
            <template #icon><Eye :size="16" /></template>
            查看我的主页
          </n-button>
        </n-space>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { Camera, Eye, ImagePlus } from '@lucide/vue';
import { request } from '../../shared/http.js';
import { loadUserSession, userSession as session } from '../session.js';

const message = useMessage();
const saving = ref(false);
const changing = ref(false);
const avatarUploading = ref(false);
const coverUploading = ref(false);
const form = reactive({ avatarUrl: '', coverUrl: '', nickname: '', phone: '', contact: '', bio: '' });
const passwordForm = reactive({ oldPassword: '', newPassword: '' });
const coverPreviewStyle = computed(() => (
  form.coverUrl
    ? { backgroundImage: `linear-gradient(90deg, rgba(19, 39, 35, 0.62), rgba(19, 39, 35, 0.18)), url("${form.coverUrl}")` }
    : {}
));

function syncForm() {
  Object.assign(form, {
    avatarUrl: session.user?.avatarUrl || '',
    coverUrl: session.user?.coverUrl || '',
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
  await uploadProfileImage(file, 'avatarUrl', avatarUploading, '头像已更新', onFinish, onError);
}

async function uploadCover({ file, onFinish, onError }) {
  await uploadProfileImage(file, 'coverUrl', coverUploading, '主页背景已更新', onFinish, onError);
}

async function uploadProfileImage(file, field, loadingRef, successText, onFinish, onError) {
  loadingRef.value = true;
  try {
    const body = new FormData();
    body.append('file', file.file);
    const uploadData = await request('/api/files/upload', { method: 'POST', body });
    const profileData = await request('/api/profile', { method: 'PATCH', body: { [field]: uploadData.url } });
    session.user = profileData.user;
    syncForm();
    message.success(successText);
    onFinish();
  } catch (error) {
    message.error(error.message || '上传失败');
    onError();
  } finally {
    loadingRef.value = false;
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

function avatarText(name = '') {
  return String(name || '同').slice(0, 1);
}
</script>
