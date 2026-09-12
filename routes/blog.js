/* ============================================================
   routes/blog.js  — Blog & Shopping Guides API
   ============================================================
   GET  /api/blog                    List all blog posts
   GET  /api/blog/:slug              Single blog post by slug
   POST /api/blog            (admin) Create post
   PUT  /api/blog/:id        (admin) Update post
   DELETE /api/blog/:id      (admin) Delete post
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

const SEED_POSTS = [
  {
    id: 'b1',
    slug: 'top-wireless-headphones-2025',
    title: '🎧 Top 5 Wireless Headphones of 2025: Ultimate Buying Guide',
    excerpt: 'Looking for noise cancellation, audiophile sound, or all-day comfort? Here is our comprehensive comparison of the best wireless headphones.',
    category: 'electronics',
    author: 'Alex Rivera',
    authorRole: 'Audio Specialist',
    readTime: '6 min read',
    date: '2025-02-15',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=450&fit=crop',
    content: `
      <h2>Finding the Perfect Wireless Pair</h2>
      <p>Wireless headphones have evolved tremendously over the past two years. With active noise cancellation (ANC), multipoint Bluetooth, and spatial audio becoming standard, picking the right pair comes down to your primary use case.</p>
      
      <h3>1. Sony WH-1000XM5 — Best Overall</h3>
      <p>The Sony WH-1000XM5 remains the reigning king of noise cancellation and audio balance. With two processors controlling 8 microphones, it silences plane engines and office chatter with ease.</p>
      
      <h3>2. Apple AirPods Max — Best for Apple Ecosystem</h3>
      <p>If you switch seamlessly between iPhone, iPad, and Mac, the computational audio and Spatial Audio head tracking of AirPods Max are hard to beat.</p>

      <h3>Key Features to Consider</h3>
      <ul>
        <li><strong>Battery Life:</strong> Look for at least 30 hours with ANC enabled.</li>
        <li><strong>Codec Support:</strong> LDAC and AAC ensure high-bitrate streaming.</li>
        <li><strong>Comfort:</strong> Memory foam earcups and lightweight headband design.</li>
      </ul>
    `,
    tags: ['audio', 'headphones', 'sony', 'buying-guide'],
    relatedProductIds: [1, 10, 16]
  },
  {
    id: 'b2',
    slug: 'essential-skincare-routine-guide',
    title: '✨ The Minimalist 4-Step Skincare Routine That Actually Works',
    excerpt: 'Ditch the 10-step confusion. Dermatologists reveal the core 4 steps every skincare routine needs for clear, glowing skin.',
    category: 'beauty',
    author: 'Dr. Sarah Chen',
    authorRole: 'Dermatology Advisor',
    readTime: '4 min read',
    date: '2025-02-10',
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&h=450&fit=crop',
    content: `
      <h2>Simplicity is Key</h2>
      <p>More products do not mean better skin. In fact, overloading active ingredients can compromise your skin barrier. Stick to these four evidence-backed steps.</p>

      <h3>Step 1: Gentle Cleansing</h3>
      <p>Cleanse morning and night with a pH-balanced cleanser to remove excess oil and environmental pollutants without stripping natural moisture.</p>

      <h3>Step 2: Vitamin C & Antioxidant Serum</h3>
      <p>Apply Vitamin C in the morning to neutralize free radicals from UV exposure and pollution while brightening dark spots.</p>

      <h3>Step 3: Hydrating Moisturizer</h3>
      <p>Lock in hydration with hyaluronic acid or ceramides to maintain barrier health.</p>

      <h3>Step 4: Broad-Spectrum SPF 50</h3>
      <p>The single most important anti-aging product is daily sunscreen.</p>
    `,
    tags: ['skincare', 'beauty', 'vitamin-c', 'glow'],
    relatedProductIds: [11, 31, 33]
  },
  {
    id: 'b3',
    slug: 'build-ultimate-home-gym-budget',
    title: '🏋️ How to Build a Complete Home Gym Under $500',
    excerpt: 'No space or budget for bulky equipment? Discover compact, versatile gear that delivers full-body workouts in any room.',
    category: 'sports',
    author: 'Marcus Vance',
    authorRole: 'Fitness Coach',
    readTime: '5 min read',
    date: '2025-02-01',
    image: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=800&h=450&fit=crop',
    content: `
      <h2>Smart Fitness Investment</h2>
      <p>Creating a home gym doesn't require thousands of dollars or a dedicated garage. Focus on versatile equipment that replaces multiple machines.</p>
      
      <h3>1. Adjustable Dumbbells</h3>
      <p>Pairing adjustable dumbbells (like Bowflex SelectTech) replaces 15 sets of weights while occupying less than 2 square feet of floor space.</p>

      <h3>2. Non-Slip Premium Yoga & Exercise Mat</h3>
      <p>A 6mm dense rubber mat protects your joints during floor exercises, stretching, and HIIT workouts.</p>
    `,
    tags: ['fitness', 'home-gym', 'dumbbells', 'sports'],
    relatedProductIds: [28, 15, 10]
  }
];

module.exports = function(authenticate, requireAdmin, readDB, writeDB) {

  function ensureBlog(db) {
    if (!db.blogPosts) { db.blogPosts = SEED_POSTS; writeDB(db); }
  }

  /* ── Get All Blog Posts ────────────────────────────────── */
  router.get('/', (req, res) => {
    const db = readDB();
    ensureBlog(db);
    const { cat, tag } = req.query;
    let posts = [...db.blogPosts];

    if (cat) posts = posts.filter(p => p.category === cat);
    if (tag) posts = posts.filter(p => (p.tags || []).includes(tag));

    res.json({ success: true, data: posts, total: posts.length });
  });

  /* ── Get Post by Slug ─────────────────────────────────── */
  router.get('/:slug', (req, res) => {
    const db   = readDB();
    ensureBlog(db);
    const post = db.blogPosts.find(p => p.slug === req.params.slug || p.id === req.params.slug);

    if (!post) return res.status(404).json({ success: false, error: 'Article not found' });

    // Enrich related products
    const relatedProducts = (post.relatedProductIds || [])
      .map(id => db.products.find(pr => pr.id === id))
      .filter(Boolean);

    res.json({ success: true, data: { ...post, relatedProducts } });
  });

  /* ── Admin: Create Post ────────────────────────────────── */
  router.post('/', requireAdmin, (req, res) => {
    const { title, excerpt, content, category, image, tags, relatedProductIds } = req.body;
    if (!title || !content) return res.status(400).json({ success: false, error: 'Title and content required' });

    const db   = readDB();
    ensureBlog(db);

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const newPost = {
      id:        'b' + Date.now(),
      slug,
      title,
      excerpt:   excerpt || title,
      category:  category || 'general',
      author:    'ShopNova Editor',
      authorRole:'Editorial Team',
      readTime:  '5 min read',
      date:      new Date().toISOString().split('T')[0],
      image:     image || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&h=450&fit=crop',
      content,
      tags:      tags || [],
      relatedProductIds: relatedProductIds || []
    };

    db.blogPosts.unshift(newPost);
    writeDB(db);
    res.status(201).json({ success: true, data: newPost });
  });

  return router;
};
