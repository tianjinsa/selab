const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('./store');

const secret = () => process.env.JWT_SECRET || 'campus-smart-life-secret';

function sign(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: '7d' });
}

function verify(token) {
  return jwt.verify(token, secret());
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: '请先登录' });
  try {
    const payload = verify(token);
    const data = store.load();
    const user = data.users.find((item) => item.id === payload.sub);
    if (!user) return res.status(401).json({ success: false, message: '登录状态已失效' });
    req.user = user;
    req.data = data;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: '登录状态已失效' });
  }
}

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: '需要管理员权限' });
    return next();
  });
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, user) {
  return bcrypt.compareSync(password, user.passwordHash);
}

module.exports = {
  sign,
  verify,
  requireAuth,
  requireAdmin,
  hashPassword,
  comparePassword
};
