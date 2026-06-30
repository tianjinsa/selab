import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/errors.js';
import { requireUser } from '../services/auth.js';

const router = express.Router();
const storage = multer.memoryStorage();

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const attachmentMimeTypes = new Set([
  ...imageMimeTypes,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar'
]);
const attachmentExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar'
]);

const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!imageMimeTypes.has(file.mimetype)) {
      cb(badRequest('仅支持 jpg、jpeg、png、webp 图片'));
      return;
    }
    cb(null, true);
  }
});

const attachmentUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!attachmentMimeTypes.has(file.mimetype) && !attachmentExtensions.has(ext)) {
      cb(badRequest('仅支持图片、PDF、Office 文档、文本、CSV、ZIP 或 RAR 文件'));
      return;
    }
    cb(null, true);
  }
});

router.post('/upload', requireUser, imageUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('请选择要上传的图片');
  const result = await saveUploadedFile(req, req.file, 'image');
  res.status(201).json(result);
}));

router.post('/upload-attachment', requireUser, attachmentUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('请选择要上传的附件');
  const kind = imageMimeTypes.has(req.file.mimetype) ? 'image' : 'file';
  const result = await saveUploadedFile(req, req.file, kind);
  res.status(201).json(result);
}));

async function saveUploadedFile(req, file, kind) {
  await fs.mkdir(config.uploadDir, { recursive: true });
  const originalExt = path.extname(file.originalname || '').toLowerCase();
  const ext = kind === 'image'
    ? imageExtension(file.mimetype)
    : attachmentExtensions.has(originalExt)
      ? originalExt
      : fallbackExtension(file.mimetype);
  const filename = `${Date.now()}-${randomUUID()}${ext}`;
  const target = path.join(config.uploadDir, filename);
  await fs.writeFile(target, file.buffer);
  const url = `/uploads/${filename}`;
  const asset = await req.store.insert('fileAssets', {
    userId: req.user.id,
    url,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    kind
  });
  return { asset, url };
}

function imageExtension(mimeType) {
  return mimeType === 'image/png'
    ? '.png'
    : mimeType === 'image/webp'
      ? '.webp'
      : '.jpg';
}

function fallbackExtension(mimeType) {
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'text/plain') return '.txt';
  if (mimeType === 'text/csv') return '.csv';
  return '.bin';
}

export default router;
