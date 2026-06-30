import { createApp } from 'vue';
import naive from 'naive-ui';
import AdminApp from './admin/AdminApp.vue';
import { adminRouter } from './admin/router.js';
import './styles/app.css';

createApp(AdminApp)
  .use(adminRouter)
  .use(naive)
  .mount('#admin-app');
