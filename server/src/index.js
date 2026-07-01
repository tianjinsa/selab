import http from 'node:http';
import { config } from './config.js';
import { createStore } from './data/store.js';
import { seedInitialData } from './services/seed.js';
import { createApp } from './app.js';
import { RealtimeHub } from './realtime/realtimeHub.js';
import { scanTaskTimeouts } from './services/tasks.js';
import { scanOrderTimeouts } from './services/market.js';
import { scanContentModerationQueue } from './services/contentModeration.js';
import { closeFileBlobStorage, migrateLocalUploadsToDatabase } from './services/fileBlobs.js';

const store = await createStore();
await seedInitialData(store);
await migrateLocalUploadsToDatabase(store).catch((error) => console.error('Upload file migration failed:', error.message));

const realtime = new RealtimeHub(store);
const app = createApp(store, realtime);
const server = http.createServer(app);
realtime.attach(server);

server.listen(config.port, () => {
  console.log(`Campus Life Service listening on http://localhost:${config.port}`);
  console.log(store.status.message);
});

await runBackgroundScans();
setInterval(() => {
  runBackgroundScans().catch((error) => console.error('Background scan failed:', error.message));
}, 60 * 60 * 1000);

async function runBackgroundScans() {
  await store.refreshFromDatabase?.({ force: true });
  await scanTaskTimeouts(store).catch((error) => console.error('Task timeout scan failed:', error.message));
  await scanOrderTimeouts(store).catch((error) => console.error('Order timeout scan failed:', error.message));
  await scanContentModerationQueue(store, realtime).catch((error) => console.error('Content moderation scan failed:', error.message));
}

process.on('SIGINT', async () => {
  realtime.close();
  await closeFileBlobStorage();
  await store.close();
  process.exit(0);
});
