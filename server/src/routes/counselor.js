import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireCounselor } from '../services/auth.js';
import {
  getCounselorAlertDetail,
  getCounselorMe,
  listCounselorAlerts,
  updateOwnCounselorRanges
} from '../services/counselor.js';

const router = express.Router();

router.get('/me', requireCounselor, asyncHandler(async (req, res) => {
  res.json({ counselor: getCounselorMe(req.store, req.counselor.id) });
}));

router.patch('/ranges', requireCounselor, asyncHandler(async (req, res) => {
  res.json({ counselor: await updateOwnCounselorRanges(req.store, req.counselor.id, req.body.ranges || []) });
}));

router.get('/alerts', requireCounselor, asyncHandler(async (req, res) => {
  res.json({ alerts: listCounselorAlerts(req.store, req.counselor.id, req.query) });
}));

router.get('/alerts/:id', requireCounselor, asyncHandler(async (req, res) => {
  res.json(await getCounselorAlertDetail(req.store, req.counselor.id, req.params.id));
}));

export default router;
