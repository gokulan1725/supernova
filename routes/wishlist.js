/* ============================================================
   routes/wishlist.js  — Wishlist API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (authenticate, readDB, writeDB) {

  /* GET /api/wishlist  — get current user's wishlist */
  router.get('/', authenticate, (req, res) => {
    const db   = readDB();
    const list = (db.wishlists || {})[req.userId] || [];
    // Enrich with product details
    const products = list.map(pid => db.products.find(p => p.id === pid)).filter(Boolean);
    res.json({ success: true, data: products, total: products.length });
  });

  /* POST /api/wishlist/:productId  — add product to wishlist */
  router.post('/:productId', authenticate, (req, res) => {
    const db  = readDB();
    const pid = parseInt(req.params.productId);

    if (!db.wishlists) db.wishlists = {};
    if (!db.wishlists[req.userId]) db.wishlists[req.userId] = [];

    if (!db.wishlists[req.userId].includes(pid)) {
      db.wishlists[req.userId].push(pid);
      writeDB(db);
    }
    res.json({ success: true, message: 'Added to wishlist', productId: pid });
  });

  /* DELETE /api/wishlist/:productId  — remove from wishlist */
  router.delete('/:productId', authenticate, (req, res) => {
    const db  = readDB();
    const pid = parseInt(req.params.productId);

    if (db.wishlists && db.wishlists[req.userId]) {
      db.wishlists[req.userId] = db.wishlists[req.userId].filter(id => id !== pid);
      writeDB(db);
    }
    res.json({ success: true, message: 'Removed from wishlist', productId: pid });
  });

  /* DELETE /api/wishlist  — clear entire wishlist */
  router.delete('/', authenticate, (req, res) => {
    const db = readDB();
    if (db.wishlists) db.wishlists[req.userId] = [];
    writeDB(db);
    res.json({ success: true, message: 'Wishlist cleared' });
  });

  return router;
};
