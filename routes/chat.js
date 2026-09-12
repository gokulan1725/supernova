/* ============================================================
   routes/chat.js  — Live Chat API
   ============================================================
   GET  /api/chat/history      Load chat history for user
   POST /api/chat/send         Save message to DB
   GET  /api/chat/admin        Admin: all active chat sessions
   DELETE /api/chat/:userId    Admin: close a chat session
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

const https = require('https');

const FAQ_RESPONSES = [
  { keywords: ['track','order','delivery','shipped','where is my order'], response: '📦 You can track your order at <a href="order-tracking.html">Order Tracking</a>. Enter your Order ID (e.g. SN-2024-001) for live status!' },
  { keywords: ['return','refund','exchange'], response: '🔄 We offer 30-day hassle-free returns! Go to <a href="profile.html">My Orders</a> and click "Return Item". Refunds process in 3-5 days.' },
  { keywords: ['cancel','cancellation'], response: '❌ To cancel, visit <a href="profile.html">My Orders</a> within 24 hours of ordering.' },
  { keywords: ['payment','pay','credit card','stripe'], response: '💳 We accept Visa, Mastercard, Amex, Apple Pay via secure Stripe checkout.' },
  { keywords: ['password','forgot','reset'], response: '🔑 Click "Forgot Password" on the <a href="login.html">Login Page</a> to receive a reset link.' },
  { keywords: ['coupon','discount','promo'], response: '🎁 Enter promo codes at checkout! Visit <a href="products.html">Flash Deals</a> for today\'s discounts.' }
];

async function callExternalLLM(prompt, contextProducts) {
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) return null;
  try {
    if (process.env.OPENAI_API_KEY) {
      const body = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are ShopNova AI Assistant. Provide helpful, enthusiastic product advice based on catalog products.' },
          { role: 'user', content: `User query: "${prompt}". Catalog items available: ${JSON.stringify(contextProducts.slice(0, 5))}` }
        ],
        max_tokens: 150
      });
      return await new Promise((resolve) => {
        const req = https.request('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          timeout: 4000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json.choices?.[0]?.message?.content || null);
            } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
      });
    }
  } catch {
    return null;
  }
  return null;
}

async function getAIShoppingResponse(message, db) {
  const lower = message.toLowerCase();

  // 1. Direct operational FAQs check
  for (const faq of FAQ_RESPONSES) {
    if (faq.keywords.some(kw => lower.includes(kw))) {
      return { message: faq.response, recommendations: [] };
    }
  }

  // 2. Budget price parsing
  let maxPrice = null;
  const budgetMatch = lower.match(/(?:under|below|less than|budget|max|\$)\s*\$?(\d+)/i);
  if (budgetMatch) {
    maxPrice = parseFloat(budgetMatch[1]);
  }

  // 3. Scan product catalog in db
  const products = (db && db.products) ? db.products : [];
  const queryTerms = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 2);
  
  let scoredProducts = products.map(p => {
    let score = 0;
    const text = `${p.name} ${p.category} ${p.subcategory || ''} ${p.brand || ''} ${(p.tags || []).join(' ')} ${p.description || ''}`.toLowerCase();
    
    queryTerms.forEach(term => {
      if (p.name.toLowerCase().includes(term)) score += 5;
      else if (p.category.toLowerCase().includes(term)) score += 4;
      else if (p.subcategory && p.subcategory.toLowerCase().includes(term)) score += 3;
      else if (text.includes(term)) score += 1;
    });

    if (maxPrice && p.price > maxPrice) {
      score = -1; // Exclude over budget
    }

    return { product: p, score };
  }).filter(item => item.score > 0);

  // Sort by highest relevance score, then rating
  scoredProducts.sort((a, b) => b.score - a.score || (b.product.rating || 0) - (a.product.rating || 0));

  let recommendations = scoredProducts.slice(0, 3).map(item => ({
    id: item.product.id,
    name: item.product.name,
    category: item.product.category,
    price: item.product.price,
    originalPrice: item.product.originalPrice || null,
    rating: item.product.rating || 4.5,
    image: item.product.image,
    badge: item.product.badge || null
  }));

  // Attempt external LLM call if configured
  const externalText = await callExternalLLM(message, recommendations.length ? recommendations : products);
  if (externalText) {
    return { message: externalText, recommendations };
  }

  // 4. Fallback Natural AI catalog summary generator
  if (recommendations.length > 0) {
    let priceText = maxPrice ? ` under $${maxPrice}` : '';
    let categoryText = recommendations[0].category ? ` ${recommendations[0].category}` : '';
    let responseText = `✨ **ShopNova AI Recommendation**: I found ${recommendations.length} top-rated${categoryText} item(s)${priceText} matching your request:`;
    return { message: responseText, recommendations };
  }

  // Generic fallback greeting / general help
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('assistant')) {
    return {
      message: "👋 Hi! I'm **ShopNova AI Shopping Assistant**. I can help you find products, compare prices, or recommend items! Try asking: *'Recommend headphones under $400'* or *'Show me top fashion deals'*.",
      recommendations: []
    };
  }

  // Fallback top bestsellers if no specific match
  const bestsellers = products.filter(p => p.badge === 'bestseller' || (p.rating && p.rating >= 4.7)).slice(0, 2);
  const fallbackRecs = bestsellers.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    originalPrice: p.originalPrice || null,
    rating: p.rating || 4.5,
    image: p.image,
    badge: p.badge || 'bestseller'
  }));

  return {
    message: "🤖 I couldn't find an exact match for that specific term, but here are some of our **highest-rated bestsellers** you might love:",
    recommendations: fallbackRecs
  };
}

module.exports = function(authenticate, requireAdmin, readDB, writeDB) {

  /* ── Ensure chat store exists ──────────────────────────── */
  function ensureChats(db) {
    if (!db.chats) { db.chats = {}; writeDB(db); }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/chat/history  — user's message history
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/history', authenticate, (req, res) => {
    const db = readDB();
    ensureChats(db);
    const history = db.chats[req.userId] || [];
    res.json({ success: true, data: history, total: history.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/chat/send  — save message + AI Shopping Assistant reply
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/send', async (req, res) => {
    const { message, userId } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

    const db = readDB();
    ensureChats(db);

    const uid = req.userId || userId || 'guest_' + Date.now();
    if (!db.chats[uid]) db.chats[uid] = [];

    const userMsg = {
      id:        'cm' + Date.now(),
      role:      'user',
      message,
      timestamp: new Date().toISOString(),
      read:      false
    };

    db.chats[uid].push(userMsg);

    // AI Shopping Assistant Reply
    const aiResult = await getAIShoppingResponse(message, db);

    const botMsg = {
      id:              'cm' + (Date.now() + 1),
      role:            'bot',
      message:         aiResult.message,
      recommendations: aiResult.recommendations || [],
      timestamp:       new Date().toISOString(),
      read:            false
    };

    db.chats[uid].push(botMsg);

    // Keep only last 100 messages per user
    if (db.chats[uid].length > 100) db.chats[uid] = db.chats[uid].slice(-100);

    writeDB(db);
    res.status(201).json({ success: true, data: { userMessage: userMsg, botReply: botMsg } });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/chat/admin  — Admin: all sessions (latest msg)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/admin', requireAdmin, (req, res) => {
    const db = readDB();
    ensureChats(db);

    const sessions = Object.entries(db.chats).map(([userId, msgs]) => {
      const user = db.users.find(u => u.id === userId);
      const lastMsg = msgs[msgs.length - 1] || {};
      const unread  = msgs.filter(m => !m.read && m.role === 'user').length;
      return {
        userId,
        userName:  user?.name || 'Guest',
        userEmail: user?.email || 'Unknown',
        lastMessage: lastMsg.message || '',
        lastTime:    lastMsg.timestamp || '',
        unreadCount: unread,
        totalMessages: msgs.length
      };
    }).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));

    res.json({ success: true, data: sessions, total: sessions.length });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/chat/admin/reply  — Admin sends reply
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/admin/reply', requireAdmin, (req, res) => {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ success: false, error: 'userId and message required' });

    const db = readDB();
    ensureChats(db);
    if (!db.chats[userId]) db.chats[userId] = [];

    const adminMsg = {
      id:        'cm' + Date.now(),
      role:      'admin',
      message,
      timestamp: new Date().toISOString(),
      read:      false
    };

    db.chats[userId].push(adminMsg);
    writeDB(db);
    res.status(201).json({ success: true, data: adminMsg });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     DELETE /api/chat/:userId  — Admin: clear session
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.delete('/:userId', requireAdmin, (req, res) => {
    const db = readDB();
    ensureChats(db);
    delete db.chats[req.params.userId];
    writeDB(db);
    res.json({ success: true, message: 'Chat session cleared' });
  });

  return router;
};
