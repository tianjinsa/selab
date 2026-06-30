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
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      cb(badRequest('仅支持 jpg、jpeg、png、webp 图片'));
      return;
    }
    cb(null, true);
  }
});

router.post('/upload', requireUser, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('请选择要上传的图片');
  await fs.mkdir(config.uploadDir, { recursive: true });
  const ext = req.file.mimetype === 'image/png'
    ? '.png'
    : req.file.mimetype === 'image/webp'
      ? '.webp'
      : '.jpg';
  const filename = `${Date.now()}-${randomUUID()}${ext}`;
  const target = path.join(config.uploadDir, filename);
  await fs.writeFile(target, req.file.buffer);
  const url = `/uploads/${filename}`;
  const asset = await req.store.insert('fileAssets', {
    userId: req.user.id,
    url,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size
  });
  res.status(201).json({ asset, url });
}));

export default router;
