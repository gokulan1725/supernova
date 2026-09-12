/* ============================================================
   utils/mailer.js  — Email Notification Service
   ============================================================
   Supports: Nodemailer with any SMTP provider
   Dev mode:  Uses Ethereal (fake SMTP) when no credentials set
   Templates: Order Confirmation, Shipping Update, Welcome, Password Reset
   ============================================================ */
'use strict';

const nodemailer = require('nodemailer');

let _transporter = null;
let _testAccount  = null;

/* ── Create / reuse the SMTP transporter ─────────────────── */
async function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    // Real SMTP (Gmail, SendGrid, Mailgun, etc.)
    _transporter = nodemailer.createTransport({
      host,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user, pass }
    });
    console.log('📧 Mailer: using real SMTP →', host);
  } else {
    // Dev mode: Ethereal fake SMTP (emails captured at ethereal.email)
    _testAccount  = await nodemailer.createTestAccount();
    _transporter  = nodemailer.createTransport({
      host:   'smtp.ethereal.email',
      port:   587,
      secure: false,
      auth: {
        user: _testAccount.user,
        pass: _testAccount.pass
      }
    });
    console.log('📧 Mailer: using Ethereal (dev) — preview at https://ethereal.email');
  }

  return _transporter;
}

/* ── Shared HTML email shell ─────────────────────────────── */
function wrapHTML(content, title = 'ShopNova') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; }
    .shell { max-width: 600px; margin: 0 auto; background: #1a1a2e; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #6C63FF 0%, #4776E6 100%); padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 28px; letter-spacing: -0.5px; }
    .header span { color: rgba(255,255,255,0.8); font-size: 13px; }
    .body { padding: 36px 40px; }
    .card { background: #16213e; border-radius: 12px; padding: 20px 24px; margin: 20px 0; border: 1px solid rgba(108,99,255,0.2); }
    .card h3 { color: #a78bfa; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 14px; }
    .row:last-child { border: none; }
    .row .label { color: #94a3b8; }
    .row .val   { color: #e2e8f0; font-weight: 600; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; background: #6C63FF22; color: #a78bfa; border: 1px solid #6C63FF55; }
    .btn { display: block; width: fit-content; margin: 24px auto 0; padding: 14px 36px; background: linear-gradient(135deg, #6C63FF, #4776E6); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; }
    .footer { padding: 20px 40px; text-align: center; font-size: 12px; color: #475569; border-top: 1px solid rgba(255,255,255,0.06); }
    .divider { height: 1px; background: rgba(255,255,255,0.06); margin: 24px 0; }
    h2 { font-size: 22px; margin-bottom: 8px; }
    p  { font-size: 14px; line-height: 1.7; color: #94a3b8; }
  </style>
</head>
<body>
  <div style="padding:24px">
    <div class="shell">
      <div class="header">
        <h1>🛍️ ShopNova</h1>
        <span>Your Premium Shopping Destination</span>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        © ${new Date().getFullYear()} ShopNova Inc. · All rights reserved<br/>
        You received this email because you have an account at ShopNova.
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ══════════════════════════════════════════════════════════
   EMAIL TEMPLATES
   ══════════════════════════════════════════════════════════ */

/* ── Order Confirmation ──────────────────────────────────── */
function orderConfirmationHTML(order, user, products = []) {
  const itemRows = (order.items || []).map(item => {
    const pid  = item.productId || item.id;
    const prod = products.find(p => p.id === pid);
    const name = prod ? prod.name : `Product #${pid}`;
    return `<div class="row"><span class="label">${name} × ${item.qty || 1}</span><span class="val">$${((item.price || 0) * (item.qty || 1)).toFixed(2)}</span></div>`;
  }).join('');

  const statusColor = { processing:'#F59E0B', confirmed:'#10B981', shipped:'#6C63FF', delivered:'#43E97B' };
  const color       = statusColor[order.status] || '#6C63FF';

  const content = `
    <h2>🎉 Order Confirmed!</h2>
    <p>Hi <strong>${user?.name || 'Valued Customer'}</strong>, thank you for shopping with ShopNova! Your order has been placed successfully.</p>
    <div class="divider"></div>
    <div class="card">
      <h3>Order Details</h3>
      <div class="row"><span class="label">Order ID</span><span class="val">${order.id}</span></div>
      <div class="row"><span class="label">Date</span><span class="val">${order.date}</span></div>
      <div class="row"><span class="label">Status</span><span class="val"><span class="badge" style="color:${color};border-color:${color}44;background:${color}11">${order.status.toUpperCase()}</span></span></div>
      <div class="row"><span class="label">Shipping to</span><span class="val">${order.address || 'N/A'}</span></div>
    </div>
    <div class="card">
      <h3>Items Ordered</h3>
      ${itemRows}
      <div class="divider"></div>
      <div class="row"><span class="label">Subtotal</span><span class="val">$${(order.total - (order.shipping || 0)).toFixed(2)}</span></div>
      <div class="row"><span class="label">Shipping</span><span class="val">${order.shipping > 0 ? '$' + order.shipping.toFixed(2) : 'FREE'}</span></div>
      <div class="row"><span class="label" style="color:#e2e8f0;font-weight:700">Total Paid</span><span class="val" style="color:#6C63FF;font-size:18px">$${Number(order.total).toFixed(2)}</span></div>
    </div>
    <a class="btn" href="http://localhost:3000/order-tracking.html?orderId=${order.id}">Track Your Order →</a>`;

  return wrapHTML(content, `Order ${order.id} Confirmed — ShopNova`);
}

/* ── Shipping Update ─────────────────────────────────────── */
function shippingUpdateHTML(order, user, newStatus) {
  const statusMessages = {
    shipped:   { emoji: '🚚', msg: 'Great news! Your order is on its way.',  sub: 'Your package has been picked up by our carrier.' },
    out:       { emoji: '🏍️', msg: 'Out for delivery today!',                 sub: 'Your order will arrive today. Please be available.' },
    delivered: { emoji: '🎉', msg: 'Your order has been delivered!',          sub: 'We hope you love your purchase. Leave a review!' }
  };
  const s = statusMessages[newStatus] || { emoji: '📦', msg: `Order status updated to ${newStatus}`, sub: '' };

  const content = `
    <h2>${s.emoji} ${s.msg}</h2>
    <p>${s.sub}</p>
    <div class="divider"></div>
    <div class="card">
      <h3>Order Info</h3>
      <div class="row"><span class="label">Order ID</span><span class="val">${order.id}</span></div>
      <div class="row"><span class="label">New Status</span><span class="val">${newStatus.toUpperCase()}</span></div>
      <div class="row"><span class="label">Deliver to</span><span class="val">${order.address || 'N/A'}</span></div>
    </div>
    <a class="btn" href="http://localhost:3000/order-tracking.html?orderId=${order.id}">View Tracking →</a>`;

  return wrapHTML(content, `Order Update — ShopNova`);
}

/* ── Welcome Email ───────────────────────────────────────── */
function welcomeHTML(user) {
  const content = `
    <h2>👋 Welcome to ShopNova, ${user.name}!</h2>
    <p>We're thrilled to have you on board. Your account has been created successfully.</p>
    <div class="card">
      <h3>Your Account</h3>
      <div class="row"><span class="label">Name</span><span class="val">${user.name}</span></div>
      <div class="row"><span class="label">Email</span><span class="val">${user.email}</span></div>
      <div class="row"><span class="label">Member Since</span><span class="val">${user.joinDate}</span></div>
      <div class="row"><span class="label">Tier</span><span class="val"><span class="badge">${user.tier || 'Bronze'}</span></span></div>
    </div>
    <p style="margin-top:16px">Start exploring thousands of products — from electronics to fashion, home decor and more.</p>
    <a class="btn" href="http://localhost:3000/index.html">Start Shopping →</a>`;

  return wrapHTML(content, `Welcome to ShopNova!`);
}

/* ── Password Reset ──────────────────────────────────────── */
function passwordResetHTML(user, resetToken) {
  const link    = `http://localhost:3000/reset-password.html?token=${resetToken}`;
  const content = `
    <h2>🔑 Password Reset Request</h2>
    <p>Hi <strong>${user.name}</strong>, we received a request to reset your ShopNova password.</p>
    <div class="card" style="text-align:center;padding:28px">
      <p style="color:#94a3b8;font-size:13px;margin-bottom:16px">This link expires in <strong style="color:#e2e8f0">15 minutes</strong></p>
      <a class="btn" href="${link}" style="margin:0 auto">Reset My Password →</a>
    </div>
    <p style="margin-top:20px;font-size:12px;color:#64748b">If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>`;

  return wrapHTML(content, `Reset Your Password — ShopNova`);
}

/* ── Low Stock Alert (Admin) ─────────────────────────────── */
function lowStockHTML(products) {
  const rows = products.map(p =>
    `<div class="row"><span class="label">${p.name}</span><span class="val" style="color:#F59E0B">${p.stock} left</span></div>`
  ).join('');

  const content = `
    <h2>⚠️ Low Stock Alert</h2>
    <p>The following products are running low on inventory and need restocking.</p>
    <div class="card">
      <h3>${products.length} Product${products.length > 1 ? 's' : ''} Need Attention</h3>
      ${rows}
    </div>
    <a class="btn" href="http://localhost:3000/admin.html">Go to Admin Panel →</a>`;

  return wrapHTML(content, `Low Stock Alert — ShopNova Admin`);
}

/* ── Abandoned Cart Reminder ─────────────────────────────── */
function abandonedCartHTML(user, cartItems, products = []) {
  const itemRows = cartItems.map(item => {
    const pid  = item.productId;
    const prod = products.find(p => p.id === pid);
    const name = prod ? prod.name : `Product #${pid}`;
    const img  = prod ? prod.image : '';
    const price = (item.price || prod?.price || 0).toFixed(2);
    return `
      <div class="row">
        <span class="label" style="display:flex;align-items:center;gap:10px">
          ${img ? `<img src="${img}" width="36" height="36" style="border-radius:8px;object-fit:cover" />` : ''}
          ${name}
        </span>
        <span class="val">$${price} × ${item.qty || item.quantity || 1}</span>
      </div>`;
  }).join('');

  const cartUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/cart.html`;
  const content = `
    <h2>🛒 You left something behind!</h2>
    <p>Hi <strong>${user?.name || 'there'}</strong>, we noticed you left some items in your cart. They're still waiting for you!</p>
    <div class="divider"></div>
    <div class="card">
      <h3>Your Cart Items</h3>
      ${itemRows}
    </div>
    <p style="margin-top:16px;font-size:13px;color:#64748b">⚡ These items are popular — don't let them sell out!</p>
    <a class="btn" href="${cartUrl}">Complete Your Purchase →</a>
    <p style="margin-top:20px;font-size:11px;color:#475569">If you've already completed your purchase, please ignore this email.</p>`;

  return wrapHTML(content, 'Your ShopNova cart is waiting!');
}

/* ══════════════════════════════════════════════════════════
   PUBLIC SEND FUNCTIONS
   ══════════════════════════════════════════════════════════ */

const FROM = process.env.SMTP_FROM || '"ShopNova" <noreply@shopnova.com>';

async function send(to, subject, html) {
  if (!to) { console.warn('📧 Mailer: skipping — no recipient email'); return null; }
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({ from: FROM, to, subject, html });
    // In dev mode, log the Ethereal preview URL
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log(`📧 Email preview: ${previewUrl}`);
    return info;
  } catch (err) {
    console.error('📧 Email send error:', err.message);
    return null;
  }
}

module.exports = {
  /* Send order confirmation to buyer */
  sendOrderConfirmation: async (order, user, products) => {
    return send(
      user?.email,
      `✅ Order ${order.id} Confirmed — ShopNova`,
      orderConfirmationHTML(order, user, products)
    );
  },

  /* Send shipping status update to buyer */
  sendShippingUpdate: async (order, user, newStatus) => {
    return send(
      user?.email,
      `📦 Your ShopNova order is ${newStatus}`,
      shippingUpdateHTML(order, user, newStatus)
    );
  },

  /* Send welcome email to new user */
  sendWelcome: async (user) => {
    return send(
      user?.email,
      `👋 Welcome to ShopNova, ${user.name}!`,
      welcomeHTML(user)
    );
  },

  /* Send password reset email */
  sendPasswordReset: async (user, resetToken) => {
    return send(
      user?.email,
      '🔑 Reset Your ShopNova Password',
      passwordResetHTML(user, resetToken)
    );
  },

  /* Send low-stock alert to admin */
  sendLowStockAlert: async (adminEmail, products) => {
    return send(
      adminEmail,
      `⚠️ Low Stock Alert — ${products.length} product(s) need restocking`,
      lowStockHTML(products)
    );
  },

  /* Send abandoned cart reminder */
  sendAbandonedCart: async (user, cartItems, products) => {
    return send(
      user?.email,
      '🛒 You left items in your ShopNova cart!',
      abandonedCartHTML(user, cartItems, products)
    );
  },

  /* Send 2FA OTP email */
  sendOTP: async (user, otp) => {
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#0A0B0E;min-height:100vh;padding:40px 20px">
        <div style="max-width:480px;margin:0 auto;background:#141720;border-radius:24px;border:1px solid rgba(255,255,255,0.08);overflow:hidden">
          <div style="background:linear-gradient(135deg,#6C63FF,#EC4899);padding:32px;text-align:center">
            <div style="font-size:48px;margin-bottom:8px">🔐</div>
            <h1 style="color:white;font-size:22px;font-weight:800;margin:0">Security Verification</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px">ShopNova Two-Factor Authentication</p>
          </div>
          <div style="padding:32px;text-align:center">
            <p style="color:#A8B2D8;font-size:15px;margin-bottom:24px">Hi <strong style="color:#F0F2FF">${user.name}</strong>, here is your one-time verification code:</p>
            <div style="background:#1A1E2E;border:2px dashed rgba(108,99,255,0.4);border-radius:16px;padding:24px;margin:24px 0">
              <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#6C63FF;font-family:monospace">${otp}</div>
            </div>
            <p style="color:#6B7299;font-size:13px;margin-top:16px">⏱️ This code expires in <strong style="color:#FF6B35">10 minutes</strong>.<br>Do not share this code with anyone.</p>
            <div style="margin-top:24px;padding:16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px">
              <p style="color:#EF4444;font-size:12px;margin:0">🚨 If you didn't request this code, your account may be at risk. <a href="mailto:support@shopnova.com" style="color:#EF4444">Contact support</a> immediately.</p>
            </div>
          </div>
          <div style="padding:16px;text-align:center;border-top:1px solid rgba(255,255,255,0.06)">
            <p style="color:#3D4466;font-size:11px;margin:0">© ${new Date().getFullYear()} ShopNova Inc. All rights reserved.</p>
          </div>
        </div>
      </div>
    `;
    return send(user.email, '🔐 Your ShopNova Verification Code', html);
  },

  /* Send Price Drop Alert email */
  sendPriceDropAlert: async (email, userName, product, currentPrice, targetPrice) => {
    const html = wrapHTML(`
      <h2>🎉 Good News! Price Drop Alert</h2>
      <p>Hi <strong>${userName || 'Shopper'}</strong>, an item on your watchlist just dropped in price!</p>
      
      <div class="card" style="display:flex;align-items:center;gap:16px;">
        <img src="${product.image}" alt="${product.name}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" />
        <div>
          <h3 style="color:#fff;font-size:16px;margin-bottom:6px;">${product.name}</h3>
          <div style="font-size:18px;font-weight:800;color:#43E97B;">
            Now ₹${Math.round(Number(currentPrice)).toLocaleString('en-IN')} 
            <span style="font-size:13px;color:#94a3b8;text-decoration:line-through;margin-left:6px;">₹${Math.round(Number(product.originalPrice || targetPrice)).toLocaleString('en-IN')}</span>
          </div>
          <p style="font-size:12px;color:#a78bfa;margin-top:4px;">🎯 Your target was ₹${Math.round(Number(targetPrice)).toLocaleString('en-IN')}</p>
        </div>
      </div>
      
      <a href="${process.env.BASE_URL || 'http://localhost:3000'}/product-detail.html?id=${product.id}" class="btn">🛒 Buy Now Before Stock Runs Out</a>
    `, 'Price Drop Alert — ShopNova');

    return send(email, `🔥 Price Drop Alert: ${product.name} is now ₹${Math.round(Number(currentPrice)).toLocaleString('en-IN')}!`, html);
  },

  /* Send Back-In-Stock Alert email */
  sendBackInStockAlert: async (email, userName, product) => {
    const html = wrapHTML(`
      <h2>📦 Back in Stock Alert!</h2>
      <p>Hi <strong>${userName || 'Shopper'}</strong>, great news! An item you were waiting for is back in stock.</p>
      
      <div class="card" style="display:flex;align-items:center;gap:16px;">
        <img src="${product.image}" alt="${product.name}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" />
        <div>
          <h3 style="color:#fff;font-size:16px;margin-bottom:6px;">${product.name}</h3>
          <div style="font-size:18px;font-weight:800;color:#6C63FF;">$${Number(product.price).toFixed(2)}</div>
          <p style="font-size:12px;color:#43E97B;margin-top:4px;">✅ In Stock Now (${product.stock || 'Limited'} available)</p>
        </div>
      </div>
      
      <a href="${process.env.BASE_URL || 'http://localhost:3000'}/product-detail.html?id=${product.id}" class="btn">⚡ Grab Yours Now</a>
    `, 'Back in Stock — ShopNova');

    return send(email, `📦 Back in Stock: ${product.name} is available now!`, html);
  }
};
