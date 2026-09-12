/* ============================================================
   routes/payments.js  — Stripe Payment Integration
   ============================================================
   Endpoints:
     POST /api/payments/create-checkout-session  (Stripe hosted checkout)
     POST /api/payments/create-payment-intent    (Custom checkout)
     POST /api/payments/confirm                  (Confirm payment intent)
     GET  /api/payments/order/:orderId           (Payment status)
     POST /api/payments/webhook                  (Stripe webhook handler)
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (authenticate, readDB, writeDB) {

  /* ── Stripe client (lazy-init so server starts without key) ─ */
  let stripe = null;
  function getStripe() {
    if (!stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith('sk_test_YOUR')) {
        throw new Error('STRIPE_SECRET_KEY not configured in .env');
      }
      stripe = require('stripe')(key);
    }
    return stripe;
  }

  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  /* ── Helper: build Stripe line items from our cart items ──── */
  function buildLineItems(items, products) {
    return items.map(item => {
      const pid  = item.productId || item.id;
      const prod = products.find(p => p.id === pid);
      if (!prod) return null;
      return {
        price_data: {
          currency:     'usd',
          unit_amount:  Math.round((item.price || prod.price) * 100), // cents
          product_data: {
            name:        prod.name,
            description: (prod.description || '').slice(0, 255),
            images:      prod.image ? [prod.image] : [],
            metadata:    { productId: String(prod.id), brand: prod.brand || '' }
          }
        },
        quantity: item.qty || 1
      };
    }).filter(Boolean);
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/payments/create-checkout-session
     Body: { orderId, items:[{productId, qty, price}], total, userId, address }
     Returns: { url } — redirect user to Stripe hosted checkout
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/create-checkout-session', async (req, res) => {
    try {
      const s = getStripe();
      const db = readDB();
      const { orderId, items, total, userId, address, coupon } = req.body;

      if (!items || !items.length) {
        return res.status(400).json({ success: false, error: 'No items provided' });
      }

      const lineItems = buildLineItems(items, db.products);
      if (!lineItems.length) {
        return res.status(400).json({ success: false, error: 'Could not resolve product details' });
      }

      // Optional shipping cost line item
      if (total && req.body.shippingCost > 0) {
        lineItems.push({
          price_data: {
            currency:    'usd',
            unit_amount: Math.round(req.body.shippingCost * 100),
            product_data: { name: 'Shipping', description: req.body.shippingMethod || 'Standard Delivery' }
          },
          quantity: 1
        });
      }

      const session = await s.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items:            lineItems,
        mode:                  'payment',
        success_url: `${BASE_URL}/order-tracking.html?orderId=${orderId}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${BASE_URL}/checkout.html?payment=cancelled`,
        metadata: {
          orderId:   orderId   || '',
          userId:    userId    || '',
          coupon:    coupon    || '',
          address:   address   || ''
        },
        // Pre-fill email if we have the user
        ...(userId && (() => {
          const user = db.users.find(u => u.id === userId);
          return user ? { customer_email: user.email } : {};
        })())
      });

      // Save session ID against the order for later verification
      if (orderId) {
        const idx = db.orders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          db.orders[idx].stripeSessionId = session.id;
          db.orders[idx].paymentStatus   = 'pending';
          writeDB(db);
        }
      }

      res.json({ success: true, url: session.url, sessionId: session.id });

    } catch (err) {
      console.error('❌ Stripe checkout error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/payments/create-payment-intent
     Body: { amount (USD), orderId, currency }
     Returns: { clientSecret } — for custom Stripe Elements UI
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/create-payment-intent', authenticate, async (req, res) => {
    try {
      const s = getStripe();
      const { amount, orderId, currency = 'usd' } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Valid amount is required' });
      }

      const intent = await s.paymentIntents.create({
        amount:   Math.round(parseFloat(amount) * 100), // cents
        currency,
        metadata: { orderId: orderId || '', userId: req.userId }
      });

      res.json({ success: true, clientSecret: intent.client_secret, paymentIntentId: intent.id });

    } catch (err) {
      console.error('❌ PaymentIntent error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/payments/confirm
     Body: { paymentIntentId, orderId }
     Returns: payment status after manual confirmation
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/confirm', authenticate, async (req, res) => {
    try {
      const s = getStripe();
      const { paymentIntentId, orderId } = req.body;
      if (!paymentIntentId) return res.status(400).json({ success: false, error: 'paymentIntentId required' });

      const intent = await s.paymentIntents.retrieve(paymentIntentId);
      const paid   = intent.status === 'succeeded';

      if (paid && orderId) {
        const db  = readDB();
        const idx = db.orders.findIndex(o => o.id === orderId);
        if (idx !== -1) {
          db.orders[idx].paymentStatus    = 'paid';
          db.orders[idx].paymentIntentId  = paymentIntentId;
          db.orders[idx].paidAt           = new Date().toISOString();
          db.orders[idx].status           = 'confirmed';
          writeDB(db);
        }
      }

      res.json({ success: true, paid, status: intent.status, orderId });

    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/payments/order/:orderId
     Returns payment status for a given order
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/order/:orderId', (req, res) => {
    const db    = readDB();
    const order = db.orders.find(o => o.id === req.params.orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    res.json({
      success:  true,
      orderId:  order.id,
      paymentStatus:   order.paymentStatus   || 'unpaid',
      paymentIntentId: order.paymentIntentId || null,
      stripeSessionId: order.stripeSessionId || null,
      paidAt:          order.paidAt          || null
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/payments/webhook
     Stripe webhook — MUST use raw body (configured below)
     Events handled:
       checkout.session.completed   → mark order paid
       payment_intent.succeeded     → mark order paid
       payment_intent.payment_failed → mark order failed
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/webhook',
    express.raw({ type: 'application/json' }), // MUST be raw body for signature check
    async (req, res) => {
      const sig    = req.headers['stripe-signature'];
      const secret = process.env.STRIPE_WEBHOOK_SECRET;

      let event;
      try {
        if (secret && sig) {
          event = getStripe().webhooks.constructEvent(req.body, sig, secret);
        } else {
          // Dev mode: parse body without signature verification
          event = JSON.parse(req.body.toString());
          console.warn('⚠️  Stripe webhook: no secret configured, skipping signature check');
        }
      } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      const db = readDB();

      switch (event.type) {

        case 'checkout.session.completed': {
          const session = event.data.object;
          const orderId = session.metadata?.orderId;
          if (orderId) {
            const idx = db.orders.findIndex(o => o.id === orderId);
            if (idx !== -1) {
              db.orders[idx].paymentStatus   = 'paid';
              db.orders[idx].stripeSessionId = session.id;
              db.orders[idx].paidAt          = new Date().toISOString();
              db.orders[idx].status          = db.orders[idx].status === 'processing' ? 'confirmed' : db.orders[idx].status;
              // Add a notification
              if (!db.notifications) db.notifications = [];
              db.notifications.unshift({
                id:      'n' + Date.now(),
                type:    'order',
                icon:    '✅',
                title:   'Payment Confirmed',
                message: `Payment for order ${orderId} was successful!`,
                time:    'just now',
                read:    false
              });
              writeDB(db);
              console.log(`✅ Order ${orderId} marked as PAID via Stripe Checkout`);
            }
          }
          break;
        }

        case 'payment_intent.succeeded': {
          const intent  = event.data.object;
          const orderId = intent.metadata?.orderId;
          if (orderId) {
            const idx = db.orders.findIndex(o => o.id === orderId);
            if (idx !== -1) {
              db.orders[idx].paymentStatus    = 'paid';
              db.orders[idx].paymentIntentId  = intent.id;
              db.orders[idx].paidAt           = new Date().toISOString();
              db.orders[idx].status           = 'confirmed';
              writeDB(db);
              console.log(`✅ Order ${orderId} marked as PAID via PaymentIntent`);
            }
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const intent  = event.data.object;
          const orderId = intent.metadata?.orderId;
          if (orderId) {
            const idx = db.orders.findIndex(o => o.id === orderId);
            if (idx !== -1) {
              db.orders[idx].paymentStatus = 'failed';
              writeDB(db);
              console.warn(`❌ Payment FAILED for order ${orderId}`);
            }
          }
          break;
        }

        default:
          console.log(`ℹ️  Unhandled Stripe event: ${event.type}`);
      }

      res.json({ received: true });
    }
  );

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/payments/config
     Returns Stripe publishable key (safe to expose to frontend)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/config', (req, res) => {
    const key = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!key || key.startsWith('pk_test_YOUR')) {
      return res.status(503).json({ success: false, error: 'Stripe not configured' });
    }
    res.json({ success: true, publishableKey: key });
  });

  return router;
};
