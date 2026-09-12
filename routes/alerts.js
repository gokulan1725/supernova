/* ============================================================
   routes/alerts.js — Price Drop & Back-in-Stock Alerts API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (authenticate, readDB, writeDB, mailer) {

  function ensureAlerts(db) {
    if (!db.alerts) { db.alerts = []; writeDB(db); }
  }

  /* POST /api/alerts/subscribe — Subscribe to price drop or back in stock */
  router.post('/subscribe', (req, res) => {
    const { productId, type, targetPrice, email } = req.body;
    if (!productId || !type) {
      return res.status(400).json({ success: false, error: 'productId and alert type required' });
    }

    const db = readDB();
    ensureAlerts(db);

    const pid = parseInt(productId);
    const product = db.products.find(p => p.id === pid);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const user = req.userId ? db.users.find(u => u.id === req.userId) : null;
    const subscriberEmail = email || user?.email;

    if (!subscriberEmail) {
      return res.status(400).json({ success: false, error: 'Email address is required for alerts' });
    }

    const newAlert = {
      id: 'alt_' + Date.now(),
      userId: req.userId || null,
      email: subscriberEmail,
      userName: user?.name || subscriberEmail.split('@')[0],
      productId: pid,
      type: type, // 'price_drop' or 'back_in_stock'
      targetPrice: targetPrice ? parseFloat(targetPrice) : product.price,
      initialPrice: product.price,
      active: true,
      createdAt: new Date().toISOString()
    };

    db.alerts.push(newAlert);
    writeDB(db);

    res.status(201).json({
      success: true,
      message: type === 'price_drop'
        ? `🔔 Price alert set for ₹${Math.round(newAlert.targetPrice).toLocaleString('en-IN')}!`
        : '📦 Stock alert set! We will email you when back in stock.',
      data: newAlert
    });
  });

  /* GET /api/alerts — Get current user's active alerts */
  router.get('/', authenticate, (req, res) => {
    const db = readDB();
    ensureAlerts(db);
    const userAlerts = db.alerts.filter(a => a.userId === req.userId && a.active);
    const enriched = userAlerts.map(a => {
      const product = db.products.find(p => p.id === a.productId);
      return { ...a, product };
    });
    res.json({ success: true, data: enriched });
  });

  /* DELETE /api/alerts/:id — Cancel an alert */
  router.delete('/:id', (req, res) => {
    const db = readDB();
    ensureAlerts(db);
    db.alerts = db.alerts.filter(a => a.id !== req.params.id);
    writeDB(db);
    res.json({ success: true, message: 'Alert cancelled successfully' });
  });

  /* POST /api/alerts/check — Check & dispatch pending alerts */
  router.post('/check', async (req, res) => {
    const db = readDB();
    ensureAlerts(db);

    let triggeredCount = 0;
    for (let alert of db.alerts) {
      if (!alert.active) continue;
      const product = db.products.find(p => p.id === alert.productId);
      if (!product) continue;

      let triggered = false;

      // Price Drop Trigger
      if (alert.type === 'price_drop' && product.price <= alert.targetPrice) {
        if (mailer && mailer.sendPriceDropAlert) {
          await mailer.sendPriceDropAlert(alert.email, alert.userName, product, product.price, alert.targetPrice).catch(() => {});
        }
        triggered = true;
      }

      // Back In Stock Trigger
      if (alert.type === 'back_in_stock' && product.stock > 0) {
        if (mailer && mailer.sendBackInStockAlert) {
          await mailer.sendBackInStockAlert(alert.email, alert.userName, product).catch(() => {});
        }
        triggered = true;
      }

      if (triggered) {
        alert.active = false; // Mark triggered
        alert.triggeredAt = new Date().toISOString();
        triggeredCount++;
      }
    }

    if (triggeredCount > 0) writeDB(db);
    res.json({ success: true, message: `Alert check completed. Triggered ${triggeredCount} email(s).`, triggeredCount });
  });

  return router;
};
