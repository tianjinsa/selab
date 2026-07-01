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

export function signAdminToken(principal = {}) {
  const type = principal.type === 'counselor' ? 'counselor' : 'admin';
  return jwt.sign(
    { sub: principal.id || 'admin', type },
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
    req.admin = { username: config.adminAccount.username, role: 'admin' };
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(new ApiError(401, '管理员登录状态已失效'));
  }
}

export function requireAdminPrincipal(req, _res, next) {
  try {
    const token = bearerToken(req);
    const payload = jwt.verify(token, config.adminJwtSecret);
    if (payload.type === 'admin') {
      req.admin = { username: config.adminAccount.username, role: 'admin' };
      return next();
    }
    if (payload.type === 'counselor') {
      const counselor = req.store.collection('counselorAccounts')
        .find((item) => item.id === payload.sub && !item.deletedAt && item.enabled !== false);
      if (!counselor) throw new ApiError(401, '导员账号不存在或已停用');
      req.admin = {
        id: counselor.id,
        username: counselor.username,
        name: counselor.name,
        role: 'counselor',
        collegeId: counselor.collegeId
      };
      req.counselor = counselor;
      return next();
    }
    throw new ApiError(401, '后台 Token 无效');
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(new ApiError(401, '后台登录状态已失效'));
  }
}

export function requireCounselor(req, _res, next) {
  try {
    const token = bearerToken(req);
    const payload = jwt.verify(token, config.adminJwtSecret);
    if (payload.type !== 'counselor') throw new ApiError(401, '导员 Token 无效');
    const counselor = req.store.collection('counselorAccounts')
      .find((item) => item.id === payload.sub && !item.deletedAt && item.enabled !== false);
    if (!counselor) throw new ApiError(401, '导员账号不存在或已停用');
    req.counselor = counselor;
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    next(new ApiError(401, '导员登录状态已失效'));
  }
}

export function verifyUserToken(token, store) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.type !== 'user') throw new ApiError(401, '用户 Token 无效');
  const user = store.collection('users').find((item) => item.id === payload.sub);
  if (!user || user.isBanned) throw new ApiError(401, '用户不可用');
  return user;
}
