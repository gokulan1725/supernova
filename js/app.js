/* ============================================================
   ShopNova — Backend API & Supabase Client Integration
   ============================================================ */

const API_BASE = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ? window.location.origin + '/api'
  : null;

let isBackendMode = false;

// Custom user credentials
const SupabaseConfig = {
  url: 'https://gfxtakyqkzquhbbneera.supabase.co',
  key: 'sb_publishable_U147IqjY8VsRO-rQe_3vsg_vATt9M0_'
};

let supabaseClient = null;
let isSupabaseMode = false;

/* ── API Helper ──────────────────────────────────────────── */
function getAuthToken() {
  try { return localStorage.getItem('shopnova_token') || ''; } catch { return ''; }
}

async function apiRequest(method, endpoint, body = null) {
  if (!API_BASE) return { success: false, error: 'No backend available' };
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + endpoint, opts);
    const json = await res.json();
    if (res.status === 401 && token) {
      localStorage.removeItem('shopnova_token');
      console.warn('Session expired — please log in again.');
    }
    return json;
  } catch (e) {
    console.warn('API request failed:', endpoint, e.message);
    return { success: false, error: e.message };
  }
}

/* ── Backend sync ────────────────────────────────────────── */
async function syncDataWithBackend() {
  if (!isBackendMode) return;

  try {
    // Sync products
    const prodRes = await apiRequest('GET', '/products');
    if (prodRes.success && prodRes.data && prodRes.data.length > 0) {
      SHOPNOVA_DATA.products = prodRes.data;
      console.log(`✅ Synced ${prodRes.data.length} products from backend`);
    }

    // Sync orders
    const user = (() => { try { return JSON.parse(localStorage.getItem('shopnova_user')); } catch { return null; } })();
    const ordUrl = user
      ? `/orders?userId=${user.id}`
      : `/orders?all=true`;
    const ordRes = await apiRequest('GET', ordUrl);
    if (ordRes.success && ordRes.data) {
      SHOPNOVA_DATA.demoOrders = ordRes.data;
      console.log(`✅ Synced ${ordRes.data.length} orders from backend`);
    }

    // Sync Cart & Wishlist
    if (typeof Cart !== 'undefined' && typeof Cart.syncFromBackend === 'function') {
      await Cart.syncFromBackend();
    }
    if (typeof Wishlist !== 'undefined' && typeof Wishlist.syncFromBackend === 'function') {
      await Wishlist.syncFromBackend();
    }

    triggerUIRerenders();
  } catch (e) {
    console.warn('Backend sync error:', e.message);
  }
}

/* ── Push a new order to the backend ─────────────────────── */
async function pushOrderToBackend(newOrder) {
  if (isBackendMode || API_BASE) {
    const result = await apiRequest('POST', '/orders', newOrder);
    if (result.success) {
      console.log('✅ Order saved to backend:', newOrder.id, '| Supabase synced:', result.synced);
      return result;
    }
    console.warn('⚠️ Backend order save failed — stored locally only');
  }
  return null;
}

/* ── Supabase Direct client-side Sync ─────────────────────── */
async function syncDataWithSupabase() {
  if (!supabaseClient) return;
  try {
    const { data: prods, error: prodErr } = await supabaseClient.from('products').select('*').order('id');
    if (!prodErr && prods && prods.length > 0) {
      const mapped = prods.map(p => ({
        id: Number(p.id),
        name: p.name,
        brand: p.brand || '',
        category: p.category || '',
        subcategory: p.subcategory || '',
        price: Number(p.price || 0),
        originalPrice: Number(p.original_price || p.price || 0),
        discount: Number(p.discount || 0),
        rating: Number(p.rating || 5),
        reviewCount: Number(p.review_count || 0),
        stock: Number(p.stock || 0),
        image: p.image || '',
        freeShipping: !!p.free_shipping,
        deliveryDays: Number(p.delivery_days || 3),
        description: p.description || '',
        specs: typeof p.specs === 'string' ? JSON.parse(p.specs) : (p.specs || {}),
        colors: Array.isArray(p.colors) ? p.colors : [],
        badge: p.badge || ''
      }));
      SHOPNOVA_DATA.products = mapped;
      localStorage.setItem('shopnova_admin_products', JSON.stringify(mapped));
      console.log(`✅ Synced ${mapped.length} products directly from Supabase`);
    }

    const { data: ords, error: ordErr } = await supabaseClient.from('orders').select('*').order('date', { ascending: false });
    if (!ordErr && ords) {
      const mappedOrds = ords.map(o => ({
        id: o.id,
        date: o.date,
        status: o.status,
        items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
        total: Number(o.total || 0),
        shipping: Number(o.shipping || 0),
        address: o.address || ''
      }));
      SHOPNOVA_DATA.demoOrders = mappedOrds;
      localStorage.setItem('shopnova_orders', JSON.stringify(mappedOrds));
      console.log(`✅ Synced ${mappedOrds.length} orders directly from Supabase`);
    }

    triggerUIRerenders();
  } catch (e) {
    console.warn('Supabase direct sync error:', e.message);
  }
}

// Backward-compat alias used by checkout.html
async function pushOrderToSupabase(newOrder) {
  if (isBackendMode) {
    await pushOrderToBackend(newOrder);
  } else if (isSupabaseMode && supabaseClient) {
    try {
      const payload = {
        id: newOrder.id,
        date: newOrder.date,
        status: newOrder.status,
        items: typeof newOrder.items === 'object' ? JSON.stringify(newOrder.items) : newOrder.items,
        total: newOrder.total,
        shipping: newOrder.shipping,
        address: newOrder.address
      };
      const { error } = await supabaseClient.from('orders').insert([payload]);
      if (error) throw error;
      console.log('✅ Order saved directly to Supabase');
    } catch (e) {
      console.error('Supabase direct insert error:', e.message);
    }
  }
}

function triggerUIRerenders() {
  if (typeof renderFeatured === 'function') renderFeatured();
  if (typeof renderTrending === 'function') renderTrending();
  if (typeof renderDeals === 'function') renderDeals();
  if (typeof renderProducts === 'function') renderProducts();
  if (typeof renderWishlist === 'function') renderWishlist();
  if (typeof renderTracking === 'function' && typeof orderId !== 'undefined') renderTracking(orderId);
  if (typeof renderTabContent === 'function') renderTabContent();
  if (typeof renderSellerWorkspace === 'function') renderSellerWorkspace();
}

/* ── Dynamically load Supabase SDK from CDN ──────────────── */
function loadSupabaseSDK() {
  return new Promise((resolve) => {
    if (window.supabase) {
      try {
        supabaseClient = window.supabase.createClient(SupabaseConfig.url, SupabaseConfig.key);
        isSupabaseMode = true;
        console.log('Supabase client initialized directly in browser');
      } catch (e) {
        console.error('Error initializing client-side Supabase:', e);
      }
      resolve(supabaseClient);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = true;
    script.onload = () => {
      try {
        supabaseClient = window.supabase.createClient(SupabaseConfig.url, SupabaseConfig.key);
        isSupabaseMode = true;
        console.log('Supabase SDK loaded & client initialized directly in browser');
      } catch (e) {
        console.error('Error initializing client-side Supabase after script load:', e);
      }
      resolve(supabaseClient);
    };
    script.onerror = () => {
      console.warn('Could not load Supabase SDK CDN, falling back to local mock data.');
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

/* ── Initialize: detect backend then sync ────────────────── */
async function initBackend() {
  if (API_BASE) {
    try {
      const health = await apiRequest('GET', '/health');
      if (health.status === 'ok') {
        isBackendMode = true;
        console.log('🚀 ShopNova backend detected — syncing live data...');
        await syncDataWithBackend();
        return;
      }
    } catch (e) {
      console.log('ℹ️ Backend not reachable. Checking client-side Supabase...');
    }
  }

  // If backend not detected or unavailable, load Supabase SDK directly in client
  console.log('ℹ️ Running in serverless/static mode. Loading Supabase SDK directly...');
  await loadSupabaseSDK();
  if (isSupabaseMode) {
    await syncDataWithSupabase();
  }
}

initBackend();

/* ============================================================
   ShopNova — theme.js
   Persistent Light/Dark Theme Switcher
   ============================================================ */
const Theme = (() => {
  const KEY = 'shopnova_theme';

  function init() {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light') {
      document.body.classList.add('light-mode');
    } else if (saved === 'dark') {
      document.body.classList.remove('light-mode');
    } else {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) {
        document.body.classList.add('light-mode');
      }
    }
  }

  function toggle() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem(KEY, isLight ? 'light' : 'dark');
    updateToggleState();
    if (typeof Notify !== 'undefined') {
      Notify.info(isLight ? 'Light Theme Activated' : 'Dark Theme Activated', 'Theme updated successfully.');
    }
  }

  function updateToggleState() {
    const isLight = document.body.classList.contains('light-mode');
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    // Toggle active class on the pill track
    const track = btn.querySelector('.theme-toggle-track');
    if (track) track.classList.toggle('is-light', isLight);
    btn.setAttribute('aria-label', isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode');
    btn.setAttribute('title', isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode');
  }

  return { init, toggle, updateToggleState };
})();

// Initialize immediately to prevent unstyled flash of dark mode
Theme.init();

/* ============================================================
   ShopNova — coupon.js
   Promo Code & Coupon Management
   ============================================================ */
const Coupon = (() => {
  const KEY = 'shopnova_coupon';
  const DATA_KEY = 'shopnova_coupon_data';
  const VALID_COUPONS = {
    'SUMMER50': { type: 'percent', value: 0.50, label: '50% Summer Discount' },
    'WELCOME10': { type: 'percent', value: 0.10, label: '10% Welcome Offer' },
    'FREESHIP': { type: 'shipping', value: 0, label: 'Free Shipping' }
  };

  function getApplied() {
    try {
      const savedData = localStorage.getItem(DATA_KEY);
      if (savedData) return JSON.parse(savedData);

      const code = localStorage.getItem(KEY);
      if (!code) return null;
      const cleanCode = code.toUpperCase().trim();
      return VALID_COUPONS[cleanCode] ? { code: cleanCode, ...VALID_COUPONS[cleanCode] } : null;
    } catch {
      return null;
    }
  }

  async function apply(code) {
    if (!code) return { success: false, error: 'Please enter a coupon code.' };
    const cleanCode = code.toUpperCase().trim();

    if (isBackendMode || API_BASE) {
      try {
        const subtotal = typeof Cart !== 'undefined' ? Cart.getSubtotal() : 0;
        const res = await apiRequest('POST', '/coupons/validate', { code: cleanCode, orderTotal: subtotal });
        if (res.success && res.data) {
          localStorage.setItem(KEY, cleanCode);
          localStorage.setItem(DATA_KEY, JSON.stringify(res.data));
          document.dispatchEvent(new CustomEvent('couponUpdated', { detail: { coupon: res.data } }));
          return { success: true, coupon: res.data };
        }
        return { success: false, error: res.error || 'Invalid coupon code.' };
      } catch (e) {
        console.warn('Backend coupon check failed, falling back to local validation');
      }
    }

    // Local fallback
    if (VALID_COUPONS[cleanCode]) {
      const cp = { code: cleanCode, ...VALID_COUPONS[cleanCode] };
      localStorage.setItem(KEY, cleanCode);
      localStorage.setItem(DATA_KEY, JSON.stringify(cp));
      document.dispatchEvent(new CustomEvent('couponUpdated', { detail: { coupon: cp } }));
      return { success: true, coupon: cp };
    }
    return { success: false, error: 'Invalid coupon code.' };
  }

  function remove() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(DATA_KEY);
    document.dispatchEvent(new CustomEvent('couponUpdated', { detail: { coupon: null } }));
  }

  function calculateDiscount(subtotal, shipping) {
    const coupon = getApplied();
    if (!coupon) return { discount: 0, newShipping: shipping };
    
    if (coupon.type === 'percent') {
      return { discount: parseFloat((subtotal * coupon.value).toFixed(2)), newShipping: shipping };
    } else if (coupon.type === 'shipping') {
      return { discount: 0, newShipping: 0 };
    } else if (coupon.type === 'fixed') {
      return { discount: Math.min(coupon.value, subtotal), newShipping: shipping };
    }
    return { discount: 0, newShipping: shipping };
  }

  return { getApplied, apply, remove, calculateDiscount };
})();

/* ============================================================
   ShopNova — comparison.js
   Product Comparison Manager
   ============================================================ */
const Comparison = (() => {
  const KEY = 'shopnova_comparison';
  const MAX_ITEMS = 3;

  function getItems() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }

  function add(productId) {
    const items = getItems();
    const id = Number(productId);
    if (items.includes(id)) return { success: false, error: 'Product already in comparison list.' };
    if (items.length >= MAX_ITEMS) return { success: false, error: `You can compare up to ${MAX_ITEMS} products at a time.` };
    items.push(id);
    localStorage.setItem(KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('comparisonUpdated', { detail: { items } }));
    updateFloatingTray();
    return { success: true };
  }

  function remove(productId) {
    const items = getItems();
    const id = Number(productId);
    const idx = items.indexOf(id);
    if (idx === -1) return { success: false };
    items.splice(idx, 1);
    localStorage.setItem(KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('comparisonUpdated', { detail: { items } }));
    updateFloatingTray();
    return { success: true };
  }

  function toggle(productId) {
    const id = Number(productId);
    const items = getItems();
    if (items.includes(id)) {
      remove(id);
      return false;
    } else {
      const res = add(id);
      if (!res.success) {
        Notify.warning('Comparison Limit', res.error);
        return false;
      }
      return true;
    }
  }

  function isInComparison(productId) {
    return getItems().includes(Number(productId));
  }

  function getCount() {
    return getItems().length;
  }

  function updateFloatingTray() {
    const ids = getItems();
    let tray = document.getElementById('comparison-floating-tray');
    if (!tray) {
      tray = document.createElement('div');
      tray.id = 'comparison-floating-tray';
      tray.className = 'comparison-tray';
      document.body.appendChild(tray);
    }

    if (ids.length === 0) {
      tray.style.display = 'none';
      return;
    }

    tray.style.display = 'flex';
    const products = SHOPNOVA_DATA.products.filter(p => ids.includes(p.id));

    tray.innerHTML = `
      <div class="tray-header">
        <span class="tray-title">Compare Products (${products.length}/${MAX_ITEMS})</span>
      </div>
      <div class="tray-items">
        ${products.map(p => `
          <div class="tray-item">
            <img src="${p.image}" alt="${p.name}">
            <span class="tray-item-name">${p.name.substring(0, 15)}...</span>
            <button class="tray-item-remove" onclick="Comparison.remove(${p.id})">✕</button>
          </div>
        `).join('')}
      </div>
      <div class="tray-actions">
        <button class="btn btn-secondary btn-sm" onclick="Comparison.clearAll()">Clear</button>
        <button class="btn btn-primary btn-sm" onclick="Comparison.showComparisonModal()">Compare Now</button>
      </div>
    `;
  }

  function clearAll() {
    localStorage.setItem(KEY, JSON.stringify([]));
    document.dispatchEvent(new CustomEvent('comparisonUpdated', { detail: { items: [] } }));
    updateFloatingTray();
  }

  function showComparisonModal() {
    const ids = getItems();
    if (ids.length < 2) {
      Notify.info('Select Products', 'Please add at least 2 products to compare.');
      return;
    }

    const products = SHOPNOVA_DATA.products.filter(p => ids.includes(p.id));

    const specKeys = new Set();
    products.forEach(p => {
      Object.keys(p.specs || {}).forEach(k => specKeys.add(k));
    });

    let modal = document.getElementById('comparison-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'comparison-modal';
      modal.className = 'comparison-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="comparison-modal-content">
        <div class="comparison-modal-header">
          <h2>Compare Products</h2>
          <button class="comparison-modal-close" onclick="Comparison.closeComparisonModal()">✕</button>
        </div>
        <div class="comparison-modal-body">
          <table class="comparison-table">
            <thead>
              <tr>
                <th style="width: 200px">Feature</th>
                ${products.map(p => `
                  <th>
                    <div class="comparison-header-product">
                      <img src="${p.image}" alt="${p.name}">
                      <div class="prod-brand">${p.brand}</div>
                      <div class="prod-name">${p.name}</div>
                      <div class="prod-price">${formatPrice(p.price)}</div>
                      <button class="btn btn-primary btn-sm w-full" style="margin-top:8px" onclick="Cart.addItem(${p.id})">🛒 Add to Cart</button>
                    </div>
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Price</strong></td>
                ${products.map(p => `
                  <td>
                    <span class="price-val" style="font-weight:700; color:var(--brand-secondary)">${formatPrice(p.price)}</span>
                    ${p.originalPrice > p.price ? `<span style="text-decoration:line-through; font-size:11px; color:var(--text-muted); margin-left:6px">${formatPrice(p.originalPrice)}</span>` : ''}
                  </td>
                `).join('')}
              </tr>
              <tr>
                <td><strong>Rating</strong></td>
                ${products.map(p => `
                  <td>
                    <div class="product-rating" style="display:flex; align-items:center; gap:4px">
                      ${renderStars(p.rating)}
                      <span class="rating-count">(${p.reviewCount.toLocaleString()})</span>
                    </div>
                  </td>
                `).join('')}
              </tr>
              <tr>
                <td><strong>Brand</strong></td>
                ${products.map(p => `<td>${p.brand}</td>`).join('')}
              </tr>
              <tr>
                <td><strong>Shipping</strong></td>
                ${products.map(p => `<td>${p.freeShipping ? '✅ Free Shipping' : 'Delivery fees apply'}</td>`).join('')}
              </tr>
              <tr>
                <td><strong>Stock Status</strong></td>
                ${products.map(p => `<td>${p.stock > 0 ? `<span style="color:var(--brand-accent)">In Stock (${p.stock})</span>` : '<span style="color:var(--brand-secondary)">Out of Stock</span>'}</td>`).join('')}
              </tr>
              ${Array.from(specKeys).map(key => `
                <tr>
                  <td><strong>${key}</strong></td>
                  ${products.map(p => `<td>${p.specs && p.specs[key] ? p.specs[key] : '—'}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function closeComparisonModal() {
    const modal = document.getElementById('comparison-modal');
    if (modal) modal.style.display = 'none';
  }

  return { getItems, add, remove, toggle, isInComparison, getCount, updateFloatingTray, clearAll, showComparisonModal, closeComparisonModal };
})();



/* ============================================================
   ShopNova — notifications.js
   Toast notification system
   ============================================================ */

const Notify = (() => {
  let container;

  function init() {
    container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  }

  function show({ type = 'info', title, message, duration = 3500 }) {
    if (!container) init();

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return {
    success: (title, msg) => show({ type: 'success', title, message: msg }),
    error:   (title, msg) => show({ type: 'error',   title, message: msg }),
    warning: (title, msg) => show({ type: 'warning', title, message: msg }),
    info:    (title, msg) => show({ type: 'info',    title, message: msg }),
  };
})();

/* ============================================================
   ShopNova — auth.js
   User authentication management
   ============================================================ */

const Auth = (() => {
  const KEY = 'shopnova_user';

  function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
  }

  // Async login — uses backend API if available, else static mock
  async function login(email, password) {
    if (isBackendMode || API_BASE) {
      const res = await apiRequest('POST', '/auth/login', { email, password });
      if (res.success) {
        if (res.require2FA) {
          return { success: false, require2FA: true, email: res.email, message: res.message };
        }
        localStorage.setItem(KEY, JSON.stringify(res.data));
        if (res.token) localStorage.setItem('shopnova_token', res.token);
        return { success: true, user: res.data };
      }
      if (isBackendMode) return { success: false, error: res.error || 'Invalid email or password' };
    }
    // Static fallback
    const user = SHOPNOVA_DATA.demoUsers.find(u => u.email === email && u.password === password);
    if (user) {
      const safe = { ...user };
      delete safe.password;
      localStorage.setItem(KEY, JSON.stringify(safe));
      return { success: true, user: safe };
    }
    return { success: false, error: 'Invalid email or password' };
  }

  async function verifyOTP(email, otp) {
    const res = await apiRequest('POST', '/auth/verify-otp', { email, otp });
    if (res.success) {
      localStorage.setItem(KEY, JSON.stringify(res.data));
      if (res.token) localStorage.setItem('shopnova_token', res.token);
      return { success: true, user: res.data };
    }
    return { success: false, error: res.error || 'Invalid OTP code' };
  }

  async function toggle2FA() {
    const res = await apiRequest('POST', '/auth/2fa/toggle', {});
    if (res.success) {
      const user = getCurrentUser();
      if (user) {
        user.twoFactorEnabled = res.twoFactorEnabled;
        localStorage.setItem(KEY, JSON.stringify(user));
      }
      return { success: true, twoFactorEnabled: res.twoFactorEnabled, message: res.message };
    }
    return { success: false, error: res.error || 'Could not toggle 2FA' };
  }

  async function getSecurityLogs() {
    const res = await apiRequest('GET', '/users/security-logs', null);
    return res.success ? res.data : [];
  }

  // Async register — uses backend API if available, else static mock
  async function register(name, email, password) {
    if (isBackendMode || API_BASE) {
      const res = await apiRequest('POST', '/auth/register', { name, email, password });
      if (res.success) {
        localStorage.setItem(KEY, JSON.stringify(res.data));
        if (res.token) localStorage.setItem('shopnova_token', res.token);
        return { success: true, user: res.data };
      }
      if (isBackendMode) return { success: false, error: res.error || 'Registration failed' };
    }
    // Static fallback
    const exists = SHOPNOVA_DATA.demoUsers.find(u => u.email === email);
    if (exists) return { success: false, error: 'Email already registered' };

    const newUser = {
      id: 'u' + Date.now(),
      name, email,
      avatar: name.charAt(0).toUpperCase(),
      joinDate: new Date().toISOString().split('T')[0],
      tier: 'Bronze',
      orders: 0,
      totalSpent: 0,
    };

    SHOPNOVA_DATA.demoUsers.push({ ...newUser, password });
    localStorage.setItem(KEY, JSON.stringify(newUser));
    return { success: true, user: newUser };
  }

  function logout() {
    localStorage.removeItem(KEY);
    localStorage.removeItem('shopnova_token');
    window.location.href = 'index.html';
  }

  function isLoggedIn() { return !!getCurrentUser(); }
  function isAdmin() { return getCurrentUser()?.isAdmin === true; }

  function updateNavAuth() {
    const user = getCurrentUser();
    const accountBtn = document.getElementById('nav-account-btn');
    if (!accountBtn) return;

    if (user) {
      accountBtn.innerHTML = `
        <div class="avatar-circle" style="width:32px;height:32px;border-radius:50%;background:var(--grad-primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${user.avatar}</div>
        <span style="font-size:11px">${user.name.split(' ')[0]}</span>
      `;
      accountBtn.onclick = () => window.location.href = 'profile.html';
    } else {
      accountBtn.innerHTML = `<span class="icon">👤</span><span>Account</span>`;
      accountBtn.onclick = () => window.location.href = 'login.html';
    }
  }

  return { getCurrentUser, login, verifyOTP, toggle2FA, getSecurityLogs, register, logout, isLoggedIn, isAdmin, updateNavAuth };
})();


/* ============================================================
   ShopNova — cart.js
   Shopping cart state management
   ============================================================ */

const Cart = (() => {
  const KEY = 'shopnova_cart';

  function getItems() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }

  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateNavBadge();
    document.dispatchEvent(new CustomEvent('cartUpdated', { detail: { items } }));
  }

  function addItem(productId, quantity = 1, options = {}) {
    const product = getProduct(productId);
    if (!product) return;

    let items = getItems();
    const key = `${productId}-${JSON.stringify(options)}`;
    const existing = items.find(i => i.key === key);

    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, product.stock);
    } else {
      items.push({
        key,
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        brand: product.brand,
        category: product.category,
        options,
        quantity,
        addedAt: Date.now(),
      });
    }

    save(items);
    Notify.success('Added to cart! 🛒', product.name);

    // Bump badge animation
    const badge = document.getElementById('cart-badge');
    if (badge) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }

    // Background sync to backend if logged in
    if (isBackendMode && Auth.isLoggedIn()) {
      apiRequest('POST', '/cart', { productId, qty: quantity, ...options }).catch(err => console.warn('Cart background add failed:', err));
    }
  }

  function removeItem(key) {
    const items = getItems();
    const item = items.find(i => i.key === key);
    const filtered = items.filter(i => i.key !== key);
    save(filtered);
    Notify.info('Removed from cart', '');

    // Background sync to backend if logged in
    if (item && isBackendMode && Auth.isLoggedIn()) {
      apiRequest('DELETE', `/cart/${item.productId}`).catch(err => console.warn('Cart background delete failed:', err));
    }
  }

  function updateQuantity(key, qty) {
    const items = getItems();
    const item = items.find(i => i.key === key);
    if (item) {
      if (qty <= 0) { removeItem(key); return; }
      item.quantity = qty;
      save(items);

      // Background sync to backend if logged in
      if (isBackendMode && Auth.isLoggedIn()) {
        apiRequest('PUT', `/cart/${item.productId}`, { qty }).catch(err => console.warn('Cart background update failed:', err));
      }
    }
  }

  function clear() {
    localStorage.removeItem(KEY);
    updateNavBadge();

    // Background sync to backend if logged in
    if (isBackendMode && Auth.isLoggedIn()) {
      apiRequest('DELETE', '/cart').catch(err => console.warn('Cart background clear failed:', err));
    }
  }

  function getCount() { return getItems().reduce((s, i) => s + i.quantity, 0); }

  function getSubtotal() { return getItems().reduce((s, i) => s + i.price * i.quantity, 0); }

  function getShipping(subtotal) {
    const FREE_THRESHOLD = 999; // ₹999 free shipping threshold
    return subtotal >= FREE_THRESHOLD ? 0 : 99; // ₹99 shipping fee
  }

  function getTax(subtotal) { return subtotal * 0.08; }

  function getTotal() {
    const sub = getSubtotal();
    const ship = getShipping(sub);
    if (typeof Coupon !== 'undefined') {
      const couponCalc = Coupon.calculateDiscount(sub, ship);
      const disc = couponCalc.discount;
      const finalShip = couponCalc.newShipping;
      const discountedSub = sub - disc;
      return discountedSub + finalShip + getTax(discountedSub);
    }
    return sub + ship + getTax(sub);
  }

  function updateNavBadge() {
    const badge = document.getElementById('cart-badge');
    const count = getCount();
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  function isInCart(productId) {
    return getItems().some(i => i.productId === productId);
  }

  /* Sync backend cart to local storage */
  async function syncFromBackend() {
    if (!isBackendMode || !Auth.isLoggedIn()) return;
    try {
      const res = await apiRequest('GET', '/cart');
      if (res.success && res.data && res.data.items) {
        const items = res.data.items.map(item => ({
          key: `${item.productId}-${JSON.stringify({ color: item.color, size: item.size })}`,
          productId: item.productId,
          name: item.product?.name || '',
          price: item.product?.price || 0,
          image: item.product?.image || '',
          brand: item.product?.brand || '',
          category: item.product?.category || '',
          options: { color: item.color, size: item.size },
          quantity: item.qty,
          addedAt: new Date(item.addedAt || Date.now()).getTime()
        }));
        save(items);
        console.log('✅ Cart synced from backend');
      }
    } catch (e) {
      console.warn('Could not sync cart from backend:', e.message);
    }
  }

  return { getItems, addItem, removeItem, updateQuantity, clear, getCount, getSubtotal, getShipping, getTax, getTotal, isInCart, updateNavBadge, syncFromBackend };
})();

/* ============================================================
    ShopNova — wishlist.js
    Wishlist management (backward-compatible wrapper)
    ============================================================ */

const Wishlist = (() => {
  function getItems() {
    if (typeof WishlistShare !== 'undefined') {
      return WishlistShare.getList(WishlistShare.DEFAULT_LIST).items || [];
    }
    try { return JSON.parse(localStorage.getItem('shopnova_wishlist')) || []; }
    catch { return []; }
  }

  function save(ids) {
    if (typeof WishlistShare !== 'undefined') {
      const lists = WishlistShare.getAll();
      lists[WishlistShare.DEFAULT_LIST] = { name: 'My Wishlist', items: ids, createdAt: Date.now() };
      WishlistShare.saveLists(lists);
    } else {
      localStorage.setItem('shopnova_wishlist', JSON.stringify(ids));
    }
    updateNavBadge();
    document.dispatchEvent(new CustomEvent('wishlistUpdated', { detail: { ids } }));
  }

  function toggle(productId) {
    const id = Number(productId);
    const items = getItems();
    const idx = items.indexOf(id);

    if (idx > -1) {
      items.splice(idx, 1);
      save(items);
      Notify.info('Removed from wishlist', '');
      if (isBackendMode && Auth.isLoggedIn()) {
        apiRequest('DELETE', `/wishlist/${id}`).catch(err => console.warn('Wishlist background delete failed:', err));
      }
      return false;
    } else {
      items.push(id);
      save(items);
      Notify.success('Added to wishlist! ❤️', getProduct(id)?.name || '');
      if (isBackendMode && Auth.isLoggedIn()) {
        apiRequest('POST', `/wishlist/${id}`).catch(err => console.warn('Wishlist background add failed:', err));
      }
      return true;
    }
  }

  function isInWishlist(productId) { return getItems().includes(Number(productId)); }

  function getCount() { return getItems().length; }

  function updateNavBadge() {
    const badge = document.getElementById('wishlist-badge');
    const count = getCount();
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  /* Sync backend wishlist to local storage */
  async function syncFromBackend() {
    if (!isBackendMode || !Auth.isLoggedIn()) return;
    try {
      const res = await apiRequest('GET', '/wishlist');
      if (res.success && res.data) {
        const ids = res.data.map(p => Number(p.id));
        save(ids);
        console.log('✅ Wishlist synced from backend');
      }
    } catch (e) {
      console.warn('Could not sync wishlist from backend:', e.message);
    }
  }

  return { getItems, toggle, isInWishlist, getCount, updateNavBadge, syncFromBackend };
})();

/* ============================================================
   ShopNova — app.js
   Core application utilities & initialization
   ============================================================ */

/* ── Scroll Reveal ───────────────────────────────────────── */
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  if (!els.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  els.forEach(el => obs.observe(el));
}

/* ── Navbar Scroll Effect ────────────────────────────────── */
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

/* ── Ripple Effect ───────────────────────────────────────── */
function addRipple(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple-effect';
  const size = Math.max(rect.width, rect.height);
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px;`;
  btn.classList.add('ripple-container');
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);
}

function initRipples() {
  document.querySelectorAll('.btn-primary, .btn-cart, .btn-buy-now').forEach(btn => {
    btn.addEventListener('click', addRipple);
  });
}

/* ── Countdown Timer ─────────────────────────────────────── */
function startCountdown(el, endTime) {
  function update() {
    const diff = endTime - Date.now();
    if (diff <= 0) { el.innerHTML = '<span class="text-muted">Expired</span>'; return; }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    const fmt = n => String(n).padStart(2, '0');
    el.innerHTML = `
      <div class="countdown-segment"><div class="countdown-number">${fmt(h)}</div><div class="countdown-label">Hrs</div></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-segment"><div class="countdown-number">${fmt(m)}</div><div class="countdown-label">Min</div></div>
      <div class="countdown-sep">:</div>
      <div class="countdown-segment"><div class="countdown-number">${fmt(s)}</div><div class="countdown-label">Sec</div></div>
    `;
  }
  update();
  return setInterval(update, 1000);
}

/* ── Stars Renderer ──────────────────────────────────────── */
function renderStars(rating, size = 14) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return `<div class="stars" style="font-size:${size}px">` +
    '⭐'.repeat(full).split('').map(() => `<span class="star filled">★</span>`).join('') +
    (half ? `<span class="star half">★</span>` : '') +
    Array(empty).fill(`<span class="star">★</span>`).join('') +
    `</div>`;
}

/* ── Product Card Builder ────────────────────────────────── */
function buildProductCard(product, listId = null) {
  const inWish = listId ? WishlistShare.isInList(listId, product.id) : Wishlist.isInWishlist(product.id);
  const badgeHtml = product.badge ? `<span class="badge badge-${product.badge}">${product.badge.toUpperCase()}</span>` : '';
  const discountHtml = product.discount > 0 ? `<span class="product-discount">-${product.discount}%</span>` : '';
  const origHtml = product.originalPrice > product.price
    ? `<span class="product-original-price">${formatPrice(product.originalPrice)}</span>` : '';

  const wishlistAttr = listId ? `data-list="${listId}"` : '';
  const wishlistClick = listId
    ? `event.stopPropagation(); toggleListWishlist(${product.id}, '${listId}', this)`
    : `event.stopPropagation(); toggleWishlist(${product.id}, this)`;

  return `
    <div class="product-card" onclick="window.location.href='product-detail.html?id=${product.id}'">
      <div class="product-img-wrap img-zoom-container">
        <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop'">
        <div class="product-badges">${badgeHtml}</div>
        <div class="product-actions">
          <button class="product-action-btn wishlist-btn ${inWish ? 'wishlist-active' : ''}"
            ${wishlistAttr}
            data-id="${product.id}"
            onclick="${wishlistClick}"
            title="${inWish ? 'Remove from list' : 'Add to list'}"
            aria-label="Toggle wishlist">
            ${inWish ? '❤️' : '🤍'}
          </button>
          <button class="product-action-btn comparison-btn ${Comparison.isInComparison(product.id) ? 'compare-active' : ''}"
            onclick="event.stopPropagation(); Comparison.toggle(${product.id}); this.classList.toggle('compare-active', Comparison.isInComparison(${product.id}))"
            title="Compare product" aria-label="Compare product">
            📊
          </button>
          <button class="product-action-btn"
            onclick="event.stopPropagation(); window.location.href='product-detail.html?id=${product.id}'"
            title="Quick view" aria-label="Quick view">
            👁️
          </button>
        </div>
      </div>
      <div class="product-content">
        <div class="product-category">${product.brand}</div>
        <div class="product-title">${product.name}</div>
        <div class="product-rating">
          ${renderStars(product.rating)}
          <span class="rating-count">(${product.reviewCount.toLocaleString()})</span>
        </div>
        <div class="product-price">
          <span class="product-current-price">${formatPrice(product.price)}</span>
          ${origHtml}
          ${discountHtml}
        </div>
      </div>
      <div class="product-card-footer">
        <button class="btn-add-cart" onclick="event.stopPropagation(); Cart.addItem(${product.id})" aria-label="Add to cart">
          🛒 Add to Cart
        </button>
      </div>
    </div>
  `;
}

/* ── Wishlist Toggle (global) ────────────────────────────── */
function toggleWishlist(productId, btn) {
  const added = Wishlist.toggle(productId);
  if (btn) {
    btn.innerHTML = added ? '❤️' : '🤍';
    btn.classList.toggle('wishlist-active', added);
  }
}

function toggleListWishlist(productId, listId, btn) {
  const inList = WishlistShare.isInList(listId, productId);
  if (inList) {
    WishlistShare.removeItem(listId, productId);
    if (btn) { btn.innerHTML = '🤍'; btn.classList.remove('wishlist-active'); }
  } else {
    WishlistShare.addItem(listId, productId);
    if (btn) { btn.innerHTML = '❤️'; btn.classList.add('wishlist-active'); }
  }
  document.dispatchEvent(new CustomEvent('listsUpdated'));
}

/* ── Navbar HTML Builder ─────────────────────────────────── */
function buildNavbar(activePage = '') {
  return `
    <nav class="navbar">
      <!-- Promo Bar -->
      <div class="ticker-wrap">
        <div class="ticker-inner">
          ${['🚀 FREE SHIPPING on orders over $35', '⚡ Flash Sale — Up to 50% OFF Today Only!', '🎁 Earn rewards on every purchase', '📱 Download our app for exclusive deals', '✨ New arrivals every week'].map(t => `<span class="ticker-item"><span class="ticker-dot"></span>${t}</span><span class="ticker-item"><span class="ticker-dot"></span>${t}</span>`).join('')}
        </div>
      </div>
      <!-- Main Nav -->
      <div class="navbar-inner">
        <a href="index.html" class="navbar-logo" aria-label="ShopNova Home">
          <div class="logo-icon">⚡</div>
          <span>ShopNova</span>
        </a>

        <div class="navbar-search" id="navbar-search">
          <div class="search-container">
            <select class="search-category" id="search-cat" aria-label="Search category">
              <option value="all">All</option>
              ${SHOPNOVA_DATA.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
            <input type="text" class="search-input" id="search-input" placeholder="Search products, brands, categories..." autocomplete="off" aria-label="Search">
            <button class="search-btn" onclick="doSearch()" aria-label="Search">🔍</button>
          </div>
          <div class="search-suggestions" id="search-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg-700);border:1px solid var(--glass-border);border-radius:var(--radius-lg);margin-top:4px;padding:var(--space-2);z-index:var(--z-dropdown);box-shadow:var(--shadow-lg);"></div>
        </div>

        <div class="navbar-actions">
          <button class="theme-pill-toggle" id="theme-toggle-btn" onclick="Theme.toggle()" aria-label="Switch to Light Mode" title="Switch to Light Mode">
            <span class="theme-icon theme-icon-moon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            </span>
            <span class="theme-toggle-track" id="theme-toggle-track">
              <span class="theme-toggle-thumb"></span>
            </span>
            <span class="theme-icon theme-icon-sun" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </span>
          </button>
          <button class="nav-action-btn" id="nav-account-btn" aria-label="Account">
            <span class="icon">👤</span>
            <span>Account</span>
          </button>
          <a href="wishlist.html" class="nav-action-btn" aria-label="Wishlist">
            <span class="icon" style="position:relative">
              🤍
              <span class="nav-badge" id="wishlist-badge" style="display:none">0</span>
            </span>
            <span>Wishlist</span>
          </a>
          <a href="cart.html" class="nav-action-btn" aria-label="Cart" style="position:relative">
            <span class="icon" style="position:relative">
              🛒
              <span class="nav-badge" id="cart-badge" style="display:none">0</span>
            </span>
            <span>Cart</span>
          </a>
        </div>
      </div>
      <!-- Category Nav -->
      <div class="category-nav">
        <div class="category-nav-inner">
          <a href="products.html" class="category-nav-item ${activePage === 'all' ? 'active' : ''}">🏷️ All Deals</a>
          <a href="bundles.html" class="category-nav-item" style="color:var(--brand-primary)">🎁 Bundles</a>
          ${SHOPNOVA_DATA.categories.slice(0, 7).map(c =>
            `<a href="products.html?cat=${c.id}" class="category-nav-item ${activePage === c.id ? 'active' : ''}">${c.icon} ${c.name}</a>`
          ).join('')}
          <a href="products.html?sale=true" class="category-nav-item" style="color:var(--brand-orange)">🔥 Sale</a>
        </div>
      </div>
    </nav>
  `;
}

/* ── Footer HTML Builder ─────────────────────────────────── */
function buildFooter() {
  return `
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="footer-logo"><span class="grad-text">⚡ ShopNova</span></div>
            <p>Your premium e-commerce destination. Discover millions of products from trusted brands, delivered fast and hassle-free.</p>
            <div class="footer-socials">
              <button class="social-btn" title="Facebook" aria-label="Facebook">📘</button>
              <button class="social-btn" title="Instagram" aria-label="Instagram">📸</button>
              <button class="social-btn" title="Twitter" aria-label="Twitter">🐦</button>
              <button class="social-btn" title="YouTube" aria-label="YouTube">▶️</button>
            </div>
          </div>
          <div class="footer-col">
            <h4>Shop</h4>
            <div class="footer-links">
              ${SHOPNOVA_DATA.categories.slice(0, 6).map(c => `<a href="products.html?cat=${c.id}">${c.name}</a>`).join('')}
            </div>
          </div>
          <div class="footer-col">
            <h4>Account</h4>
            <div class="footer-links">
              <a href="login.html">Login / Register</a>
              <a href="profile.html">My Orders</a>
              <a href="wishlist.html">Wishlist</a>
              <a href="profile.html">Settings</a>
            </div>
          </div>
          <div class="footer-col">
            <h4>Support</h4>
            <div class="footer-links">
              <a href="#">Help Center</a>
              <a href="order-tracking.html">Track Order</a>
              <a href="#">Returns & Refunds</a>
              <a href="#">Contact Us</a>
              <a href="#">Live Chat</a>
            </div>
          </div>
          <div class="footer-col">
            <h4>Company</h4>
            <div class="footer-links">
              <a href="#">About Us</a>
              <a href="seller-dashboard.html">Sell on ShopNova</a>
              <a href="admin.html">Admin Panel</a>
              <a href="#">Careers</a>
              <a href="#">Privacy Policy</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <p>© 2024 ShopNova Inc. All rights reserved.</p>
          <div class="footer-payment-methods">
            <span class="payment-chip">VISA</span>
            <span class="payment-chip">MC</span>
            <span class="payment-chip">AMEX</span>
            <span class="payment-chip">PayPal</span>
            <span class="payment-chip">Apple Pay</span>
            <span class="payment-chip">Google Pay</span>
          </div>
        </div>
      </div>
    </footer>
    <div id="toast-container" class="toast-container"></div>
  `;
}

/* ── Search Autocomplete ─────────────────────────────────── */
function initSearch() {
  const input = document.getElementById('search-input');
  const suggestions = document.getElementById('search-suggestions');
  if (!input || !suggestions) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length < 2) { suggestions.style.display = 'none'; return; }

    const results = searchProducts(q).slice(0, 6);
    if (!results.length) { suggestions.style.display = 'none'; return; }

    suggestions.innerHTML = results.map(p => `
      <div onclick="window.location.href='product-detail.html?id=${p.id}'"
        style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;cursor:pointer;transition:background 0.15s"
        onmouseover="this.style.background='var(--glass-bg)'" onmouseout="this.style.background=''">
        <img src="${p.image}" style="width:40px;height:40px;border-radius:8px;object-fit:cover" alt="${p.name}" loading="lazy">
        <div>
          <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${p.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">${p.brand} • ${formatPrice(p.price)}</div>
        </div>
      </div>
    `).join('');

    suggestions.innerHTML += `<div onclick="doSearch()" style="text-align:center;padding:10px;font-size:12px;color:var(--brand-primary);cursor:pointer;border-top:1px solid var(--glass-border);margin-top:4px">
      See all results for "${q}" →
    </div>`;

    suggestions.style.display = 'block';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  document.addEventListener('click', (e) => {
    if (!input.closest('.navbar-search').contains(e.target)) {
      suggestions.style.display = 'none';
    }
  });
}

function doSearch() {
  const q = document.getElementById('search-input')?.value?.trim();
  if (q) window.location.href = `search-results.html?q=${encodeURIComponent(q)}`;
}

/* ── Init All ────────────────────────────────────────────── */
function initApp() {
  initNavbarScroll();
  initScrollReveal();
  initRipples();
  initSearch();
  Cart.updateNavBadge();
  Wishlist.updateNavBadge();
  Auth.updateNavAuth();
  Theme.updateToggleState();
  Comparison.updateFloatingTray();
  Chatbot.init();
}

/* ============================================================
   ShopNova — chatbot.js
   Floating Mock AI Support Chatbot
   ============================================================ */
const Chatbot = (() => {
  let initialized = false;
  let isOpen = false;

  function init() {
    if (initialized) return;
    initialized = true;

    // Inject chat bubble launcher and window container
    const launcher = document.createElement('button');
    launcher.id = 'chatbot-launcher';
    launcher.className = 'chatbot-bubble-launcher';
    launcher.innerHTML = '💬';
    launcher.title = 'ShopNova Support Assistant';
    launcher.onclick = toggle;
    document.body.appendChild(launcher);

    const container = document.createElement('div');
    container.id = 'chatbot-container';
    container.className = 'chatbot-window-container';
    container.style.display = 'none';
    container.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-header-info">
          <span class="chatbot-header-avatar">🤖</span>
          <div>
            <div class="chatbot-header-name">Nova Assistant</div>
            <div class="chatbot-header-status"><span class="status-dot"></span>Online</div>
          </div>
        </div>
        <button class="chatbot-header-close" onclick="Chatbot.toggle()">✕</button>
      </div>
      <div class="chatbot-body">
        <div class="chatbot-messages" id="chatbot-messages">
          <div class="chat-msg bot">
            Hello! I am your ShopNova Assistant. How can I help you today?
          </div>
        </div>
        <div class="chat-suggestions" id="chat-suggestions">
          <button class="suggestion-chip" onclick="Chatbot.sendQuick('coupons')">🎟️ Current Coupons</button>
          <button class="suggestion-chip" onclick="Chatbot.sendQuick('search')">🔍 Search Catalog</button>
          <button class="suggestion-chip" onclick="Chatbot.sendQuick('track')">📦 Track Order</button>
          <button class="suggestion-chip" onclick="Chatbot.sendQuick('compare')">💡 Compare Help</button>
        </div>
      </div>
      <div class="chatbot-footer">
        <input type="text" id="chatbot-input" placeholder="Type a message..." autocomplete="off">
        <button id="chatbot-send-btn" onclick="Chatbot.handleSend()">➔</button>
      </div>
    `;
    document.body.appendChild(container);

    // Bind Enter key
    const input = document.getElementById('chatbot-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
      });
    }
  }

  function toggle() {
    const container = document.getElementById('chatbot-container');
    if (!container) return;
    isOpen = !isOpen;
    container.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      document.getElementById('chatbot-input')?.focus();
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    const messages = document.getElementById('chatbot-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function appendMessage(text, isUser = false) {
    const messages = document.getElementById('chatbot-messages');
    if (!messages) return;

    const div = document.createElement('div');
    div.className = `chat-msg ${isUser ? 'user' : 'bot'}`;
    div.innerHTML = text;
    messages.appendChild(div);
    scrollToBottom();
  }

  function appendTypingIndicator() {
    const messages = document.getElementById('chatbot-messages');
    if (!messages) return null;

    const div = document.createElement('div');
    div.id = 'chatbot-typing-indicator';
    div.className = 'chat-msg bot typing';
    div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('chatbot-typing-indicator');
    if (indicator) indicator.remove();
  }

  function sendQuick(type) {
    let query = '';
    if (type === 'coupons') query = 'What are the current promo coupons?';
    else if (type === 'search') query = 'How do I search for products?';
    else if (type === 'track') query = 'Track order SN-2024-001';
    else if (type === 'compare') query = 'How do I compare products?';

    appendMessage(query, true);
    respond(query);
  }

  function handleSend() {
    const input = document.getElementById('chatbot-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendMessage(text, true);
    respond(text);
  }

  async function respond(text) {
    const typing = appendTypingIndicator();

    // Check if Gemini AI response is available
    if (typeof GeminiChat !== 'undefined') {
      const aiReply = await GeminiChat.ask(text);
      if (aiReply) {
        removeTypingIndicator();
        appendMessage(aiReply);
        return;
      }
    }

    setTimeout(() => {
      removeTypingIndicator();
      const lower = text.toLowerCase();

      if (lower.includes('coupon') || lower.includes('promo') || lower.includes('discount')) {
        appendMessage(`Here are the active coupon codes you can use at checkout:
          <ul style="margin: 8px 0 0 16px; padding: 0; line-height: 1.5">
            <li><strong>SUMMER50</strong>: 50% discount on all items</li>
            <li><strong>WELCOME10</strong>: 10% discount on your order</li>
            <li><strong>FREESHIP</strong>: Free shipping on any subtotal</li>
          </ul>`);
      } 
      else if (lower.includes('track') || lower.includes('order')) {
        const match = text.match(/SN-\d{4}-\d{6}|SN-\d{4}-\d{3}/i) || text.match(/\d+/);
        const code = match ? match[0].toUpperCase() : 'SN-2024-001';
        
        const ords = [...SHOPNOVA_DATA.demoOrders];
        const localOrds = (() => {
          try { return JSON.parse(localStorage.getItem('shopnova_orders')) || []; }
          catch { return []; }
        })();
        const allOrders = [...localOrds, ...ords];
        
        const order = allOrders.find(o => o.id.toUpperCase().includes(code) || code.includes(o.id.replace('SN-', '')));
        if (order) {
          appendMessage(`<strong>Order Status for ${order.id}:</strong>
            <div style="margin-top:6px">Status: <strong style="text-transform:uppercase; color:var(--brand-accent)">${order.status}</strong></div>
            <div>Date: ${order.date}</div>
            <div>Total: ${formatPrice(order.total)}</div>
            <div>Shipping: ${order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}</div>
            <div style="margin-top:6px"><a href="order-tracking.html?id=${order.id}" style="color:var(--brand-primary); font-weight:600">Click here to track detailed shipping updates →</a></div>`);
        } else {
          appendMessage(`Sorry, I couldn't find an order matching "${code}". Try tracking one of our demo orders like <strong>SN-2024-001</strong>.`);
        }
      } 
      else if (lower.includes('compare') || lower.includes('comparison')) {
        appendMessage(`To compare products side-by-side:
          <ol style="margin: 8px 0 0 16px; padding: 0; line-height: 1.5">
            <li>Browse the catalog and hover over any product card.</li>
            <li>Click the comparison button (📊) to add up to 3 products.</li>
            <li>A drawer will appear at the bottom of the screen. Click "Compare Now" to see detailed specs.</li>
          </ol>`);
      }
      else {
        const queryWords = lower.split(/\s+/).filter(w => w.length > 2);
        let found = [];
        if (queryWords.length > 0) {
          found = SHOPNOVA_DATA.products.filter(p => 
            queryWords.some(w => 
              p.name.toLowerCase().includes(w) || 
              p.brand.toLowerCase().includes(w) || 
              p.category.toLowerCase().includes(w)
            )
          );
        }

        if (found.length > 0) {
          const limit = found.slice(0, 3);
          appendMessage(`I found some products matching your query:
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px">
              ${limit.map(p => `
                <div onclick="window.location.href='product-detail.html?id=${p.id}'" 
                  style="display:flex; align-items:center; gap:8px; background:var(--bg-600); padding:6px; border-radius:var(--radius-md); border:1px solid var(--glass-border); cursor:pointer">
                  <img src="${p.image}" style="width:36px; height:36px; border-radius:var(--radius-sm); object-fit:cover">
                  <div style="flex:1; overflow:hidden">
                    <div style="font-size:11px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; overflow:hidden">${p.name}</div>
                    <div style="font-size:10px; color:var(--brand-secondary)">${formatPrice(p.price)}</div>
                  </div>
                </div>
              `).join('')}
            </div>`);
        } else {
          appendMessage("I'm not sure I understand that query. You can ask me to track an order (e.g., 'Track SN-2024-001'), show active discount coupons, or list products like 'laptops' or 'headphones'.");
        }
      }
    }, 1000);
  }

  return { init, toggle, sendQuick, handleSend };
})();

document.addEventListener('DOMContentLoaded', initApp);
