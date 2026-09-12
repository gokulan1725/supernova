/* ============================================================
   routes/loyalty.js  — Loyalty Points & Rewards System
   ============================================================
   GET  /api/loyalty/me             User's points balance & history
   GET  /api/loyalty/tiers          Tier definitions
   POST /api/loyalty/redeem         Redeem points for discount
   GET  /api/loyalty/leaderboard    Top earners (optional)
   ============================================================
   Earning rules:
     - $1 spent  = 10 points
     - Review    = 50 points
     - Register  = 100 points (welcome bonus)
     - Referral  = 200 points
   Redemption:
     - 100 points = $1 discount
   Tiers: Bronze(0) → Silver(1000) → Gold(5000) → Platinum(15000)
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

const TIERS = [
  { name: 'Bronze',   minPoints: 0,     icon: '🥉', color: '#CD7F32', perks: ['Early access to sales'] },
  { name: 'Silver',   minPoints: 1000,  icon: '🥈', color: '#C0C0C0', perks: ['5% extra discount', 'Priority support'] },
  { name: 'Gold',     minPoints: 5000,  icon: '🥇', color: '#FFD700', perks: ['10% extra discount', 'Free express shipping', 'Birthday bonus'] },
  { name: 'Platinum', minPoints: 15000, icon: '💎', color: '#E5E4E2', perks: ['15% extra discount', 'Free overnight shipping', 'Dedicated support', 'Exclusive products'] }
];

const EARN_RULES = {
  purchase:  1,     // 1 point per ₹10 spent (applied as Math.floor(total/10))
  review:    50,    // per review
  register:  100,   // one-time welcome
  referral:  200,   // per successful referral
};

const REDEEM_RATE = 100; // 100 points = ₹100

module.exports = function (authenticate, requireAdmin, readDB, writeDB) {

  function ensureLoyalty(db) {
    if (!db.loyalty) { db.loyalty = {}; writeDB(db); }
  }

  function getUserLoyalty(db, userId) {
    if (!db.loyalty[userId]) {
      db.loyalty[userId] = { points: 0, lifetimePoints: 0, history: [] };
    }
    return db.loyalty[userId];
  }

  function getTier(points) {
    let tier = TIERS[0];
    for (const t of TIERS) { if (points >= t.minPoints) tier = t; }
    return tier;
  }

  function addPoints(db, userId, amount, reason, ref = null) {
    ensureLoyalty(db);
    const loyalty = getUserLoyalty(db, userId);
    loyalty.points          += amount;
    loyalty.lifetimePoints  += amount;
    loyalty.history.unshift({
      id:       'lh' + Date.now() + Math.random(),
      type:     'earn',
      amount,
      reason,
      ref,
      date:     new Date().toISOString()
    });
    // Update tier on user record
    const userIdx = db.users.findIndex(u => u.id === userId);
    if (userIdx !== -1) db.users[userIdx].tier = getTier(loyalty.lifetimePoints).name;
    return loyalty;
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/loyalty/tiers
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/tiers', (req, res) => {
    res.json({ success: true, data: TIERS, earnRules: EARN_RULES, redeemRate: REDEEM_RATE });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/loyalty/me  — current user's loyalty data
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/me', authenticate, (req, res) => {
    const db      = readDB();
    ensureLoyalty(db);
    const loyalty = getUserLoyalty(db, req.userId);
    const tier    = getTier(loyalty.lifetimePoints);
    const nextTier = TIERS[TIERS.indexOf(tier) + 1] || null;

    res.json({
      success: true,
      data: {
        points:           loyalty.points,
        lifetimePoints:   loyalty.lifetimePoints,
        history:          loyalty.history.slice(0, 50),
        redeemableValue:  parseFloat((loyalty.points / REDEEM_RATE).toFixed(2)),
        tier,
        nextTier,
        pointsToNextTier: nextTier ? nextTier.minPoints - loyalty.lifetimePoints : 0
      }
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/loyalty/earn  — internal endpoint to award points
     Body: { userId, amount, reason, ref }
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/earn', requireAdmin, (req, res) => {
    const db     = readDB();
    const { userId, amount, reason, ref } = req.body;
    if (!userId || !amount) return res.status(400).json({ success: false, error: 'userId and amount required' });
    ensureLoyalty(db);
    const loyalty = addPoints(db, userId, parseInt(amount), reason || 'Manual award', ref);
    writeDB(db);
    res.json({ success: true, data: loyalty });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/loyalty/redeem
     Body: { points }  — convert points to a discount coupon
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/redeem', authenticate, (req, res) => {
    const db     = readDB();
    ensureLoyalty(db);
    const { points } = req.body;
    const toRedeem   = parseInt(points || 0);

    if (!toRedeem || toRedeem < 100) {
      return res.status(400).json({ success: false, error: 'Minimum redemption is 100 points ($1)' });
    }

    const loyalty = getUserLoyalty(db, req.userId);
    if (loyalty.points < toRedeem) {
      return res.status(400).json({ success: false, error: `Insufficient points (have ${loyalty.points}, need ${toRedeem})` });
    }

    const discountValue = parseFloat((toRedeem / REDEEM_RATE).toFixed(2));

    // Deduct points
    loyalty.points -= toRedeem;
    loyalty.history.unshift({
      id:     'lh' + Date.now(),
      type:   'redeem',
      amount: -toRedeem,
      reason: `Redeemed for $${discountValue} discount`,
      date:   new Date().toISOString()
    });
    writeDB(db);

    // Return a one-time coupon code (stored in DB)
    const couponCode = 'POINTS' + toRedeem + Date.now().toString().slice(-4);
    if (!db.coupons) db.coupons = [];
    db.coupons.push({
      id:        'cp' + Date.now(),
      code:      couponCode,
      type:      'fixed',
      value:     discountValue,
      label:     `Loyalty Points Redemption ($${discountValue})`,
      minOrder:  0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      active:    true,
      userId:    req.userId,
      createdAt: new Date().toISOString()
    });
    writeDB(db);

    res.json({
      success: true,
      message: `Redeemed ${toRedeem} points for $${discountValue} discount!`,
      data: {
        couponCode,
        discountValue,
        pointsUsed:      toRedeem,
        remainingPoints: loyalty.points,
        expiresIn:       '30 days'
      }
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/loyalty/leaderboard  — top 10 loyalty members
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/leaderboard', (req, res) => {
    const db = readDB();
    ensureLoyalty(db);

    const leaderboard = Object.entries(db.loyalty)
      .map(([userId, data]) => {
        const user = db.users.find(u => u.id === userId);
        return user ? {
          name:          user.name,
          avatar:        user.avatar,
          tier:          getTier(data.lifetimePoints),
          lifetimePoints:data.lifetimePoints,
          currentPoints: data.points
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.lifetimePoints - a.lifetimePoints)
      .slice(0, 10);

    res.json({ success: true, data: leaderboard });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Expose addPoints for internal use by other routes
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router._addPoints = addPoints;

  return router;
};
