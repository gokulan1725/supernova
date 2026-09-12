/* ============================================================
   routes/email.js  — Email & Password Reset API
   ============================================================
   POST /api/email/password-reset        Request password reset link
   POST /api/email/password-reset/verify Verify token + set new password
   POST /api/email/low-stock-alert       Admin trigger low-stock alert
   POST /api/email/test                  Admin test email send
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const mailer  = require('../utils/mailer');

module.exports = function (requireAdmin, readDB, writeDB) {

  /* ── In-memory store for reset tokens (use Redis in prod) ─ */
  const resetTokens = new Map(); // token → { userId, expiresAt }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/email/password-reset
     Body: { email }
     Sends a password reset link to the user's email
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/password-reset', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    const db   = readDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

    // Always respond OK to avoid user enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate secure token
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    resetTokens.set(token, { userId: user.id, expiresAt });

    // Auto-cleanup after expiry
    setTimeout(() => resetTokens.delete(token), 15 * 60 * 1000);

    await mailer.sendPasswordReset(user, token);
    console.log(`🔑 Password reset token for ${email}: ${token}`);

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/email/password-reset/verify
     Body: { token, newPassword }
     Verifies the token and sets the new password
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/password-reset/verify', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const entry = resetTokens.get(token);
    if (!entry)                          return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    if (Date.now() > entry.expiresAt)   { resetTokens.delete(token); return res.status(400).json({ success: false, error: 'Reset token has expired' }); }

    const db  = readDB();
    const idx = db.users.findIndex(u => u.id === entry.userId);
    if (idx === -1) return res.status(404).json({ success: false, error: 'User not found' });

    const bcrypt = require('bcryptjs');
    db.users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
    delete db.users[idx].password;
    writeDB(db);

    resetTokens.delete(token);
    console.log(`✅ Password reset successful for user ${entry.userId}`);

    res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/email/low-stock-alert
     Admin: sends a low-stock alert email listing all products < threshold
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/low-stock-alert', requireAdmin, async (req, res) => {
    const { threshold = 10 } = req.body;
    const db = readDB();

    const lowStockProducts = db.products.filter(p => p.stock <= parseInt(threshold));
    if (!lowStockProducts.length) {
      return res.json({ success: true, message: 'No low-stock products found', count: 0 });
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@shopnova.com';
    await mailer.sendLowStockAlert(adminEmail, lowStockProducts);

    res.json({ success: true, message: `Low-stock alert sent for ${lowStockProducts.length} product(s)`, count: lowStockProducts.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/email/test
     Admin: send a test email to verify SMTP config
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/test', requireAdmin, async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, error: 'Recipient email (to) is required' });
    try {
      await mailer.sendWelcome({ name: 'Test User', email: to, joinDate: new Date().toISOString().split('T')[0], tier: 'Bronze' });
      res.json({ success: true, message: `Test email sent to ${to}` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
