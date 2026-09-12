/* ============================================================
   routes/recommendations.js  — Product Recommendations API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (authenticate, readDB) {

  /* GET /api/recommendations/similar/:productId
     Products in the same category, excluding the current product */
  router.get('/similar/:productId', (req, res) => {
    const { limit = 8 } = req.query;
    const db   = readDB();
    const pid  = parseInt(req.params.productId);
    const base = db.products.find(p => p.id === pid);

    if (!base) return res.status(404).json({ success: false, error: 'Product not found' });

    let similar = db.products
      .filter(p => p.id !== pid && p.category === base.category)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, parseInt(limit));

    // Fallback if same category is empty
    if (similar.length < 4) {
      const extras = db.products
        .filter(p => p.id !== pid && !similar.find(s => s.id === p.id))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, parseInt(limit) - similar.length);
      similar = [...similar, ...extras];
    }

    res.json({ success: true, data: similar, total: similar.length });
  });

  /* GET /api/recommendations/trending  — globally trending products */
  router.get('/trending', (req, res) => {
    const { limit = 8 } = req.query;
    const db   = readDB();
    const trending = db.products
      .filter(p => p.isTrending)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, parseInt(limit));
    res.json({ success: true, data: trending, total: trending.length });
  });

  /* GET /api/recommendations/new-arrivals  — newest products */
  router.get('/new-arrivals', (req, res) => {
    const { limit = 8 } = req.query;
    const db   = readDB();
    const newArrivals = db.products
      .filter(p => p.isNew)
      .sort((a, b) => b.id - a.id)
      .slice(0, parseInt(limit));
    res.json({ success: true, data: newArrivals, total: newArrivals.length });
  });

  /* GET /api/recommendations/deals  — biggest discounts */
  router.get('/deals', (req, res) => {
    const { limit = 8 } = req.query;
    const db   = readDB();
    const deals = db.products
      .filter(p => p.discount > 0)
      .sort((a, b) => b.discount - a.discount)
      .slice(0, parseInt(limit));
    res.json({ success: true, data: deals, total: deals.length });
  });

  /* GET /api/recommendations/for-you  — personalised (auth) */
  router.get('/for-you', authenticate, (req, res) => {
    const { limit = 12 } = req.query;
    const db   = readDB();

    // Derive categories from order history
    const userOrders = db.orders.filter(o => o.userId === req.userId);
    const purchasedCategories = new Set();
    userOrders.forEach(o => {
      (o.items || []).forEach(item => {
        const prod = db.products.find(p => p.id === (item.productId || item.id));
        if (prod) purchasedCategories.add(prod.category);
      });
    });

    let recs = [];
    if (purchasedCategories.size > 0) {
      recs = db.products
        .filter(p => purchasedCategories.has(p.category) && p.rating >= 4)
        .sort((a, b) => b.rating - a.rating);
    }

    // Fallback to featured products
    if (recs.length < parseInt(limit)) {
      const extras = db.products
        .filter(p => p.isFeatured && !recs.find(r => r.id === p.id))
        .sort((a, b) => b.rating - a.rating);
      recs = [...recs, ...extras];
    }

    res.json({ success: true, data: recs.slice(0, parseInt(limit)), total: recs.length, personalized: purchasedCategories.size > 0 });
  });

  /* GET /api/recommendations/frequently-bought/:productId
     Simulated "customers also bought" */
  router.get('/frequently-bought/:productId', (req, res) => {
    const { limit = 4 } = req.query;
    const db  = readDB();
    const pid = parseInt(req.params.productId);

    // Find orders containing this product
    const coOrders   = db.orders.filter(o => (o.items || []).some(i => (i.productId || i.id) === pid));
    const coProductIds = new Set();
    coOrders.forEach(o =>
      (o.items || []).forEach(i => {
        if ((i.productId || i.id) !== pid) coProductIds.add(i.productId || i.id);
      })
    );

    let freqBought = [...coProductIds]
      .map(id => db.products.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, parseInt(limit));

    // Fallback
    if (freqBought.length === 0) {
      const base = db.products.find(p => p.id === pid);
      freqBought = db.products
        .filter(p => p.id !== pid && base && p.category === base.category)
        .sort((a, b) => b.sold - a.sold)
        .slice(0, parseInt(limit));
    }

    res.json({ success: true, data: freqBought, total: freqBought.length });
  });

  return router;
};
