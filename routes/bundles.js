/* ============================================================
   routes/bundles.js  — Bundle Deals & Frequently Bought Together
   ============================================================
   GET  /api/bundles                    List active bundles
   GET  /api/bundles/:id                Single bundle
   GET  /api/bundles/product/:productId Bundles containing a product
   POST /api/bundles            (admin)  Create bundle
   PUT  /api/bundles/:id        (admin)  Update bundle
   DELETE /api/bundles/:id      (admin)  Remove bundle
   POST /api/bundles/:id/apply          Apply bundle discount to cart
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

const SEED_BUNDLES = [
  {
    id: 'bnd1',
    title: '🎧 Ultimate Audio Setup',
    description: 'Sony headphones + Fitbit tracker — perfect pair for workouts',
    productIds: [1, 10],
    bundleDiscount: 12,
    active: true,
    badge: '🔥 Best Combo',
    createdAt: new Date().toISOString()
  },
  {
    id: 'bnd2',
    title: '💻 Work From Home Kit',
    description: 'MacBook Air + Fitbit Charge 6 — productivity meets wellness',
    productIds: [2, 10],
    bundleDiscount: 10,
    active: true,
    badge: '⭐ Popular',
    createdAt: new Date().toISOString()
  },
  {
    id: 'bnd3',
    title: '🧴 Glow & Go Beauty Set',
    description: 'Vitamin C Serum + Matcha Tea — inside & out wellness',
    productIds: [11, 9],
    bundleDiscount: 15,
    active: true,
    badge: '💚 Wellness',
    createdAt: new Date().toISOString()
  }
];

module.exports = function(authenticate, requireAdmin, readDB, writeDB) {

  function ensureBundles(db) {
    if (!db.bundles) { db.bundles = SEED_BUNDLES; writeDB(db); }
  }

  function enrichBundle(bundle, db) {
    const products = (bundle.productIds || [])
      .map(id => db.products.find(p => p.id === id))
      .filter(Boolean);
    const originalTotal = products.reduce((sum, p) => sum + p.price, 0);
    const discountedTotal = parseFloat((originalTotal * (1 - bundle.bundleDiscount / 100)).toFixed(2));
    const savings = parseFloat((originalTotal - discountedTotal).toFixed(2));
    return { ...bundle, products, originalTotal, discountedTotal, savings };
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/bundles
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/', (req, res) => {
    const db = readDB();
    ensureBundles(db);
    const { all } = req.query;
    const bundles = all === 'true' ? db.bundles : db.bundles.filter(b => b.active);
    res.json({ success: true, data: bundles.map(b => enrichBundle(b, db)), total: bundles.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/bundles/product/:productId
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/product/:productId', (req, res) => {
    const db  = readDB();
    ensureBundles(db);
    const pid = parseInt(req.params.productId);
    const bundles = db.bundles.filter(b => b.active && (b.productIds || []).includes(pid));
    res.json({ success: true, data: bundles.map(b => enrichBundle(b, db)), total: bundles.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/bundles/:id
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/:id', (req, res) => {
    const db     = readDB();
    ensureBundles(db);
    const bundle = db.bundles.find(b => b.id === req.params.id);
    if (!bundle) return res.status(404).json({ success: false, error: 'Bundle not found' });
    res.json({ success: true, data: enrichBundle(bundle, db) });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/bundles  (Admin: create)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/', requireAdmin, (req, res) => {
    const { title, description, productIds, bundleDiscount, badge } = req.body;
    if (!title || !productIds || !bundleDiscount) {
      return res.status(400).json({ success: false, error: 'title, productIds, and bundleDiscount required' });
    }
    const db = readDB();
    ensureBundles(db);

    const newBundle = {
      id:             'bnd' + Date.now(),
      title,
      description:    description || '',
      productIds:     Array.isArray(productIds) ? productIds.map(Number) : [Number(productIds)],
      bundleDiscount: Number(bundleDiscount),
      active:         true,
      badge:          badge || '🔥 Bundle Deal',
      createdAt:      new Date().toISOString()
    };

    db.bundles.push(newBundle);
    writeDB(db);
    res.status(201).json({ success: true, data: enrichBundle(newBundle, db) });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PUT /api/bundles/:id  (Admin: update)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.put('/:id', requireAdmin, (req, res) => {
    const db  = readDB();
    ensureBundles(db);
    const idx = db.bundles.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Bundle not found' });
    db.bundles[idx] = { ...db.bundles[idx], ...req.body, id: req.params.id };
    writeDB(db);
    res.json({ success: true, data: enrichBundle(db.bundles[idx], db) });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     DELETE /api/bundles/:id  (Admin: deactivate)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.delete('/:id', requireAdmin, (req, res) => {
    const db  = readDB();
    ensureBundles(db);
    const idx = db.bundles.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Bundle not found' });
    db.bundles[idx].active = false;
    writeDB(db);
    res.json({ success: true, message: 'Bundle deactivated' });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/bundles/:id/apply  — Apply bundle discount
     Returns discount amount and coupon code for checkout
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/:id/apply', (req, res) => {
    const db     = readDB();
    ensureBundles(db);
    const bundle = db.bundles.find(b => b.id === req.params.id && b.active);
    if (!bundle) return res.status(404).json({ success: false, error: 'Bundle not found or inactive' });

    const enriched = enrichBundle(bundle, db);
    res.json({
      success:  true,
      message:  `Bundle deal applied! Save ${bundle.bundleDiscount}% on this combo.`,
      data: {
        bundleId:        bundle.id,
        discount:        bundle.bundleDiscount,
        savings:         enriched.savings,
        discountedTotal: enriched.discountedTotal,
        productIds:      bundle.productIds
      }
    });
  });

  return router;
};
