require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { sql, config } = require('../services/sqlServer');

function quoteName(value) {
  return `[${String(value).replace(/]/g, ']]')}]`;
}

function quoteString(value) {
  return String(value).replace(/'/g, "''");
}

function splitBatches(script) {
  return script
    .split(/^\s*GO\s*;?\s*$/gim)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main() {
  const database = process.env.SQLSERVER_DATABASE || config.database || 'CampusSmartLifeDB';
  const adminDatabase = process.env.SQLSERVER_ADMIN_DATABASE || 'tempdb';
  const databaseName = quoteName(database);
  const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
  const adminConfig = { ...config, database: adminDatabase };
  const targetConfig = { ...config, database };

  console.log(`[db:init] Target database: ${database}`);
  console.log(`[db:init] Connecting through ${adminDatabase} database...`);

  const adminPool = await new sql.ConnectionPool(adminConfig).connect();
  try {
    console.log('[db:init] Dropping old database if it exists...');
    await adminPool.request().batch(`
IF DB_ID(N'${quoteString(database)}') IS NOT NULL
BEGIN
  ALTER DATABASE ${databaseName} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE ${databaseName};
END;
`);

    console.log('[db:init] Creating fresh database...');
    await adminPool.request().batch(`CREATE DATABASE ${databaseName};`);
  } finally {
    await adminPool.close();
  }

  console.log('[db:init] Creating tables...');
  const targetPool = await new sql.ConnectionPool(targetConfig).connect();
  try {
    const batches = splitBatches(fs.readFileSync(schemaPath, 'utf8'));
    for (const [index, batch] of batches.entries()) {
      await targetPool.request().batch(batch);
      console.log(`[db:init] Applied schema batch ${index + 1}/${batches.length}`);
    }
  } finally {
    await targetPool.close();
  }

  console.log(`[db:init] Database ${database} has been rebuilt successfully.`);
}

main().catch((error) => {
  console.error(`[db:init] Failed: ${error.message}`);
  process.exit(1);
});
