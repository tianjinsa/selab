const sql = require('mssql');

const config = {
  server: process.env.SQLSERVER_HOST || 'localhost',
  port: Number(process.env.SQLSERVER_PORT || 8887),
  user: process.env.SQLSERVER_USER || 'sa',
  password: process.env.SQLSERVER_PASSWORD || '123456Aa',
  database: process.env.SQLSERVER_DATABASE || 'CampusSmartLife',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

let poolPromise = null;

function enabled() {
  return String(process.env.USE_SQLSERVER || 'false').toLowerCase() === 'true';
}

async function getPool() {
  if (!enabled()) return null;
  if (!poolPromise) poolPromise = sql.connect(config);
  return poolPromise;
}

module.exports = {
  sql,
  config,
  enabled,
  getPool
};
