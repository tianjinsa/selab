import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { config } from '../config.js';

const FILENAME_MAX = 260;
const MIME_TYPE_MAX = 160;
const KIND_MAX = 30;
const LOCAL_UPLOADS_MIGRATION = 'local_uploads_to_blobs';

let pool = null;
let connecting = null;
let schemaReady = null;

function sqlConfig() {
  return {
    server: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
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

async function getPool() {
  if (pool?.connected) return pool;
  if (!connecting) {
    connecting = (async () => {
      const next = new sql.ConnectionPool(sqlConfig());
      next.on('error', (error) => {
        console.error('SQL Server file blob pool error:', error.message);
      });
      pool = await next.connect();
      schemaReady = null;
      return pool;
    })().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const activePool = await getPool();
      await activePool.request().query(`
        IF OBJECT_ID(N'dbo.AppFileBlobs', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.AppFileBlobs (
            filename NVARCHAR(${FILENAME_MAX}) NOT NULL CONSTRAINT PK_AppFileBlobs PRIMARY KEY,
            assetId NVARCHAR(100) NULL,
            originalName NVARCHAR(${FILENAME_MAX}) NULL,
            mimeType NVARCHAR(${MIME_TYPE_MAX}) NOT NULL,
            size BIGINT NOT NULL,
            kind NVARCHAR(${KIND_MAX}) NOT NULL,
            content VARBINARY(MAX) NOT NULL,
            createdAt DATETIME2 NOT NULL CONSTRAINT DF_AppFileBlobs_createdAt DEFAULT SYSUTCDATETIME(),
            updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppFileBlobs_updatedAt DEFAULT SYSUTCDATETIME()
          )
        END

        IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE name = N'IX_AppFileBlobs_AssetId'
            AND object_id = OBJECT_ID(N'dbo.AppFileBlobs')
        )
        BEGIN
          CREATE INDEX IX_AppFileBlobs_AssetId ON dbo.AppFileBlobs(assetId)
        END

        IF OBJECT_ID(N'dbo.AppFileBlobMigrations', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.AppFileBlobMigrations (
            name NVARCHAR(120) NOT NULL CONSTRAINT PK_AppFileBlobMigrations PRIMARY KEY,
            completedAt DATETIME2 NOT NULL CONSTRAINT DF_AppFileBlobMigrations_completedAt DEFAULT SYSUTCDATETIME()
          )
        END
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function saveFileBlob({ filename, assetId = '', originalName = '', mimeType, size, kind, buffer }) {
  const safeName = safeUploadFilename(filename);
  if (!safeName) throw new Error('Invalid upload filename');
  await ensureSchema();
  const activePool = await getPool();
  await activePool.request()
    .input('filename', sql.NVarChar(FILENAME_MAX), safeName)
    .input('assetId', sql.NVarChar(100), assetId || null)
    .input('originalName', sql.NVarChar(FILENAME_MAX), String(originalName || '').slice(0, FILENAME_MAX))
    .input('mimeType', sql.NVarChar(MIME_TYPE_MAX), String(mimeType || 'application/octet-stream').slice(0, MIME_TYPE_MAX))
    .input('size', sql.BigInt, Number(size || buffer?.length || 0))
    .input('kind', sql.NVarChar(KIND_MAX), String(kind || 'file').slice(0, KIND_MAX))
    .input('content', sql.VarBinary(sql.MAX), buffer)
    .query(`
      MERGE dbo.AppFileBlobs WITH (HOLDLOCK) AS target
      USING (
        SELECT
          @filename AS filename,
          @assetId AS assetId,
          @originalName AS originalName,
          @mimeType AS mimeType,
          @size AS size,
          @kind AS kind,
          @content AS content
      ) AS source
      ON target.filename = source.filename
      WHEN MATCHED THEN
        UPDATE SET
          assetId = source.assetId,
          originalName = source.originalName,
          mimeType = source.mimeType,
          size = source.size,
          kind = source.kind,
          content = source.content,
          updatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (filename, assetId, originalName, mimeType, size, kind, content)
        VALUES (source.filename, source.assetId, source.originalName, source.mimeType, source.size, source.kind, source.content);
    `);
}

export async function getFileBlob(filename) {
  const safeName = safeUploadFilename(filename);
  if (!safeName) return null;
  await ensureSchema();
  const activePool = await getPool();
  const result = await activePool.request()
    .input('filename', sql.NVarChar(FILENAME_MAX), safeName)
    .query(`
      SELECT TOP 1 filename, assetId, originalName, mimeType, size, kind, content
      FROM dbo.AppFileBlobs
      WHERE filename = @filename
    `);
  return result.recordset[0] || null;
}

export async function hasFileBlob(filename) {
  const safeName = safeUploadFilename(filename);
  if (!safeName) return false;
  await ensureSchema();
  const activePool = await getPool();
  const result = await activePool.request()
    .input('filename', sql.NVarChar(FILENAME_MAX), safeName)
    .query('SELECT TOP 1 1 AS found FROM dbo.AppFileBlobs WHERE filename = @filename');
  return Boolean(result.recordset[0]);
}

export async function migrateLocalUploadsToDatabase(store) {
  await ensureSchema();
  await store.loadCollections?.(['fileAssets'], { force: true });
  const activePool = await getPool();
  if (await isMigrationCompleted(activePool, LOCAL_UPLOADS_MIGRATION)) return;

  const assets = store.collection('fileAssets');
  let migrated = 0;
  for (const asset of assets) {
    const filename = filenameFromUploadUrl(asset.url);
    if (!filename || await hasFileBlob(filename)) continue;

    const filePath = path.resolve(config.uploadDir, filename);
    if (!filePath.startsWith(config.uploadDir)) continue;

    let buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      continue;
    }

    await saveFileBlob({
      filename,
      assetId: asset.id,
      originalName: asset.originalName || filename,
      mimeType: asset.mimeType || 'application/octet-stream',
      size: asset.size || buffer.length,
      kind: asset.kind || 'file',
      buffer
    });
    migrated += 1;
  }

  if (migrated > 0) {
    console.log(`已迁移 ${migrated} 个上传文件到 SQL Server`);
  }
  await markMigrationCompleted(activePool, LOCAL_UPLOADS_MIGRATION);
}

export async function closeFileBlobStorage() {
  await connecting?.catch(() => {});
  await pool?.close().catch(() => {});
  pool = null;
  connecting = null;
  schemaReady = null;
}

export function safeUploadFilename(filename) {
  const value = String(filename || '').trim();
  if (!value || value.length > FILENAME_MAX) return '';
  if (value !== path.basename(value)) return '';
  return value;
}

function filenameFromUploadUrl(url) {
  const value = String(url || '');
  if (!value.startsWith('/uploads/')) return '';
  return safeUploadFilename(decodeURIComponent(value.slice('/uploads/'.length)));
}

async function isMigrationCompleted(activePool, name) {
  const result = await activePool.request()
    .input('name', sql.NVarChar(120), name)
    .query('SELECT TOP 1 1 AS completed FROM dbo.AppFileBlobMigrations WHERE name = @name');
  return Boolean(result.recordset[0]);
}

async function markMigrationCompleted(activePool, name) {
  await activePool.request()
    .input('name', sql.NVarChar(120), name)
    .query(`
      MERGE dbo.AppFileBlobMigrations AS target
      USING (SELECT @name AS name) AS source
      ON target.name = source.name
      WHEN MATCHED THEN
        UPDATE SET completedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (name) VALUES (source.name);
    `);
}
