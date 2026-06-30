import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError, forbidden } from '../utils/errors.js';

export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(String(password), passwordHash);
}

export function signUserToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'user', studentId: user.studentId },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function signAdminToken() {
  return jwt.sign(
    { sub: 'admin', type: 'admin' },
    config.adminJwtSecret,
    { expiresIn: '8h' }
  );
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, '请先登录');
  }
  return token;
}

export function requireUser(req, _res, next) {
  try {
    const token = bearerToken(req);
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.type !== 'user') throw new ApiError(401, '用户 Token 无效');
    const user = req.store.collection('users').find((item) => item.id === payload.sub);
    if (!user) throw new ApiError(401, '登录用户不存在');
    if (user.isBanned) throw forbidden('账号已被封禁，无法继续操作');
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(new ApiError(401, '登录状态已失效，请重新登录'));
  }
}

export function requireAdmin(req, _res, next) {
  try {
    const token = bearerToken(req);
    const payload = jwt.verify(token, config.adminJwtSecret);
    if (payload.type !== 'admin') throw new ApiError(401, '管理员 Token 无效');
    req.admin = { username: config.adminAccount.username };
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(new ApiError(401, '管理员登录状态已失效'));
  }
}

export function verifyUserToken(token, store) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.type !== 'user') throw new ApiError(401, '用户 Token 无效');
  const user = store.collection('users').find((item) => item.id === payload.sub);
  if (!user || user.isBanned) throw new ApiError(401, '用户不可用');
  return user;
}
