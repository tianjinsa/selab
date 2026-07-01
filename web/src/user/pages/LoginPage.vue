<template>
  <div class="auth-page">
    <div class="auth-card surface">
      <div class="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <section class="auth-copy">
        <div>
          <span class="auth-kicker">Campus Life Service</span>
          <h1>把分散的校园生活服务收回一个入口</h1>
          <p>任务互助、社区交流、二手交易、私信通知和智能咨询共享一套清晰的校园身份。</p>
        </div>
        <div class="auth-proof-grid">
          <div class="auth-proof">
            <strong>12 位</strong>
            <span>学号格式校验</span>
          </div>
          <div class="auth-proof">
            <strong>JWT</strong>
            <span>用户登录态保持</span>
          </div>
          <div class="auth-proof">
            <strong>隔离</strong>
            <span>用户与管理员 Token</span>
          </div>
        </div>
      </section>
      <section class="auth-form">
        <n-tabs v-model:value="tab" animated>
          <n-tab-pane name="login" tab="登录">
            <n-form :model="loginForm" label-placement="top">
              <n-form-item label="学号或手机号">
                <n-input v-model:value="loginForm.account" placeholder="202600000001 或 13800000001" />
              </n-form-item>
              <n-form-item label="密码">
                <n-input v-model:value="loginForm.password" type="password" show-password-on="click" />
              </n-form-item>
              <n-button type="primary" block :loading="loading" @click="login">登录</n-button>
            </n-form>
            <p class="muted">演示账号：202600000001 / 123456，202600000002 / 123456</p>
          </n-tab-pane>
          <n-tab-pane name="register" tab="注册">
            <n-form :model="registerForm" label-placement="top">
              <n-form-item label="学号">
                <n-input v-model:value="registerForm.studentId" maxlength="12" placeholder="12 位纯数字" />
              </n-form-item>
              <n-form-item label="手机号">
                <n-input v-model:value="registerForm.phone" maxlength="11" placeholder="仅格式校验，不发送短信" />
              </n-form-item>
              <n-form-item label="昵称">
                <n-input v-model:value="registerForm.nickname" placeholder="可稍后修改" />
              </n-form-item>
              <n-form-item label="密码">
                <n-input v-model:value="registerForm.password" type="password" show-password-on="click" />
              </n-form-item>
              <n-alert v-if="registerHint" class="form-alert" type="warning" :show-icon="false">
                {{ registerHint }}
              </n-alert>
              <n-button type="primary" block :loading="loading" @click="register">创建账号</n-button>
            </n-form>
          </n-tab-pane>
          <n-tab-pane name="reset" tab="重置密码">
            <n-form :model="resetForm" label-placement="top">
              <n-form-item label="学号">
                <n-input v-model:value="resetForm.studentId" maxlength="12" />
              </n-form-item>
              <n-form-item label="手机号">
                <n-input v-model:value="resetForm.phone" maxlength="11" />
              </n-form-item>
              <n-form-item label="新密码">
                <n-input v-model:value="resetForm.newPassword" type="password" show-password-on="click" />
              </n-form-item>
              <n-button block :loading="loading" @click="resetPassword">确认重置</n-button>
            </n-form>
          </n-tab-pane>
        </n-tabs>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';
import ThemeToggle from '../../shared/ThemeToggle.vue';
import { setUserSession } from '../session.js';

const router = useRouter();
const message = useMessage();
const tab = ref('login');
const loading = ref(false);

const loginForm = reactive({ account: '', password: '' });
const registerForm = reactive({ studentId: '', phone: '', nickname: '', password: '' });
const resetForm = reactive({ studentId: '', phone: '', newPassword: '' });

const registerHint = computed(() => {
  if (registerForm.studentId && !/^\d{12}$/.test(registerForm.studentId)) return '学号必须是 12 位纯数字。';
  if (registerForm.phone && !/^1[3-9]\d{9}$/.test(registerForm.phone)) return '手机号格式不正确。';
  if (registerForm.password && registerForm.password.length < 6) return '密码至少需要 6 位。';
  return '';
});

async function run(action) {
  loading.value = true;
  try {
    await action();
  } catch (error) {
    message.error(error.message || '操作失败');
  } finally {
    loading.value = false;
  }
}

function login() {
  return run(async () => {
    const data = await request('/api/auth/login', { method: 'POST', body: loginForm });
    setUserSession(data.token, data.user);
    router.push('/');
  });
}

function register() {
  return run(async () => {
    if (registerHint.value) throw new Error(registerHint.value);
    const data = await request('/api/auth/register', { method: 'POST', body: registerForm });
    setUserSession(data.token, data.user);
    router.push('/');
  });
}

function resetPassword() {
  return run(async () => {
    const data = await request('/api/auth/reset-password', { method: 'POST', body: resetForm });
    message.success(data.message || '密码已重置');
    tab.value = 'login';
  });
}
</script>
