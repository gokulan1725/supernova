/* ============================================================
   routes/giftcards.js  — Digital Gift Cards & Vouchers API
   ============================================================
   GET  /api/giftcards/check/:code     Check balance of a gift card
   POST /api/giftcards/purchase        Buy a gift card
   POST /api/giftcards/redeem          Redeem/apply gift card at checkout
   GET  /api/giftcards/my-cards        User's purchased/received cards
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();
const mailer  = require('../utils/mailer');

const SEED_GIFTCARDS = [
  {
    code: 'GIFT-DEMO-2025',
    amount: 50.00,
    balance: 50.00,
    recipientEmail: 'john@demo.com',
    recipientName: 'John Doe',
    senderName: 'ShopNova Team',
    message: 'Welcome to ShopNova! Enjoy $50 on us.',
    purchasedAt: new Date().toISOString(),
    status: 'active'
  }
];

module.exports = function(authenticate, requireAdmin, readDB, writeDB) {

  function ensureGiftCards(db) {
    if (!db.giftCards) { db.giftCards = SEED_GIFTCARDS; writeDB(db); }
  }

  /* ── Check Gift Card Balance ──────────────────────────── */
  router.get('/check/:code', (req, res) => {
    const db = readDB();
    ensureGiftCards(db);
    const code = req.params.code.toUpperCase().trim();
    const card = db.giftCards.find(g => g.code === code && g.status === 'active');

    if (!card) return res.status(404).json({ success: false, error: 'Invalid or expired gift card code' });
    if (card.balance <= 0) return res.status(400).json({ success: false, error: 'Gift card balance is $0.00' });

    res.json({
      success: true,
      data: {
        code: card.code,
        balance: card.balance,
        originalAmount: card.amount,
        senderName: card.senderName,
        message: card.message
      }
    });
  });

  /* ── Purchase Gift Card ────────────────────────────────── */
  router.post('/purchase', authenticate, async (req, res) => {
    const { amount, recipientEmail, recipientName, message } = req.body;
    if (!amount || amount < 10) {
      return res.status(400).json({ success: false, error: 'Minimum gift card amount is $10' });
    }
    if (!recipientEmail) {
      return res.status(400).json({ success: false, error: 'Recipient email is required' });
    }

    const db = readDB();
    ensureGiftCards(db);

    const sender = db.users.find(u => u.id === req.userId) || { name: 'A Friend' };
    const randomCode = 'GIFT-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

    const newCard = {
      code:           randomCode,
      amount:         parseFloat(amount),
      balance:        parseFloat(amount),
      senderId:       req.userId,
      senderName:     sender.name,
      recipientEmail: recipientEmail.toLowerCase(),
      recipientName:  recipientName || 'Friend',
      message:        message || 'A gift for you from ShopNova!',
      purchasedAt:    new Date().toISOString(),
      status:         'active'
    };

    db.giftCards.push(newCard);
    writeDB(db);

    res.status(201).json({
      success: true,
      message: `Gift card ${randomCode} ($${amount}) created and sent to ${recipientEmail}!`,
      data: newCard
    });
  });

  /* ── Redeem / Apply Gift Card ─────────────────────────── */
  router.post('/redeem', authenticate, (req, res) => {
    const { code, orderTotal } = req.body;
    if (!code || !orderTotal) return res.status(400).json({ success: false, error: 'code and orderTotal required' });

    const db   = readDB();
    ensureGiftCards(db);
    const card = db.giftCards.find(g => g.code === code.toUpperCase().trim() && g.status === 'active');

    if (!card) return res.status(404).json({ success: false, error: 'Invalid or expired gift card' });
    if (card.balance <= 0) return res.status(400).json({ success: false, error: 'Gift card has zero balance' });

    const appliedAmount = Math.min(card.balance, parseFloat(orderTotal));
    card.balance = parseFloat((card.balance - appliedAmount).toFixed(2));
    if (card.balance === 0) card.status = 'depleted';

    writeDB(db);

    res.json({
      success: true,
      message: `Applied $${appliedAmount.toFixed(2)} from gift card!`,
      data: {
        appliedAmount,
        remainingBalance: card.balance,
        newTotal: Math.max(0, parseFloat(orderTotal) - appliedAmount)
      }
    });
  });

  /* ── User's Gift Cards ────────────────────────────────── */
  router.get('/my-cards', authenticate, (req, res) => {
    const db = readDB();
    ensureGiftCards(db);
    const user = db.users.find(u => u.id === req.userId);
    const cards = db.giftCards.filter(g =>
      g.senderId === req.userId || (user && g.recipientEmail === user.email.toLowerCase())
    );
    res.json({ success: true, data: cards, total: cards.length });
  });

  return router;
};
