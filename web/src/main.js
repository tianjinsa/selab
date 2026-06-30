import { createApp } from 'vue';
import naive from 'naive-ui';
import UserApp from './user/UserApp.vue';
import { userRouter } from './user/router.js';
import { initializeThemeMode } from './shared/theme.js';
import './styles/app.css';

initializeThemeMode();

createApp(UserApp)
  .use(userRouter)
  .use(naive)
  .mount('#app');
