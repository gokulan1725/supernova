/* ============================================================
   routes/shipping.js  — Shipping & Delivery API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

// Simulated shipping rates
const SHIPPING_PROVIDERS = [
  { id: 'standard', name: 'Standard Delivery',  days: '5-7',  price: 4.99,  icon: '📦' },
  { id: 'express',  name: 'Express Delivery',   days: '2-3',  price: 9.99,  icon: '⚡' },
  { id: 'overnight',name: 'Overnight Delivery', days: '1',    price: 19.99, icon: '🚀' },
  { id: 'pickup',   name: 'Store Pickup',        days: '0',    price: 0,     icon: '🏪' },
];

// Simulate real-time order tracking stages
const TRACKING_STAGES = [
  { status: 'processing', label: 'Order Placed',        icon: '🛒' },
  { status: 'confirmed',  label: 'Order Confirmed',     icon: '✅' },
  { status: 'packed',     label: 'Packed & Ready',      icon: '📦' },
  { status: 'shipped',    label: 'Shipped',             icon: '🚚' },
  { status: 'out',        label: 'Out for Delivery',    icon: '🏍️' },
  { status: 'delivered',  label: 'Delivered',           icon: '🎉' },
];

module.exports = function (authenticate, readDB, writeDB) {

  /* GET /api/shipping/rates?total=...  — get shipping options */
  router.get('/rates', (req, res) => {
    const total       = parseFloat(req.query.total || 0);
    const FREE_THRESHOLD = 99;

    const rates = SHIPPING_PROVIDERS.map(p => ({
      ...p,
      price: total >= FREE_THRESHOLD && p.id === 'standard' ? 0 : p.price,
      freeEligible: total >= FREE_THRESHOLD && p.id === 'standard'
    }));

    res.json({
      success: true,
      data:    rates,
      freeShippingThreshold: FREE_THRESHOLD,
      qualifiesForFree: total >= FREE_THRESHOLD
    });
  });

  /* GET /api/shipping/track/:orderId  — track an order */
  router.get('/track/:orderId', (req, res) => {
    const db    = readDB();
    const order = db.orders.find(o => o.id === req.params.orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const currentStageIndex = TRACKING_STAGES.findIndex(s => s.status === order.status);
    const effectiveIndex    = currentStageIndex === -1 ? 0 : currentStageIndex;

    const timeline = TRACKING_STAGES.map((stage, idx) => ({
      ...stage,
      completed: idx <= effectiveIndex,
      current:   idx === effectiveIndex,
      time: idx <= effectiveIndex
        ? new Date(new Date(order.date).getTime() + idx * 12 * 60 * 60 * 1000).toISOString()
        : null
    }));

    const estimated = new Date(order.date);
    estimated.setDate(estimated.getDate() + (order.deliveryDays || 5));

    res.json({
      success: true,
      data: {
        orderId:           order.id,
        status:            order.status,
        estimatedDelivery: estimated.toISOString().split('T')[0],
        trackingNumber:    'TRK' + order.id.replace(/[^0-9]/g, ''),
        carrier:           'ShopNova Express',
        timeline
      }
    });
  });

  /* POST /api/shipping/address/validate  — validate delivery address */
  router.post('/address/validate', (req, res) => {
    const { street, city, state, zip, country } = req.body;
    const errors = [];
    if (!street) errors.push('Street address is required');
    if (!city)   errors.push('City is required');
    if (!zip)    errors.push('ZIP/Postal code is required');

    if (errors.length) return res.status(400).json({ success: false, errors });

    // Simulate zip code validation
    const isValid = /^\d{5}(-\d{4})?$/.test(zip) || /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(zip);
    if (!isValid) return res.status(400).json({ success: false, error: 'Invalid ZIP/Postal code format' });

    res.json({
      success: true,
      data: { street, city, state: state || '', zip, country: country || 'US', valid: true }
    });
  });

  /* GET /api/shipping/addresses  — get saved addresses */
  router.get('/addresses', authenticate, (req, res) => {
    const db   = readDB();
    const user = db.users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user.addresses || [] });
  });

  /* POST /api/shipping/addresses  — save a new address */
  router.post('/addresses', authenticate, (req, res) => {
    const db    = readDB();
    const idx   = db.users.findIndex(u => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'User not found' });

    if (!db.users[idx].addresses) db.users[idx].addresses = [];

    const newAddr = {
      id:        'addr' + Date.now(),
      label:     req.body.label   || 'Home',
      street:    req.body.street  || '',
      city:      req.body.city    || '',
      state:     req.body.state   || '',
      zip:       req.body.zip     || '',
      country:   req.body.country || 'US',
      isDefault: db.users[idx].addresses.length === 0
    };

    db.users[idx].addresses.push(newAddr);
    writeDB(db);
    res.status(201).json({ success: true, data: newAddr });
  });

  /* DELETE /api/shipping/addresses/:id  — remove saved address */
  router.delete('/addresses/:id', authenticate, (req, res) => {
    const db  = readDB();
    const idx = db.users.findIndex(u => u.id === req.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'User not found' });

    const addrIdx = (db.users[idx].addresses || []).findIndex(a => a.id === req.params.id);
    if (addrIdx === -1) return res.status(404).json({ success: false, error: 'Address not found' });

    db.users[idx].addresses.splice(addrIdx, 1);
    writeDB(db);
    res.json({ success: true, message: 'Address removed' });
  });

  return router;
};
