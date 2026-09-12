/* ============================================================
   routes/groupbuying.js  — Social Group Buying / Team Deals API
   ============================================================
   GET  /api/teamdeals                List active team deals
   GET  /api/teamdeals/:id            Team deal status & members
   POST /api/teamdeals/create         Start a team deal for a product
   POST /api/teamdeals/:id/join       Join an existing team deal
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

const SEED_TEAM_DEALS = [
  {
    id: 'td1',
    productId: 1,
    productName: 'Sony WH-1000XM5 Wireless Headphones',
    originalPrice: 349.99,
    teamPrice: 262.49, // 25% off
    discountPercent: 25,
    requiredMembers: 3,
    members: [
      { userId: 'u1', name: 'John Doe', joinedAt: new Date().toISOString() }
    ],
    status: 'open',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }
];

module.exports = function(authenticate, readDB, writeDB) {

  function ensureTeamDeals(db) {
    if (!db.teamDeals) { db.teamDeals = SEED_TEAM_DEALS; writeDB(db); }
  }

  /* ── List Active Team Deals ────────────────────────────── */
  router.get('/', (req, res) => {
    const db = readDB();
    ensureTeamDeals(db);
    const active = db.teamDeals.filter(td => td.status === 'open' && new Date(td.expiresAt) > new Date());
    res.json({ success: true, data: active, total: active.length });
  });

  /* ── Single Team Deal ──────────────────────────────────── */
  router.get('/:id', (req, res) => {
    const db = readDB();
    ensureTeamDeals(db);
    const deal = db.teamDeals.find(td => td.id === req.params.id);
    if (!deal) return res.status(404).json({ success: false, error: 'Team deal not found' });
    const product = db.products.find(p => p.id === deal.productId);
    res.json({ success: true, data: { ...deal, product } });
  });

  /* ── Start Team Deal ───────────────────────────────────── */
  router.post('/create', authenticate, (req, res) => {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, error: 'productId is required' });

    const db = readDB();
    ensureTeamDeals(db);

    const product = db.products.find(p => p.id === parseInt(productId));
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const user = db.users.find(u => u.id === req.userId) || { name: 'Shopper' };
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24-hour limit

    const newDeal = {
      id:              'td' + Date.now(),
      productId:       product.id,
      productName:     product.name,
      originalPrice:   product.price,
      teamPrice:       parseFloat((product.price * 0.75).toFixed(2)),
      discountPercent: 25,
      requiredMembers: 3,
      members: [
        { userId: req.userId, name: user.name, joinedAt: new Date().toISOString() }
      ],
      status:    'open',
      expiresAt: expiresAt.toISOString()
    };

    db.teamDeals.unshift(newDeal);
    writeDB(db);

    res.status(201).json({
      success: true,
      message: '👥 Team Deal started! Invite 2 friends to get 25% OFF!',
      data: newDeal
    });
  });

  /* ── Join Team Deal ────────────────────────────────────── */
  router.post('/:id/join', authenticate, (req, res) => {
    const db = readDB();
    ensureTeamDeals(db);
    const deal = db.teamDeals.find(td => td.id === req.params.id && td.status === 'open');

    if (!deal) return res.status(404).json({ success: false, error: 'Team deal not found or closed' });
    if (new Date(deal.expiresAt) < new Date()) {
      deal.status = 'expired';
      writeDB(db);
      return res.status(400).json({ success: false, error: 'Team deal expired' });
    }

    if (deal.members.some(m => m.userId === req.userId)) {
      return res.status(400).json({ success: false, error: 'You have already joined this team deal!' });
    }

    const user = db.users.find(u => u.id === req.userId) || { name: 'Shopper' };
    deal.members.push({ userId: req.userId, name: user.name, joinedAt: new Date().toISOString() });

    if (deal.members.length >= deal.requiredMembers) {
      deal.status = 'completed';
    }

    writeDB(db);

    res.json({
      success: true,
      message: deal.status === 'completed'
        ? '🎉 Team Deal Completed! All 3 members get 25% OFF!'
        : `Joined! ${deal.requiredMembers - deal.members.length} more member(s) needed.`,
      data: deal
    });
  });

  return router;
};
