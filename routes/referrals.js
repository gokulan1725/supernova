/* ============================================================
    routes/referrals.js  — Referral & Invite Program API
    ============================================================
    GET  /api/referrals/me            Get my referral stats
    POST /api/referrals/apply         Apply referral code at checkout
    POST /api/referrals/register      Register a referral code for a user
    ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function(authenticate, readDB, writeDB) {

  function ensureReferrals(db) {
    if (!db.referrals) db.referrals = {};
  }

  /* ── Get my referral stats ──────────────────────────────── */
  router.get('/me', authenticate, (req, res) => {
    const db = readDB();
    ensureReferrals(db);
    const user = db.users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const myCode = db.referrals[req.userId] || { code: null, uses: [], totalEarned: 0 };
    res.json({ success: true, data: myCode });
  });

  /* ── Register referral code for user ────────────────────── */
  router.post('/register', authenticate, (req, res) => {
    const db = readDB();
    ensureReferrals(db);
    const user = db.users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (db.referrals[req.userId]) {
      return res.json({ success: true, data: db.referrals[req.userId] });
    }

    const code = 'SN-' + user.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) + '-' + Math.floor(100 + Math.random() * 900);
    db.referrals[req.userId] = { code, uses: [], totalEarned: 0 };
    writeDB(db);

    res.json({ success: true, data: db.referrals[req.userId] });
  });

  /* ── Apply referral code ────────────────────────────────── */
  router.post('/apply', authenticate, (req, res) => {
    const { code } = req.body;
    if (!code || code.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Invalid referral code.' });
    }

    const db = readDB();
    ensureReferrals(db);
    const clean = code.trim().toUpperCase();

    const referrerId = Object.keys(db.referrals).find(uid => db.referrals[uid].code === clean);
    if (!referrerId) {
      return res.status(404).json({ success: false, error: 'Referral code not found.' });
    }

    if (referrerId === req.userId) {
      return res.status(400).json({ success: false, error: 'You cannot use your own referral code.' });
    }

    const existingUses = db.referrals[referrerId].uses || [];
    if (existingUses.length >= 50) {
      return res.status(400).json({ success: false, error: 'This referral code has reached its maximum uses.' });
    }

    const alreadyUsed = existingUses.some(u => u.userId === req.userId);
    if (alreadyUsed) {
      return res.status(400).json({ success: false, error: 'You have already used this referral code.' });
    }

    db.referrals[referrerId].uses.push({ userId: req.userId, date: new Date().toISOString().split('T')[0], reward: 10 });
    db.referrals[referrerId].totalEarned += 10;
    writeDB(db);

    res.json({ success: true, discount: 10, message: 'Referral applied! You saved $10.' });
  });

  return router;
};
