import http from 'node:http';
import { config } from './config.js';
import { createStore } from './data/store.js';
import { seedInitialData } from './services/seed.js';
import { createApp } from './app.js';
import { RealtimeHub } from './realtime/realtimeHub.js';
import { scanTaskTimeouts } from './services/tasks.js';
import { scanOrderTimeouts } from './services/market.js';

const store = await createStore();
await seedInitialData(store);

const realtime = new RealtimeHub(store);
const app = createApp(store, realtime);
const server = http.createServer(app);
realtime.attach(server);

server.listen(config.port, () => {
  console.log(`Campus Life Service listening on http://localhost:${config.port}`);
  console.log(store.status.message);
});

await scanTaskTimeouts(store).catch((error) => console.error('Task timeout scan failed:', error.message));
await scanOrderTimeouts(store).catch((error) => console.error('Order timeout scan failed:', error.message));
setInterval(() => {
  scanTaskTimeouts(store).catch((error) => console.error('Task timeout scan failed:', error.message));
  scanOrderTimeouts(store).catch((error) => console.error('Order timeout scan failed:', error.message));
}, 60 * 60 * 1000);

process.on('SIGINT', async () => {
  await store.close();
  process.exit(0);
});
