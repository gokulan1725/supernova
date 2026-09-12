/* ============================================================
   supabase-sync.js
   Uploads local db.json data into your Supabase tables.

   Usage:
     node supabase-sync.js           — sync all
     node supabase-sync.js products  — sync only products
     node supabase-sync.js users     — sync only users
     node supabase-sync.js orders    — sync only orders

   Prerequisites:
     1. Run supabase-schema.sql in your Supabase SQL Editor first
     2. Fill in real SUPABASE_URL and SUPABASE_KEY (service_role) in .env
============================================================ */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_URL.startsWith('https://')) {
  console.error('❌ SUPABASE_URL is missing or invalid in .env');
  process.exit(1);
}
if (!SUPABASE_KEY || SUPABASE_KEY.includes('sb_publishable')) {
  console.error('❌ SUPABASE_KEY looks like a publishable key.');
  console.error('   Use the SERVICE ROLE key from:');
  console.error('   Supabase Dashboard → Project Settings → API → service_role key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

const target = process.argv[2]; // optional: "products", "users", "orders"

/* ── Helpers ─────────────────────────────────────────────── */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function upsertChunked(table, rows, chunkSize = 50) {
  if (!rows || rows.length === 0) { console.log(`  ⏭  ${table}: nothing to insert`); return; }
  let total = 0;
  for (const batch of chunk(rows, chunkSize)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (error) { console.error(`  ❌ ${table} batch error:`, error.message); return; }
    total += batch.length;
    process.stdout.write(`  ✅ ${table}: ${total}/${rows.length} rows synced\r`);
  }
  console.log(`  ✅ ${table}: ${total} rows synced           `);
}

/* ── Mappers (snake_case for Supabase) ───────────────────── */
function mapProduct(p) {
  return {
    id:             p.id,
    name:           p.name,
    category:       p.category,
    subcategory:    p.subcategory || null,
    brand:          p.brand || null,
    price:          p.price,
    original_price: p.originalPrice || p.original_price || p.price,
    discount:       p.discount || 0,
    rating:         p.rating || 0,
    review_count:   p.reviewCount || p.review_count || 0,
    stock:          p.stock || 0,
    sold:           p.sold || 0,
    image:          p.image || null,
    images:         p.images || [],
    badge:          p.badge || null,
    tags:           p.tags || [],
    description:    p.description || null,
    specs:          p.specs || {},
    colors:         p.colors || [],
    sizes:          p.sizes || [],
    free_shipping:  p.freeShipping || p.free_shipping || false,
    delivery_days:  p.deliveryDays || p.delivery_days || 5,
    warranty:       p.warranty || null,
    is_trending:    p.isTrending || p.is_trending || false,
    is_featured:    p.isFeatured || p.is_featured || false,
    is_new:         p.isNew || p.is_new || false,
    seller:         p.seller || null,
  };
}

function mapUser(u) {
  return {
    id:             u.id,
    name:           u.name,
    email:          u.email,
    password_hash:  u.passwordHash || u.password_hash || null,
    avatar:         u.avatar || u.name?.charAt(0) || 'U',
    join_date:      u.joinDate || u.join_date || new Date().toISOString().split('T')[0],
    tier:           u.tier || 'Bronze',
    orders:         u.orders || 0,
    total_spent:    u.totalSpent || u.total_spent || 0,
    is_admin:       u.isAdmin || u.is_admin || false,
    is_seller:      u.isSeller || u.is_seller || false,
    loyalty_points: u.loyaltyPoints || u.loyalty_points || 0,
    phone:          u.phone || null,
    addresses:      u.addresses || [],
  };
}

function mapOrder(o) {
  return {
    id:             o.id,
    user_id:        o.userId || o.user_id || null,
    date:           o.date || new Date().toISOString().split('T')[0],
    status:         o.status || 'processing',
    items:          o.items || [],
    total:          o.total || 0,
    shipping:       o.shipping || 0,
    discount:       o.discount || 0,
    address:        o.address || null,
    payment_method: o.paymentMethod || o.payment_method || 'card',
    payment_intent: o.paymentIntent || o.payment_intent || null,
    coupon_code:    o.couponCode || o.coupon_code || null,
    tracking_number: o.trackingNumber || o.tracking_number || null,
    carrier:        o.carrier || null,
  };
}

/* ── Sync functions ──────────────────────────────────────── */
async function syncCategories() {
  console.log('\n📁 Syncing categories...');
  const rows = (db.categories || []).map(c => ({
    id: c.id, name: c.name, icon: c.icon || null, color: c.color || null, count: c.count || 0
  }));
  await upsertChunked('categories', rows);
}

async function syncProducts() {
  console.log('\n📦 Syncing products...');
  const rows = (db.products || []).map(mapProduct);
  await upsertChunked('products', rows);

  // Sync reviews
  const allReviews = [];
  const reviewsMap = db.reviews || {};
  for (const [productId, revs] of Object.entries(reviewsMap)) {
    for (const r of revs) {
      allReviews.push({
        id:         r.id,
        product_id: parseInt(productId),
        user_id:    r.userId || null,
        user_name:  r.user || r.userName || 'Anonymous',
        avatar:     r.avatar || null,
        rating:     r.rating,
        title:      r.title || null,
        text:       r.text || null,
        verified:   r.verified || false,
        helpful:    r.helpful || 0,
        unhelpful:  r.unhelpful || 0,
      });
    }
  }
  if (allReviews.length > 0) {
    console.log('\n⭐ Syncing reviews...');
    await upsertChunked('reviews', allReviews);
  }
}

async function syncUsers() {
  console.log('\n👤 Syncing users...');
  const rows = (db.users || []).map(mapUser);
  await upsertChunked('users', rows);
}

async function syncOrders() {
  console.log('\n🛒 Syncing orders...');
  const rows = (db.orders || []).map(mapOrder);
  await upsertChunked('orders', rows);
}

async function syncBanners() {
  console.log('\n🎨 Syncing banners...');
  const rows = (db.banners || []).map(b => ({
    id:           b.id,
    title:        b.title,
    subtitle:     b.subtitle || null,
    cta:          b.cta || null,
    cta_link:     b.ctaLink || b.cta_link || null,
    badge:        b.badge || null,
    accent_color: b.accentColor || b.accent_color || '#6C63FF',
    product_id:   b.productId || b.product_id || null,
    is_active:    true,
    sort_order:   b.id || 0,
  }));
  await upsertChunked('banners', rows);
}

async function syncNotifications() {
  console.log('\n🔔 Syncing notifications...');
  const rows = (db.notifications || []).map(n => ({
    id:      n.id,
    user_id: n.userId || null,
    type:    n.type || 'system',
    icon:    n.icon || null,
    title:   n.title,
    message: n.message || null,
    read:    n.read || false,
  }));
  await upsertChunked('notifications', rows);
}

/* ── Main ────────────────────────────────────────────────── */
async function main() {
  console.log('');
  console.log('🛍️  ShopNova — Supabase Sync Tool');
  console.log('══════════════════════════════════');
  console.log('URL:', SUPABASE_URL);
  console.log('Target:', target || 'all');
  console.log('');

  const start = Date.now();

  try {
    if (!target || target === 'categories') await syncCategories();
    if (!target || target === 'products')   await syncProducts();
    if (!target || target === 'users')      await syncUsers();
    if (!target || target === 'orders')     await syncOrders();
    if (!target || target === 'banners')    await syncBanners();
    if (!target || target === 'notifications') await syncNotifications();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('');
    console.log(`✅ Sync complete in ${elapsed}s`);
    console.log('');
  } catch (err) {
    console.error('\n❌ Fatal sync error:', err.message);
    process.exit(1);
  }
}

main();
