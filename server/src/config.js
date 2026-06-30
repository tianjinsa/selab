import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'campus-user-secret',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || 'campus-admin-secret',
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || 'uploads'),
  publicDir: path.resolve(rootDir, 'public'),
  adminAccount: {
    username: 'admin',
    password: '123456'
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 8887),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '123456Aa',
    database: process.env.DB_NAME || 'CampusLifeService',
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE || 'true') === 'true'
  }
};
