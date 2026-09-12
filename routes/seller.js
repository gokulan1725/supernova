/* ============================================================
   routes/seller.js  — Seller Dashboard API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (authenticate, readDB, writeDB) {

  /* Middleware: ensure user has seller role */
  function requireSeller(req, res, next) {
    const db   = readDB();
    const user = db.users.find(u => u.id === req.userId);
    if (!user || (!user.isSeller && !user.isAdmin)) {
      return res.status(403).json({ success: false, error: 'Seller access required' });
    }
    req.seller = user;
    next();
  }

  /* POST /api/seller/apply  — apply to become a seller */
  router.post('/apply', authenticate, (req, res) => {
    const db   = readDB();
    const user = db.users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.isSeller) return res.status(409).json({ success: false, error: 'Already a seller' });

    const { businessName, description, category } = req.body;
    if (!businessName) return res.status(400).json({ success: false, error: 'Business name is required' });

    user.sellerApplication = {
      businessName,
      description: description || '',
      category:    category    || '',
      status:      'pending',
      appliedAt:   new Date().toISOString()
    };
    writeDB(db);
    res.json({ success: true, message: 'Seller application submitted. Pending approval.', data: user.sellerApplication });
  });

  /* GET /api/seller/dashboard  — seller's own products & stats */
  router.get('/dashboard', authenticate, requireSeller, (req, res) => {
    const db            = readDB();
    const sellerProducts = db.products.filter(p => p.sellerId === req.userId);
    const sellerOrders   = db.orders.filter(o =>
      (o.items || []).some(item => {
        const pid  = item.productId || item.id;
        return sellerProducts.some(p => p.id === pid);
      })
    );

    const revenue = sellerOrders.reduce((sum, o) => {
      return sum + (o.items || []).reduce((s, item) => {
        const pid     = item.productId || item.id;
        const isMine  = sellerProducts.some(p => p.id === pid);
        return isMine ? s + (item.price || 0) * (item.qty || 1) : s;
      }, 0);
    }, 0);

    res.json({
      success: true,
      data: {
        products:     sellerProducts.length,
        orders:       sellerOrders.length,
        revenue:      parseFloat(revenue.toFixed(2)),
        recentOrders: sellerOrders.slice(0, 5)
      }
    });
  });

  /* GET /api/seller/products  — list seller's products */
  router.get('/products', authenticate, requireSeller, (req, res) => {
    const db       = readDB();
    const products = db.products.filter(p => p.sellerId === req.userId);
    res.json({ success: true, data: products, total: products.length });
  });

  /* POST /api/seller/products  — add a new product */
  router.post('/products', authenticate, requireSeller, (req, res) => {
    const db    = readDB();
    const newId = db.products.length ? Math.max(...db.products.map(p => p.id)) + 1 : 1;
    const product = {
      id:          newId,
      sellerId:    req.userId,
      sellerName:  req.seller.name,
      ...req.body,
      rating:      req.body.rating || 5,
      reviewCount: 0,
      sold:        0,
      createdAt:   new Date().toISOString()
    };
    db.products.push(product);
    writeDB(db);
    res.status(201).json({ success: true, data: product });
  });

  /* PUT /api/seller/products/:id  — update seller's product */
  router.put('/products/:id', authenticate, requireSeller, (req, res) => {
    const db    = readDB();
    const pid   = parseInt(req.params.id);
    const idx   = db.products.findIndex(p => p.id === pid && p.sellerId === req.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Product not found or not yours' });
    db.products[idx] = { ...db.products[idx], ...req.body, id: pid, sellerId: req.userId };
    writeDB(db);
    res.json({ success: true, data: db.products[idx] });
  });

  /* DELETE /api/seller/products/:id  — remove seller's product */
  router.delete('/products/:id', authenticate, requireSeller, (req, res) => {
    const db  = readDB();
    const pid = parseInt(req.params.id);
    const idx = db.products.findIndex(p => p.id === pid && p.sellerId === req.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Product not found or not yours' });
    const removed = db.products.splice(idx, 1)[0];
    writeDB(db);
    res.json({ success: true, data: removed });
  });

  return router;
};
