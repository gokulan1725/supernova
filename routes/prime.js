/* ============================================================
   routes/prime.js  — ShopNova Prime VIP Membership API
   ============================================================
   GET  /api/prime/status       Check Prime membership status
   POST /api/prime/join         Join Prime ($9.99/mo or $99/yr)
   POST /api/prime/cancel       Cancel Prime membership
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function(authenticate, readDB, writeDB) {

  function ensurePrime(db) {
    if (!db.primeMembers) { db.primeMembers = {}; writeDB(db); }
  }

  /* ── Status ───────────────────────────────────────────── */
  router.get('/status', authenticate, (req, res) => {
    const db = readDB();
    ensurePrime(db);
    const member = db.primeMembers[req.userId];
    const isPrime = Boolean(member && member.status === 'active' && new Date(member.expiresAt) > new Date());

    res.json({
      success: true,
      data: {
        isPrime,
        tier: isPrime ? (member.plan === 'yearly' ? 'Prime VIP' : 'Prime Monthly') : 'Standard',
        expiresAt: isPrime ? member.expiresAt : null,
        benefits: [
          '⚡ Free 1-Day Express Shipping on all orders',
          '🏷️ Extra 10% Instant Discount on all products',
          '🔥 30-Minute Early Access to Flash Deals',
          '🎧 VIP Customer Support Response (< 15 mins)'
        ]
      }
    });
  });

  /* ── Join Prime ───────────────────────────────────────── */
  router.post('/join', authenticate, (req, res) => {
    const { plan = 'monthly' } = req.body;
    const db = readDB();
    ensurePrime(db);

    const durationDays = plan === 'yearly' ? 365 : 30;
    const expiresAt    = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    db.primeMembers[req.userId] = {
      userId:    req.userId,
      plan,
      status:    'active',
      joinedAt:  new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      autoRenew: true
    };

    // Update user tier in DB
    const user = db.users.find(u => u.id === req.userId);
    if (user) user.tier = 'Prime VIP';

    writeDB(db);

    res.json({
      success: true,
      message: `👑 Welcome to ShopNova Prime! You now enjoy Free 1-Day Shipping and 10% Extra Discount on all orders.`,
      data: db.primeMembers[req.userId]
    });
  });

  /* ── Cancel Prime ─────────────────────────────────────── */
  router.post('/cancel', authenticate, (req, res) => {
    const db = readDB();
    ensurePrime(db);
    if (db.primeMembers[req.userId]) {
      db.primeMembers[req.userId].autoRenew = false;
      writeDB(db);
    }
    res.json({ success: true, message: 'Prime auto-renewal turned off. Your benefits remain active until the end of your billing cycle.' });
  });

  return router;
};
