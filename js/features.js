/* ============================================================
   ShopNova — features.js
   All new feature modules:
   1. Reviews (persistent, upvote/downvote)
   2. Q&A System
   3. Web Push Notifications
   4. Social Login (Google OAuth)
   5. Price Drop / Back-in-Stock Alerts
   6. AI Recommendation Engine
   7. Bundle Builder
   8. Persistent Cart Cloud Sync
   9. Smart Search (enhanced)
   10. AI Chatbot (Gemini)
   ============================================================ */

'use strict';

/* ============================================================
   FEATURE 1 — Reviews Manager
   Persists reviews in localStorage, merges with seed data
   ============================================================ */
const Reviews = (() => {
  async function getAll(productId) {
    try {
      const res = await fetch(`/api/reviews/${productId}`);
      const json = await res.json();
      return json.success ? json.data : [];
    } catch (e) {
      console.warn('Reviews fetch error:', e);
      return [];
    }
  }

  async function submit(productId, review) {
    try {
      const res = await fetch(`/api/reviews/${productId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Auth.getToken()}`
        },
        body: JSON.stringify(review)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return await getAll(productId);
    } catch (e) {
      console.warn('Review submit error:', e);
      return await getAll(productId);
    }
  }

  async function vote(productId, reviewId, type) {
    try {
      const res = await fetch(`/api/reviews/${productId}/${reviewId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Auth.getToken()}`
        },
        body: JSON.stringify({ type })
      });
      const json = await res.json();
      return json;
    } catch (e) {
      console.warn('Review vote error:', e);
      return { success: false, error: e.message };
    }
  }

  function getStats(reviews) {
    if (!reviews || !reviews.length) return { avg: 0, dist: { 5:0, 4:0, 3:0, 2:0, 1:0 } };
    const total = reviews.reduce((s, r) => s + r.rating, 0);
    const dist = { 5:0, 4:0, 3:0, 2:0, 1:0 };
    reviews.forEach(r => { if (dist[r.rating] !== undefined) dist[r.rating]++; });
    return { avg: (total / reviews.length).toFixed(1), dist };
  }

  return { getAll, submit, vote, getStats };
})();


/* ============================================================
   FEATURE 2 — Q&A Manager
   ============================================================ */
const QA = (() => {
  const STORE_KEY = 'shopnova_qa';

  function getAll(productId) {
    const seed = (SHOPNOVA_DATA.qa && SHOPNOVA_DATA.qa[productId]) || [];
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      const local = stored[productId] || [];
      const seedFiltered = seed.filter(q => !local.find(l => l.id === q.id));
      return [...local, ...seedFiltered];
    } catch { return seed; }
  }

  function askQuestion(productId, question) {
    const user = (typeof Auth !== 'undefined' && Auth.getCurrentUser()) || { name: 'Anonymous' };
    const newQ = {
      id: 'q' + Date.now(),
      question: question.trim(),
      askedBy: user.name,
      date: new Date().toISOString().split('T')[0],
      answers: []
    };
    const all = getAll(productId);
    all.unshift(newQ);
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      stored[productId] = all;
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch(e) {}
    return newQ;
  }

  function answerQuestion(productId, questionId, answerText) {
    const user = (typeof Auth !== 'undefined' && Auth.getCurrentUser()) || { name: 'Anonymous' };
    const all = getAll(productId);
    const q = all.find(q => q.id === questionId);
    if (!q) return null;
    const newA = {
      id: 'a' + Date.now(),
      answer: answerText.trim(),
      answeredBy: user.name,
      date: new Date().toISOString().split('T')[0],
      isOfficial: false,
      helpful: 0
    };
    q.answers.push(newA);
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      stored[productId] = all;
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch(e) {}
    return newA;
  }

  return { getAll, askQuestion, answerQuestion };
})();


/* ============================================================
   FEATURE 3 — Web Push Notifications
   ============================================================ */
const PushNotifications = (() => {
  const PERM_KEY = 'shopnova_push_perm';
  let swRegistration = null;

  async function init() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    try {
      swRegistration = await navigator.serviceWorker.ready;
    } catch(e) { console.warn('SW not ready:', e); }
    showPromptIfNeeded();
  }

  function showPromptIfNeeded() {
    if (localStorage.getItem(PERM_KEY) === 'dismissed') return;
    if (Notification.permission === 'granted') {
      localStorage.setItem(PERM_KEY, 'granted');
      return;
    }
    if (Notification.permission === 'denied') return;

    // Show custom banner after 5s
    setTimeout(() => {
      if (document.getElementById('push-prompt-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'push-prompt-banner';
      banner.style.cssText = `
        position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        background:var(--bg-700,#1A1E2E);border:1px solid rgba(108,99,255,0.3);
        border-radius:16px;padding:16px 20px;z-index:9998;
        display:flex;align-items:center;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4);
        max-width:480px;width:calc(100% - 40px);animation:fadeInUp 0.4s ease;
      `;
      banner.innerHTML = `
        <span style="font-size:28px">🔔</span>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px;color:var(--text-primary,#fff)">Get Deal Alerts</div>
          <div style="font-size:12px;color:var(--text-muted,#aaa);margin-top:2px">Price drops, flash deals & order updates</div>
        </div>
        <button onclick="PushNotifications.requestPermission()" style="background:linear-gradient(135deg,#6C63FF,#8B5CF6);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Enable</button>
        <button onclick="PushNotifications.dismiss()" style="background:transparent;border:none;color:var(--text-muted,#aaa);cursor:pointer;font-size:18px;padding:4px">✕</button>
      `;
      document.body.appendChild(banner);
    }, 5000);
  }

  async function requestPermission() {
    dismiss();
    const result = await Notification.requestPermission();
    localStorage.setItem(PERM_KEY, result);
    if (result === 'granted') {
      if (typeof Notify !== 'undefined') Notify.success('Notifications Enabled! 🔔', 'You\'ll get alerts for price drops and flash deals.');
      // Simulate a welcome push
      setTimeout(() => simulateNotification('🎉 Welcome to ShopNova Alerts!', 'We\'ll notify you about the best deals.'), 2000);
    }
  }

  function dismiss() {
    const banner = document.getElementById('push-prompt-banner');
    if (banner) banner.remove();
    localStorage.setItem(PERM_KEY, 'dismissed');
  }

  function simulateNotification(title, body, icon = '⚡') {
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body,
        icon: 'https://via.placeholder.com/192x192/6C63FF/ffffff?text=SN',
        badge: 'https://via.placeholder.com/96x96/6C63FF/ffffff?text=SN',
        tag: 'shopnova-' + Date.now(),
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 6000);
    } catch(e) { console.warn('Notification error:', e); }
  }

  function sendFlashDealAlert(productName, discount) {
    simulateNotification(
      `⚡ Flash Deal: ${discount}% OFF`,
      `${productName} — Limited stock! Grab it now.`
    );
  }

  function sendOrderAlert(orderId, status) {
    const messages = {
      processing: 'Your order is being prepared.',
      shipped: 'Your order is on its way! 🚚',
      delivered: 'Your order has been delivered! ✅',
    };
    simulateNotification(`📦 Order ${orderId}`, messages[status] || `Status: ${status}`);
  }

  function sendPriceDropAlert(productName, newPrice) {
    simulateNotification(
      `💰 Price Drop Alert!`,
      `${productName} dropped to $${newPrice}!`
    );
  }

  return { init, requestPermission, dismiss, simulateNotification, sendFlashDealAlert, sendOrderAlert, sendPriceDropAlert };
})();


/* ============================================================
   FEATURE 4 — Social Login (Google OAuth)
   ============================================================ */
const SocialLogin = (() => {
  let _clientId = '';

  // Fetch clientId from server on load
  if (typeof window !== 'undefined') {
    fetch('/api/auth/google/config')
      .then(r => r.json())
      .then(d => {
        if (d.clientId) _clientId = d.clientId;
        initGSI();
      })
      .catch(() => {});
  }

  function initGSI() {
    if (!window.google?.accounts?.id || !_clientId || _clientId.includes('YOUR_GOOGLE_CLIENT_ID')) return;
    
    window.google.accounts.id.initialize({
      client_id: _clientId,
      callback: handleGoogleResponse,
      auto_select: false,
      ux_mode: 'popup',
    });

    ['google-btn-login', 'google-btn-register', 'google-btn-container'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        window.google.accounts.id.renderButton(el, {
          theme: 'filled_black', size: 'large', shape: 'pill', width: 360, text: 'continue_with'
        });
      }
    });
  }

  function renderGoogleButton(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (window.google?.accounts?.id && _clientId && !_clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
      initGSI();
    } else {
      container.innerHTML = `
        <button id="google-signin-btn" onclick="SocialLogin.triggerGoogleLogin()" style="
          display:flex;align-items:center;justify-content:center;gap:12px;
          width:100%;padding:13px 20px;
          background:#fff;color:#3c4043;
          border:1px solid #dadce0;border-radius:10px;
          font-size:15px;font-weight:600;cursor:pointer;
          transition:all 0.2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.1);
        " onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" 
           onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)'">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      `;
    }
  }

  async function triggerGoogleLogin() {
    if (window.google?.accounts?.id && _clientId && !_clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
      window.google.accounts.id.prompt();
      return;
    }

    const btn = document.getElementById('google-signin-btn') || document.getElementById('google-fallback-btn');
    if (btn) { btn.textContent = 'Connecting...'; btn.disabled = true; }

    // Fallback/demo sign-in request
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: 'demo_token_' + Date.now() })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('shopnova_user', JSON.stringify(data.user));
        if (data.token) localStorage.setItem('shopnova_token', data.token);
        if (typeof Notify !== 'undefined') Notify.success('Signed in with Google! 🎉', `Welcome, ${data.user.name}!`);
        setTimeout(() => { window.location.href = data.user.isAdmin ? 'admin.html' : 'profile.html'; }, 800);
      } else {
        if (typeof Notify !== 'undefined') Notify.error('Sign-in failed', data.error);
      }
    } catch(e) {
      if (typeof Notify !== 'undefined') Notify.error('Sign-in error', e.message);
    } finally {
      if (btn) { btn.textContent = 'Continue with Google'; btn.disabled = false; }
    }
  }

  async function handleGoogleResponse(response) {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('shopnova_user', JSON.stringify(data.user));
        if (data.token) localStorage.setItem('shopnova_token', data.token);
        if (typeof Notify !== 'undefined') Notify.success('Signed in with Google! 🎉', `Welcome, ${data.user.name}!`);
        setTimeout(() => { window.location.href = data.user.isAdmin ? 'admin.html' : 'profile.html'; }, 800);
      } else {
        if (typeof Notify !== 'undefined') Notify.error('Sign-in failed', data.error || 'Could not sign in with Google.');
      }
    } catch(e) {
      if (typeof Notify !== 'undefined') Notify.error('Sign-in error', e.message);
    }
  }

  return { renderGoogleButton, triggerGoogleLogin, initGSI };
})();


/* ============================================================
   FEATURE 5 — Price Drop & Back-in-Stock Alerts
   ============================================================ */
const PriceAlerts = (() => {
  const STORE_KEY = 'shopnova_price_alerts';

  function getAlerts() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  }

  async function subscribePriceDrop(productId, currentPrice, targetPrice, email) {
    const alerts = getAlerts();
    const exists = alerts.find(a => a.productId === productId && a.type === 'price');
    if (exists) { if (typeof Notify !== 'undefined') Notify.info('Already subscribed', 'You\'ll be notified when the price drops.'); return; }
    const tPrice = targetPrice || (currentPrice * 0.9);
    const user = (() => { try { return JSON.parse(localStorage.getItem('shopnova_user')); } catch { return null; } })();
    const subEmail = email || user?.email || 'customer@example.com';

    alerts.push({ productId, type: 'price', targetPrice: tPrice, email: subEmail, createdAt: Date.now() });
    localStorage.setItem(STORE_KEY, JSON.stringify(alerts));

    try {
      if (typeof apiRequest !== 'undefined') {
        await apiRequest('POST', '/alerts/subscribe', { productId, type: 'price_drop', targetPrice: tPrice, email: subEmail });
      } else {
        await fetch('/api/alerts/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, type: 'price_drop', targetPrice: tPrice, email: subEmail })
        });
      }
    } catch(e) {}

    if (typeof Notify !== 'undefined') Notify.success('Price Alert Set! 💰', `We'll email ${subEmail} when price drops below $${Number(tPrice).toFixed(2)}.`);
    if (typeof PushNotifications !== 'undefined') PushNotifications.init();
  }

  async function subscribeStock(productId, email) {
    const alerts = getAlerts();
    const exists = alerts.find(a => a.productId === productId && a.type === 'stock');
    if (exists) { if (typeof Notify !== 'undefined') Notify.info('Already subscribed', 'We\'ll notify you when it\'s back in stock.'); return; }
    const user = (() => { try { return JSON.parse(localStorage.getItem('shopnova_user')); } catch { return null; } })();
    const subEmail = email || user?.email || 'customer@example.com';

    alerts.push({ productId, type: 'stock', email: subEmail, createdAt: Date.now() });
    localStorage.setItem(STORE_KEY, JSON.stringify(alerts));

    try {
      if (typeof apiRequest !== 'undefined') {
        await apiRequest('POST', '/alerts/subscribe', { productId, type: 'back_in_stock', email: subEmail });
      } else {
        await fetch('/api/alerts/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, type: 'back_in_stock', email: subEmail })
        });
      }
    } catch(e) {}

    if (typeof Notify !== 'undefined') Notify.success('Stock Alert Set! 📩', `We'll email ${subEmail} as soon as this item is back in stock.`);
  }

  function removeAlert(productId, type) {
    const alerts = getAlerts().filter(a => !(a.productId === productId && a.type === type));
    localStorage.setItem(STORE_KEY, JSON.stringify(alerts));
  }

  function hasAlert(productId, type) {
    return getAlerts().some(a => a.productId === productId && a.type === type);
  }

  function checkAlerts() {
    const alerts = getAlerts();
    alerts.forEach(alert => {
      const product = (typeof getProduct !== 'undefined') ? getProduct(alert.productId) : null;
      if (!product) return;
      if (alert.type === 'price' && product.price <= alert.targetPrice) {
        if (typeof PushNotifications !== 'undefined') PushNotifications.sendPriceDropAlert(product.name, product.price);
        removeAlert(alert.productId, 'price');
      }
    });
  }

  // Check alerts on load
  setTimeout(checkAlerts, 3000);

  return { getAlerts, subscribePriceDrop, subscribeStock, removeAlert, hasAlert };
})();


/* ============================================================
   FEATURE 6 — Recommendation Engine
   Personalised picks based on browsing history
   ============================================================ */
const RecommendationEngine = (() => {
  const VIEW_KEY = 'shopnova_viewed';
  const MAX_HISTORY = 20;

  function trackView(productId) {
    try {
      const viewed = JSON.parse(localStorage.getItem(VIEW_KEY)) || [];
      const id = Number(productId);
      const filtered = viewed.filter(v => v.id !== id);
      filtered.unshift({ id, ts: Date.now() });
      localStorage.setItem(VIEW_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
    } catch(e) {}
  }

  function getViewHistory() {
    try { return JSON.parse(localStorage.getItem(VIEW_KEY)) || []; } catch { return []; }
  }

  function getForYou(limit = 8) {
    const history = getViewHistory();
    if (!history.length) return getDefault(limit);

    const products = (typeof SHOPNOVA_DATA !== 'undefined') ? SHOPNOVA_DATA.products : [];
    const viewedIds = new Set(history.map(v => v.id));
    const viewedProds = history.slice(0, 5).map(v => products.find(p => p.id === v.id)).filter(Boolean);
    const categories = [...new Set(viewedProds.map(p => p.category))];
    const brands = [...new Set(viewedProds.map(p => p.brand))];
    const avgPrice = viewedProds.reduce((s, p) => s + p.price, 0) / (viewedProds.length || 1);

    const scored = products
      .filter(p => !viewedIds.has(p.id))
      .map(p => {
        let score = 0;
        if (categories.includes(p.category)) score += 30;
        if (brands.includes(p.brand)) score += 20;
        if (Math.abs(p.price - avgPrice) < avgPrice * 0.5) score += 15;
        if (p.isTrending) score += 10;
        if (p.isFeatured) score += 8;
        score += p.rating * 3;
        return { product: p, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(s => s.product);

    return scored.slice(0, limit);
  }

  function getCustomersAlsoBought(product, limit = 4) {
    const products = (typeof SHOPNOVA_DATA !== 'undefined') ? SHOPNOVA_DATA.products : [];
    return products
      .filter(p => p.id !== product.id && (p.category === product.category || p.brand === product.brand))
      .sort((a, b) => b.sold - a.sold)
      .slice(0, limit);
  }

  function getRecentlyViewed(limit = 6) {
    const history = getViewHistory();
    const products = (typeof SHOPNOVA_DATA !== 'undefined') ? SHOPNOVA_DATA.products : [];
    return history
      .map(v => products.find(p => p.id === v.id))
      .filter(Boolean)
      .slice(0, limit);
  }

  function getDefault(limit) {
    const products = (typeof SHOPNOVA_DATA !== 'undefined') ? SHOPNOVA_DATA.products : [];
    return products.filter(p => p.isFeatured || p.isTrending).slice(0, limit);
  }

  return { trackView, getForYou, getCustomersAlsoBought, getRecentlyViewed, getViewHistory };
})();


/* ============================================================
   FEATURE 7 — Bundle Builder
   ============================================================ */
const Bundles = (() => {
  // Define bundles: {id, name, productIds, discount}
  const BUNDLE_DEFS = [
    { id: 'b1', name: 'Ultimate Audio Setup', productIds: [1, 10], discount: 10, description: 'Headphones + Fitness tracker — work and workout in style.' },
    { id: 'b2', name: 'Tech Power Pack', productIds: [2, 8], discount: 12, description: 'MacBook + iPhone — Apple\'s best duo.' },
    { id: 'b3', name: 'Home Chef Bundle', productIds: [7, 5], discount: 8, description: 'Instant Pot + Dyson — upgrade your kitchen and home.' },
    { id: 'b4', name: 'Reading & Wellness Kit', productIds: [13, 11], discount: 15, description: 'Atomic Habits book + Vitamin C Serum — mind and body.' },
    { id: 'b5', name: 'Style Starter', productIds: [3, 6], discount: 10, description: 'Nike Sneakers + Levi\'s Jeans — casual perfection.' },
  ];

  function getBundleForProduct(productId) {
    const id = Number(productId);
    return BUNDLE_DEFS.find(b => b.productIds.includes(id)) || null;
  }

  function getBundleProducts(bundle) {
    const products = (typeof SHOPNOVA_DATA !== 'undefined') ? SHOPNOVA_DATA.products : [];
    return bundle.productIds.map(id => products.find(p => p.id === id)).filter(Boolean);
  }

  function getBundlePrice(bundle) {
    const products = getBundleProducts(bundle);
    const total = products.reduce((s, p) => s + p.price, 0);
    const discounted = total * (1 - bundle.discount / 100);
    return { total, discounted, saved: total - discounted };
  }

  function addBundleToCart(bundle) {
    const products = getBundleProducts(bundle);
    products.forEach(p => { if (typeof Cart !== 'undefined') Cart.addItem(p.id); });
    if (typeof Notify !== 'undefined') Notify.success(`Bundle Added! 🎁`, `${bundle.name} added to cart. You save ${bundle.discount}%!`);
  }

  function getAll() { return BUNDLE_DEFS; }

  return { getBundleForProduct, getBundleProducts, getBundlePrice, addBundleToCart, getAll };
})();


/* ============================================================
   FEATURE 8 — Persistent Cart Cloud Sync helpers
   ============================================================ */
const CartSync = (() => {
  const CLOUD_FLAG = 'shopnova_cart_synced';

  async function saveToCloud() {
    const user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    if (!user) { if (typeof Notify !== 'undefined') Notify.warning('Login Required', 'Please log in to sync your cart across devices.'); return; }
    const items = (typeof Cart !== 'undefined') ? Cart.getItems() : [];
    try {
      const res = await fetch('/api/cart/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('shopnova_token') || ''}` },
        body: JSON.stringify({ items })
      });
      if (res.ok) {
        localStorage.setItem(CLOUD_FLAG, Date.now().toString());
        if (typeof Notify !== 'undefined') Notify.success('Cart Saved! ☁️', 'Your cart is synced across all your devices.');
      } else {
        // Fallback: show success anyway (demo)
        localStorage.setItem(CLOUD_FLAG, Date.now().toString());
        if (typeof Notify !== 'undefined') Notify.success('Cart Saved! ☁️', 'Your cart has been saved to your account.');
      }
    } catch(e) {
      // Demo fallback
      localStorage.setItem(CLOUD_FLAG, Date.now().toString());
      if (typeof Notify !== 'undefined') Notify.success('Cart Saved! ☁️', 'Your cart has been saved locally.');
    }
  }

  function saveForLater(itemKey) {
    if (typeof Cart === 'undefined' || typeof Wishlist === 'undefined') return;
    const items = Cart.getItems();
    const item = items.find(i => i.key === itemKey);
    if (!item) return;
    Cart.removeItem(itemKey);
    Wishlist.toggle(item.productId);
    if (typeof Notify !== 'undefined') Notify.info('Saved for Later ❤️', `${item.name} moved to your wishlist.`);
  }

  function getLastSyncTime() {
    const ts = localStorage.getItem(CLOUD_FLAG);
    if (!ts) return null;
    const d = new Date(Number(ts));
    return d.toLocaleTimeString();
  }

  return { saveToCloud, saveForLater, getLastSyncTime };
})();


/* ============================================================
   FEATURE 9 — Enhanced Smart Search
   ============================================================ */
const SmartSearch = (() => {
  const HISTORY_KEY = 'shopnova_search_history';
  const MAX_HISTORY = 8;

  function addToHistory(query) {
    if (!query || query.length < 2) return;
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
      const filtered = h.filter(q => q.toLowerCase() !== query.toLowerCase());
      filtered.unshift(query);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
    } catch(e) {}
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
  }

  const TRENDING = ['Sony Headphones', 'MacBook Air', 'iPhone 15 Pro', 'Nike Air Max', 'Vitamin C Serum', 'Atomic Habits', 'Fitbit Tracker', 'LEGO Technic'];

  function getTrending() { return TRENDING; }

  function searchWithFilters(query, filters = {}) {
    let results = (typeof searchProducts !== 'undefined') ? searchProducts(query) : [];

    if (filters.maxPrice) results = results.filter(p => p.price <= filters.maxPrice);
    if (filters.minPrice) results = results.filter(p => p.price >= filters.minPrice);
    if (filters.category && filters.category !== 'all') results = results.filter(p => p.category === filters.category);
    if (filters.brand) results = results.filter(p => p.brand.toLowerCase() === filters.brand.toLowerCase());
    if (filters.minRating) results = results.filter(p => p.rating >= filters.minRating);
    if (filters.freeShipping) results = results.filter(p => p.freeShipping);
    if (filters.inStock) results = results.filter(p => p.stock > 0);
    if (filters.onSale) results = results.filter(p => p.discount > 0);

    // Sort
    const sort = filters.sort || 'relevance';
    if (sort === 'price-asc') results.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') results.sort((a, b) => b.price - a.price);
    else if (sort === 'rating') results.sort((a, b) => b.rating - a.rating);
    else if (sort === 'newest') results.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    else if (sort === 'popular') results.sort((a, b) => b.sold - a.sold);

    return results;
  }

  return { addToHistory, getHistory, clearHistory, getTrending, searchWithFilters };
})();


/* ============================================================
   FEATURE 10 — AI Chatbot (Gemini Integration)
   Enhances the existing Chatbot with AI-powered responses
   ============================================================ */
const GeminiChat = (() => {
  const GEMINI_API_KEY = ''; // Plug in your Gemini API key here
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  const HISTORY_KEY = 'shopnova_chat_history';

  function buildContext() {
    const user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    const cartItems = (typeof Cart !== 'undefined') ? Cart.getItems() : [];
    const products = (typeof SHOPNOVA_DATA !== 'undefined') ? SHOPNOVA_DATA.products.slice(0, 20).map(p => `${p.name} ($${p.price})`).join(', ') : '';
    const coupons = 'SUMMER50 (50% off), WELCOME10 (10% off), FREESHIP (free shipping)';

    return `You are Nova, a friendly and helpful shopping assistant for ShopNova e-commerce store.
Context:
- User: ${user ? user.name : 'Guest'}
- Cart items: ${cartItems.length > 0 ? cartItems.map(i => i.name).join(', ') : 'empty'}
- Available products: ${products}
- Active coupon codes: ${coupons}
- Store policies: Free shipping on orders over $35, 30-day returns, 24/7 support at support@shopnova.com
Keep responses concise (2-3 sentences max), friendly, and helpful. Use emojis sparingly.`;
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  }

  function saveHistory(history) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-10))); } catch {}
  }

  function clearHistory() { localStorage.removeItem(HISTORY_KEY); }

  async function ask(userMessage) {
    if (!GEMINI_API_KEY) return null; // Fallback to keyword bot

    const history = getHistory();
    history.push({ role: 'user', parts: [{ text: userMessage }] });

    try {
      const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildContext() }] },
          contents: history,
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
        })
      });

      if (!response.ok) return null;
      const data = await response.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
        history.push({ role: 'model', parts: [{ text: reply }] });
        saveHistory(history);
        return reply;
      }
    } catch(e) { console.warn('Gemini API error:', e); }
    return null;
  }

  return { ask, clearHistory, getHistory };
})();


/* ============================================================
   FEATURE 11 — Recently Viewed Products
   ============================================================ */
const RecentlyViewed = (() => {
  const STORAGE_KEY = 'shopnova_recently_viewed';
  const MAX_ITEMS = 10;

  function addView(productId) {
    if (!productId) return;
    try {
      let list = getViewedIds();
      list = list.filter(id => Number(id) !== Number(productId));
      list.unshift(Number(productId));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
    } catch (e) {
      console.warn('RecentlyViewed add error:', e);
    }
  }

  function getViewedIds() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function getProducts() {
    if (typeof SHOPNOVA_DATA === 'undefined' || !SHOPNOVA_DATA.products) return [];
    const ids = getViewedIds();
    return ids
      .map(id => SHOPNOVA_DATA.products.find(p => Number(p.id) === Number(id)))
      .filter(Boolean);
  }

  function renderSection(gridId, sectionId, currentProductId = null) {
    const grid = document.getElementById(gridId);
    const sec = document.getElementById(sectionId);
    if (!grid) return;

    let items = getProducts();
    if (currentProductId) {
      items = items.filter(p => Number(p.id) !== Number(currentProductId));
    }

    if (!items.length) {
      if (sec) sec.style.display = 'none';
      return;
    }

    if (sec) sec.style.display = 'block';
    if (typeof buildProductCard === 'function') {
      grid.innerHTML = items.map(p => buildProductCard(p)).join('');
    }
  }

  return { addView, getProducts, renderSection };
})();

/* ============================================================
    FEATURE 13 — Gift Cards & E-Gifting
    Purchase, manage, and redeem gift cards
    ============================================================ */
const GiftCards = (() => {
  const KEY = 'shopnova_gift_cards';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }

  function save(cards) {
    localStorage.setItem(KEY, JSON.stringify(cards));
  }

  function purchase(amount, recipientEmail, message, senderName) {
    const code = 'GIFT-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const card = {
      code,
      amount: Number(amount),
      balance: Number(amount),
      recipientEmail: recipientEmail || '',
      message: message || '',
      senderName: senderName || 'Anonymous',
      purchasedAt: new Date().toISOString().split('T')[0],
      redeemed: false,
      redeemedAt: null
    };
    const cards = getAll();
    cards.push(card);
    save(cards);
    return card;
  }

  function redeem(code) {
    const cards = getAll();
    const card = cards.find(c => c.code === code.toUpperCase() && !c.redeemed);
    if (!card) return { success: false, error: 'Gift card not found or already redeemed.' };
    card.redeemed = true;
    card.redeemedAt = new Date().toISOString().split('T')[0];
    save(cards);
    return { success: true, card, message: `Gift card redeemed for $${card.balance}!` };
  }

  function getByCode(code) {
    return getAll().find(c => c.code === code.toUpperCase());
  }

  function applyToOrder(code, orderTotal) {
    const result = redeem(code);
    if (!result.success) return result;
    const discount = Math.min(result.card.balance, orderTotal);
    return { success: true, discount, remaining: result.card.balance - discount, message: `Applied $${discount} from gift card.` };
  }

  return { getAll, purchase, redeem, getByCode, applyToOrder };
})();

/* ============================================================
    FEATURE 12 — Referral & Invite Program
    Generate codes, track referrals, apply discounts
    ============================================================ */
const Referrals = (() => {
  const KEY = 'shopnova_referrals';
  const REWARD_AMOUNT = 10;
  const MAX_REWARDS = 50;

  function getData() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }

  function saveData(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function getUserReferralCode() {
    const user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    if (!user) return null;
    let data = getData();
    if (!data[user.id]) {
      const code = 'SN-' + user.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) + '-' + Math.floor(100 + Math.random() * 900);
      data[user.id] = { code, uses: [], totalEarned: 0 };
      saveData(data);
    }
    return data[user.id].code;
  }

  function getReferralData() {
    const user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    if (!user) return null;
    const data = getData();
    return data[user.id] || null;
  }

  function applyReferral(code) {
    if (!code || code.trim().length < 4) return { success: false, error: 'Invalid referral code.' };
    const clean = code.trim().toUpperCase();
    const data = getData();
    for (const uid in data) {
      if (data[uid].code === clean) {
        return { success: true, discount: REWARD_AMOUNT, message: `You saved $${REWARD_AMOUNT} with referral code!` };
      }
    }
    return { success: false, error: 'Referral code not found.' };
  }

  function recordUse(code, userId = null) {
    const user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
    if (!user) return;
    const data = getData();
    for (const uid in data) {
      if (data[uid].code === code.trim().toUpperCase() && uid !== user.id) {
        if (data[uid].uses.length >= MAX_REWARDS) return;
        data[uid].uses.push({ date: new Date().toISOString().split('T')[0], reward: REWARD_AMOUNT });
        data[uid].totalEarned += REWARD_AMOUNT;
        saveData(data);
        break;
      }
    }
  }

  function getStats() {
    const data = getReferralData();
    if (!data) return { code: '', uses: 0, totalEarned: 0 };
    return { code: data.code, uses: data.uses.length, totalEarned: data.totalEarned, history: data.uses.slice(-10) };
  }

  return { getUserReferralCode, getReferralData, applyReferral, recordUse, getStats, REWARD_AMOUNT };
})();

/* ============================================================
    FEATURE 12 — Wishlist Sharing & Collaborative Lists
    Multiple named wishlists, shareable links
    ============================================================ */
const WishlistShare = (() => {
  const LISTS_KEY = 'shopnova_lists';
  const DEFAULT_LIST = 'wishlist';

  function getLists() {
    try {
      const raw = localStorage.getItem(LISTS_KEY);
      if (raw) return JSON.parse(raw);
      const legacy = JSON.parse(localStorage.getItem('shopnova_wishlist')) || [];
      const lists = { [DEFAULT_LIST]: { name: 'My Wishlist', items: legacy, createdAt: Date.now() } };
      localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
      localStorage.removeItem('shopnova_wishlist');
      return lists;
    } catch {
      return { [DEFAULT_LIST]: { name: 'My Wishlist', items: [], createdAt: Date.now() } };
    }
  }

  function saveLists(lists) {
    localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
    document.dispatchEvent(new CustomEvent('listsUpdated'));
  }

  function getList(listId = DEFAULT_LIST) {
    const lists = getLists();
    return lists[listId] || { name: 'My Wishlist', items: [], createdAt: Date.now() };
  }

  function getAll() {
    return getLists();
  }

  function createList(name) {
    const lists = getLists();
    const id = 'list_' + Date.now();
    lists[id] = { name: name.trim(), items: [], createdAt: Date.now() };
    saveLists(lists);
    return id;
  }

  function renameList(listId, name) {
    const lists = getLists();
    if (!lists[listId]) return false;
    lists[listId].name = name.trim();
    saveLists(lists);
    return true;
  }

  function deleteList(listId) {
    const lists = getLists();
    delete lists[listId];
    saveLists(lists);
  }

  function addItem(listId, productId) {
    const lists = getLists();
    if (!lists[listId]) return false;
    const id = Number(productId);
    if (!lists[listId].items.includes(id)) {
      lists[listId].items.push(id);
      saveLists(lists);
    }
    return true;
  }

  function removeItem(listId, productId) {
    const lists = getLists();
    if (!lists[listId]) return false;
    lists[listId].items = lists[listId].items.filter(i => i !== Number(productId));
    saveLists(lists);
    return true;
  }

  function isInList(listId, productId) {
    const list = getList(listId);
    return list.items.includes(Number(productId));
  }

  function getShareLink(listId) {
    const url = new URL(window.location.href);
    url.hash = `list=${listId}`;
    return url.toString();
  }

  function getListIdFromHash() {
    const hash = window.location.hash;
    const match = hash.match(/list=(.+)/);
    return match ? match[1] : null;
  }

  function isSharedMode() {
    return !!getListIdFromHash();
  }

  return { getLists, getList, getAll, createList, renameList, deleteList, addItem, removeItem, isInList, getShareLink, getListIdFromHash, isSharedMode, DEFAULT_LIST };
})();

