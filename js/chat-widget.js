/* ============================================================
   ShopNova — chat-widget.js
   Live Chat & Customer Support Widget
   Socket.io-backed with bot auto-replies & offline fallback
   ============================================================ */

'use strict';

const ChatWidget = (() => {

  /* ── Bot auto-responses ──────────────────────────────────── */
  const BOT_RESPONSES = [
    { keywords: ['track', 'order', 'where', 'delivery', 'shipping'],
      response: '📦 You can track your order at <a href="order-tracking.html">Order Tracking</a>. Enter your Order ID (e.g., SN-2024-001) for real-time updates!' },
    { keywords: ['return', 'refund', 'exchange'],
      response: '🔄 We offer <strong>30-day hassle-free returns</strong>! Go to <a href="profile.html">My Orders</a> and click "Return Item" on your order. Refund is processed within 3-5 business days.' },
    { keywords: ['cancel', 'cancellation'],
      response: '❌ To cancel an order, please visit <a href="profile.html">My Orders</a> and click "Cancel" within 24 hours of placing the order. After that, please use the return flow.' },
    { keywords: ['payment', 'pay', 'credit', 'card', 'stripe'],
      response: '💳 We accept Visa, Mastercard, American Express, and more via our secure Stripe checkout. All payments are SSL encrypted.' },
    { keywords: ['password', 'forgot', 'reset', 'login'],
      response: '🔑 Click "Forgot Password" on the <a href="login.html">login page</a> and we\'ll send a reset link to your email.' },
    { keywords: ['discount', 'coupon', 'promo', 'code'],
      response: '🎁 Enter your coupon code at checkout! Check our <a href="products.html?sale=true">Flash Deals</a> page for today\'s best offers.' },
    { keywords: ['warranty', 'guarantee'],
      response: '🛡️ Warranty details are listed on each product page. Most electronics come with 1-2 year manufacturer warranties.' },
    { keywords: ['hello', 'hi', 'hey', 'hola', 'bonjour', 'namaste'],
      response: '👋 Hello! I\'m ShopNova\'s support bot. I can help with orders, returns, payments, and more. What do you need?' },
    { keywords: ['human', 'agent', 'person', 'real'],
      response: '🧑‍💼 I\'m connecting you to a human agent. In the meantime, you can email us at <strong>support@shopnova.com</strong>. We respond within 24 hours.' },
    { keywords: ['hours', 'support', 'available', 'contact'],
      response: '📞 Our support team is available Monday–Friday, 9 AM–6 PM EST. You can also email <strong>support@shopnova.com</strong> anytime!' }
  ];

  const DEFAULT_RESPONSE = '🤖 I understand you\'re looking for help! Our team will get back to you shortly. For urgent queries, email <strong>support@shopnova.com</strong>.';

  /* ── State ───────────────────────────────────────────────── */
  let isOpen = false;
  let socket = null;
  let messages = [];
  let isConnected = false;
  let unreadCount = 0;

  /* ── Build chat widget HTML ──────────────────────────────── */
  function buildHTML() {
    return `
      <!-- Chat Toggle Button -->
      <button class="chat-toggle" id="chat-toggle" onclick="ChatWidget.toggleChat()" aria-label="Open chat support">
        <span class="chat-toggle-icon" id="chat-toggle-icon">💬</span>
        <div class="chat-unread-badge hidden" id="chat-unread-badge">0</div>
        <div class="chat-pulse-ring"></div>
      </button>

      <!-- Chat Panel -->
      <div class="chat-panel" id="chat-panel" role="dialog" aria-label="Customer support chat">
        <!-- Header -->
        <div class="chat-header">
          <div class="chat-header-info">
            <div class="chat-avatar-wrap">
              <div class="chat-bot-avatar">🛍️</div>
              <div class="chat-online-dot"></div>
            </div>
            <div>
              <div class="chat-header-title">ShopNova Support</div>
              <div class="chat-header-sub" id="chat-status-text">● Online — Typically replies instantly</div>
            </div>
          </div>
          <div class="chat-header-actions">
            <button class="chat-header-btn" onclick="ChatWidget.clearChat()" title="Clear chat" aria-label="Clear chat">🗑️</button>
            <button class="chat-header-btn" onclick="ChatWidget.toggleChat()" aria-label="Close chat">✕</button>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="chat-quick-actions" id="chat-quick-actions">
          <div class="chat-quick-label">Quick AI Prompts:</div>
          <div class="chat-quick-btns">
            <button class="chat-quick-btn" onclick="ChatWidget.quickSend('Recommend top electronics')">🛍️ Recommend Items</button>
            <button class="chat-quick-btn" onclick="ChatWidget.quickSend('Find headphones under $400')">🎧 Tech Deals</button>
            <button class="chat-quick-btn" onclick="ChatWidget.quickSend('Track my order')">📦 Track Order</button>
            <button class="chat-quick-btn" onclick="ChatWidget.quickSend('How do returns work?')">🔄 Returns</button>
          </div>
        </div>

        <!-- Messages -->
        <div class="chat-messages" id="chat-messages" role="log" aria-live="polite"></div>

        <!-- Input -->
        <div class="chat-input-wrap">
          <input
            type="text"
            class="chat-input"
            id="chat-input"
            placeholder="Type a message..."
            onkeydown="if(event.key==='Enter')ChatWidget.sendMessage()"
            autocomplete="off"
            aria-label="Chat message input"
          >
          <button class="chat-send-btn" onclick="ChatWidget.sendMessage()" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div class="chat-footer">Powered by ShopNova AI • <a href="mailto:support@shopnova.com">support@shopnova.com</a></div>
      </div>
    `;
  }

  /* ── Inject CSS ──────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('chat-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'chat-widget-styles';
    style.textContent = `
      /* ── Chat Widget Styles ── */
      .chat-toggle {
        position: fixed;
        bottom: 28px;
        right: 28px;
        width: 58px;
        height: 58px;
        border-radius: 50%;
        background: var(--grad-primary);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(108,99,255,0.5);
        z-index: 9999;
        transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
      }
      .chat-toggle:hover { transform: scale(1.1); box-shadow: 0 6px 30px rgba(108,99,255,0.7); }
      .chat-toggle-icon { font-size: 22px; transition: transform 0.3s ease; }
      .chat-toggle.open .chat-toggle-icon { transform: rotate(90deg); }
      .chat-pulse-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid rgba(108,99,255,0.5);
        animation: chat-pulse 2s infinite;
      }
      @keyframes chat-pulse {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(1.5); opacity: 0; }
      }
      .chat-unread-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 20px;
        height: 20px;
        background: #EF4444;
        color: white;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 5px;
        border: 2px solid var(--bg-900);
        animation: chat-badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes chat-badge-pop { from { transform: scale(0); } to { transform: scale(1); } }
      .chat-unread-badge.hidden { display: none; }

      /* Panel */
      .chat-panel {
        position: fixed;
        bottom: 100px;
        right: 28px;
        width: 370px;
        max-height: 580px;
        background: var(--bg-700);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-2xl);
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.1);
        display: flex;
        flex-direction: column;
        z-index: 9998;
        transform: translateY(20px) scale(0.95);
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
        overflow: hidden;
      }
      .chat-panel.open {
        transform: translateY(0) scale(1);
        opacity: 1;
        pointer-events: all;
      }
      @media (max-width: 480px) {
        .chat-panel { width: calc(100vw - 24px); right: 12px; bottom: 90px; }
        .chat-toggle { right: 18px; bottom: 20px; }
      }

      /* Header */
      .chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 16px 12px;
        background: linear-gradient(135deg, rgba(108,99,255,0.15), rgba(139,92,246,0.1));
        border-bottom: 1px solid var(--glass-border);
        flex-shrink: 0;
      }
      .chat-header-info { display: flex; align-items: center; gap: 12px; }
      .chat-avatar-wrap { position: relative; }
      .chat-bot-avatar {
        width: 38px; height: 38px;
        border-radius: 50%;
        background: var(--grad-primary);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px;
      }
      .chat-online-dot {
        position: absolute; bottom: 1px; right: 1px;
        width: 10px; height: 10px;
        background: var(--brand-accent);
        border-radius: 50%;
        border: 2px solid var(--bg-700);
      }
      .chat-header-title { font-weight: 700; font-size: 14px; color: var(--text-primary); }
      .chat-header-sub { font-size: 11px; color: var(--brand-accent); margin-top: 1px; }
      .chat-header-actions { display: flex; gap: 6px; }
      .chat-header-btn {
        width: 28px; height: 28px;
        background: rgba(255,255,255,0.06);
        border: 1px solid var(--glass-border);
        border-radius: 50%;
        color: var(--text-muted);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px;
        transition: all 0.2s;
      }
      .chat-header-btn:hover { background: rgba(255,255,255,0.12); color: var(--text-primary); }

      /* Quick Actions */
      .chat-quick-actions {
        padding: 10px 14px;
        border-bottom: 1px solid var(--glass-border);
        background: rgba(255,255,255,0.02);
        flex-shrink: 0;
      }
      .chat-quick-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
      .chat-quick-btns { display: flex; gap: 6px; flex-wrap: wrap; }
      .chat-quick-btn {
        padding: 4px 10px;
        background: rgba(108,99,255,0.1);
        border: 1px solid rgba(108,99,255,0.25);
        border-radius: 12px;
        color: var(--brand-primary);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .chat-quick-btn:hover { background: rgba(108,99,255,0.2); transform: translateY(-1px); }

      /* Messages */
      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scrollbar-width: thin;
        scrollbar-color: var(--bg-400) transparent;
      }
      .chat-messages::-webkit-scrollbar { width: 4px; }
      .chat-messages::-webkit-scrollbar-track { background: transparent; }
      .chat-messages::-webkit-scrollbar-thumb { background: var(--bg-400); border-radius: 2px; }

      .chat-msg {
        display: flex;
        gap: 8px;
        animation: chat-msg-in 0.3s ease forwards;
        max-width: 90%;
      }
      @keyframes chat-msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .chat-msg.user { flex-direction: row-reverse; align-self: flex-end; }
      .chat-msg.bot { align-self: flex-start; }

      .chat-msg-avatar {
        width: 28px; height: 28px;
        border-radius: 50%;
        background: var(--grad-primary);
        display: flex; align-items: center; justify-content: center;
        font-size: 13px;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .chat-msg.user .chat-msg-avatar { background: var(--bg-400); }

      .chat-msg-bubble {
        padding: 9px 13px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.5;
      }
      .chat-msg.bot .chat-msg-bubble {
        background: var(--bg-500);
        border: 1px solid var(--glass-border);
        color: var(--text-primary);
        border-bottom-left-radius: 4px;
      }
      .chat-msg.user .chat-msg-bubble {
        background: var(--grad-primary);
        color: white;
        border-bottom-right-radius: 4px;
      }
      .chat-msg-bubble a { color: var(--brand-gold); text-decoration: underline; }

      .chat-msg-time {
        font-size: 10px;
        color: var(--text-muted);
        margin-top: 3px;
        text-align: right;
      }
      .chat-msg.bot .chat-msg-time { text-align: left; }

      .chat-typing {
        display: flex;
        gap: 4px;
        align-items: center;
        padding: 10px 13px;
      }
      .chat-typing span {
        width: 7px; height: 7px;
        background: var(--text-muted);
        border-radius: 50%;
        animation: typing-dot 1.2s infinite;
      }
      .chat-typing span:nth-child(2) { animation-delay: 0.2s; }
      .chat-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing-dot {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* Input */
      .chat-input-wrap {
        display: flex;
        gap: 8px;
        padding: 12px 14px;
        border-top: 1px solid var(--glass-border);
        background: var(--bg-800);
        flex-shrink: 0;
      }
      .chat-input {
        flex: 1;
        padding: 9px 14px;
        background: var(--bg-600);
        border: 1px solid var(--glass-border);
        border-radius: 20px;
        color: var(--text-primary);
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
      }
      .chat-input:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 3px rgba(108,99,255,0.15); }
      .chat-send-btn {
        width: 36px; height: 36px;
        border-radius: 50%;
        background: var(--grad-primary);
        border: none;
        color: white;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s;
      }
      .chat-send-btn:hover { transform: scale(1.1); }

      .chat-footer {
        text-align: center;
        font-size: 10px;
        color: var(--text-muted);
        padding: 6px;
        border-top: 1px solid var(--glass-border);
      }
      .chat-footer a { color: var(--brand-primary); }

      /* i18n switcher styles */
      .i18n-switcher {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .i18n-dropdown-wrap {
        position: relative;
      }
      .i18n-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 10px;
        background: rgba(255,255,255,0.06);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-full);
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .i18n-btn:hover { background: rgba(255,255,255,0.12); color: var(--text-primary); }
      .i18n-code { font-weight: 700; letter-spacing: 0.5px; }
      .i18n-arrow { font-size: 9px; opacity: 0.7; }
      .i18n-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 150px;
        background: var(--bg-600);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        z-index: 10000;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-8px);
        transition: all 0.2s ease;
      }
      .i18n-dropdown.open {
        opacity: 1;
        pointer-events: all;
        transform: translateY(0);
      }
      .i18n-option {
        padding: 9px 14px;
        font-size: 13px;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .i18n-option:hover { background: var(--bg-500); color: var(--text-primary); }
      .i18n-option.active { color: var(--brand-primary); background: rgba(108,99,255,0.1); font-weight: 600; }

      /* Subscribe & Save */
      .subscribe-save-section {
        background: rgba(67,233,123,0.06);
        border: 1px solid rgba(67,233,123,0.2);
        border-radius: var(--radius-lg);
        padding: 14px 16px;
        margin: 16px 0;
      }
      .subscribe-save-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .subscribe-label { font-weight: 700; font-size: 14px; color: var(--brand-accent); }
      .subscribe-toggle {
        position: relative;
        width: 44px;
        height: 24px;
      }
      .subscribe-toggle input { opacity: 0; width: 0; height: 0; }
      .subscribe-slider {
        position: absolute;
        inset: 0;
        background: var(--bg-400);
        border-radius: 12px;
        cursor: pointer;
        transition: 0.3s;
      }
      .subscribe-slider::before {
        content: '';
        position: absolute;
        width: 18px; height: 18px;
        border-radius: 50%;
        background: white;
        left: 3px; top: 3px;
        transition: 0.3s;
      }
      .subscribe-toggle input:checked + .subscribe-slider { background: var(--brand-accent); }
      .subscribe-toggle input:checked + .subscribe-slider::before { transform: translateX(20px); }
      .subscribe-extra { font-size: 12px; color: var(--text-muted); }
      .subscribe-frequency {
        margin-top: 10px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .freq-option {
        padding: 4px 10px;
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-full);
        font-size: 12px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: all 0.2s;
        background: none;
      }
      .freq-option.selected, .freq-option:hover {
        background: rgba(67,233,123,0.15);
        border-color: var(--brand-accent);
        color: var(--brand-accent);
      }

      /* AI Product Recommendation Cards */
      .chat-recs-wrap {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .chat-rec-card {
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid var(--glass-border);
        border-radius: 12px;
        padding: 8px 10px;
        transition: transform 0.2s, border-color 0.2s;
      }
      .chat-rec-card:hover {
        border-color: var(--brand-primary);
        transform: translateY(-1px);
      }
      .chat-rec-img {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        object-fit: cover;
        background: var(--bg-800);
        flex-shrink: 0;
      }
      .chat-rec-details {
        flex: 1;
        min-width: 0;
      }
      .chat-rec-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chat-rec-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 2px;
        font-size: 11px;
      }
      .chat-rec-price {
        font-weight: 700;
        color: var(--brand-accent);
      }
      .chat-rec-orig {
        text-decoration: line-through;
        opacity: 0.6;
        font-size: 10px;
      }
      .chat-rec-rating {
        color: #FBBF24;
        font-size: 10px;
      }
      .chat-rec-actions {
        display: flex;
        gap: 5px;
        margin-top: 4px;
      }
      .chat-rec-btn {
        padding: 3px 8px;
        border-radius: 8px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
      }
      .chat-rec-btn.view {
        background: rgba(255, 255, 255, 0.12);
        color: var(--text-primary);
      }
      .chat-rec-btn.cart {
        background: var(--grad-primary);
        color: white;
      }
      .chat-rec-btn:hover {
        opacity: 0.9;
        transform: scale(1.04);
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Get bot response (Fallback) ───────────────────────── */
  function getBotResponse(message) {
    const lower = message.toLowerCase();
    for (const item of BOT_RESPONSES) {
      if (item.keywords.some(kw => lower.includes(kw))) return item.response;
    }
    return DEFAULT_RESPONSE;
  }

  /* ── Render a message ────────────────────────────────────── */
  function renderMessage(role, text, time, recommendations = []) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const user = (() => { try { return JSON.parse(localStorage.getItem('shopnova_user')); } catch { return null; } })();
    const avatar = role === 'user' ? (user?.avatar || '👤') : '🛍️';
    const t = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Format basic bold markdown (**text**)
    let formattedText = text ? text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') : '';

    let recsHTML = '';
    if (recommendations && recommendations.length > 0) {
      recsHTML = `
        <div class="chat-recs-wrap">
          ${recommendations.map(p => `
            <div class="chat-rec-card">
              <img src="${p.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'}" alt="${p.name}" class="chat-rec-img">
              <div class="chat-rec-details">
                <div class="chat-rec-name" title="${p.name}">${p.name}</div>
                <div class="chat-rec-meta">
                  <span class="chat-rec-price">$${Number(p.price).toFixed(2)}</span>
                  ${p.originalPrice ? `<span class="chat-rec-orig">$${Number(p.originalPrice).toFixed(2)}</span>` : ''}
                  <span class="chat-rec-rating">★ ${p.rating || 4.5}</span>
                </div>
                <div class="chat-rec-actions">
                  <a href="product-detail.html?id=${p.id}" class="chat-rec-btn view" target="_blank">View Item</a>
                  <button class="chat-rec-btn cart" onclick="ChatWidget.quickAddToCart(${p.id}, event)">+ Cart</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${role}`;
    msgEl.innerHTML = `
      <div class="chat-msg-avatar">${avatar}</div>
      <div>
        <div class="chat-msg-bubble">${formattedText}${recsHTML}</div>
        <div class="chat-msg-time">${t}</div>
      </div>
    `;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  function quickAddToCart(productId, event) {
    if (event) event.stopPropagation();
    if (typeof App !== 'undefined' && App.addToCart) {
      App.addToCart(productId, 1);
    } else if (typeof window.addToCart === 'function') {
      window.addToCart(productId);
    } else {
      try {
        let cart = JSON.parse(localStorage.getItem('shopnova_cart') || '[]');
        let item = cart.find(i => i.id == productId);
        if (item) item.qty = (item.qty || 1) + 1;
        else cart.push({ id: productId, qty: 1 });
        localStorage.setItem('shopnova_cart', JSON.stringify(cart));
        if (typeof showToast === 'function') showToast('🛒 Added to cart!', 'success');
        else alert('🛒 Item added to cart!');
      } catch (e) { console.error(e); }
    }
  }

  /* ── Show typing indicator ───────────────────────────────── */
  function showTyping() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'chat-msg bot';
    el.id = 'chat-typing-indicator';
    el.innerHTML = `
      <div class="chat-msg-avatar">🛍️</div>
      <div class="chat-msg-bubble" style="padding:10px 13px">
        <div class="chat-typing"><span></span><span></span><span></span></div>
      </div>
    `;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    document.getElementById('chat-typing-indicator')?.remove();
  }

  /* ── Public API ──────────────────────────────────────────── */
  function toggleChat() {
    isOpen = !isOpen;
    const panel = document.getElementById('chat-panel');
    const toggle = document.getElementById('chat-toggle');
    panel?.classList.toggle('open', isOpen);
    toggle?.classList.toggle('open', isOpen);
    if (isOpen) {
      unreadCount = 0;
      const badge = document.getElementById('chat-unread-badge');
      if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
      document.getElementById('chat-input')?.focus();
      // Hide quick actions after first interaction
      if (messages.length > 1) {
        document.getElementById('chat-quick-actions')?.style && (document.getElementById('chat-quick-actions').style.display = 'none');
      }
    }
  }

  async function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Add to message history
    messages.push({ role: 'user', text, time: new Date().toISOString() });
    renderMessage('user', text);

    // Hide quick actions once user chats
    const qActions = document.getElementById('chat-quick-actions');
    if (qActions) qActions.style.display = 'none';

    showTyping();

    try {
      let result = null;
      if (typeof apiRequest !== 'undefined') {
        result = await apiRequest('POST', '/chat/send', { message: text });
      } else {
        const fetchRes = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        result = await fetchRes.json();
      }

      hideTyping();

      if (result && result.success && result.data && result.data.botReply) {
        const reply = result.data.botReply;
        messages.push(reply);
        renderMessage('bot', reply.message, null, reply.recommendations || []);
      } else {
        throw new Error('Fallback required');
      }
    } catch (e) {
      hideTyping();
      const fallbackResponse = getBotResponse(text);
      messages.push({ role: 'bot', text: fallbackResponse, time: new Date().toISOString() });
      renderMessage('bot', fallbackResponse);
    }

    // If panel closed, show unread badge
    if (!isOpen) {
      unreadCount++;
      const badge = document.getElementById('chat-unread-badge');
      if (badge) { badge.textContent = unreadCount; badge.classList.remove('hidden'); }
    }
  }

  function quickSend(text) {
    const input = document.getElementById('chat-input');
    if (input) input.value = text;
    sendMessage();
  }

  function clearChat() {
    messages = [];
    const container = document.getElementById('chat-messages');
    if (container) container.innerHTML = '';
    // Re-show greeting
    setTimeout(() => renderMessage('bot', '👋 Hi! I\'m ShopNova AI Assistant. How can I help you today?'), 200);
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    injectCSS();
    const container = document.createElement('div');
    container.id = 'chat-widget-container';
    container.innerHTML = buildHTML();
    document.body.appendChild(container);

    // Greeting message
    setTimeout(() => {
      renderMessage('bot', '👋 Hi! I\'m **ShopNova AI Assistant**. Ask me for product recommendations, deals, or order help!');
    }, 1500);
  }

  return { init, toggleChat, sendMessage, quickSend, clearChat, quickAddToCart };
})();

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ChatWidget.init());
} else {
  ChatWidget.init();
}
