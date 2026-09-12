/* ============================================================
   routes/cart.js  — Persistent Server-Side Cart API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (authenticate, readDB, writeDB) {

  function getCart(db, userId) {
    if (!db.carts) db.carts = {};
    if (!db.carts[userId]) db.carts[userId] = { items: [], updatedAt: null };
    return db.carts[userId];
  }

  /* GET /api/cart  — get cart */
  router.get('/', authenticate, (req, res) => {
    const db   = readDB();
    const cart = getCart(db, req.userId);
    // Enrich items with latest product data
    const enriched = cart.items.map(item => {
      const product = db.products.find(p => p.id === item.productId);
      return product ? { ...item, product } : null;
    }).filter(Boolean);
    res.json({ success: true, data: { items: enriched, total: enriched.length } });
  });

  /* POST /api/cart  — add or update item */
  router.post('/', authenticate, (req, res) => {
    const db   = readDB();
    const cart = getCart(db, req.userId);
    const { productId, qty = 1, color, size } = req.body;

    if (!productId) return res.status(400).json({ success: false, error: 'productId required' });

    const pid  = parseInt(productId);
    const prod = db.products.find(p => p.id === pid);
    if (!prod) return res.status(404).json({ success: false, error: 'Product not found' });
    if (prod.stock < qty) return res.status(400).json({ success: false, error: 'Insufficient stock' });

    const existing = cart.items.find(i => i.productId === pid && i.color === color && i.size === size);
    if (existing) {
      existing.qty = Math.min(existing.qty + qty, prod.stock);
    } else {
      cart.items.push({ productId: pid, qty, color: color || null, size: size || null, addedAt: new Date().toISOString() });
    }
    cart.updatedAt = new Date().toISOString();
    writeDB(db);
    res.json({ success: true, data: cart });
  });

  /* PUT /api/cart/:productId  — update qty */
  router.put('/:productId', authenticate, (req, res) => {
    const db   = readDB();
    const cart = getCart(db, req.userId);
    const pid  = parseInt(req.params.productId);
    const { qty } = req.body;

    const item = cart.items.find(i => i.productId === pid);
    if (!item) return res.status(404).json({ success: false, error: 'Item not in cart' });

    if (qty <= 0) {
      cart.items = cart.items.filter(i => i.productId !== pid);
    } else {
      item.qty = qty;
    }
    cart.updatedAt = new Date().toISOString();
    writeDB(db);
    res.json({ success: true, data: cart });
  });

  /* DELETE /api/cart/:productId  — remove item */
  router.delete('/:productId', authenticate, (req, res) => {
    const db   = readDB();
    const cart = getCart(db, req.userId);
    const pid  = parseInt(req.params.productId);

    cart.items     = cart.items.filter(i => i.productId !== pid);
    cart.updatedAt = new Date().toISOString();
    writeDB(db);
    res.json({ success: true, message: 'Item removed', data: cart });
  });

  /* DELETE /api/cart  — clear cart */
  router.delete('/', authenticate, (req, res) => {
    const db = readDB();
    if (db.carts) db.carts[req.userId] = { items: [], updatedAt: new Date().toISOString() };
    writeDB(db);
    res.json({ success: true, message: 'Cart cleared' });
  });

  return router;
};
