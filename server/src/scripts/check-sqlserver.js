require('dotenv').config();

const { getPool, config } = require('../services/sqlServer');

process.env.USE_SQLSERVER = 'true';

getPool()
  .then(async (pool) => {
    const result = await pool.request().query('SELECT 1 AS ok');
    console.log(`SQL Server connected: ${config.server}:${config.port}`);
    console.log(JSON.stringify(result.recordset[0]));
    await pool.close();
  })
  .catch((error) => {
    console.error(`SQL Server connection failed: ${error.message}`);
    process.exit(1);
  });
