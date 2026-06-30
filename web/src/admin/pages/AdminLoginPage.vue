<template>
  <div class="auth-page">
    <div class="auth-card surface">
      <section class="auth-copy">
        <h1>管理员后台</h1>
        <p>管理员入口与普通用户入口完全隔离，用户 Token 不能访问后台接口。</p>
        <span class="status-pill">/admin 独立入口</span>
      </section>
      <section class="auth-form">
        <h2 style="margin-top: 0;">登录后台</h2>
        <n-form :model="form" label-placement="top">
          <n-form-item label="账号">
            <n-input v-model:value="form.username" placeholder="admin" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input v-model:value="form.password" type="password" show-password-on="click" placeholder="123456" />
          </n-form-item>
          <n-button type="primary" block :loading="loading" @click="login">登录</n-button>
        </n-form>
      </section>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { request } from '../../shared/http.js';
import { setAdminSession } from '../session.js';

const router = useRouter();
const message = useMessage();
const loading = ref(false);
const form = reactive({ username: 'admin', password: '123456' });

async function login() {
  loading.value = true;
  try {
    const data = await request('/api/admin/auth/login', { method: 'POST', body: form }, 'admin');
    setAdminSession(data.token, data.admin);
    router.push('/');
  } catch (error) {
    message.error(error.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>
