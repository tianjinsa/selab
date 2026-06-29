const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const seed = require('../seed');

const dataDir = path.resolve(__dirname, '../../data');
const dataFile = path.join(dataDir, 'db.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2), 'utf8');
  }
}

function load() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function save(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function reset() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2), 'utf8');
  return clone(seed);
}

function id(prefix) {
  return `${prefix}_${uuid().slice(0, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function withoutPassword(user) {
  if (!user) return null;
  const next = { ...user };
  delete next.passwordHash;
  return next;
}

function getUser(data, userId) {
  return data.users.find((item) => item.id === userId);
}

function addNotification(data, input) {
  const notice = {
    id: id('notice'),
    read: false,
    createdAt: now(),
    ...input
  };
  data.notifications.unshift(notice);
  return notice;
}

function audit(data, input) {
  const item = {
    id: id('audit'),
    createdAt: now(),
    ...input
  };
  data.audits.unshift(item);
  return item;
}

function publicTask(data, task) {
  const publisher = withoutPassword(getUser(data, task.publisherId));
  const assignee = withoutPassword(getUser(data, task.assigneeId));
  return { ...task, publisher, assignee };
}

function publicPost(data, post) {
  const author = withoutPassword(getUser(data, post.authorId));
  const postComments = data.comments
    .filter((item) => item.postId === post.id)
    .map((item) => ({ ...item, author: withoutPassword(getUser(data, item.authorId)) }));
  return { ...post, author, commentCount: postComments.length, comments: postComments };
}

function publicGoods(data, item) {
  const seller = withoutPassword(getUser(data, item.sellerId));
  return { ...item, seller };
}

module.exports = {
  clone,
  load,
  save,
  reset,
  id,
  now,
  withoutPassword,
  getUser,
  addNotification,
  audit,
  publicTask,
  publicPost,
  publicGoods
};
