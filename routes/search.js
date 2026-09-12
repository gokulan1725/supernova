/* ============================================================
   routes/search.js  — Advanced Search & Autocomplete API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (readDB, supabase) {

function mapSupabaseProductToClient(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory || null,
    brand: p.brand || null,
    price: p.price,
    originalPrice: p.original_price || p.price,
    discount: p.discount || 0,
    rating: p.rating || 0,
    reviewCount: p.review_count || 0,
    stock: p.stock || 0,
    sold: p.sold || 0,
    image: p.image || null,
    images: p.images || [],
    badge: p.badge || null,
    tags: p.tags || [],
    description: p.description || null,
    specs: p.specs || {},
    colors: p.colors || [],
    sizes: p.sizes || [],
    freeShipping: p.free_shipping || false,
    deliveryDays: p.delivery_days || 5,
    warranty: p.warranty || null,
    isTrending: p.is_trending || false,
    isFeatured: p.is_featured || false,
    isNew: p.is_new || false,
    seller: p.seller || null,
  };
}

  /* GET /api/search?q=...&cat=...&sort=...&min=...&max=...&page=...&limit=...
     Full-featured search with filters, pagination and facets */
  router.get('/', async (req, res) => {
    const { q = '', cat, sort, min, max, brand, page = 1, limit = 20, sale, rating } = req.query;

    let products = [];
    let source = 'local';

    try {
      if (supabase) {
        let query = supabase.from('products').select('*');

        if (q.trim()) {
          const pattern = `%${q.trim()}%`;
          query = query.or(`name.ilike.${pattern},brand.ilike.${pattern},description.ilike.${pattern}`);
        }

        if (cat && cat !== 'all')       query = query.eq('category', cat);
        if (sale === 'true')            query = query.gt('discount', 0);
        if (brand)                      query = query.eq('brand', brand);
        if (min !== undefined && min !== '')  query = query.gte('price', parseFloat(min));
        if (max !== undefined && max !== '')  query = query.lte('price', parseFloat(max));
        if (rating)                     query = query.gte('rating', parseFloat(rating));

        const sortMap = {
          'price-low':  { column: 'price', ascending: true },
          'price-high': { column: 'price', ascending: false },
          'rating':     { column: 'rating', ascending: false },
          'newest':     { column: 'is_new', ascending: false },
          'discount':   { column: 'discount', ascending: false },
          'trending':   { column: 'sold', ascending: false },
          'featured':   { column: 'is_featured', ascending: false },
        };
        const s = sortMap[sort] || sortMap['featured'];
        query = query.order(s.column, { ascending: s.ascending });

        const { data, error } = await query;
        if (!error && data) {
          products = data.map(mapSupabaseProductToClient);
          source = 'supabase';
        }
      }
    } catch (e) {
      products = [];
      source = 'local';
    }

    if (source === 'local') {
      const db = readDB();
      products = [...db.products];
      const ql = q.trim().toLowerCase();
      if (ql) {
        products = products.filter(p =>
          p.name.toLowerCase().includes(ql) ||
          (p.brand || '').toLowerCase().includes(ql) ||
          (p.description || '').toLowerCase().includes(ql) ||
          (p.tags || []).some(t => t.toLowerCase().includes(ql)) ||
          p.category.toLowerCase().includes(ql) ||
          (p.subcategory || '').toLowerCase().includes(ql)
        );
      }
      if (cat && cat !== 'all')         products = products.filter(p => p.category === cat);
      if (sale === 'true')              products = products.filter(p => p.discount > 0);
      if (brand)                        products = products.filter(p => (p.brand||'').toLowerCase() === brand.toLowerCase());
      if (min !== undefined && min !== '')  products = products.filter(p => p.price >= parseFloat(min));
      if (max !== undefined && max !== '')  products = products.filter(p => p.price <= parseFloat(max));
      if (rating)                       products = products.filter(p => p.rating >= parseFloat(rating));
      const sortMap = {
        'price-low':  (a,b) => a.price - b.price,
        'price-high': (a,b) => b.price - a.price,
        'rating':     (a,b) => b.rating - a.rating,
        'newest':     (a,b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0),
        'discount':   (a,b) => b.discount - a.discount,
        'trending':   (a,b) => b.sold - a.sold,
        'featured':   (a,b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0),
      };
      if (sortMap[sort]) products.sort(sortMap[sort]);
    }

    const facets = {
      brands:     [...new Set(products.map(p => p.brand).filter(Boolean))].sort(),
      categories: [...new Set(products.map(p => p.category))].sort(),
      priceRange: { min: products.length ? Math.min(...products.map(p => p.price)) : 0, max: products.length ? Math.max(...products.map(p => p.price)) : 2000 },
      ratings:    [5, 4, 3, 2, 1].map(r => ({ rating: r, count: products.filter(p => Math.floor(p.rating) >= r).length }))
    };

    const totalResults = products.length;
    const pageNum      = Math.max(1, parseInt(page));
    const pageSize     = Math.min(50, Math.max(1, parseInt(limit)));
    const totalPages   = Math.ceil(totalResults / pageSize);
    const paged        = products.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    res.json({
      success: true,
      source,
      query: q,
      data: paged,
      facets,
      pagination: { page: pageNum, limit: pageSize, total: totalResults, totalPages }
    });
  });

  /* GET /api/search/autocomplete?q=...  — fast typeahead suggestions */
  router.get('/autocomplete', async (req, res) => {
    const { q = '' } = req.query;
    if (!q.trim()) return res.json({ success: true, data: [] });

    let products = [];
    let categories = [];
    let source = 'local';

    try {
      if (supabase) {
        const pattern = `%${q.trim()}%`;
        const { data: prods, error: pe } = await supabase.from('products').select('name,brand,category').or(`name.ilike.${pattern},brand.ilike.${pattern}`);
        if (!pe && prods) products = prods;
        const { data: cats, error: ce } = await supabase.from('categories').select('id,name,icon').ilike('name', `%${q.trim()}%`).limit(10);
        if (!ce && cats) categories = cats;
        source = 'supabase';
      }
    } catch (e) {
      source = 'local';
    }

    const suggestions = new Set();
    if (source === 'supabase') {
      products.forEach(p => {
        if (p.name && p.name.toLowerCase().includes(q.toLowerCase()))     suggestions.add(JSON.stringify({ type: 'product', text: p.name, id: p.id }));
        if (p.brand && p.brand.toLowerCase().includes(q.toLowerCase()))    suggestions.add(JSON.stringify({ type: 'brand',   text: p.brand, category: p.category }));
      });
      categories.forEach(c => {
        if (c.name && c.name.toLowerCase().includes(q.toLowerCase()))     suggestions.add(JSON.stringify({ type: 'category', text: c.name, id: c.id, icon: c.icon }));
      });
    } else {
      const db = readDB();
      const ql = q.toLowerCase();
      db.products.forEach(p => {
        if (p.name.toLowerCase().includes(ql))     suggestions.add(JSON.stringify({ type: 'product', text: p.name,     id: p.id }));
        if ((p.brand||'').toLowerCase().includes(ql)) suggestions.add(JSON.stringify({ type: 'brand',   text: p.brand,    category: p.category }));
        (p.tags || []).forEach(t => { if (t.includes(ql)) suggestions.add(JSON.stringify({ type: 'tag', text: t })); });
      });
      db.categories.forEach(c => {
        if (c.name.toLowerCase().includes(ql)) suggestions.add(JSON.stringify({ type: 'category', text: c.name, id: c.id, icon: c.icon }));
      });
    }

    res.json({ success: true, source, data: [...suggestions].map(s => JSON.parse(s)).slice(0, 10) });
  });

  /* GET /api/search/trending  — get trending search terms */
  router.get('/trending', (req, res) => {
    const trending = ['iPhone 15', 'MacBook', 'Nike shoes', 'Sony headphones', 'Yoga mat', 'Matcha tea', 'LEGO', 'Vitamin C serum'];
    res.json({ success: true, data: trending });
  });

  return router;
};
