import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireUser } from '../services/auth.js';
import { walletSummary, withdrawWallet } from '../services/wallet.js';

const router = express.Router();

router.get('/', requireUser, asyncHandler(async (req, res) => {
  res.json(walletSummary(req.store, req.user.id));
}));

router.post('/withdrawals', requireUser, asyncHandler(async (req, res) => {
  const transaction = await withdrawWallet(req.store, req.user, req.body);
  res.status(201).json({
    transaction,
    wallet: walletSummary(req.store, req.user.id)
  });
}));

export default router;
