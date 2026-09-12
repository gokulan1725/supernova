/* ============================================================
   routes/coupons.js  — Coupon Management API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

// Built-in static coupons (could be moved to DB for admin control)
const STATIC_COUPONS = {
  'SUMMER50':  { type: 'percent',  value: 0.50, label: '50% Summer Discount',    minOrder: 0,   maxUses: null, expiresAt: null },
  'WELCOME10': { type: 'percent',  value: 0.10, label: '10% Welcome Offer',       minOrder: 0,   maxUses: null, expiresAt: null },
  'SAVE20':    { type: 'percent',  value: 0.20, label: '20% Off Your Order',      minOrder: 50,  maxUses: null, expiresAt: null },
  'FREESHIP':  { type: 'shipping', value: 0,    label: 'Free Shipping',           minOrder: 0,   maxUses: null, expiresAt: null },
  'FLAT500':   { type: 'fixed',    value: 500,  label: '$500 Off on Orders $999+', minOrder: 999, maxUses: null, expiresAt: null },
};

module.exports = function (authenticate, requireAdmin, readDB, writeDB) {

  /* POST /api/coupons/validate  — validate coupon code */
  router.post('/validate', (req, res) => {
    const code      = (req.body.code || '').toUpperCase().trim();
    const orderTotal = parseFloat(req.body.orderTotal || 0);

    if (!code) return res.status(400).json({ success: false, error: 'Coupon code required' });

    // Check static coupons
    let coupon = STATIC_COUPONS[code];

    // Check DB coupons (admin-created)
    if (!coupon) {
      const db   = readDB();
      const dbCoupon = (db.coupons || []).find(c => c.code === code && c.active);
      if (dbCoupon) coupon = dbCoupon;
    }

    if (!coupon) return res.status(404).json({ success: false, error: 'Invalid or expired coupon code' });

    // Check minimum order
    if (coupon.minOrder && orderTotal < coupon.minOrder) {
      return res.status(400).json({
        success: false,
        error: `Minimum order of $${coupon.minOrder} required for this coupon`
      });
    }

    // Check expiry
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'This coupon has expired' });
    }

    // Compute discount amount
    let discount = 0;
    if (coupon.type === 'percent')  discount = orderTotal * coupon.value;
    if (coupon.type === 'fixed')    discount = coupon.value;
    if (coupon.type === 'shipping') discount = 0; // handled on frontend

    res.json({ success: true, data: { code, ...coupon, discountAmount: Math.min(discount, orderTotal) } });
  });

  /* GET /api/coupons  — admin: list all DB coupons */
  router.get('/', requireAdmin, (req, res) => {
    const db = readDB();
    res.json({ success: true, data: db.coupons || [] });
  });

  /* POST /api/coupons  — admin: create a new coupon */
  router.post('/', requireAdmin, (req, res) => {
    const { code, type, value, label, minOrder, expiresAt } = req.body;
    if (!code || !type || value === undefined) {
      return res.status(400).json({ success: false, error: 'code, type and value are required' });
    }
    const db  = readDB();
    if (!db.coupons) db.coupons = [];

    const exists = db.coupons.find(c => c.code === code.toUpperCase());
    if (exists) return res.status(409).json({ success: false, error: 'Coupon code already exists' });

    const newCoupon = {
      id:        'cp' + Date.now(),
      code:      code.toUpperCase(),
      type,
      value:     parseFloat(value),
      label:     label || code,
      minOrder:  minOrder  ? parseFloat(minOrder) : 0,
      expiresAt: expiresAt || null,
      active:    true,
      createdAt: new Date().toISOString()
    };
    db.coupons.push(newCoupon);
    writeDB(db);
    res.status(201).json({ success: true, data: newCoupon });
  });

  /* DELETE /api/coupons/:id  — admin: deactivate coupon */
  router.delete('/:id', requireAdmin, (req, res) => {
    const db  = readDB();
    const idx = (db.coupons || []).findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Coupon not found' });
    db.coupons[idx].active = false;
    writeDB(db);
    res.json({ success: true, message: 'Coupon deactivated' });
  });

  return router;
};
