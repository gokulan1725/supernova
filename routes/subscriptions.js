/* ============================================================
   routes/subscriptions.js  — Subscription / Auto-Reorder
   ============================================================
   GET  /api/subscriptions           User's subscriptions
   GET  /api/subscriptions/:id       Single subscription
   POST /api/subscriptions           Create subscription
   PUT  /api/subscriptions/:id       Update (pause/frequency)
   DELETE /api/subscriptions/:id     Cancel subscription
   POST /api/subscriptions/:id/pause Pause / resume
   GET  /api/subscriptions/admin/all Admin: all subscriptions
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

const ELIGIBLE_CATEGORIES = ['grocery', 'beauty', 'sports', 'books'];
const FREQUENCIES = {
  weekly:    { label: 'Every Week',       days: 7,  extraDiscount: 5 },
  biweekly:  { label: 'Every 2 Weeks',    days: 14, extraDiscount: 5 },
  monthly:   { label: 'Every Month',      days: 30, extraDiscount: 5 },
  bimonthly: { label: 'Every 2 Months',   days: 60, extraDiscount: 5 }
};

module.exports = function(authenticate, requireAdmin, readDB, writeDB) {

  function ensureSubs(db) {
    if (!db.subscriptions) { db.subscriptions = []; writeDB(db); }
  }

  function enrichSub(sub, db) {
    const product = db.products.find(p => p.id === sub.productId) || null;
    const freq    = FREQUENCIES[sub.frequency] || FREQUENCIES.monthly;
    const discountedPrice = product
      ? parseFloat((product.price * (1 - freq.extraDiscount / 100)).toFixed(2))
      : sub.price;
    return { ...sub, product, frequencyLabel: freq.label, discountedPrice, extraDiscount: freq.extraDiscount };
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/subscriptions  — user's subscriptions
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/', authenticate, (req, res) => {
    const db   = readDB();
    ensureSubs(db);
    const subs = db.subscriptions.filter(s => s.userId === req.userId);
    res.json({ success: true, data: subs.map(s => enrichSub(s, db)), total: subs.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/subscriptions/eligible-categories
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/eligible-categories', (req, res) => {
    res.json({ success: true, data: ELIGIBLE_CATEGORIES });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/subscriptions/frequencies
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/frequencies', (req, res) => {
    res.json({ success: true, data: FREQUENCIES });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/subscriptions/admin/all  — admin
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/admin/all', requireAdmin, (req, res) => {
    const db   = readDB();
    ensureSubs(db);
    const enriched = db.subscriptions.map(s => {
      const user = db.users.find(u => u.id === s.userId);
      return { ...enrichSub(s, db), userName: user?.name, userEmail: user?.email };
    });
    res.json({ success: true, data: enriched, total: enriched.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/subscriptions/:id
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/:id', authenticate, (req, res) => {
    const db  = readDB();
    ensureSubs(db);
    const sub = db.subscriptions.find(s => s.id === req.params.id && s.userId === req.userId);
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    res.json({ success: true, data: enrichSub(sub, db) });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/subscriptions  — Create
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/', authenticate, (req, res) => {
    const { productId, frequency = 'monthly', qty = 1 } = req.body;
    if (!productId) return res.status(400).json({ success: false, error: 'productId is required' });
    if (!FREQUENCIES[frequency]) return res.status(400).json({ success: false, error: `Invalid frequency. Use: ${Object.keys(FREQUENCIES).join(', ')}` });

    const db = readDB();
    ensureSubs(db);

    const product = db.products.find(p => p.id === parseInt(productId));
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    // Check if already subscribed to this product
    const existing = db.subscriptions.find(s => s.userId === req.userId && s.productId === product.id && s.status === 'active');
    if (existing) return res.status(409).json({ success: false, error: 'Already subscribed to this product' });

    const freq = FREQUENCIES[frequency];
    const nextOrderDate = new Date();
    nextOrderDate.setDate(nextOrderDate.getDate() + freq.days);

    const newSub = {
      id:            'sub' + Date.now(),
      userId:        req.userId,
      productId:     product.id,
      productName:   product.name,
      price:         product.price,
      frequency,
      qty:           parseInt(qty),
      status:        'active',
      extraDiscount: freq.extraDiscount,
      startDate:     new Date().toISOString(),
      nextOrderDate: nextOrderDate.toISOString(),
      ordersPlaced:  0,
      address:       db.users.find(u => u.id === req.userId)?.address || ''
    };

    db.subscriptions.push(newSub);
    writeDB(db);
    res.status(201).json({ success: true, data: enrichSub(newSub, db), message: 'Subscription created! You save 5% on every auto-order.' });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PUT /api/subscriptions/:id  — Update
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.put('/:id', authenticate, (req, res) => {
    const db  = readDB();
    ensureSubs(db);
    const idx = db.subscriptions.findIndex(s => s.id === req.params.id && s.userId === req.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const allowed = ['frequency', 'qty', 'address', 'status'];
    allowed.forEach(k => { if (req.body[k] !== undefined) db.subscriptions[idx][k] = req.body[k]; });

    // Recalculate next order date if frequency changed
    if (req.body.frequency && FREQUENCIES[req.body.frequency]) {
      const freq = FREQUENCIES[req.body.frequency];
      db.subscriptions[idx].extraDiscount = freq.extraDiscount;
      const next = new Date();
      next.setDate(next.getDate() + freq.days);
      db.subscriptions[idx].nextOrderDate = next.toISOString();
    }

    writeDB(db);
    res.json({ success: true, data: enrichSub(db.subscriptions[idx], db) });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/subscriptions/:id/pause  — Toggle pause
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/:id/pause', authenticate, (req, res) => {
    const db  = readDB();
    ensureSubs(db);
    const sub = db.subscriptions.find(s => s.id === req.params.id && s.userId === req.userId);
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });
    sub.status = sub.status === 'paused' ? 'active' : 'paused';
    writeDB(db);
    res.json({ success: true, data: enrichSub(sub, db), message: `Subscription ${sub.status}` });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     DELETE /api/subscriptions/:id  — Cancel
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.delete('/:id', authenticate, (req, res) => {
    const db  = readDB();
    ensureSubs(db);
    const idx = db.subscriptions.findIndex(s => s.id === req.params.id && s.userId === req.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Subscription not found' });
    db.subscriptions[idx].status = 'cancelled';
    db.subscriptions[idx].cancelledAt = new Date().toISOString();
    writeDB(db);
    res.json({ success: true, message: 'Subscription cancelled' });
  });

  return router;
};
