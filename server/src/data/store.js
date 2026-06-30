import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { config } from '../config.js';
import { collectionNames, createEmptyData, normalizeData } from './defaultData.js';

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

async function createSqlPersistence() {
  const master = await new sql.ConnectionPool(sqlConfig('master')).connect();
  try {
    const databaseName = config.db.database.replaceAll(']', ']]');
    await master.request().query(`
      IF DB_ID(N'${config.db.database.replaceAll("'", "''")}') IS NULL
      BEGIN
        CREATE DATABASE [${databaseName}]
      END
    `);
  } finally {
    await master.close();
  }

  const pool = await new sql.ConnectionPool(sqlConfig(config.db.database)).connect();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.AppCollections', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AppCollections (
        name NVARCHAR(100) NOT NULL PRIMARY KEY,
        payload NVARCHAR(MAX) NOT NULL,
        updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      )
    END
  `);

  return {
    mode: 'sqlserver',
    async load() {
      const result = await pool.request().query('SELECT name, payload FROM dbo.AppCollections');
      const data = createEmptyData();
      for (const row of result.recordset) {
        try {
          data[row.name] = JSON.parse(row.payload);
        } catch {
          data[row.name] = row.name === 'settings' ? createEmptyData().settings : [];
        }
      }
      return normalizeData(data);
    },
    async save(name, payload) {
      const json = JSON.stringify(payload);
      await pool.request()
        .input('name', sql.NVarChar(100), name)
        .input('payload', sql.NVarChar(sql.MAX), json)
        .query(`
          MERGE dbo.AppCollections AS target
          USING (SELECT @name AS name, @payload AS payload) AS source
          ON target.name = source.name
          WHEN MATCHED THEN
            UPDATE SET payload = source.payload, updatedAt = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (name, payload) VALUES (source.name, source.payload);
        `);
    },
    async close() {
      await pool.close();
    }
  };
}

async function createFilePersistence() {
  const dataDir = path.resolve(config.rootDir, 'data');
  const dataFile = path.join(dataDir, 'app-data.json');
  await fs.mkdir(dataDir, { recursive: true });

  return {
    mode: 'file',
    async load() {
      try {
        const content = await fs.readFile(dataFile, 'utf8');
        return normalizeData(JSON.parse(content));
      } catch {
        const data = createEmptyData();
        await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
        return normalizeData(data);
      }
    },
    async save(_name, _payload, fullData) {
      await fs.writeFile(dataFile, JSON.stringify(fullData, null, 2), 'utf8');
    },
    async close() {}
  };
}

export async function createStore() {
  let persistence;
  let status;
  try {
    persistence = await createSqlPersistence();
    status = {
      mode: 'sqlserver',
      ok: true,
      message: `SQL Server 已连接：${config.db.host}:${config.db.port}/${config.db.database}`
    };
  } catch (error) {
    persistence = await createFilePersistence();
    status = {
      mode: 'file',
      ok: false,
      message: `SQL Server 不可用，已启用本地演示数据：${error.message}`
    };
  }

  const data = await persistence.load();

  async function persist(name) {
    await persistence.save(name, data[name], data);
  }

  return {
    status,
    data,
    collection(name) {
      if (name === 'settings') return data.settings;
      if (!Array.isArray(data[name])) data[name] = [];
      return data[name];
    },
    async insert(name, item) {
      if (!Array.isArray(data[name])) data[name] = [];
      const next = {
        id: item.id || randomUUID(),
        createdAt: item.createdAt || now(),
        updatedAt: item.updatedAt || now(),
        ...item
      };
      data[name].push(next);
      await persist(name);
      return next;
    },
    async update(name, id, patch) {
      if (!Array.isArray(data[name])) data[name] = [];
      const index = data[name].findIndex((item) => item.id === id);
      if (index < 0) return null;
      data[name][index] = {
        ...data[name][index],
        ...patch,
        updatedAt: now()
      };
      await persist(name);
      return data[name][index];
    },
    async replaceCollection(name, items) {
      data[name] = items;
      await persist(name);
      return items;
    },
    async updateSettings(patch) {
      data.settings = {
        ...data.settings,
        ...patch,
        updatedAt: now()
      };
      await persist('settings');
      return data.settings;
    },
    async saveCollection(name) {
      await persist(name);
    },
    snapshot() {
      return JSON.parse(JSON.stringify(data));
    },
    collectionNames,
    async close() {
      await persistence.close();
    }
  };
}
