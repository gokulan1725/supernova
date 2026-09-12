/* ============================================================
   ShopNova — i18n.js
   Multi-Currency & Multi-Language System
   Supports: EN, FR, ES, HI | USD, EUR, GBP, INR, AED
   ============================================================ */

'use strict';

const I18N = (() => {

  /* ── Supported Languages ─────────────────────────────────── */
  const LANGUAGES = {
    en: { name: 'English',  flag: '🇺🇸', code: 'en' },
    fr: { name: 'Français', flag: '🇫🇷', code: 'fr' },
    es: { name: 'Español',  flag: '🇪🇸', code: 'es' },
    hi: { name: 'हिन्दी',   flag: '🇮🇳', code: 'hi' }
  };

  /* ── Supported Currencies ────────────────────────────────── */
  const CURRENCIES = {
    INR: { symbol: '₹',  name: 'Indian Rupee', flag: '🇮🇳', rate: 1.0    },
    USD: { symbol: '$',  name: 'US Dollar',    flag: '🇺🇸', rate: 0.012  },
    EUR: { symbol: '€',  name: 'Euro',         flag: '🇪🇺', rate: 0.011  },
    GBP: { symbol: '£',  name: 'British Pound',flag: '🇬🇧', rate: 0.0095 },
    AED: { symbol: 'د.إ',name: 'UAE Dirham',   flag: '🇦🇪', rate: 0.044  }
  };

  /* ── Translation strings ─────────────────────────────────── */
  const TRANSLATIONS = {
    en: {
      'nav.home': 'Home',
      'nav.products': 'Products',
      'nav.cart': 'Cart',
      'nav.wishlist': 'Wishlist',
      'nav.login': 'Login',
      'nav.profile': 'My Account',
      'nav.search': 'Search products...',
      'btn.add_to_cart': '🛒 Add to Cart',
      'btn.buy_now': '⚡ Buy Now',
      'btn.shop_now': '🛍️ Shop Now',
      'btn.view_deals': '⚡ View Deals',
      'label.free_shipping': 'Free Shipping',
      'label.in_stock': 'In Stock',
      'label.out_of_stock': 'Out of Stock',
      'label.reviews': 'reviews',
      'label.sold': 'sold',
      'label.save': 'You save',
      'label.subscribe_save': '📅 Subscribe & Save',
      'label.subscribe_extra': 'Extra 5% off on subscription',
      'section.flash_deals': 'Flash Deals',
      'section.featured': 'Featured Products',
      'section.trending': 'Trending Products',
      'section.categories': 'Shop by Category',
      'footer.rights': 'All rights reserved.',
      'chat.title': 'ShopNova Support',
      'chat.placeholder': 'Type a message...',
      'chat.send': 'Send',
      'chat.greeting': '👋 Hi! How can I help you today?'
    },
    fr: {
      'nav.home': 'Accueil',
      'nav.products': 'Produits',
      'nav.cart': 'Panier',
      'nav.wishlist': 'Liste de souhaits',
      'nav.login': 'Connexion',
      'nav.profile': 'Mon compte',
      'nav.search': 'Rechercher des produits...',
      'btn.add_to_cart': '🛒 Ajouter au panier',
      'btn.buy_now': '⚡ Acheter maintenant',
      'btn.shop_now': '🛍️ Acheter',
      'btn.view_deals': '⚡ Voir les offres',
      'label.free_shipping': 'Livraison gratuite',
      'label.in_stock': 'En stock',
      'label.out_of_stock': 'Rupture de stock',
      'label.reviews': 'avis',
      'label.sold': 'vendus',
      'label.save': 'Vous économisez',
      'label.subscribe_save': '📅 S\'abonner & Économiser',
      'label.subscribe_extra': 'Économisez 5% supplémentaires sur abonnement',
      'section.flash_deals': 'Ventes Flash',
      'section.featured': 'Produits en vedette',
      'section.trending': 'Tendances',
      'section.categories': 'Acheter par catégorie',
      'footer.rights': 'Tous droits réservés.',
      'chat.title': 'Support ShopNova',
      'chat.placeholder': 'Tapez un message...',
      'chat.send': 'Envoyer',
      'chat.greeting': '👋 Bonjour! Comment puis-je vous aider?'
    },
    es: {
      'nav.home': 'Inicio',
      'nav.products': 'Productos',
      'nav.cart': 'Carrito',
      'nav.wishlist': 'Lista de deseos',
      'nav.login': 'Iniciar sesión',
      'nav.profile': 'Mi cuenta',
      'nav.search': 'Buscar productos...',
      'btn.add_to_cart': '🛒 Agregar al carrito',
      'btn.buy_now': '⚡ Comprar ahora',
      'btn.shop_now': '🛍️ Comprar',
      'btn.view_deals': '⚡ Ver ofertas',
      'label.free_shipping': 'Envío gratis',
      'label.in_stock': 'En stock',
      'label.out_of_stock': 'Agotado',
      'label.reviews': 'reseñas',
      'label.sold': 'vendidos',
      'label.save': 'Ahorras',
      'label.subscribe_save': '📅 Suscribirse y Ahorrar',
      'label.subscribe_extra': '5% extra de descuento en suscripción',
      'section.flash_deals': 'Ofertas Flash',
      'section.featured': 'Productos destacados',
      'section.trending': 'Tendencias',
      'section.categories': 'Comprar por categoría',
      'footer.rights': 'Todos los derechos reservados.',
      'chat.title': 'Soporte ShopNova',
      'chat.placeholder': 'Escribe un mensaje...',
      'chat.send': 'Enviar',
      'chat.greeting': '👋 ¡Hola! ¿Cómo puedo ayudarte hoy?'
    },
    hi: {
      'nav.home': 'होम',
      'nav.products': 'उत्पाद',
      'nav.cart': 'कार्ट',
      'nav.wishlist': 'विशलिस्ट',
      'nav.login': 'लॉगिन',
      'nav.profile': 'मेरा खाता',
      'nav.search': 'उत्पाद खोजें...',
      'btn.add_to_cart': '🛒 कार्ट में जोड़ें',
      'btn.buy_now': '⚡ अभी खरीदें',
      'btn.shop_now': '🛍️ अभी खरीदें',
      'btn.view_deals': '⚡ डील्स देखें',
      'label.free_shipping': 'मुफ़्त शिपिंग',
      'label.in_stock': 'स्टॉक में है',
      'label.out_of_stock': 'स्टॉक खत्म',
      'label.reviews': 'समीक्षाएं',
      'label.sold': 'बेचे गए',
      'label.save': 'आपकी बचत',
      'label.subscribe_save': '📅 सदस्यता लें और बचाएं',
      'label.subscribe_extra': 'सदस्यता पर 5% अतिरिक्त छूट',
      'section.flash_deals': 'फ्लैश डील्स',
      'section.featured': 'फीचर्ड उत्पाद',
      'section.trending': 'ट्रेंडिंग',
      'section.categories': 'श्रेणी अनुसार खरीदें',
      'footer.rights': 'सर्वाधिकार सुरक्षित।',
      'chat.title': 'ShopNova सहायता',
      'chat.placeholder': 'संदेश लिखें...',
      'chat.send': 'भेजें',
      'chat.greeting': '👋 नमस्ते! आज मैं आपकी कैसे मदद कर सकता हूं?'
    }
  };

  let currentLang = localStorage.getItem('shopnova_lang') || 'en';
  let currentCurrency = localStorage.getItem('shopnova_currency');
  if (!currentCurrency || currentCurrency === 'USD') {
    currentCurrency = 'INR';
    localStorage.setItem('shopnova_currency', 'INR');
  }

  /* ── Live Exchange Rate Fetch ────────────────────────────── */
  // Prices in the app are stored in INR. INR rate = 1.0 (base).
  // We fetch live rates to convert INR → other currencies for display.
  let liveRatesFetched = false;

  async function fetchLiveRates() {
    if (liveRatesFetched) return;
    try {
      // open.er-api.com provides free rates with INR as base
      const res = await fetch('https://open.er-api.com/v6/latest/INR');
      if (!res.ok) throw new Error('Rate fetch failed');
      const data = await res.json();
      if (data && data.rates) {
        // INR is base (rate = 1.0), other currencies show how many units per 1 INR
        CURRENCIES.INR.rate = 1.0;
        CURRENCIES.USD.rate = data.rates.USD || 0.012;
        CURRENCIES.EUR.rate = data.rates.EUR || 0.011;
        CURRENCIES.GBP.rate = data.rates.GBP || 0.0095;
        CURRENCIES.AED.rate = data.rates.AED || 0.044;
        liveRatesFetched = true;
        console.log('✅ ShopNova: Live exchange rates loaded (base: INR)');
        // Refresh any displayed prices with the new live rates
        refreshAllPrices();
        updateSwitcherUI();
      }
    } catch (e) {
      console.warn('⚠️ ShopNova: Using fallback exchange rates —', e.message);
    }
  }

  /* ── Translate a key ─────────────────────────────────────── */

  function t(key) {
    return (TRANSLATIONS[currentLang] || TRANSLATIONS.en)[key] || key;
  }

  /* ── Format price in active currency ─────────────────────── */
  function formatPrice(amount) {
    if (typeof amount !== 'number') amount = parseFloat(amount) || 0;
    const cur = CURRENCIES[currentCurrency] || CURRENCIES.INR;
    const converted = amount * cur.rate;
    if (currentCurrency === 'INR') {
      return `${cur.symbol}${Math.round(converted).toLocaleString('en-IN')}`;
    }
    return `${cur.symbol}${converted.toFixed(2)}`;
  }

  /* ── Set language ────────────────────────────────────────── */
  function setLanguage(lang) {
    if (!LANGUAGES[lang]) return;
    currentLang = lang;
    localStorage.setItem('shopnova_lang', lang);
    document.documentElement.lang = lang;
    applyTranslations();
    updateSwitcherUI();
  }

  /* ── Set currency ────────────────────────────────────────── */
  function setCurrency(code) {
    if (!CURRENCIES[code]) return;
    currentCurrency = code;
    localStorage.setItem('shopnova_currency', code);
    refreshAllPrices();
    updateSwitcherUI();
  }

  /* ── Apply [data-i18n] translations to DOM ───────────────── */
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });
  }

  /* ── Refresh all [data-price] elements ───────────────────── */
  function refreshAllPrices() {
    document.querySelectorAll('[data-price]').forEach(el => {
      const usd = parseFloat(el.getAttribute('data-price'));
      if (!isNaN(usd)) el.textContent = formatPrice(usd);
    });
  }

  /* ── Build language + currency switcher HTML ─────────────── */
  function buildSwitcherHTML() {
    const lang = LANGUAGES[currentLang];
    const cur  = CURRENCIES[currentCurrency];
    return `
      <div class="i18n-switcher" id="i18n-switcher">
        <!-- Language Dropdown -->
        <div class="i18n-dropdown-wrap" id="lang-wrap">
          <button class="i18n-btn" onclick="I18N.toggleDropdown('lang')" aria-label="Switch language">
            <span>${lang.flag}</span>
            <span class="i18n-code">${lang.code.toUpperCase()}</span>
            <span class="i18n-arrow">▾</span>
          </button>
          <div class="i18n-dropdown" id="lang-dropdown">
            ${Object.values(LANGUAGES).map(l => `
              <div class="i18n-option ${l.code === currentLang ? 'active' : ''}"
                   onclick="I18N.setLanguage('${l.code}'); I18N.closeAll()">
                ${l.flag} ${l.name}
              </div>
            `).join('')}
          </div>
        </div>
        <!-- Currency Dropdown -->
        <div class="i18n-dropdown-wrap" id="cur-wrap">
          <button class="i18n-btn" onclick="I18N.toggleDropdown('cur')" aria-label="Switch currency">
            <span>${cur.flag}</span>
            <span class="i18n-code">${currentCurrency}</span>
            <span class="i18n-arrow">▾</span>
          </button>
          <div class="i18n-dropdown" id="cur-dropdown">
            ${Object.entries(CURRENCIES).map(([code, c]) => `
              <div class="i18n-option ${code === currentCurrency ? 'active' : ''}"
                   onclick="I18N.setCurrency('${code}'); I18N.closeAll()">
                ${c.flag} ${code} <span style="color:var(--text-muted);font-size:11px">${c.symbol}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /* ── Inject switcher into navbar ─────────────────────────── */
  function injectSwitcher(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = buildSwitcherHTML();
  }

  function updateSwitcherUI() {
    const existing = document.getElementById('i18n-switcher');
    if (existing) existing.outerHTML = buildSwitcherHTML();
    else injectSwitcher('i18n-switcher-container');
  }

  function toggleDropdown(type) {
    const id = type === 'lang' ? 'lang-dropdown' : 'cur-dropdown';
    const otherId = type === 'lang' ? 'cur-dropdown' : 'lang-dropdown';
    document.getElementById(id)?.classList.toggle('open');
    document.getElementById(otherId)?.classList.remove('open');
  }

  function closeAll() {
    document.querySelectorAll('.i18n-dropdown').forEach(d => d.classList.remove('open'));
  }

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.i18n-dropdown-wrap')) closeAll();
  });

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    document.documentElement.lang = currentLang;
    applyTranslations();
    // Fetch live exchange rates in background (non-blocking)
    fetchLiveRates();
  }

  return {
    t, formatPrice, setLanguage, setCurrency,
    buildSwitcherHTML, injectSwitcher,
    toggleDropdown, closeAll,
    getCurrentLang: () => currentLang,
    getCurrentCurrency: () => currentCurrency,
    LANGUAGES, CURRENCIES, init, fetchLiveRates
  };
})();

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => I18N.init());
} else {
  I18N.init();
}
