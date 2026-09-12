/* ============================================================
   routes/returns.js  — Returns & Refunds API
   ============================================================
   POST /api/returns                       Submit return request
   GET  /api/returns                       List user's returns
   GET  /api/returns/:id                   Single return detail
   PUT  /api/returns/:id/status            Admin: approve/reject/complete
   GET  /api/admin/returns                 Admin: all returns
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

const RETURN_REASONS = [
  'Defective / Damaged product',
  'Wrong item received',
  'Item not as described',
  'Changed my mind',
  'Better price available',
  'Order arrived late',
  'Duplicate order',
  'Other'
];

const RETURN_WINDOW_DAYS = 30; // days after order date

module.exports = function (authenticate, requireAdmin, readDB, writeDB) {

  function ensureReturns(db) {
    if (!db.returns) { db.returns = []; writeDB(db); }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/returns/reasons  — list valid return reasons
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/reasons', (req, res) => {
    res.json({ success: true, data: RETURN_REASONS, windowDays: RETURN_WINDOW_DAYS });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/returns
     Body: { orderId, items:[{productId, qty, reason}], notes }
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/', authenticate, (req, res) => {
    const db = readDB();
    ensureReturns(db);
    const { orderId, items, notes } = req.body;

    if (!orderId || !items || !items.length) {
      return res.status(400).json({ success: false, error: 'orderId and items are required' });
    }

    // Find the order
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.userId !== req.userId) return res.status(403).json({ success: false, error: 'Not your order' });
    if (order.status !== 'delivered') return res.status(400).json({ success: false, error: 'Only delivered orders can be returned' });

    // Check return window
    const orderDate = new Date(order.date);
    const daysSince = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > RETURN_WINDOW_DAYS) {
      return res.status(400).json({ success: false, error: `Return window (${RETURN_WINDOW_DAYS} days) has passed` });
    }

    // Check no existing return for same order
    const existing = db.returns.find(r => r.orderId === orderId && r.userId === req.userId && r.status !== 'rejected');
    if (existing) return res.status(409).json({ success: false, error: 'A return request already exists for this order', existingId: existing.id });

    // Calculate refund amount
    const refundAmount = items.reduce((sum, item) => {
      const orderItem = (order.items || []).find(i => (i.productId || i.id) === (item.productId || item.id));
      return sum + (orderItem ? orderItem.price * (item.qty || 1) : 0);
    }, 0);

    const returnReq = {
      id:           'RET-' + Date.now(),
      orderId,
      userId:       req.userId,
      items:        items.map(i => ({ productId: i.productId || i.id, qty: i.qty || 1, reason: i.reason || 'Other' })),
      notes:        notes || '',
      refundAmount: parseFloat(refundAmount.toFixed(2)),
      status:       'pending',       // pending → approved → refunded | rejected
      refundMethod: 'original',      // original payment method
      submittedAt:  new Date().toISOString(),
      updatedAt:    new Date().toISOString()
    };

    db.returns.push(returnReq);

    // Update order status
    const oIdx = db.orders.findIndex(o => o.id === orderId);
    if (oIdx !== -1) db.orders[oIdx].returnStatus = 'pending';

    writeDB(db);
    res.status(201).json({ success: true, data: returnReq });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/returns  — user's own returns
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/', authenticate, (req, res) => {
    const db      = readDB();
    ensureReturns(db);
    const returns = db.returns.filter(r => r.userId === req.userId);
    // Enrich with order info
    const enriched = returns.map(r => ({
      ...r,
      order: db.orders.find(o => o.id === r.orderId) || null
    }));
    res.json({ success: true, data: enriched, total: enriched.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/returns/:id
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/:id', authenticate, (req, res) => {
    const db = readDB();
    ensureReturns(db);
    const ret = db.returns.find(r => r.id === req.params.id);
    if (!ret) return res.status(404).json({ success: false, error: 'Return not found' });
    if (ret.userId !== req.userId) return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: { ...ret, order: db.orders.find(o => o.id === ret.orderId) } });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/admin/returns  — Admin: all returns
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/admin/all', requireAdmin, (req, res) => {
    const db = readDB();
    ensureReturns(db);
    const enriched = db.returns.map(r => {
      const user  = db.users.find(u => u.id === r.userId);
      const order = db.orders.find(o => o.id === r.orderId);
      const { passwordHash, password, ...safeUser } = user || {};
      return { ...r, user: safeUser || null, order: order || null };
    });
    res.json({ success: true, data: enriched, total: enriched.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PUT /api/returns/:id/status  (Admin)
     Body: { status: 'approved' | 'rejected' | 'refunded', note }
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.put('/:id/status', requireAdmin, (req, res) => {
    const db  = readDB();
    ensureReturns(db);
    const idx = db.returns.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Return not found' });

    const { status, note } = req.body;
    const valid = ['approved', 'rejected', 'refunded', 'processing'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

    db.returns[idx].status    = status;
    db.returns[idx].adminNote = note || '';
    db.returns[idx].updatedAt = new Date().toISOString();
    if (status === 'refunded') db.returns[idx].refundedAt = new Date().toISOString();

    // Update order return status
    const oIdx = db.orders.findIndex(o => o.id === db.returns[idx].orderId);
    if (oIdx !== -1) db.orders[oIdx].returnStatus = status;

    // If refunded, add loyalty points back? (optional)
    if (status === 'refunded') {
      const ret  = db.returns[idx];
      const uIdx = db.users.findIndex(u => u.id === ret.userId);
      if (uIdx !== -1) {
        db.users[uIdx].totalSpent = Math.max(0, (db.users[uIdx].totalSpent || 0) - ret.refundAmount);
      }
    }

    writeDB(db);

    // Add notification
    const ret     = db.returns[idx];
    const uIdx    = db.users.findIndex(u => u.id === ret.userId);
    if (uIdx !== -1) {
      if (!db.notifications) db.notifications = [];
      const icons = { approved: '✅', rejected: '❌', refunded: '💰', processing: '⏳' };
      db.notifications.unshift({
        id:      'n' + Date.now(),
        type:    'return',
        icon:    icons[status] || '📦',
        title:   `Return ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your return request ${ret.id} has been ${status}.`,
        time:    'just now',
        read:    false
      });
      writeDB(db);
    }

    res.json({ success: true, data: db.returns[idx] });
  });

  return router;
};
