import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { config } from '../config.js';
import { collectionNames, createEmptyData, normalizeData } from './defaultData.js';

const COLLECTION_NAME_MAX = 100;
const ITEM_ID_MAX = 200;
const SETTINGS_COLLECTION_NAME = 'settings';
const LEGACY_COLLECTIONS_MIGRATION = 'legacy_collections_to_items';
const COLLECTION_VERSIONS_MIGRATION = 'collection_versions_seeded';
const SYNC_MIN_INTERVAL_MS = 3000;

function now() {
  return new Date().toISOString();
}

function sqlConfig(database) {
  return {
    server: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: config.db.trustServerCertificate
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

function quoteSqlString(value) {
  return String(value).replaceAll("'", "''");
}

function quoteSqlIdentifier(value) {
  return String(value).replaceAll(']', ']]');
}

async function createSqlPersistence() {
  let pool = await connectAppPool().catch(async () => {
    await ensureDatabase();
    return connectAppPool();
  });
  let reconnecting = null;

  async function ensureDatabase() {
    const master = await new sql.ConnectionPool(sqlConfig('master')).connect();
    try {
      await master.request().query(`
        IF DB_ID(N'${quoteSqlString(config.db.database)}') IS NULL
        BEGIN
          CREATE DATABASE [${quoteSqlIdentifier(config.db.database)}]
        END
      `);
    } finally {
      await master.close();
    }
  }

  async function connectAppPool() {
    const next = new sql.ConnectionPool(sqlConfig(config.db.database));
    next.on('error', (error) => {
      console.error('SQL Server connection pool error:', error.message);
    });
    return next.connect();
  }

  async function ensureSchema(activePool) {
    await activePool.request().query(`
      IF OBJECT_ID(N'dbo.AppItems', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AppItems (
          collectionName NVARCHAR(${COLLECTION_NAME_MAX}) NOT NULL,
          itemId NVARCHAR(${ITEM_ID_MAX}) NOT NULL,
          payload NVARCHAR(MAX) NOT NULL,
          sortIndex INT NOT NULL CONSTRAINT DF_AppItems_sortIndex DEFAULT 0,
          createdAt DATETIME2 NOT NULL CONSTRAINT DF_AppItems_createdAt DEFAULT SYSUTCDATETIME(),
          updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppItems_updatedAt DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_AppItems PRIMARY KEY (collectionName, itemId)
        )
      END

      IF COL_LENGTH(N'dbo.AppItems', N'sortIndex') IS NULL
      BEGIN
        ALTER TABLE dbo.AppItems
          ADD sortIndex INT NOT NULL CONSTRAINT DF_AppItems_sortIndex DEFAULT 0
      END

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = N'IX_AppItems_CollectionSort'
          AND object_id = OBJECT_ID(N'dbo.AppItems')
      )
      BEGIN
        CREATE INDEX IX_AppItems_CollectionSort
          ON dbo.AppItems(collectionName, sortIndex, updatedAt DESC)
      END

      IF OBJECT_ID(N'dbo.AppSettings', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AppSettings (
          id TINYINT NOT NULL CONSTRAINT PK_AppSettings PRIMARY KEY,
          payload NVARCHAR(MAX) NOT NULL,
          updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppSettings_updatedAt DEFAULT SYSUTCDATETIME(),
          CONSTRAINT CK_AppSettings_Singleton CHECK (id = 1)
        )
      END

      IF OBJECT_ID(N'dbo.AppCollectionVersions', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AppCollectionVersions (
          collectionName NVARCHAR(${COLLECTION_NAME_MAX}) NOT NULL CONSTRAINT PK_AppCollectionVersions PRIMARY KEY,
          updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppCollectionVersions_updatedAt DEFAULT SYSUTCDATETIME()
        )
      END

      IF OBJECT_ID(N'dbo.AppStoreMigrations', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AppStoreMigrations (
          name NVARCHAR(120) NOT NULL CONSTRAINT PK_AppStoreMigrations PRIMARY KEY,
          completedAt DATETIME2 NOT NULL CONSTRAINT DF_AppStoreMigrations_completedAt DEFAULT SYSUTCDATETIME()
        )
      END
    `);
    await migrateLegacyCollections(activePool);
    await seedCollectionVersions(activePool);
  }

  async function reconnect() {
    if (!reconnecting) {
      const previous = pool;
      reconnecting = (async () => {
        await previous?.close().catch(() => {});
        const next = await connectAppPool();
        await ensureSchema(next);
        pool = next;
      })().finally(() => {
        reconnecting = null;
      });
    }
    await reconnecting;
  }

  async function runWithReconnect(operation) {
    try {
      return await operation(pool);
    } catch (error) {
      if (!isTransientSqlError(error)) throw error;
      await reconnect();
      return operation(pool);
    }
  }

  async function migrateLegacyCollections(activePool) {
    if (await isMigrationCompleted(activePool, LEGACY_COLLECTIONS_MIGRATION)) return;

    const legacyTable = await activePool.request().query(`
      SELECT OBJECT_ID(N'dbo.AppCollections', N'U') AS objectId
    `);
    if (!legacyTable.recordset[0]?.objectId) {
      await markMigrationCompleted(activePool, LEGACY_COLLECTIONS_MIGRATION);
      return;
    }

    const legacy = await activePool.request().query('SELECT name, payload FROM dbo.AppCollections');
    for (const row of legacy.recordset) {
      const name = normalizeCollectionName(row.name);
      if (!name) continue;

      const parsed = parseJson(row.payload, null);
      if (name === 'settings') {
        const settingsCount = await countSettingsRows(activePool);
        if (settingsCount === 0 && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          await saveSettings(activePool, normalizeData({ settings: parsed }).settings);
        }
        continue;
      }

      if (!Array.isArray(parsed)) continue;
      const itemCount = await countItems(activePool, name);
      if (itemCount === 0) {
        await replaceItems(activePool, name, prepareCollection(parsed));
      }
    }

    await markMigrationCompleted(activePool, LEGACY_COLLECTIONS_MIGRATION);
  }

  async function seedCollectionVersions(activePool) {
    if (await isMigrationCompleted(activePool, COLLECTION_VERSIONS_MIGRATION)) return;

    await activePool.request()
      .input('settingsName', sql.NVarChar(COLLECTION_NAME_MAX), SETTINGS_COLLECTION_NAME)
      .query(`
        MERGE dbo.AppCollectionVersions AS target
        USING (
          SELECT collectionName, MAX(updatedAt) AS updatedAt
          FROM dbo.AppItems
          GROUP BY collectionName
          UNION ALL
          SELECT @settingsName AS collectionName, updatedAt
          FROM dbo.AppSettings
          WHERE id = 1
        ) AS source
        ON target.collectionName = source.collectionName
        WHEN MATCHED AND target.updatedAt < source.updatedAt THEN
          UPDATE SET updatedAt = source.updatedAt
        WHEN NOT MATCHED THEN
          INSERT (collectionName, updatedAt)
          VALUES (source.collectionName, source.updatedAt);
      `);
    await markMigrationCompleted(activePool, COLLECTION_VERSIONS_MIGRATION);
  }

  await ensureSchema(pool);

  return {
    mode: 'sqlserver',
    async load() {
      const data = createEmptyData();
      let hasSettings = false;
      const items = await runWithReconnect((activePool) => activePool.request().query(`
        SELECT collectionName, itemId, payload
        FROM dbo.AppItems
        ORDER BY collectionName ASC, sortIndex ASC, createdAt ASC, itemId ASC
      `));

      for (const row of items.recordset) {
        const name = normalizeCollectionName(row.collectionName);
        if (!name) continue;
        if (!Array.isArray(data[name])) data[name] = [];

        const item = parseJson(row.payload, null);
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        if (!item.id) item.id = row.itemId;
        data[name].push(item);
      }

      const settings = await runWithReconnect((activePool) => activePool.request().query(`
        SELECT TOP 1 payload
        FROM dbo.AppSettings
        WHERE id = 1
      `));
      if (settings.recordset[0]?.payload) {
        hasSettings = true;
        const parsed = parseJson(settings.recordset[0].payload, null);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          data.settings = parsed;
        }
      }

      const normalized = normalizeData(data);
      prepareAllCollections(normalized);
      if (!hasSettings) {
        await runWithReconnect((activePool) => saveSettings(activePool, normalized.settings));
      }
      return normalized;
    },
    async saveItem(name, item, sortIndex) {
      const collectionName = normalizeCollectionName(name);
      if (!collectionName) throw new Error(`Invalid collection name: ${name}`);
      await runWithReconnect((activePool) => upsertItem(activePool, collectionName, item, sortIndex));
    },
    async replaceItems(name, items) {
      const collectionName = normalizeCollectionName(name);
      if (!collectionName) throw new Error(`Invalid collection name: ${name}`);
      await runWithReconnect((activePool) => replaceItems(activePool, collectionName, items));
    },
    async saveSettings(settings) {
      await runWithReconnect((activePool) => saveSettings(activePool, settings));
    },
    async loadCollection(name) {
      const collectionName = normalizeCollectionName(name);
      if (!collectionName) throw new Error(`Invalid collection name: ${name}`);
      return runWithReconnect((activePool) => loadCollectionItems(activePool, collectionName));
    },
    async loadCollections(names) {
      const collectionNames = normalizeCollectionNames(names);
      return runWithReconnect((activePool) => loadCollectionItemsMap(activePool, collectionNames));
    },
    async countItems(name) {
      const collectionName = normalizeCollectionName(name);
      if (!collectionName) throw new Error(`Invalid collection name: ${name}`);
      return runWithReconnect((activePool) => countItems(activePool, collectionName));
    },
    async loadSettings() {
      return runWithReconnect((activePool) => loadSettings(activePool));
    },
    async getVersions() {
      return runWithReconnect((activePool) => readCollectionVersions(activePool));
    },
    async close() {
      if (reconnecting) await reconnecting.catch(() => {});
      await pool.close();
    }
  };
}

function isTransientSqlError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return ['ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN'].includes(code)
    || message.includes('socket hang up')
    || message.includes('connection lost')
    || message.includes('connection is closed')
    || message.includes('connection not yet open')
    || message.includes('failed to connect');
}

function normalizeCollectionName(name) {
  const value = String(name || '').trim();
  if (!value || value.length > COLLECTION_NAME_MAX) return '';
  return value;
}

function normalizeCollectionNames(names = []) {
  return [...new Set((Array.isArray(names) ? names : [names])
    .map((name) => normalizeCollectionName(name))
    .filter(Boolean))];
}

function normalizeItemId(id, usedIds = null) {
  const value = String(id || '').trim();
  if (value && value.length <= ITEM_ID_MAX && !usedIds?.has(value)) return value;
  return randomUUID();
}

function parseJson(content, fallback) {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepareItem(item, usedIds = null) {
  const timestamp = now();
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item };
  const next = {
    ...source,
    id: normalizeItemId(source.id, usedIds),
    createdAt: source.createdAt || timestamp,
    updatedAt: source.updatedAt || timestamp
  };
  usedIds?.add(next.id);
  return next;
}

function prepareCollection(items) {
  const usedIds = new Set();
  return (Array.isArray(items) ? items : []).map((item) => prepareItem(item, usedIds));
}

function prepareCollectionInPlace(items) {
  const prepared = prepareCollection(items);
  items.splice(0, items.length, ...prepared);
  return items;
}

function prepareAllCollections(data) {
  for (const name of collectionNames) {
    if (Array.isArray(data[name])) prepareCollectionInPlace(data[name]);
  }
}

async function countItems(activePool, collectionName) {
  const result = await activePool.request()
    .input('collectionName', sql.NVarChar(COLLECTION_NAME_MAX), collectionName)
    .query(`
      SELECT COUNT_BIG(*) AS total
      FROM dbo.AppItems
      WHERE collectionName = @collectionName
    `);
  return Number(result.recordset[0]?.total || 0);
}

async function countSettingsRows(activePool) {
  const result = await activePool.request().query(`
    SELECT COUNT_BIG(*) AS total
    FROM dbo.AppSettings
    WHERE id = 1
  `);
  return Number(result.recordset[0]?.total || 0);
}

async function loadCollectionItems(activePool, collectionName) {
  const result = await activePool.request()
    .input('collectionName', sql.NVarChar(COLLECTION_NAME_MAX), collectionName)
    .query(`
      SELECT itemId, payload
      FROM dbo.AppItems
      WHERE collectionName = @collectionName
      ORDER BY sortIndex ASC, createdAt ASC, itemId ASC
    `);
  const items = [];
  for (const row of result.recordset) {
    const item = parseJson(row.payload, null);
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (!item.id) item.id = row.itemId;
    items.push(item);
  }
  return prepareCollection(items);
}

async function loadCollectionItemsMap(activePool, collectionNames) {
  const names = normalizeCollectionNames(collectionNames);
  const collections = Object.fromEntries(names.map((name) => [name, []]));
  if (!names.length) return collections;

  const request = activePool.request();
  const placeholders = names.map((name, index) => {
    const paramName = `name${index}`;
    request.input(paramName, sql.NVarChar(COLLECTION_NAME_MAX), name);
    return `@${paramName}`;
  });
  const result = await request.query(`
    SELECT collectionName, itemId, payload
    FROM dbo.AppItems
    WHERE collectionName IN (${placeholders.join(', ')})
    ORDER BY collectionName ASC, sortIndex ASC, createdAt ASC, itemId ASC
  `);

  for (const row of result.recordset) {
    const name = normalizeCollectionName(row.collectionName);
    if (!name || !collections[name]) continue;
    const item = parseJson(row.payload, null);
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (!item.id) item.id = row.itemId;
    collections[name].push(item);
  }

  for (const name of names) {
    collections[name] = prepareCollection(collections[name]);
  }
  return collections;
}

async function loadSettings(activePool) {
  const result = await activePool.request().query(`
    SELECT TOP 1 payload
    FROM dbo.AppSettings
    WHERE id = 1
  `);
  const parsed = result.recordset[0]?.payload
    ? parseJson(result.recordset[0].payload, null)
    : null;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return createEmptyData().settings;
  }
  return normalizeData({ settings: parsed }).settings;
}

async function readCollectionVersions(activePool) {
  const result = await activePool.request().query(`
    SELECT collectionName, CONVERT(VARCHAR(33), updatedAt, 126) AS version
    FROM dbo.AppCollectionVersions
  `);
  return Object.fromEntries(result.recordset.map((row) => [row.collectionName, row.version]));
}

async function isMigrationCompleted(activePool, name) {
  const result = await activePool.request()
    .input('name', sql.NVarChar(120), name)
    .query('SELECT TOP 1 1 AS completed FROM dbo.AppStoreMigrations WHERE name = @name');
  return Boolean(result.recordset[0]);
}

async function markMigrationCompleted(activePool, name) {
  await activePool.request()
    .input('name', sql.NVarChar(120), name)
    .query(`
      MERGE dbo.AppStoreMigrations AS target
      USING (SELECT @name AS name) AS source
      ON target.name = source.name
      WHEN MATCHED THEN
        UPDATE SET completedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (name) VALUES (source.name);
    `);
}

async function upsertItem(activePool, collectionName, item, sortIndex = 0) {
  await activePool.request()
    .input('collectionName', sql.NVarChar(COLLECTION_NAME_MAX), collectionName)
    .input('itemId', sql.NVarChar(ITEM_ID_MAX), item.id)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(item))
    .input('sortIndex', sql.Int, Number(sortIndex) || 0)
    .query(`
      MERGE dbo.AppItems WITH (HOLDLOCK) AS target
      USING (
        SELECT
          @collectionName AS collectionName,
          @itemId AS itemId,
          @payload AS payload,
          @sortIndex AS sortIndex
      ) AS source
      ON target.collectionName = source.collectionName
        AND target.itemId = source.itemId
      WHEN MATCHED THEN
        UPDATE SET
          payload = source.payload,
          sortIndex = source.sortIndex,
          updatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (collectionName, itemId, payload, sortIndex)
        VALUES (source.collectionName, source.itemId, source.payload, source.sortIndex);

      MERGE dbo.AppCollectionVersions AS target
      USING (SELECT @collectionName AS collectionName) AS source
      ON target.collectionName = source.collectionName
      WHEN MATCHED THEN
        UPDATE SET updatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (collectionName) VALUES (source.collectionName);
    `);
}

async function replaceItems(activePool, collectionName, items) {
  const transaction = new sql.Transaction(activePool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('collectionName', sql.NVarChar(COLLECTION_NAME_MAX), collectionName)
      .query('DELETE FROM dbo.AppItems WHERE collectionName = @collectionName');

    for (const [index, item] of items.entries()) {
      await new sql.Request(transaction)
        .input('collectionName', sql.NVarChar(COLLECTION_NAME_MAX), collectionName)
        .input('itemId', sql.NVarChar(ITEM_ID_MAX), item.id)
        .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(item))
        .input('sortIndex', sql.Int, index)
        .query(`
          INSERT INTO dbo.AppItems (collectionName, itemId, payload, sortIndex)
          VALUES (@collectionName, @itemId, @payload, @sortIndex)
        `);
    }

    await new sql.Request(transaction)
      .input('collectionName', sql.NVarChar(COLLECTION_NAME_MAX), collectionName)
      .query(`
        MERGE dbo.AppCollectionVersions AS target
        USING (SELECT @collectionName AS collectionName) AS source
        ON target.collectionName = source.collectionName
        WHEN MATCHED THEN
          UPDATE SET updatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (collectionName) VALUES (source.collectionName);
      `);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}

async function saveSettings(activePool, settings) {
  await activePool.request()
    .input('settingsName', sql.NVarChar(COLLECTION_NAME_MAX), SETTINGS_COLLECTION_NAME)
    .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(settings || {}))
    .query(`
      MERGE dbo.AppSettings WITH (HOLDLOCK) AS target
      USING (SELECT CAST(1 AS TINYINT) AS id, @payload AS payload) AS source
      ON target.id = source.id
      WHEN MATCHED THEN
        UPDATE SET payload = source.payload, updatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (id, payload) VALUES (source.id, source.payload);

      MERGE dbo.AppCollectionVersions AS target
      USING (SELECT @settingsName AS collectionName) AS source
      ON target.collectionName = source.collectionName
      WHEN MATCHED THEN
        UPDATE SET updatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (collectionName) VALUES (source.collectionName);
    `);
}

export async function createStore() {
  let persistence;
  try {
    persistence = await createSqlPersistence();
  } catch (error) {
    throw new Error(`SQL Server 初始化失败，已停止启动以避免写入本地 JSON：${error.message}`, { cause: error });
  }

  const data = normalizeData({ settings: await persistence.loadSettings() });
  const loadedCollections = new Set([SETTINGS_COLLECTION_NAME]);
  const collectionVersions = new Map();
  const pendingWriteCounts = new Map();
  const refreshDeferredUntil = new Map();
  let writeChain = Promise.resolve();
  let syncChain = Promise.resolve();
  let lastSyncAt = 0;

  function markPendingWrites(names) {
    for (const name of normalizeCollectionNames(names)) {
      pendingWriteCounts.set(name, Number(pendingWriteCounts.get(name) || 0) + 1);
    }
  }

  function unmarkPendingWrites(names) {
    for (const name of normalizeCollectionNames(names)) {
      const next = Number(pendingWriteCounts.get(name) || 0) - 1;
      if (next > 0) pendingWriteCounts.set(name, next);
      else pendingWriteCounts.delete(name);
    }
  }

  function hasPendingWrite(name) {
    return Number(pendingWriteCounts.get(name) || 0) > 0;
  }

  function deferCollectionRefresh(name, durationMs = 30000) {
    const collectionName = normalizeCollectionName(name);
    if (!collectionName) return;
    const until = Date.now() + Math.max(1000, Number(durationMs) || 30000);
    refreshDeferredUntil.set(collectionName, Math.max(Number(refreshDeferredUntil.get(collectionName) || 0), until));
  }

  function isRefreshDeferred(name) {
    const until = Number(refreshDeferredUntil.get(name) || 0);
    if (!until) return false;
    if (until > Date.now()) return true;
    refreshDeferredUntil.delete(name);
    return false;
  }

  function queueWrite(operation, names = []) {
    const writeNames = normalizeCollectionNames(names);
    markPendingWrites(writeNames);
    const next = writeChain
      .then(operation, operation)
      .finally(() => unmarkPendingWrites(writeNames));
    writeChain = next.catch(() => {});
    return next;
  }

  function logAsyncWriteError(action, error) {
    console.error(`SQL Server 异步落盘失败（${action}）：`, error?.message || error);
  }

  function enqueueWrite(operation, names, options, action) {
    const promise = queueWrite(operation, names);
    if (options?.async) {
      promise.catch((error) => logAsyncWriteError(action, error));
      return null;
    }
    return promise;
  }

  async function reloadCollections(names = []) {
    const uniqueNames = normalizeCollectionNames(names);
    if (!uniqueNames.length) return { loaded: [] };

    const loaded = [];
    const itemNames = uniqueNames.filter((name) => name !== SETTINGS_COLLECTION_NAME);
    const settingsRequested = uniqueNames.includes(SETTINGS_COLLECTION_NAME);
    const [settingsValue, itemCollections] = await Promise.all([
      settingsRequested ? persistence.loadSettings() : Promise.resolve(null),
      itemNames.length ? persistence.loadCollections(itemNames) : Promise.resolve({})
    ]);

    if (settingsRequested) {
      data.settings = settingsValue;
      loadedCollections.add(SETTINGS_COLLECTION_NAME);
      loaded.push(SETTINGS_COLLECTION_NAME);
    }

    for (const name of itemNames) {
      data[name] = itemCollections[name] || [];
      loadedCollections.add(name);
      loaded.push(name);
    }
    return { loaded };
  }

  async function loadCollections(names = [], options = {}) {
    const force = Boolean(options.force);
    const uniqueNames = normalizeCollectionNames(names);
    if (!uniqueNames.length) return { loaded: [] };
    const targetNames = uniqueNames.filter((name) => force || !loadedCollections.has(name));

    let loaded = [];
    if (targetNames.length) {
      if (force) await writeChain.catch(() => {});
      const result = await reloadCollections(targetNames);
      loaded = result.loaded;
    }

    if (!force && options.checkVersions !== false) {
      const result = await refreshFromDatabase({ collections: uniqueNames, minInterval: options.minInterval });
      return { loaded, checked: result.checked, changed: result.changed };
    }

    return { loaded };
  }

  function refreshFromDatabase(options = {}) {
    const force = Boolean(options.force);
    const minInterval = Number(options.minInterval ?? SYNC_MIN_INTERVAL_MS);
    if (!force && Date.now() - lastSyncAt < minInterval) {
      return Promise.resolve({ checked: false, changed: [] });
    }

    const next = syncChain.then(async () => {
      if (!force && Date.now() - lastSyncAt < minInterval) {
        return { checked: false, changed: [] };
      }

      if (force) await writeChain.catch(() => {});
      const names = normalizeCollectionNames(options.collections || [SETTINGS_COLLECTION_NAME, ...collectionNames])
        .filter((name) => force || loadedCollections.has(name));
      const versions = await persistence.getVersions();
      lastSyncAt = Date.now();

      const changed = [];
      for (const name of names) {
        if (hasPendingWrite(name) || isRefreshDeferred(name)) continue;
        const nextVersion = versions[name] || '';
        const previousVersion = collectionVersions.get(name);
        if (force || (previousVersion && previousVersion !== nextVersion)) {
          changed.push(name);
        } else if (!previousVersion) {
          collectionVersions.set(name, nextVersion);
        }
      }

      if (changed.length) {
        await reloadCollections(changed);
        for (const name of changed) {
          collectionVersions.set(name, versions[name] || '');
        }
      }
      return { checked: true, changed };
    });
    syncChain = next.catch(() => {});
    return next;
  }

  return {
    status: {
      mode: 'sqlserver',
      ok: true,
      message: `SQL Server 数据库存储已启用：${config.db.host}:${config.db.port}/${config.db.database}`
    },
    data,
    collection(name) {
      if (name === 'settings') return data.settings;
      if (!Array.isArray(data[name])) data[name] = [];
      return data[name];
    },
    async loadCollections(names, options) {
      return loadCollections(names, options);
    },
    async count(name) {
      if (name === 'settings') return 1;
      return persistence.countItems(name);
    },
    async insert(name, item, options = {}) {
      if (name === 'settings') return this.updateSettings(item, options);
      if (!Array.isArray(data[name])) data[name] = [];
      const next = prepareItem(item);
      data[name].push(next);
      const itemSnapshot = clone(next);
      const sortIndex = loadedCollections.has(name)
        ? data[name].length - 1
        : await persistence.countItems(name);
      const write = enqueueWrite(
        () => persistence.saveItem(name, itemSnapshot, sortIndex),
        [name],
        options,
        `insert ${name}/${next.id}`
      );
      if (write) await write;
      return next;
    },
    async update(name, id, patch, options = {}) {
      if (!Array.isArray(data[name])) data[name] = [];
      if (!loadedCollections.has(name)) {
        await loadCollections([name]);
      }
      const index = data[name].findIndex((item) => item.id === id);
      if (index < 0) return null;
      const current = data[name][index];
      data[name][index] = {
        ...current,
        ...patch,
        id: current.id,
        updatedAt: now()
      };
      const itemSnapshot = clone(data[name][index]);
      const write = enqueueWrite(
        () => persistence.saveItem(name, itemSnapshot, index),
        [name],
        options,
        `update ${name}/${id}`
      );
      if (write) await write;
      return data[name][index];
    },
    async replaceCollection(name, items, options = {}) {
      if (name === 'settings') return this.updateSettings(items, options);
      data[name] = prepareCollection(items);
      loadedCollections.add(name);
      const itemsSnapshot = clone(data[name]);
      const write = enqueueWrite(
        () => persistence.replaceItems(name, itemsSnapshot),
        [name],
        options,
        `replace ${name}`
      );
      if (write) await write;
      return data[name];
    },
    async updateSettings(patch, options = {}) {
      data.settings = {
        ...data.settings,
        ...patch,
        updatedAt: now()
      };
      loadedCollections.add(SETTINGS_COLLECTION_NAME);
      const settingsSnapshot = clone(data.settings);
      const write = enqueueWrite(
        () => persistence.saveSettings(settingsSnapshot),
        [SETTINGS_COLLECTION_NAME],
        options,
        'update settings'
      );
      if (write) await write;
      return data.settings;
    },
    async saveCollection(name, options = {}) {
      if (name === 'settings') {
        const settingsSnapshot = clone(data.settings);
        const write = enqueueWrite(
          () => persistence.saveSettings(settingsSnapshot),
          [SETTINGS_COLLECTION_NAME],
          options,
          'save settings'
        );
        if (write) await write;
        return;
      }
      if (!Array.isArray(data[name])) data[name] = [];
      if (!loadedCollections.has(name)) {
        await loadCollections([name]);
      }
      prepareCollectionInPlace(data[name]);
      const itemsSnapshot = clone(data[name]);
      const write = enqueueWrite(
        () => persistence.replaceItems(name, itemsSnapshot),
        [name],
        options,
        `save ${name}`
      );
      if (write) await write;
    },
    snapshot() {
      return clone(data);
    },
    collectionNames,
    refreshFromDatabase,
    deferCollectionRefresh,
    async close() {
      await syncChain.catch(() => {});
      await writeChain.catch(() => {});
      await persistence.close();
    }
  };
}
