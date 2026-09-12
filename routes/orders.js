/* ============================================================
   routes/orders.js  — Order Management System
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function(authenticate, requireAdmin, readDB, writeDB, mapOrderToClient, mapOrderToSupabase, mailer, supabase) {

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/orders
     List orders. If ?userId is passed, filters by user.
     If no query, requires admin.
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/', authenticate, (req, res) => {
    const db = readDB();
    const { userId } = req.query;

    let orders = [];
    if (userId) {
      if (req.userId !== userId && !req.isAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      orders = db.orders.filter(o => o.userId === userId);
    } else {
      if (!req.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      orders = db.orders;
    }

    // Map output safely
    res.json({ success: true, data: orders, total: orders.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/orders/me
     List orders for currently logged in user
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/me', authenticate, (req, res) => {
    const db = readDB();
    const orders = db.orders.filter(o => o.userId === req.userId);
    res.json({ success: true, data: orders, total: orders.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/orders/:id
     Get single order
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/:id', async (req, res) => {
    const orderId = req.params.id;
    try {
      if (supabase) {
        const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
        if (error) throw error;
        if (data) {
          return res.json({ success: true, data: mapOrderToClient(data), source: 'supabase' });
        }
      }
    } catch(e) {}
    
    const db = readDB();
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order, source: 'local' });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/orders
     Create new order
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/', async (req, res) => {
    const db = readDB();
    const newOrder = {
      id:       req.body.id || ('SN-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6)),
      userId:   req.body.userId   || null,
      date:     req.body.date     || new Date().toISOString().split('T')[0],
      status:   req.body.status   || 'processing',
      items:    req.body.items    || [],
      total:    req.body.total    || 0,
      shipping: req.body.shipping || 0,
      address:  req.body.address  || '',
      coupon:   req.body.coupon   || null
    };

    if (!db.orders) db.orders = [];
    db.orders.unshift(newOrder);

    if (newOrder.userId) {
      const userIdx = db.users.findIndex(u => u.id === newOrder.userId);
      if (userIdx !== -1) {
        db.users[userIdx].orders     = (db.users[userIdx].orders     || 0) + 1;
        db.users[userIdx].totalSpent = (db.users[userIdx].totalSpent || 0) + newOrder.total;
      }
    }

    // Decrement stock for each ordered product
    (newOrder.items || []).forEach(item => {
      const pidx = db.products.findIndex(p => p.id === (item.productId || item.id));
      if (pidx !== -1 && db.products[pidx].stock >= item.qty) {
        db.products[pidx].stock -= item.qty;
        db.products[pidx].sold  = (db.products[pidx].sold || 0) + item.qty;
      }
    });

    writeDB(db);

    try {
      if (supabase && mapOrderToSupabase) {
        const { error } = await supabase.from('orders').insert([mapOrderToSupabase(newOrder)]);
        if (error) throw error;
      }
      // Send order confirmation email
      const buyer = db.users.find(u => u.id === newOrder.userId);
      if (mailer && mailer.sendOrderConfirmation) {
        mailer.sendOrderConfirmation(newOrder, buyer, db.products).catch(() => {});
      }
      
      // Award loyalty points
      if (newOrder.userId) {
        try {
          const db2 = readDB();
          if (!db2.loyalty) db2.loyalty = {};
          if (!db2.loyalty[newOrder.userId]) db2.loyalty[newOrder.userId] = { points: 0, lifetimePoints: 0, history: [] };
          const pts = Math.floor(newOrder.total * 10);
          db2.loyalty[newOrder.userId].points         += pts;
          db2.loyalty[newOrder.userId].lifetimePoints += pts;
          db2.loyalty[newOrder.userId].history.unshift({ id: 'lh' + Date.now(), type: 'earn', amount: pts, reason: `Purchase: Order ${newOrder.id}`, ref: newOrder.id, date: new Date().toISOString() });
          writeDB(db2);
        } catch (e) {}
      }
      res.status(201).json({ success: true, data: newOrder, synced: true });
    } catch (e) {
      console.warn('⚠️ Supabase order insert error — saved locally:', e.message);
      const buyer = db.users.find(u => u.id === newOrder.userId);
      if (mailer && mailer.sendOrderConfirmation) {
        mailer.sendOrderConfirmation(newOrder, buyer, db.products).catch(() => {});
      }
      res.status(201).json({ success: true, data: newOrder, synced: false });
    }
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     PUT /api/orders/:id
     Update single order (e.g., status)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.put('/:id', authenticate, async (req, res) => {
    const orderId = req.params.id;
    const db = readDB();
    const idx = db.orders.findIndex(o => o.id === orderId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Order not found' });

    // Restrict access if not admin
    if (!req.isAdmin && db.orders[idx].userId !== req.userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    db.orders[idx] = { ...db.orders[idx], ...req.body, id: orderId };
    writeDB(db);

    const notifyStatuses = ['shipped', 'out', 'delivered'];
    if (req.body.status && notifyStatuses.includes(req.body.status)) {
      const buyer = db.users.find(u => u.id === db.orders[idx].userId);
      if (mailer && mailer.sendShippingUpdate) {
        mailer.sendShippingUpdate(db.orders[idx], buyer, req.body.status).catch(() => {});
      }
    }

    try {
      if (supabase && mapOrderToSupabase) {
        const { error } = await supabase.from('orders').update(mapOrderToSupabase(db.orders[idx])).eq('id', orderId);
        if (error) throw error;
      }
      res.json({ success: true, data: db.orders[idx], synced: true });
    } catch (e) {
      res.json({ success: true, data: db.orders[idx], synced: false, error: e.message });
    }
  });

  return router;
};
