import express from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError, badRequest } from '../utils/errors.js';
import { requireUser } from '../services/auth.js';
import { getFileBlob, safeUploadFilename, saveFileBlob } from '../services/fileBlobs.js';

const router = express.Router();
const storage = multer.memoryStorage();

const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
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
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!imageMimeTypes.has(file.mimetype) && !imageExtensions.has(ext)) {
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
  const originalExt = path.extname(file.originalname || '').toLowerCase();
  const ext = kind === 'image'
    ? imageExtension(file.mimetype, originalExt)
    : attachmentExtensions.has(originalExt)
      ? originalExt
      : fallbackExtension(file.mimetype);
  const filename = `${Date.now()}-${randomUUID()}${ext}`;
  const url = `/uploads/${filename}`;
  const assetId = randomUUID();
  await saveFileBlob({
    filename,
    assetId,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    kind,
    buffer: file.buffer
  });
  const asset = await req.store.insert('fileAssets', {
    id: assetId,
    userId: req.user.id,
    url,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    kind
  });
  return { asset, url };
}

export const serveUploadedFile = asyncHandler(async (req, res) => {
  const filename = safeUploadFilename(req.params.filename);
  if (!filename) throw new ApiError(404, '文件不存在');

  const file = await getFileBlob(filename);
  if (!file) throw new ApiError(404, '文件不存在');

  const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
  const mimeType = file.mimeType || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(file.size || content.length));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (file.kind !== 'image') {
    const downloadName = encodeURIComponent(file.originalName || file.filename || 'download');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${downloadName}`);
  }
  res.end(content);
});

function imageExtension(mimeType, originalExt = '') {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (imageExtensions.has(originalExt)) return originalExt === '.jpeg' ? '.jpg' : originalExt;
  return '.jpg';
}

function fallbackExtension(mimeType) {
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'text/plain') return '.txt';
  if (mimeType === 'text/csv') return '.csv';
  return '.bin';
}

export default router;
