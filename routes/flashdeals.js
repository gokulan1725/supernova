/* ============================================================
   routes/flashdeals.js  — Flash Deals (Time-Limited Offers)
   ============================================================
   GET  /api/flash-deals               Active flash deals list
   GET  /api/flash-deals/:id           Single deal details
   POST /api/flash-deals               Admin: create a deal
   PUT  /api/flash-deals/:id           Admin: update deal
   DELETE /api/flash-deals/:id         Admin: remove deal
   POST /api/flash-deals/:id/claim     Claim deal (apply to cart)
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

/* Seed flash deals added to DB on first run */
const SEED_FLASH_DEALS = [
  {
    id:          'fd1',
    productId:   1,
    title:       '⚡ Flash Deal — Sony Headphones',
    label:       'Limited Time',
    discount:    35,
    originalPrice: 349.99,
    dealPrice:   227.49,
    startTime:   new Date().toISOString(),
    endTime:     new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 h from now
    totalStock:  20,
    claimedCount:7,
    active:      true,
    color:       '#FF6B35'
  },
  {
    id:          'fd2',
    productId:   8,
    title:       '⚡ Flash Deal — iPhone 15 Pro Max',
    label:       'Mega Sale',
    discount:    12,
    originalPrice: 1199.00,
    dealPrice:   1055.12,
    startTime:   new Date().toISOString(),
    endTime:     new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 h from now
    totalStock:  10,
    claimedCount:3,
    active:      true,
    color:       '#6C63FF'
  }
];

module.exports = function (authenticate, requireAdmin, readDB, writeDB) {

  /* ── Ensure flash deals exist in DB ──────────────────────── */
  function ensureFlashDeals(db) {
    if (!db.flashDeals) {
      db.flashDeals = SEED_FLASH_DEALS;
      writeDB(db);
    }
  }

  /* ── Filter only currently active deals ─────────────────── */
  function getActiveDeals(deals) {
    const now = Date.now();
    return deals.filter(d =>
      d.active &&
      new Date(d.startTime).getTime() <= now &&
      new Date(d.endTime).getTime()   >  now &&
      d.claimedCount < d.totalStock
    );
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/flash-deals
     Returns all active flash deals enriched with product info
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/', (req, res) => {
    const db = readDB();
    ensureFlashDeals(db);

    const { all } = req.query;
    const deals   = all === 'true' ? db.flashDeals : getActiveDeals(db.flashDeals);

    const enriched = deals.map(deal => {
      const product = db.products.find(p => p.id === deal.productId);
      const now     = Date.now();
      const endsAt  = new Date(deal.endTime).getTime();
      const remaining = Math.max(0, deal.totalStock - deal.claimedCount);
      return {
        ...deal,
        product:         product || null,
        remainingStock:  remaining,
        soldPercent:     Math.round((deal.claimedCount / deal.totalStock) * 100),
        secondsLeft:     Math.max(0, Math.floor((endsAt - now) / 1000)),
        isExpired:       endsAt <= now || remaining === 0
      };
    });

    res.json({ success: true, data: enriched, total: enriched.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/flash-deals/:id
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/:id', (req, res) => {
    const db   = readDB();
    ensureFlashDeals(db);
    const deal = db.flashDeals.find(d => d.id === req.params.id);
    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

    const product   = db.products.find(p => p.id === deal.productId);
    const remaining = Math.max(0, deal.totalStock - deal.claimedCount);
    const now       = Date.now();
    res.json({
      success: true,
      data: {
        ...deal,
        product,
        remainingStock: remaining,
        soldPercent:    Math.round((deal.claimedCount / deal.totalStock) * 100),
        secondsLeft:    Math.max(0, Math.floor((new Date(deal.endTime).getTime() - now) / 1000)),
        isExpired:      new Date(deal.endTime).getTime() <= now || remaining === 0
      }
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/flash-deals/:id/claim
     Claim a flash deal slot — reduces remaining stock
     Returns the deal price to apply at checkout
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/:id/claim', authenticate, (req, res) => {
    const db  = readDB();
    ensureFlashDeals(db);
    const idx = db.flashDeals.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Deal not found' });

    const deal = db.flashDeals[idx];
    const now  = Date.now();

    if (!deal.active)                                          return res.status(400).json({ success: false, error: 'Deal is not active' });
    if (new Date(deal.endTime).getTime() <= now)               return res.status(400).json({ success: false, error: 'Deal has expired' });
    if (deal.claimedCount >= deal.totalStock)                  return res.status(400).json({ success: false, error: 'Deal is sold out' });

    db.flashDeals[idx].claimedCount += 1;
    writeDB(db);

    res.json({
      success: true,
      message: 'Flash deal claimed! Add the product to your cart at the deal price.',
      data: {
        dealId:      deal.id,
        productId:   deal.productId,
        dealPrice:   deal.dealPrice,
        discount:    deal.discount,
        remaining:   deal.totalStock - db.flashDeals[idx].claimedCount,
        validUntil:  deal.endTime
      }
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/flash-deals  (Admin — create deal)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/', requireAdmin, (req, res) => {
    const db = readDB();
    ensureFlashDeals(db);
    const { productId, discount, durationHours = 6, totalStock = 50, title, color } = req.body;

    if (!productId || !discount) return res.status(400).json({ success: false, error: 'productId and discount are required' });

    const product = db.products.find(p => p.id === parseInt(productId));
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const dealPrice = parseFloat((product.price * (1 - discount / 100)).toFixed(2));
    const newDeal   = {
      id:            'fd' + Date.now(),
      productId:     parseInt(productId),
      title:         title || `⚡ Flash Deal — ${product.name}`,
      label:         'Flash Sale',
      discount:      parseInt(discount),
      originalPrice: product.price,
      dealPrice,
      startTime:     new Date().toISOString(),
      endTime:       new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString(),
      totalStock:    parseInt(totalStock),
      claimedCount:  0,
      active:        true,
      color:         color || '#FF6B35'
    };

    db.flashDeals.push(newDeal);
    writeDB(db);
    res.status(201).json({ success: true, data: newDeal });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PUT /api/flash-deals/:id  (Admin — update)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.put('/:id', requireAdmin, (req, res) => {
    const db  = readDB();
    ensureFlashDeals(db);
    const idx = db.flashDeals.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Deal not found' });
    db.flashDeals[idx] = { ...db.flashDeals[idx], ...req.body, id: req.params.id };
    writeDB(db);
    res.json({ success: true, data: db.flashDeals[idx] });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     DELETE /api/flash-deals/:id  (Admin — deactivate)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.delete('/:id', requireAdmin, (req, res) => {
    const db  = readDB();
    ensureFlashDeals(db);
    const idx = db.flashDeals.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Deal not found' });
    db.flashDeals[idx].active = false;
    writeDB(db);
    res.json({ success: true, message: 'Flash deal deactivated' });
  });

  return router;
};
