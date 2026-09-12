/* ============================================================
   ShopNova — server.js
   Node.js / Express Backend  (v3 — Modular Routes)
   ============================================================ */

'use strict';

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const morgan   = require('morgan');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const mailer = require('./utils/mailer');


const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET     = process.env.JWT_SECRET     || 'shopnova_dev_secret_change_in_prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gfxtakyqkzquhbbneera.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_U147IqjY8VsRO-rQe_3vsg_vATt9M0_';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── Middleware ──────────────────────────────────────────── */
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname)));           // Serves all HTML/CSS/JS
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded files

/* ── JWT helpers ─────────────────────────────────────────── */
function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/* ── Auth Middleware ─────────────────────────────────────── */
function authenticate(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  req.userId = payload.sub;
  next();
}

function requireAdmin(req, res, next) {
  authenticate(req, res, async () => {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.userId).maybeSingle();
    if (!user || !user.is_admin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
  });
}

/* ── Initial seed data ───────────────────────────────────── */
const INITIAL_DATA = {
  categories: [
    { id: 'electronics', name: 'Electronics',     icon: '💻', color: '#6C63FF', count: 1420 },
    { id: 'fashion',     name: 'Fashion',          icon: '👗', color: '#EC4899', count: 3250 },
    { id: 'home',        name: 'Home & Living',    icon: '🛋️', color: '#F59E0B', count: 890  },
    { id: 'sports',      name: 'Sports & Fitness', icon: '⚽', color: '#43E97B', count: 640  },
    { id: 'beauty',      name: 'Beauty & Care',    icon: '💄', color: '#F472B6', count: 1100 },
    { id: 'books',       name: 'Books',            icon: '📚', color: '#60A5FA', count: 5200 },
    { id: 'toys',        name: 'Toys & Games',     icon: '🎮', color: '#A78BFA', count: 760  },
    { id: 'automotive',  name: 'Automotive',       icon: '🚗', color: '#34D399', count: 420  },
    { id: 'grocery',     name: 'Grocery',          icon: '🛒', color: '#FBBF24', count: 980  },
    { id: 'jewelry',     name: 'Jewelry',          icon: '💍', color: '#FCD34D', count: 310  },
  ],

  products: [
    { id: 1,  name: 'Sony WH-1000XM5 Wireless Headphones', category: 'electronics', subcategory: 'Audio',       brand: 'Sony', price: 29990, originalPrice: 34990, discount: 14, rating: 4.8, reviewCount: 12420, stock: 45,   sold: 8920,   image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop','https://images.unsplash.com/photo-1484704849700-f032a568e944?w=600&h=600&fit=crop'],  badge: 'bestseller', tags: ['wireless','noise-cancelling','premium'], description: 'Industry-leading noise canceling with 30-hour battery life.', specs: { 'Driver Size': '30mm', 'Battery Life': '30 hours', 'Connectivity': 'Bluetooth 5.2', 'Weight': '250g' }, colors: ['#1A1A1A','#C0C0C0','#1B3A6B'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: false },
    { id: 2,  name: 'Apple MacBook Air M3 13-inch',          category: 'electronics', subcategory: 'Laptops',     brand: 'Apple', price: 99900, originalPrice: 114900, discount: 13, rating: 4.9, reviewCount: 8730,  stock: 12,   sold: 15400,  image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&h=600&fit=crop'],                                                                                         badge: 'new',        tags: ['laptop','apple','m3-chip'], description: 'Supercharged by the M3 chip. Outrageously thin, seriously powerful.', specs: { 'Processor': 'Apple M3', 'RAM': '8GB / 16GB', 'Storage': '256GB – 2TB SSD', 'Display': '13.6" Liquid Retina', 'Battery': '18 hours', 'Weight': '1.24 kg' }, colors: ['#E8D5B7','#C0C0C0','#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: true },
    { id: 3,  name: 'Nike Air Max 270 React',                 category: 'fashion',     subcategory: 'Sneakers',    brand: 'Nike', price: 9995, originalPrice: 12995, discount: 23, rating: 4.6, reviewCount: 5640,  stock: 234,  sold: 45600,  image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',   images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop'],                                                                                         badge: 'sale',       tags: ['running','sneakers','sports'], description: 'Nike Air Max 270 React combines two great technologies.',               specs: { 'Upper': 'Mesh & Synthetic', 'Sole': 'React foam + Air Max' }, colors: ['#1A1A1A','#FFFFFF','#FF6B35'], sizes: ['6','7','8','9','10','11','12'], freeShipping: true, deliveryDays: 3, warranty: '6 Months', isTrending: true, isFeatured: true, isNew: false },
    { id: 4,  name: 'Samsung 65" 4K QLED Smart TV',           category: 'electronics', subcategory: 'TVs',         brand: 'Samsung', price: 69990, originalPrice: 99990, discount: 30, rating: 4.7, reviewCount: 3280,  stock: 8,    sold: 6740,   image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829e1?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1593359677879-a4bb92f829e1?w=600&h=600&fit=crop'],                                                                                         badge: 'sale',       tags: ['4k','smart-tv','qled'], description: 'Neo QLED 4K Smart TV with AI-Powered 4K Pro Processor.',               specs: { 'Display': '65" Neo QLED', 'Resolution': '4K 3840x2160', 'HDR': 'HDR10+', 'Refresh Rate': '120Hz' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 5, warranty: '2 Years', isTrending: false, isFeatured: true, isNew: false },
    { id: 5,  name: 'Dyson V15 Detect Absolute Vacuum',       category: 'home',        subcategory: 'Appliances',  brand: 'Dyson', price: 49900, originalPrice: 59900, discount: 17, rating: 4.7, reviewCount: 2140,  stock: 31,   sold: 3200,   image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',   images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop'],                                                                                         badge: 'new',        tags: ['vacuum','cordless','dyson'], description: 'The Dyson V15 Detect scientifically proves a deep clean.',              specs: { 'Suction': '230 AW', 'Run Time': '60 min', 'Filtration': 'HEPA' }, colors: ['#FFD700','#C0C0C0'], freeShipping: true, deliveryDays: 4, warranty: '2 Years', isTrending: true, isFeatured: true, isNew: true },
    { id: 6,  name: "Levi's 511 Slim Fit Jeans",              category: 'fashion',     subcategory: 'Jeans',       brand: "Levi's", price: 2499, originalPrice: 3299, discount: 24, rating: 4.5, reviewCount: 18920, stock: 876,  sold: 124000, image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop',   images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&h=600&fit=crop'],                                                                                         badge: 'bestseller', tags: ['jeans','denim','casual'], description: "The iconic Levi's 511 Slim Fit jeans.",                                  specs: { 'Fit': 'Slim', 'Material': '98% Cotton, 2% Elastane' }, colors: ['#1A2744','#696969','#1A1A1A'], sizes: ['28x30','30x32','32x32','34x32'], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: false, isFeatured: false, isNew: false },
    { id: 7,  name: 'Instant Pot Duo 7-in-1 Pressure Cooker', category: 'home',        subcategory: 'Kitchen',     brand: 'Instant Pot', price: 5999, originalPrice: 8999, discount: 33, rating: 4.8, reviewCount: 32100, stock: 540,  sold: 89000,  image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1585515320310-259814833e62?w=600&h=600&fit=crop'],                                                                                         badge: 'bestseller', tags: ['kitchen','pressure-cooker'], description: '7-in-1 multi-use appliance.',                                               specs: { 'Capacity': '6 Quart', 'Programs': '13 one-touch', 'Wattage': '1000W' }, colors: ['#C0C0C0'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: false, isFeatured: false, isNew: false },
    { id: 8,  name: 'Apple iPhone 15 Pro Max',                 category: 'electronics', subcategory: 'Smartphones', brand: 'Apple', price: 134900, originalPrice: 159900, discount: 16,  rating: 4.9, reviewCount: 24780, stock: 56,   sold: 48200,  image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&h=600&fit=crop'],                                                                                         badge: 'trending',   tags: ['smartphone','iphone','5g','pro'], description: 'Forged in titanium, featuring the A17 Pro chip.',                       specs: { 'Chip': 'Apple A17 Pro', 'Display': '6.7" Super Retina XDR', 'Camera': '48MP + 12MP + 12MP', 'Battery': '29h video' }, colors: ['#3D3D3D','#F5F0E8','#4A5D3D'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: true },
    { id: 9,  name: 'Organic Matcha Green Tea Powder',         category: 'grocery',     subcategory: 'Beverages',   brand: 'Jade Leaf', price: 1499, originalPrice: 2199, discount: 32, rating: 4.7, reviewCount: 8910,  stock: 1200, sold: 34000,  image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop',   images: ['https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop'],                                                                                         badge: 'new',        tags: ['organic','matcha','tea','health'], description: 'USDA certified organic matcha green tea powder.',                       specs: { 'Grade': 'Ceremonial', 'Origin': 'Uji, Japan', 'Net Weight': '100g' }, colors: [], freeShipping: false, deliveryDays: 4, warranty: 'N/A', isTrending: false, isFeatured: false, isNew: true },
    { id: 10, name: 'Fitbit Charge 6 Fitness Tracker',         category: 'sports',      subcategory: 'Wearables',   brand: 'Fitbit', price: 12999, originalPrice: 14999, discount: 13, rating: 4.5, reviewCount: 6720,  stock: 189,  sold: 22400,  image: 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=600&h=600&fit=crop'],                                                                                         badge: null,         tags: ['fitness','tracker','wearable'], description: 'Advanced fitness tracker with built-in GPS.',                              specs: { 'Display': '1.04" AMOLED', 'Battery': '7 days', 'Water Resistance': '50m', 'GPS': 'Built-in' }, colors: ['#1A1A1A','#4776E6','#EC4899'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: false, isFeatured: false, isNew: false },
    { id: 11, name: 'Vitamin C + E Facial Serum',              category: 'beauty',      subcategory: 'Skincare',    brand: 'TruSkin', price: 899, originalPrice: 1299, discount: 31, rating: 4.6, reviewCount: 45320, stock: 3400, sold: 320000, image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&h=600&fit=crop'],                                                                                         badge: 'bestseller', tags: ['serum','vitamin-c','skincare'], description: 'Brighten skin and reduce dark spots.',                                  specs: { 'Key Ingredients': 'Vitamin C, E, Hyaluronic Acid', 'Volume': '30ml' }, colors: [], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: true, isFeatured: false, isNew: false },
    { id: 12, name: 'LEGO Technic Ferrari Daytona SP3',        category: 'toys',        subcategory: 'Building Sets',brand: 'LEGO', price: 29999, originalPrice: 34999, discount: 14, rating: 4.9, reviewCount: 3280,  stock: 67,   sold: 12400,  image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&h=600&fit=crop'],                                                                                         badge: 'trending',   tags: ['lego','technic','ferrari','collector'], description: 'Build the legendary Ferrari Daytona SP3 with 3778 pieces.',              specs: { 'Pieces': '3778', 'Age': '18+', 'Scale': '1:8' }, colors: ['#D40000'], freeShipping: true, deliveryDays: 4, warranty: 'N/A', isTrending: true, isFeatured: true, isNew: false },
    { id: 13, name: 'Atomic Habits by James Clear',            category: 'books',       subcategory: 'Self-Help',   brand: 'Avery', price: 499, originalPrice: 799, discount: 38, rating: 4.9, reviewCount: 89430, stock: 5000, sold: 1200000,image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=400&fit=crop',   images: ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&h=600&fit=crop'],                                                                                         badge: 'bestseller', tags: ['book','self-help','habits','productivity'], description: "No.1 bestselling guide to building good habits.",                     specs: { 'Format': 'Hardcover / Paperback', 'Pages': '320', 'Language': 'English' }, colors: [], freeShipping: true, deliveryDays: 2, warranty: 'N/A', isTrending: true, isFeatured: false, isNew: false },
    { id: 14, name: 'Weber Genesis E-325s Gas Grill',          category: 'home',        subcategory: 'Outdoor',     brand: 'Weber', price: 69900, originalPrice: 84900, discount: 18, rating: 4.7, reviewCount: 4120,  stock: 23,   sold: 8900,   image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',   images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=600&fit=crop'],                                                                                         badge: null,         tags: ['grill','bbq','outdoor'], description: 'Three stainless steel burners with enclosed cart design.',                 specs: { 'Burners': '3 stainless steel', 'BTU': '39,000', 'Fuel': 'Propane / Natural Gas' }, colors: ['#1A1A1A'], freeShipping: false, deliveryDays: 7, warranty: '10 Years', isTrending: false, isFeatured: false, isNew: false },
    { id: 15, name: 'Yoga Mat Premium Non-Slip 6mm',           category: 'sports',      subcategory: 'Yoga',        brand: 'Manduka', price: 1999, originalPrice: 2999, discount: 33, rating: 4.8, reviewCount: 12780, stock: 432,  sold: 68000,  image: 'https://images.unsplash.com/photo-1601925228017-99f4d0c2b57b?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1601925228017-99f4d0c2b57b?w=600&h=600&fit=crop'],                                                                                         badge: null,         tags: ['yoga','mat','fitness'], description: 'Professional-grade yoga mat with superior cushioning.',                    specs: { 'Thickness': '6mm', 'Material': 'Natural rubber + microfiber', 'Dimensions': '71" x 24"' }, colors: ['#1A1A1A','#4776E6','#EC4899','#43E97B'], freeShipping: true, deliveryDays: 3, warranty: 'Lifetime', isTrending: false, isFeatured: false, isNew: false },
    { id: 16, name: 'Dell XPS 15 9530 Laptop',                 category: 'electronics', subcategory: 'Laptops',     brand: 'Dell', price: 144900, originalPrice: 179900, discount: 19, rating: 4.6, reviewCount: 3840,  stock: 28,   sold: 12300,  image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&h=600&fit=crop'],                                                                                         badge: 'sale',       tags: ['laptop','dell','xps','workstation'], description: 'Ultra-thin laptop with 15.6" OLED display.',                               specs: { 'Processor': 'Intel Core i7-13700H', 'RAM': '16GB DDR5', 'Storage': '512GB NVMe SSD', 'Display': '15.6" OLED 3.5K', 'GPU': 'NVIDIA RTX 4060' }, colors: ['#C0C0C0'], freeShipping: true, deliveryDays: 3, warranty: '2 Years', isTrending: false, isFeatured: false, isNew: false },
    { id: 17, name: 'Sony PlayStation 5 Slim Console',          category: 'electronics', subcategory: 'Gaming',      brand: 'Sony', price: 44990, originalPrice: 54990, discount: 18,  rating: 4.9, reviewCount: 15400, stock: 120, sold: 84000,  image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['gaming','playstation','ps5'], description: 'Ultra-high speed SSD and 3D Audio.', specs: { 'Storage': '1TB SSD' }, colors: ['#FFFFFF'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: true },
    { id: 18, name: 'Canon EOS R6 Mark II Camera',               category: 'electronics', subcategory: 'Cameras',     brand: 'Canon', price: 215990, originalPrice: 243990, discount: 11, rating: 4.8, reviewCount: 1920,  stock: 14,  sold: 5200,   image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&h=600&fit=crop'], badge: 'new', tags: ['camera','canon','mirrorless'], description: 'Full-frame 24.2 MP mirrorless camera.', specs: { 'Sensor': '24.2MP' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '2 Years', isTrending: true, isFeatured: true, isNew: true },
    { id: 19, name: 'Apple iPad Air M2 11-inch',               category: 'electronics', subcategory: 'Tablets',     brand: 'Apple', price: 54900, originalPrice: 59900, discount: 8,  rating: 4.9, reviewCount: 6320,  stock: 45,  sold: 32100,  image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&h=600&fit=crop'], badge: 'trending', tags: ['ipad','apple','tablet'], description: 'Liquid Retina display powered by M2 chip.', specs: { 'Chip': 'Apple M2' }, colors: ['#C0C0C0'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: true, isFeatured: false, isNew: true },
    { id: 20, name: 'Adidas Originals Trefoil Hoodie',          category: 'fashion',     subcategory: 'Hoodies',     brand: 'Adidas', price: 3499, originalPrice: 4499, discount: 22, rating: 4.7, reviewCount: 8900,  stock: 340, sold: 42000,  image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['hoodie','adidas','fleece'], description: 'Cozy French terry fleece hoodie.', specs: { 'Material': '100% Cotton' }, colors: ['#1A1A1A'], sizes: ['S','M','L','XL'], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: true, isFeatured: false, isNew: false },
    { id: 21, name: 'Ray-Ban Classic Wayfarer Sunglasses',      category: 'fashion',     subcategory: 'Eyewear',     brand: 'Ray-Ban', price: 9490, originalPrice: 12490, discount: 24, rating: 4.8, reviewCount: 14200, stock: 150, sold: 95000,  image: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['sunglasses','ray-ban'], description: 'Iconic sunglasses with 100% UV protection.', specs: { 'UV': '100%' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '2 Years', isTrending: true, isFeatured: true, isNew: false },
    { id: 22, name: 'Michael Kors Jet Set Tote Handbag',       category: 'fashion',     subcategory: 'Handbags',    brand: 'Michael Kors', price: 14995, originalPrice: 21995, discount: 32, rating: 4.6, reviewCount: 4520,  stock: 88,  sold: 21000,  image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&h=600&fit=crop'], badge: 'sale', tags: ['handbag','leather'], description: 'Saffiano leather tote with top zip.', specs: { 'Material': 'Leather' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: false, isFeatured: true, isNew: false },
    { id: 23, name: 'Fossil Gen 6 Touchscreen Smartwatch',      category: 'fashion',     subcategory: 'Watches',     brand: 'Fossil', price: 11995, originalPrice: 18995, discount: 37, rating: 4.4, reviewCount: 3120,  stock: 65,  sold: 14000,  image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop'], badge: 'sale', tags: ['smartwatch','fossil'], description: 'Powered with Wear OS by Google.', specs: { 'OS': 'Wear OS' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '2 Years', isTrending: false, isFeatured: false, isNew: false },
    { id: 24, name: 'Zara Linen Blend Slim Fit Shirt',          category: 'fashion',     subcategory: 'Shirts',      brand: 'Zara', price: 2490, originalPrice: 3290, discount: 24, rating: 4.5, reviewCount: 2890,  stock: 410, sold: 18500,  image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&h=600&fit=crop'], badge: null, tags: ['shirt','linen'], description: 'Lightweight linen blend shirt.', specs: { 'Material': 'Linen' }, colors: ['#FFFFFF'], sizes: ['S','M','L','XL'], freeShipping: false, deliveryDays: 4, warranty: 'N/A', isTrending: true, isFeatured: false, isNew: true },
    { id: 25, name: 'Philips Hue Smart LED Starter Kit',        category: 'home',        subcategory: 'Lighting',    brand: 'Philips', price: 9999, originalPrice: 12999, discount: 23, rating: 4.7, reviewCount: 7800,  stock: 95,  sold: 38000,  image: 'https://images.unsplash.com/photo-1550985616-10810253b84d?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1550985616-10810253b84d?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['smart-home','lighting'], description: '16 million colors smart LED bulbs.', specs: { 'Bulb': 'A19 E26' }, colors: ['#FFFFFF'], freeShipping: true, deliveryDays: 3, warranty: '3 Years', isTrending: true, isFeatured: true, isNew: false },
    { id: 26, name: 'Nespresso Vertuo Next Coffee Maker',        category: 'home',        subcategory: 'Kitchen',     brand: 'Nespresso', price: 12990, originalPrice: 16990, discount: 24, rating: 4.6, reviewCount: 11400, stock: 110, sold: 67000,  image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&h=600&fit=crop'], badge: 'sale', tags: ['coffee','espresso'], description: 'Brews coffee and espresso with Centrifusion.', specs: { 'Tank': '37 oz' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: false, isFeatured: true, isNew: false },
    { id: 27, name: 'Herman Miller Aeron Ergonomic Chair',       category: 'home',        subcategory: 'Furniture',   brand: 'Herman Miller', price: 99990, originalPrice: 125000, discount: 20, rating: 4.9, reviewCount: 5600,  stock: 18,  sold: 24000,  image: 'https://images.unsplash.com/photo-1580481072645-022f9a6d8310?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1580481072645-022f9a6d8310?w=600&h=600&fit=crop'], badge: 'premium', tags: ['chair','office','ergonomic'], description: 'Gold standard ergonomic office seating.', specs: { 'Frame': 'Graphite' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 5, warranty: '12 Years', isTrending: true, isFeatured: true, isNew: false },
    { id: 28, name: 'Bowflex SelectTech 552 Dumbbells',         category: 'sports',      subcategory: 'Gym',         brand: 'Bowflex', price: 34999, originalPrice: 42999, discount: 19, rating: 4.8, reviewCount: 9820,  stock: 42,  sold: 45000,  image: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['dumbbells','weights'], description: 'Adjusts from 5 to 52.5 lbs.', specs: { 'Range': '5-52.5 lbs' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 4, warranty: '2 Years', isTrending: true, isFeatured: true, isNew: false },
    { id: 29, name: 'Garmin Forerunner 965 GPS Watch',          category: 'sports',      subcategory: 'Wearables',   brand: 'Garmin', price: 49999, originalPrice: 54999, discount: 9,  rating: 4.9, reviewCount: 3410,  stock: 38,  sold: 16200,  image: 'https://images.unsplash.com/photo-1510017803434-a899398421b3?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1510017803434-a899398421b3?w=600&h=600&fit=crop'], badge: 'new', tags: ['garmin','running','gps'], description: 'Vibrant AMOLED GPS running smartwatch.', specs: { 'Display': '1.4" AMOLED' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: true, isFeatured: false, isNew: true },
    { id: 30, name: 'Spalding TF-1000 Legacy Basketball',        category: 'sports',      subcategory: 'Equipment',   brand: 'Spalding', price: 3499, originalPrice: 4499, discount: 22, rating: 4.7, reviewCount: 4120,  stock: 190, sold: 28000,  image: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1519861531473-9200262188bf?w=600&h=600&fit=crop'], badge: null, tags: ['basketball','sports'], description: 'Exclusive ZK microfiber leather basketball.', specs: { 'Size': 'Official Size 7' }, colors: ['#FF6B35'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: false, isFeatured: false, isNew: false },
    { id: 31, name: 'Olaplex No. 3 Hair Perfector',              category: 'beauty',      subcategory: 'Haircare',    brand: 'Olaplex', price: 2450, originalPrice: 2950, discount: 17, rating: 4.8, reviewCount: 38900, stock: 850, sold: 290000, image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['haircare','repair'], description: 'At-home bond building treatment.', specs: { 'Volume': '100ml' }, colors: [], freeShipping: true, deliveryDays: 2, warranty: 'N/A', isTrending: true, isFeatured: true, isNew: false },
    { id: 32, name: 'Dior Sauvage Eau de Parfum 100ml',         category: 'beauty',      subcategory: 'Fragrance',   brand: 'Dior', price: 11500, originalPrice: 13500, discount: 15, rating: 4.9, reviewCount: 21500, stock: 120, sold: 140000, image: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['perfume','fragrance'], description: 'Radically fresh citrus and woody trail.', specs: { 'Volume': '100ml' }, colors: [], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: true, isFeatured: true, isNew: false },
    { id: 33, name: 'Laneige Lip Sleeping Mask Berry',          category: 'beauty',      subcategory: 'Skincare',    brand: 'Laneige', price: 1450, originalPrice: 1750, discount: 17, rating: 4.8, reviewCount: 52100, stock: 1200,sold: 380000, image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['lip-mask','skincare'], description: 'Overnight lip mask with Berry Mix.', specs: { 'Volume': '20g' }, colors: [], freeShipping: true, deliveryDays: 2, warranty: 'N/A', isTrending: true, isFeatured: false, isNew: false },
    { id: 34, name: 'Dyson Airwrap Multi-Styler',                category: 'beauty',      subcategory: 'Haircare',    brand: 'Dyson', price: 45900, originalPrice: 49900, discount: 8, rating: 4.7, reviewCount: 8910,  stock: 25,  sold: 41000,  image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&h=600&fit=crop'], badge: 'new', tags: ['dyson','airwrap'], description: 'Curl and style with Coanda airflow.', specs: { 'Airflow': '13.5 l/s' }, colors: ['#EC4899'], freeShipping: true, deliveryDays: 3, warranty: '2 Years', isTrending: true, isFeatured: true, isNew: true },
    { id: 35, name: 'The Psychology of Money',                  category: 'books',       subcategory: 'Finance',     brand: 'Harriman', price: 399, originalPrice: 499, discount: 20, rating: 4.9, reviewCount: 42100, stock: 3200,sold: 680000, image: 'https://images.unsplash.com/photo-1592496001020-d31bd816657f?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1592496001020-d31bd816657f?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['book','finance'], description: 'Timeless lessons on wealth and greed.', specs: { 'Pages': '256' }, colors: [], freeShipping: true, deliveryDays: 2, warranty: 'N/A', isTrending: true, isFeatured: true, isNew: false },
    { id: 36, name: 'Clean Code by Robert C. Martin',           category: 'books',       subcategory: 'Technology',  brand: 'Prentice', price: 1999, originalPrice: 2499, discount: 20, rating: 4.7, reviewCount: 12400, stock: 890, sold: 150000, image: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1532012197267-da84d127e765?w=600&h=600&fit=crop'], badge: null, tags: ['book','tech','coding'], description: 'Master principles of clean code.', specs: { 'Pages': '464' }, colors: [], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: false, isFeatured: false, isNew: false },
    { id: 37, name: 'Dune Deluxe Hardcover Edition',             category: 'books',       subcategory: 'Sci-Fi',      brand: 'Penguin', price: 1499, originalPrice: 1999, discount: 25, rating: 4.9, reviewCount: 19800, stock: 1100,sold: 240000, image: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&h=600&fit=crop'], badge: 'trending', tags: ['book','sci-fi','dune'], description: 'Frank Herbert sci-fi masterpiece.', specs: { 'Pages': '688' }, colors: [], freeShipping: true, deliveryDays: 2, warranty: 'N/A', isTrending: true, isFeatured: false, isNew: false },
    { id: 38, name: 'Catan Strategy Board Game',                category: 'toys',        subcategory: 'Board Games', brand: 'Catan', price: 2999, originalPrice: 3999, discount: 25, rating: 4.8, reviewCount: 28400, stock: 430, sold: 210000, image: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['board-game','catan'], description: 'Iconic strategy board game.', specs: { 'Players': '3-4' }, colors: [], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: true, isFeatured: true, isNew: false },
    { id: 39, name: 'DJI Mini 3 Lightweight Drone',             category: 'toys',        subcategory: 'RC Toys',     brand: 'DJI', price: 42999, originalPrice: 49999, discount: 14, rating: 4.7, reviewCount: 4120,  stock: 54,  sold: 22000,  image: 'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=600&h=600&fit=crop'], badge: 'new', tags: ['drone','dji'], description: 'Under 249g 4K camera drone.', specs: { 'Weight': '< 249g' }, colors: ['#C0C0C0'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: true },
    { id: 40, name: 'Nintendo Switch OLED Model',               category: 'toys',        subcategory: 'Video Games', brand: 'Nintendo', price: 28999, originalPrice: 31999, discount: 9,  rating: 4.9, reviewCount: 31200, stock: 85,  sold: 190000, image: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['nintendo','switch'], description: 'Vibrant 7-inch OLED screen console.', specs: { 'Screen': '7" OLED' }, colors: ['#FFFFFF'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: false },
    { id: 41, name: 'REDTIGER 4K Front & Rear Dash Cam',        category: 'automotive',  subcategory: 'Electronics', brand: 'REDTIGER', price: 9999, originalPrice: 14999, discount: 33, rating: 4.6, reviewCount: 8920,  stock: 210, sold: 48000,  image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600&h=600&fit=crop'], badge: 'sale', tags: ['dashcam','4k'], description: 'Dual 4K front and 1080P rear camera.', specs: { 'Resolution': '4K' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 3, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: false },
    { id: 42, name: 'NOCO Boost Plus GB40 Jump Starter',        category: 'automotive',  subcategory: 'Tools',       brand: 'NOCO', price: 7999, originalPrice: 9999, discount: 20, rating: 4.8, reviewCount: 45100, stock: 670, sold: 320000, image: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['jump-starter','noco'], description: '1000-Amp lithium car jump starter.', specs: { 'Current': '1000A' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: true, isFeatured: false, isNew: false },
    { id: 43, name: 'Chemical Guys 16-Piece Car Wash Kit',     category: 'automotive',  subcategory: 'Care',        brand: 'Chemical Guys', price: 7499, originalPrice: 9999, discount: 25, rating: 4.7, reviewCount: 12400, stock: 310, sold: 84000,  image: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=600&h=600&fit=crop'], badge: 'sale', tags: ['car-wash','detailing'], description: 'Complete 16-piece detailing wash bucket kit.', specs: { 'Pieces': '16' }, colors: [], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: false, isFeatured: true, isNew: false },
    { id: 44, name: 'Bosch ICON 26A Premium Wiper Blade',       category: 'automotive',  subcategory: 'Accessories', brand: 'Bosch', price: 1499, originalPrice: 1999, discount: 25, rating: 4.6, reviewCount: 18900, stock: 1400,sold: 160000, image: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=600&h=600&fit=crop'], badge: null, tags: ['wiper-blade','bosch'], description: 'Dual rubber premium wiper blade.', specs: { 'Size': '26 Inch' }, colors: ['#1A1A1A'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: false, isFeatured: false, isNew: false },
    { id: 45, name: 'Blue Bottle Coffee Whole Bean 12oz',        category: 'grocery',     subcategory: 'Coffee',      brand: 'Blue Bottle', price: 1299, originalPrice: 1699, discount: 24, rating: 4.8, reviewCount: 6710,  stock: 850, sold: 54000,  image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&h=600&fit=crop'], badge: 'new', tags: ['coffee','whole-bean'], description: 'Freshly roasted single-origin coffee.', specs: { 'Weight': '12 oz' }, colors: [], freeShipping: false, deliveryDays: 3, warranty: 'N/A', isTrending: true, isFeatured: true, isNew: true },
    { id: 46, name: 'Kirkland Signature Organic EVOO 2L',        category: 'grocery',     subcategory: 'Organic',     brand: 'Kirkland', price: 1999, originalPrice: 2499, discount: 20, rating: 4.9, reviewCount: 28900, stock: 2100,sold: 290000, image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['olive-oil','organic'], description: 'USDA certified Italian organic olive oil.', specs: { 'Volume': '2 Liters' }, colors: [], freeShipping: true, deliveryDays: 3, warranty: 'N/A', isTrending: false, isFeatured: false, isNew: false },
    { id: 47, name: 'KIND Protein Bars Dark Chocolate 12-Pack', category: 'grocery',     subcategory: 'Snacks',      brand: 'KIND', price: 1499, originalPrice: 1899, discount: 21, rating: 4.7, reviewCount: 14200, stock: 1800,sold: 110000, image: 'https://images.unsplash.com/photo-1622484210800-88517572bf92?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1622484210800-88517572bf92?w=600&h=600&fit=crop'], badge: null, tags: ['protein-bar','kind'], description: '12g plant-based protein snack bar.', specs: { 'Pack': '12 Bars' }, colors: [], freeShipping: true, deliveryDays: 2, warranty: 'N/A', isTrending: false, isFeatured: false, isNew: false },
    { id: 48, name: 'Pandora Moments Charm Bracelet',            category: 'jewelry',     subcategory: 'Bracelets',   brand: 'Pandora', price: 4990, originalPrice: 6490, discount: 23, rating: 4.8, reviewCount: 19400, stock: 310, sold: 125000, image: 'https://images.unsplash.com/photo-1611591475777-233ca70be3ee?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1611591475777-233ca70be3ee?w=600&h=600&fit=crop'], badge: 'bestseller', tags: ['jewelry','bracelet','pandora'], description: '925 sterling silver snake chain bracelet.', specs: { 'Material': 'Sterling Silver' }, colors: ['#C0C0C0'], freeShipping: true, deliveryDays: 2, warranty: '1 Year', isTrending: true, isFeatured: true, isNew: false },
    { id: 49, name: 'Swarovski Crystal Tennis Bracelet',        category: 'jewelry',     subcategory: 'Bracelets',   brand: 'Swarovski', price: 9990, originalPrice: 12990, discount: 23, rating: 4.7, reviewCount: 8120,  stock: 145, sold: 58000,  image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&h=600&fit=crop'], badge: 'sale', tags: ['jewelry','bracelet','swarovski'], description: 'Rhodium-plated clear crystal tennis bracelet.', specs: { 'Stone': 'Swarovski' }, colors: ['#C0C0C0'], freeShipping: true, deliveryDays: 3, warranty: '2 Years', isTrending: false, isFeatured: true, isNew: false },
    { id: 50, name: '14K Gold Solitaire Diamond Pendant',       category: 'jewelry',     subcategory: 'Necklaces',   brand: 'Brilliant Earth', price: 34999, originalPrice: 49999, discount: 30, rating: 4.9, reviewCount: 3210,  stock: 42,  sold: 19000,  image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400&h=400&fit=crop',  images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&h=600&fit=crop'], badge: 'premium', tags: ['jewelry','necklace','diamond'], description: '0.25ct diamond set in 14K gold.', specs: { 'Carat': '0.25 ct' }, colors: ['#FFD700'], freeShipping: true, deliveryDays: 2, warranty: 'Lifetime', isTrending: true, isFeatured: true, isNew: true }
  ],

  users: [
    { id: 'u1', name: 'John Doe',    email: 'john@demo.com',         passwordHash: '$2a$10$wKQblK4fFfGLRGCzXFjXdeg9NXL2Bq4LTUMO.71tXaMJKhCn0C2Gy', avatar: 'J', joinDate: '2023-01-15', tier: 'Gold',     orders: 42, totalSpent: 4820.50, isAdmin: false },
    { id: 'u2', name: 'Admin User',  email: 'admin@shopnova.com',    passwordHash: '$2a$10$z3xlP7.d9iHn1MNqZiCxeObC3cNI3.9UQPQpW7v4lF0VWzv/vwT9i', avatar: 'A', joinDate: '2022-06-01', tier: 'Platinum', orders: 0,  totalSpent: 0,       isAdmin: true  }
    // Passwords: john@demo.com → "demo1234", admin@shopnova.com → "admin1234"
  ],

  orders: [
    { id: 'SN-2024-001', userId: 'u1', date: '2024-02-18', status: 'delivered',  items: [{ productId: 1,  qty: 1, price: 349.99 }, { productId: 13, qty: 2, price: 14.99 }], total: 379.97, shipping: 0,  address: '123 Main St, New York, NY 10001'           },
    { id: 'SN-2024-002', userId: 'u1', date: '2024-02-25', status: 'shipped',    items: [{ productId: 8,  qty: 1, price: 1199.00 }],                                          total: 1199.00, shipping: 0, address: '456 Oak Ave, Los Angeles, CA 90001'        },
    { id: 'SN-2024-003', userId: 'u1', date: '2024-03-01', status: 'processing', items: [{ productId: 3,  qty: 1, price: 129.99 }, { productId: 11, qty: 1, price: 19.99 }], total: 149.98, shipping: 0,  address: '789 Pine St, Chicago, IL 60601'             }
  ],

  banners: [
    { id: 1, title: 'The Future of Sound',     subtitle: 'Sony WH-1000XM5 — Industry-leading noise cancellation', cta: 'Shop Now',     ctaLink: 'product-detail.html?id=1', badge: '🎵 Up to 30hrs battery', accentColor: '#6C63FF', productId: 1 },
    { id: 2, title: 'Powered by M3',           subtitle: 'MacBook Air — Outrageously thin. Seriously powerful.',  cta: 'Explore Now',  ctaLink: 'product-detail.html?id=2', badge: '✨ New Arrival',        accentColor: '#4776E6', productId: 2 },
    { id: 3, title: "Season's Biggest Sale",   subtitle: 'Up to 50% off on thousands of products',                cta: 'View Deals',   ctaLink: 'products.html?sale=true',  badge: '🔥 Limited Time',       accentColor: '#FF6B35', productId: 3 }
  ],

  reviews: {
    "1": [
      { id: 'r1', user: 'Alex K.',  avatar: 'A', rating: 5, date: '2024-02-15', title: "Best headphones I've ever owned!", text: 'The noise cancellation is absolutely incredible.', verified: true, helpful: 234, unhelpful: 12 },
      { id: 'r2', user: 'Sarah M.', avatar: 'S', rating: 5, date: '2024-01-28', title: 'Worth every penny',                text: 'Exceptional sound quality and comfort.',            verified: true, helpful: 156, unhelpful: 8  }
    ],
    "8": [
      { id: 'r4', user: 'Emma L.', avatar: 'E', rating: 5, date: '2024-02-20', title: 'Life-changing camera', text: 'The camera system is absolutely mind-blowing.',    verified: true, helpful: 445, unhelpful: 28 },
      { id: 'r5', user: 'Ryan P.', avatar: 'R', rating: 5, date: '2024-02-10', title: 'Best iPhone yet',     text: 'The titanium build feels premium.',                  verified: true, helpful: 312, unhelpful: 19 }
    ]
  },

  notifications: [
    { id: 'n1', type: 'order',  icon: '📦', title: 'Order Delivered',         message: 'Your Sony headphones have been delivered!',   time: '2 hours ago', read: false },
    { id: 'n2', type: 'deal',   icon: '🔥', title: 'Flash Deal Alert',         message: 'iPhone 15 Pro — 8% off for 4 more hours!',    time: '5 hours ago', read: false },
    { id: 'n3', type: 'review', icon: '⭐', title: 'Review Request',           message: 'How did you like your MacBook Air?',           time: '1 day ago',   read: true  },
    { id: 'n4', type: 'promo',  icon: '🎁', title: "You've earned Gold status!", message: 'Enjoy exclusive member discounts!',          time: '2 days ago',  read: true  }
  ]
};

const DB_PATH = path.join(__dirname, 'data', 'db.json');

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) ensureDB();
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading DB:', err);
    return INITIAL_DATA;
  }
}

function writeDB(data) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

/* ── Initialize DB if not exists ─────────────────────────── */
function ensureDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    writeDB(INITIAL_DATA);
    console.log('✅ Database initialized at', DB_PATH);
  }
}
ensureDB();

/* ── Field mapping helpers ───────────────────────────────── */
function mapProductToClient(p) {
  if (!p) return null;
  return {
    id:           Number(p.id),
    name:         p.name,
    brand:        p.brand         || '',
    category:     p.category      || '',
    subcategory:  p.subcategory   || '',
    price:        Number(p.price  || 0),
    originalPrice:Number(p.original_price || p.originalPrice || p.price || 0),
    discount:     Number(p.discount       || 0),
    rating:       Number(p.rating         || 5),
    reviewCount:  Number(p.review_count   || p.reviewCount || 0),
    stock:        Number(p.stock          || 0),
    image:        p.image         || '',
    images:       Array.isArray(p.images) ? p.images : [],
    freeShipping: !!(p.free_shipping || p.freeShipping),
    deliveryDays: Number(p.delivery_days  || p.deliveryDays || 3),
    description:  p.description   || '',
    specs:        typeof p.specs === 'string' ? JSON.parse(p.specs) : (p.specs || {}),
    colors:       Array.isArray(p.colors) ? p.colors : [],
    sizes:        Array.isArray(p.sizes)  ? p.sizes  : [],
    badge:        p.badge         || '',
    tags:         Array.isArray(p.tags)   ? p.tags   : [],
    isTrending:   !!(p.isTrending  || p.is_trending),
    isFeatured:   !!(p.isFeatured  || p.is_featured),
    isNew:        !!(p.isNew       || p.is_new),
    sold:         Number(p.sold   || 0),
    warranty:     p.warranty      || ''
  };
}

function mapProductToSupabase(p) {
  return {
    id:            Number(p.id),
    name:          p.name,
    brand:         p.brand        || '',
    category:      p.category     || '',
    subcategory:   p.subcategory  || '',
    price:         Number(p.price || 0),
    original_price:Number(p.originalPrice || p.price || 0),
    discount:      Number(p.discount      || 0),
    rating:        Number(p.rating        || 5),
    review_count:  Number(p.reviewCount   || 0),
    stock:         Number(p.stock         || 0),
    image:         p.image        || '',
    free_shipping: !!(p.freeShipping),
    delivery_days: Number(p.deliveryDays  || 3),
    description:   p.description  || '',
    specs:         typeof p.specs === 'object' ? JSON.stringify(p.specs) : p.specs,
    colors:        p.colors       || [],
    badge:         p.badge        || ''
  };
}

function mapOrderToClient(o) {
  if (!o) return null;
  return {
    id:       o.id,
    userId:   o.userId || o.user_id || null,
    date:     o.date,
    status:   o.status,
    items:    typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
    total:    Number(o.total    || 0),
    shipping: Number(o.shipping || 0),
    address:  o.address  || ''
  };
}

function mapOrderToSupabase(o) {
  return {
    id:       o.id,
    user_id:  o.userId || null,
    date:     o.date,
    status:   o.status,
    items:    typeof o.items === 'object' ? JSON.stringify(o.items) : o.items,
    total:    Number(o.total),
    shipping: Number(o.shipping || 0),
    address:  o.address
  };
}

/* ══════════════════════════════════════════════════════════
   API ROUTES
   ══════════════════════════════════════════════════════════ */

/* ── Health check ────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

/* ── Categories ──────────────────────────────────────────── */
app.get('/api/categories', (req, res) => {
  const db = readDB();
  res.json({ success: true, data: db.categories });
});

/* ── Banners ─────────────────────────────────────────────── */
app.get('/api/banners', (req, res) => {
  const db = readDB();
  res.json({ success: true, data: db.banners });
});

/* ── Products ────────────────────────────────────────────── */
app.get('/api/products', async (req, res) => {
  const { cat, q, sort, sale, featured, trending, limit } = req.query;

  try {
    let query = supabase.from('products').select('*');
    if (cat && cat !== 'all') query = query.eq('category', cat);
    if (sale === 'true')      query = query.gt('discount', 0);
    if (featured === 'true')  query = query.eq('is_featured', true);
    if (trending === 'true')  query = query.eq('is_trending', true);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return res.json({ success: true, total: 0, data: [], source: 'supabase' });

    let products = data.map(mapProductToClient);
    if (q) {
      const ql = q.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(ql) ||
        p.brand.toLowerCase().includes(ql) ||
        (p.tags || []).some(t => String(t).toLowerCase().includes(ql)) ||
        p.category.toLowerCase().includes(ql)
      );
    }

    applySortAndLimit(products, sort, limit);
    return res.json({ success: true, total: products.length, data: products, source: 'supabase' });

  } catch (e) {
    console.warn('Supabase /api/products unavailable, falling back to local DB');
    const db = readDB();
    let products = (db.products || []).slice();
    if (cat && cat !== 'all') products = products.filter(p => p.category === cat);
    if (sale === 'true')      products = products.filter(p => p.discount > 0);
    if (featured === 'true')  products = products.filter(p => p.isFeatured);
    if (trending === 'true')  products = products.filter(p => p.isTrending);

    if (q) {
      const ql = q.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(ql) ||
        p.brand.toLowerCase().includes(ql) ||
        (p.tags || []).some(t => String(t).toLowerCase().includes(ql)) ||
        p.category.toLowerCase().includes(ql)
      );
    }

    applySortAndLimit(products, sort, limit);
    return res.json({ success: true, total: products.length, data: products, source: 'local' });
  }
});

function applySortAndLimit(products, sort, limit) {
  if (sort === 'price-asc')  products.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') products.sort((a, b) => b.price - a.price);
  if (sort === 'rating')     products.sort((a, b) => b.rating - a.rating);
  if (sort === 'newest')     products.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  if (sort === 'trending')   products.sort((a, b) => (b.isTrending ? 1 : 0) - (a.isTrending ? 1 : 0));
  if (sort === 'discount')   products.sort((a, b) => b.discount - a.discount);
  if (limit) products.splice(parseInt(limit));
}

app.get('/api/products/:id', async (req, res) => {
  const prodId = parseInt(req.params.id);
  try {
    const { data, error } = await supabase.from('products').select('*').eq('id', prodId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: mapProductToClient(data), source: 'supabase' });
  } catch (e) {
    const db = readDB();
    const product = db.products.find(p => p.id === prodId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: product, source: 'local' });
  }
});

app.post('/api/products', authenticate, async (req, res) => {
  const db = readDB();
  const newId = db.products.length ? Math.max(...db.products.map(p => p.id)) + 1 : 1;
  const product = { id: newId, ...req.body, rating: req.body.rating || 5, reviewCount: 0, sold: 0 };

  db.products.push(product);
  writeDB(db);

  try {
    const { error } = await supabase.from('products').insert([mapProductToSupabase(product)]);
    if (error) throw error;
    res.status(201).json({ success: true, data: product, synced: true });
  } catch (e) {
    console.warn('⚠️ Supabase product insert error:', e.message);
    res.status(201).json({ success: true, data: product, synced: false });
  }
});

app.put('/api/products/:id', authenticate, async (req, res) => {
  const prodId = parseInt(req.params.id);
  const db = readDB();
  const idx = db.products.findIndex(p => p.id === prodId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Product not found' });

  db.products[idx] = { ...db.products[idx], ...req.body, id: prodId };
  writeDB(db);

  try {
    const { error } = await supabase.from('products').update(mapProductToSupabase(db.products[idx])).eq('id', prodId);
    if (error) throw error;
    res.json({ success: true, data: db.products[idx], synced: true });
  } catch (e) {
    res.json({ success: true, data: db.products[idx], synced: false });
  }
});

app.delete('/api/products/:id', authenticate, async (req, res) => {
  const prodId = parseInt(req.params.id);
  const db = readDB();
  const idx = db.products.findIndex(p => p.id === prodId);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Product not found' });

  const deleted = db.products.splice(idx, 1)[0];
  writeDB(db);

  try {
    const { error } = await supabase.from('products').delete().eq('id', prodId);
    if (error) throw error;
    res.json({ success: true, data: deleted, synced: true });
  } catch (e) {
    res.json({ success: true, data: deleted, synced: false });
  }
});

/* ── Reviews ─────────────────────────────────────────────── */
app.get('/api/products/:id/reviews', (req, res) => {
  const db = readDB();
  const reviews = db.reviews[req.params.id] || [];
  reviews.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ success: true, data: reviews, total: reviews.length });
});

app.post('/api/products/:id/reviews', (req, res) => {
  const db = readDB();
  const productId = req.params.id;
  if (!db.reviews[productId]) db.reviews[productId] = [];

  const review = {
    id:        'r' + Date.now(),
    user:      req.body.user   || 'Anonymous',
    avatar:    (req.body.user  || 'A').charAt(0).toUpperCase(),
    rating:    Number(req.body.rating) || 5,
    date:      new Date().toISOString().split('T')[0],
    title:     req.body.title  || '',
    text:      req.body.text   || '',
    verified:  false,
    helpful:   0,
    unhelpful: 0
  };

  db.reviews[productId].unshift(review);

  // Update product aggregate rating
  const allReviews = db.reviews[productId];
  const avgRating = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
  const prod = db.products.find(p => String(p.id) === String(productId));
  if (prod) {
    prod.rating = Math.round(avgRating * 10) / 10;
    prod.reviewCount = allReviews.length;
  }

  writeDB(db);
  res.status(201).json({ success: true, data: review });
});

/* ── Mark review helpful ─────────────────────────────────── */
app.post('/api/products/:id/reviews/:reviewId/helpful', (req, res) => {
  const db = readDB();
  const { type } = req.body; // 'helpful' | 'unhelpful'
  const reviews = db.reviews[req.params.id] || [];
  const review = reviews.find(r => r.id === req.params.reviewId);
  if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
  if (type === 'helpful')   review.helpful   = (review.helpful   || 0) + 1;
  if (type === 'unhelpful') review.unhelpful = (review.unhelpful || 0) + 1;
  writeDB(db);
  res.json({ success: true, data: review });
});

/* ── Auth ────────────────────────────────────────────────── */
app.post('/api/auth/register', async (req, res) => {
  const db = readDB();
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email and password are required' });
  }

  const exists = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) return res.status(409).json({ success: false, error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = {
    id:           'u' + Date.now(),
    name,
    email:        email.toLowerCase(),
    passwordHash,
    avatar:       name.charAt(0).toUpperCase(),
    joinDate:     new Date().toISOString().split('T')[0],
    tier:         'Bronze',
    orders:       0,
    totalSpent:   0,
    isAdmin:      false
  };

  db.users.push(newUser);
  writeDB(db);

  // Send welcome email (non-blocking)
  mailer.sendWelcome(newUser).catch(() => {});

  // Award welcome loyalty points (non-blocking)
  try {
    const db2 = readDB();
    if (!db2.loyalty) db2.loyalty = {};
    if (!db2.loyalty[newUser.id]) db2.loyalty[newUser.id] = { points: 0, lifetimePoints: 0, history: [] };
    db2.loyalty[newUser.id].points         += 100;
    db2.loyalty[newUser.id].lifetimePoints += 100;
    db2.loyalty[newUser.id].history.unshift({ id: 'lh' + Date.now(), type: 'earn', amount: 100, reason: 'Welcome bonus', date: new Date().toISOString() });
    writeDB(db2);
  } catch (e) { /* non-critical */ }

  const token = signToken(newUser.id);
  const { passwordHash: _, ...safe } = newUser;
  res.status(201).json({ success: true, token, data: safe });
});

app.post('/api/auth/login', async (req, res) => {
  const db = readDB();
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password' });

  // Support both bcrypt hashes and legacy plain passwords
  let valid = false;
  if (user.passwordHash) {
    valid = await bcrypt.compare(password, user.passwordHash);
  } else if (user.password) {
    // Legacy plain text — auto-upgrade to hash
    valid = (user.password === password);
    if (valid) {
      user.passwordHash = await bcrypt.hash(password, 10);
      delete user.password;
      writeDB(db);
    }
  }

  if (!valid) return res.status(401).json({ success: false, error: 'Invalid email or password' });

  // 2FA Protection check
  if (user.twoFactorEnabled) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 10 * 60 * 1000;
    if (!db.otps) db.otps = {};
    db.otps[user.email.toLowerCase()] = { otp, expires, userId: user.id };
    
    if (!db.securityLogs) db.securityLogs = [];
    db.securityLogs.push({ id: 'sec_' + Date.now(), userId: user.id, event: '2FA OTP Sent via Login', timestamp: new Date().toISOString() });
    writeDB(db);

    try { await mailer.sendOTP(user, otp).catch(() => {}); } catch(e) {}
    console.log(`🔐 2FA Login OTP for ${user.email}: ${otp}`);

    return res.json({
      success: true,
      require2FA: true,
      email: user.email,
      message: '🔐 2FA Protection Active. A 6-digit verification code was sent to your email.'
    });
  }

  if (!db.securityLogs) db.securityLogs = [];
  db.securityLogs.push({ id: 'sec_' + Date.now(), userId: user.id, event: 'Successful Login', timestamp: new Date().toISOString() });
  writeDB(db);

  const token = signToken(user.id);
  const { passwordHash: _h, password: _p, ...safe } = user;
  res.json({ success: true, token, data: safe });
});

/* ── Users ───────────────────────────────────────────────── */
app.get('/api/users/me', authenticate, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  const { passwordHash: _, password: _p, ...safe } = user;
  res.json({ success: true, data: safe });
});

app.get('/api/users/:id', authenticate, (req, res) => {
  const db = readDB();
  // Only admins can view other profiles; normal users can only view their own
  if (req.userId !== req.params.id) {
    const requester = db.users.find(u => u.id === req.userId);
    if (!requester || !requester.isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
  }
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  const { passwordHash: _, password: _p, ...safe } = user;
  res.json({ success: true, data: safe });
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  if (req.userId !== req.params.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'User not found' });

  const allowed = ['name', 'avatar', 'phone', 'address'];
  allowed.forEach(k => { if (req.body[k] !== undefined) db.users[idx][k] = req.body[k]; });

  // Allow password change
  if (req.body.newPassword) {
    db.users[idx].passwordHash = await bcrypt.hash(req.body.newPassword, 10);
    delete db.users[idx].password;
  }

  writeDB(db);
  const { passwordHash: _, password: _p, ...safe } = db.users[idx];
  res.json({ success: true, data: safe });
});

/* ── Orders ──────────────────────────────────────────────── */
app.get('/api/orders', async (req, res) => {
  const { userId, all } = req.query;

  try {
    let query = supabase.from('orders').select('*');
    if (userId && all !== 'true') {
      query = query.or(`user_id.eq.${userId},userId.eq.${userId}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const orders = (data || []).map(mapOrderToClient);
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.json({ success: true, data: orders, source: 'supabase' });
  } catch (e) {
    const db = readDB();
    let orders = [...db.orders];
    if (userId && all !== 'true') {
      orders = orders.filter(o => o.userId === userId || o.user_id === userId);
    }
    orders.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, data: orders, source: 'local' });
  }
});

// Order routes moved to routes/orders.js

/* ── Notifications ───────────────────────────────────────── */
app.get('/api/notifications', (req, res) => {
  const db = readDB();
  res.json({ success: true, data: db.notifications });
});

app.put('/api/notifications/:id/read', (req, res) => {
  const db = readDB();
  const notif = db.notifications.find(n => n.id === req.params.id);
  if (!notif) return res.status(404).json({ success: false, error: 'Notification not found' });
  notif.read = true;
  writeDB(db);
  res.json({ success: true, data: notif });
});

app.put('/api/notifications/read-all', (req, res) => {
  const db = readDB();
  db.notifications.forEach(n => { n.read = true; });
  writeDB(db);
  res.json({ success: true, message: 'All notifications marked as read' });
});

/* ── Modular Route Modules ───────────────────────────────── */
const wishlistRoutes        = require('./routes/wishlist')(authenticate, readDB, writeDB);
const cartRoutes            = require('./routes/cart')(authenticate, readDB, writeDB);
const searchRoutes          = require('./routes/search')(readDB, supabase);
const couponRoutes          = require('./routes/coupons')(authenticate, requireAdmin, readDB, writeDB);
const analyticsRoutes       = require('./routes/analytics')(requireAdmin, readDB);
const sellerRoutes          = require('./routes/seller')(authenticate, readDB, writeDB);
const shippingRoutes        = require('./routes/shipping')(authenticate, readDB, writeDB);
const recommendationRoutes  = require('./routes/recommendations')(authenticate, readDB);
const paymentRoutes         = require('./routes/payments')(authenticate, readDB, writeDB);
const emailRoutes           = require('./routes/email')(requireAdmin, readDB, writeDB);
const flashDealRoutes       = require('./routes/flashdeals')(authenticate, requireAdmin, readDB, writeDB);
const returnRoutes          = require('./routes/returns')(authenticate, requireAdmin, readDB, writeDB);
const loyaltyRoutes         = require('./routes/loyalty')(authenticate, requireAdmin, readDB, writeDB);
const uploadRoutes          = require('./routes/uploads')(authenticate, readDB, writeDB);
const chatRoutes            = require('./routes/chat')(authenticate, requireAdmin, readDB, writeDB);
const bundleRoutes          = require('./routes/bundles')(authenticate, requireAdmin, readDB, writeDB);
const subscriptionRoutes    = require('./routes/subscriptions')(authenticate, requireAdmin, readDB, writeDB);
const reviewRoutes          = require('./routes/reviews')(authenticate, requireAdmin, readDB, writeDB, supabase);
const orderRoutes           = require('./routes/orders')(authenticate, requireAdmin, readDB, writeDB, mapOrderToClient, mapOrderToSupabase, mailer, supabase);
const referralRoutes        = require('./routes/referrals')(authenticate, readDB, writeDB);
const alertRoutes           = require('./routes/alerts')(authenticate, readDB, writeDB, mailer);

app.use('/api/wishlist',         wishlistRoutes);
app.use('/api/cart',             cartRoutes);
app.use('/api/search',           searchRoutes);
app.use('/api/coupons',          couponRoutes);
app.use('/api/admin/analytics',  analyticsRoutes);
app.use('/api/seller',           sellerRoutes);
app.use('/api/shipping',         shippingRoutes);
app.use('/api/recommendations',  recommendationRoutes);
app.use('/api/payments',         paymentRoutes);
app.use('/api/email',            emailRoutes);
app.use('/api/flash-deals',      flashDealRoutes);
app.use('/api/returns',          returnRoutes);
app.use('/api/loyalty',          loyaltyRoutes);
app.use('/api/uploads',          uploadRoutes);
app.use('/api/chat',             chatRoutes);
app.use('/api/bundles',          bundleRoutes);
app.use('/api/subscriptions',    subscriptionRoutes);
app.use('/api/reviews',          reviewRoutes);
app.use('/api/referrals',        referralRoutes);
app.use('/api/orders',           orderRoutes);
app.use('/api/alerts',          alertRoutes);

/* ── 2FA / OTP Endpoints ─────────────────────────────────── */

// POST /api/auth/send-otp  — generate & email a 6-digit OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

  const db   = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(404).json({ success: false, error: 'Email not found' });

  const otp     = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

  if (!db.otps) db.otps = {};
  db.otps[email.toLowerCase()] = { otp, expires, userId: user.id };
  writeDB(db);

  // Send OTP email (non-blocking)
  try {
    await mailer.sendOTP(user, otp).catch(() => {});
  } catch (e) { /* non-critical */ }

  console.log(`🔐 OTP for ${email}: ${otp}`);
  res.json({ success: true, message: 'OTP sent to your email. Valid for 10 minutes.' });
});

// POST /api/auth/verify-otp  — verify OTP and return JWT
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP required' });

  const db      = readDB();
  const stored  = (db.otps || {})[email.toLowerCase()];

  if (!stored)                       return res.status(400).json({ success: false, error: 'No OTP found for this email. Please request a new one.' });
  if (Date.now() > stored.expires)   return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
  if (stored.otp !== String(otp))    return res.status(400).json({ success: false, error: 'Invalid OTP. Please try again.' });

  // Clear used OTP
  delete db.otps[email.toLowerCase()];
  writeDB(db);

  const user = db.users.find(u => u.id === stored.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  if (!db.securityLogs) db.securityLogs = [];
  db.securityLogs.push({ id: 'sec_' + Date.now(), userId: user.id, event: '2FA Login Verified', timestamp: new Date().toISOString() });
  writeDB(db);

  const token = signToken(user.id);
  const { passwordHash: _, password: _p, ...safe } = user;
  res.json({ success: true, token, data: safe, message: '2FA verified successfully' });
});

// POST /api/auth/2fa/toggle — Enable/Disable 2FA for logged in user
app.post('/api/auth/2fa/toggle', authenticate, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  user.twoFactorEnabled = !user.twoFactorEnabled;

  if (!db.securityLogs) db.securityLogs = [];
  db.securityLogs.push({
    id: 'sec_' + Date.now(),
    userId: user.id,
    event: user.twoFactorEnabled ? '2FA Enabled' : '2FA Disabled',
    timestamp: new Date().toISOString()
  });
  writeDB(db);

  const { passwordHash: _, password: _p, ...safe } = user;
  res.json({
    success: true,
    twoFactorEnabled: user.twoFactorEnabled,
    message: user.twoFactorEnabled ? '🔐 2FA enabled! Your account is now protected.' : '🔓 2FA disabled.',
    data: safe
  });
});

// GET /api/users/security-logs — Retrieve security activity history for user
app.get('/api/users/security-logs', authenticate, (req, res) => {
  const db = readDB();
  const logs = (db.securityLogs || []).filter(l => l.userId === req.userId).slice(-20).reverse();
  res.json({ success: true, data: logs });
});

// POST /api/auth/track-view  — AI recommendation: track product view
app.post('/api/auth/track-view', (req, res) => {
  const { productId, userId } = req.body;
  if (!productId) return res.json({ success: false });
  const db = readDB();
  if (!db.viewHistory) db.viewHistory = {};
  const uid = userId || 'anon';
  if (!db.viewHistory[uid]) db.viewHistory[uid] = [];
  // Keep only last 50 views per user
  const existing = db.viewHistory[uid].filter(v => v.productId !== parseInt(productId));
  existing.unshift({ productId: parseInt(productId), viewedAt: new Date().toISOString() });
  db.viewHistory[uid] = existing.slice(0, 50);
  writeDB(db);
  res.json({ success: true });
});

// GET /api/auth/recommendations/history/:userId — AI recs based on view history
app.get('/api/recommendations/history', authenticate, (req, res) => {
  const { limit = 8 } = req.query;
  const db = readDB();
  const history = (db.viewHistory || {})[req.userId] || [];
  const viewedIds = history.map(v => v.productId);
  if (viewedIds.length === 0) {
    const featured = db.products.filter(p => p.isFeatured).slice(0, parseInt(limit));
    return res.json({ success: true, data: featured, personalized: false });
  }
  // Category affinity scoring
  const categoryCount = {};
  viewedIds.forEach(id => {
    const p = db.products.find(pr => pr.id === id);
    if (p) categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
  });
  const topCats = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
  const recs = db.products
    .filter(p => topCats.includes(p.category) && !viewedIds.includes(p.id))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, parseInt(limit));
  res.json({ success: true, data: recs, personalized: true, basedOn: topCats });
});

/* ── Admin: Reset DB ─────────────────────────────────────── */
app.post('/api/db/reset', requireAdmin, async (req, res) => {
  writeDB(INITIAL_DATA);
  let synced = false;
  try {
    const productsPayload = INITIAL_DATA.products.map(mapProductToSupabase);
    await supabase.from('products').delete().neq('id', 0);
    const { error: pe } = await supabase.from('products').insert(productsPayload);
    if (pe) throw pe;
    const ordersPayload = INITIAL_DATA.orders.map(mapOrderToSupabase);
    await supabase.from('orders').delete().neq('id', '0');
    const { error: oe } = await supabase.from('orders').insert(ordersPayload);
    if (oe) throw oe;
    synced = true;
  } catch (e) {
    console.warn('⚠️ Could not sync reset to Supabase:', e.message);
  }
  res.json({ success: true, message: 'Database reset successfully', synced });
});

/* ── Admin: DB Export ────────────────────────────────────── */
app.get('/api/db/export', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({ success: true, data: db });
});

/* ── Analytics handled by routes/analytics.js ───────────── */

/* ── Google OAuth Endpoints ───────────────────────────────── */
const { OAuth2Client } = require('google-auth-library');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

/* GET /api/auth/google/config — returns public client ID */
app.get('/api/auth/google/config', (req, res) => {
  res.json({ success: true, clientId: GOOGLE_CLIENT_ID });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ success: false, error: 'Credential token required' });

  let payload;

  /* ── If GOOGLE_CLIENT_ID is configured, verify for real ─── */
  if (googleClient && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken:  credential,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('❌ Google token verification failed:', err.message);
      return res.status(401).json({ success: false, error: 'Invalid Google credential. Please try again.' });
    }
  } else {
    /* ── Dev/demo mode: decode without verification ─────────── */
    console.warn('⚠️  GOOGLE_CLIENT_ID not configured — using demo OAuth mode');
    try {
      // Decode the base64 payload part of the JWT without verifying signature
      const parts  = credential.split('.');
      const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch {
      // Fallback mock payload for testing
      payload = {
        sub:            'demo_' + Date.now(),
        email:          'demo.google@shopnova.com',
        name:           'Demo Google User',
        given_name:     'Demo',
        picture:        null,
        email_verified: true,
      };
    }
  }

  /* ── Extract user info from Google payload ──────────────── */
  const googleId    = payload.sub;
  const email       = payload.email       || '';
  const name        = payload.name        || payload.given_name || 'Google User';
  const picture     = payload.picture     || null;
  const verified    = payload.email_verified;

  if (!verified && googleClient) {
    return res.status(400).json({ success: false, error: 'Google email is not verified.' });
  }

  /* ── Find or create user in local DB ───────────────────── */
  const db = readDB();
  let user = db.users.find(u =>
    u.email.toLowerCase() === email.toLowerCase() ||
    u.oauthId === googleId
  );

  if (!user) {
    /* New user — create account */
    user = {
      id:           'g-' + Date.now(),
      name,
      email,
      avatar:       picture || name.charAt(0).toUpperCase(),
      joinDate:     new Date().toISOString().split('T')[0],
      tier:         'Bronze',
      orders:       0,
      totalSpent:   0,
      isAdmin:      false,
      isSeller:     false,
      loyaltyPoints: 0,
      oauthProvider: 'google',
      oauthId:       googleId,
      passwordHash:  null,       // no password for OAuth users
      addresses:     [],
    };
    db.users.push(user);
    writeDB(db);

    // Send welcome email (non-blocking)
    mailer.sendWelcome(user).catch(() => {});
    console.log(`✅ New Google user created: ${email}`);
  } else if (!user.oauthId) {
    /* Existing email account — link it to Google */
    user.oauthProvider = 'google';
    user.oauthId       = googleId;
    if (picture && !user.avatar?.startsWith('http')) user.avatar = picture;
    writeDB(db);
    console.log(`🔗 Google account linked to existing user: ${email}`);
  }

  /* ── Issue JWT ──────────────────────────────────────────── */
  const token = signToken(user.id);

  // Sanitize — don't send passwordHash to client
  const { passwordHash, oauthId, ...safeUser } = user;

  console.log(`🔐 Google OAuth login: ${email} (id: ${user.id})`);
  res.json({ success: true, user: safeUser, token });
});


/* ── Web Push Subscribe Endpoint ─────────────────────────── */
const pushSubscriptions = [];
app.post('/api/push/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, error: 'Subscription endpoint required' });
  }
  pushSubscriptions.push({ ...subscription, createdAt: Date.now() });
  res.json({ success: true, message: 'Push subscription saved' });
});

/* ── Price & Stock Alerts Endpoints ─────────────────────── */
const activeAlerts = [];
app.post('/api/alerts/price', (req, res) => {
  const { productId, targetPrice, email } = req.body;
  if (!productId) return res.status(400).json({ success: false, error: 'Product ID required' });
  const alert = { id: 'alt-' + Date.now(), productId: Number(productId), type: 'price', targetPrice, email, createdAt: Date.now() };
  activeAlerts.push(alert);
  res.json({ success: true, alert, message: 'Price drop alert created' });
});

app.post('/api/alerts/stock', (req, res) => {
  const { productId, email } = req.body;
  if (!productId) return res.status(400).json({ success: false, error: 'Product ID required' });
  const alert = { id: 'alt-' + Date.now(), productId: Number(productId), type: 'stock', email, createdAt: Date.now() };
  activeAlerts.push(alert);
  res.json({ success: true, alert, message: 'Stock alert created' });
});

/* ── Catch-all: serve index.html ─────────────────────────── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ── 404 handler ─────────────────────────────────────────── */
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

/* ── HTML 404 fallback ───────────────────────────────── */
app.use((req, res) => {
  const p = path.join(__dirname, '404.html');
  if (fs.existsSync(p)) return res.status(404).sendFile(p);
  res.status(404).send('404 — Page Not Found');
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ABANDONED CART BACKGROUND JOB
   Runs every 30 minutes. Emails users whose cart has had
   items sitting untouched for > 2 hours with no purchase.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const ABANDONED_CART_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const ABANDONED_CART_INTERVAL_MS  = 30 * 60 * 1000;      // check every 30 mins
const abandonedCartSent = new Set();                       // track already-emailed carts

async function checkAbandonedCarts() {
  try {
    const db  = readDB();
    const now = Date.now();
    if (!db.carts) return;

    for (const [userId, cart] of Object.entries(db.carts)) {
      if (!cart.items || !cart.items.length) continue;
      if (!cart.updatedAt) continue;

      const idleMs  = now - new Date(cart.updatedAt).getTime();
      const cartKey = `${userId}-${cart.updatedAt}`;

      if (idleMs < ABANDONED_CART_THRESHOLD_MS) continue;
      if (abandonedCartSent.has(cartKey)) continue;

      // Skip if user placed an order more recently than the cart was updated
      const latestOrder = (db.orders || [])
        .filter(o => o.userId === userId)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (latestOrder && new Date(latestOrder.date) >= new Date(cart.updatedAt)) continue;

      const user = db.users.find(u => u.id === userId);
      if (!user || !user.email) continue;

      console.log(`📧 Sending abandoned cart reminder to ${user.email}`);
      await mailer.sendAbandonedCart(user, cart.items, db.products).catch(() => {});
      abandonedCartSent.add(cartKey);
    }
  } catch (e) {
    console.error('Abandoned cart job error:', e.message);
  }
}
setInterval(checkAbandonedCarts, ABANDONED_CART_INTERVAL_MS);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FEATURE 4 — REAL-TIME INVENTORY RESERVATION
   POST /api/orders/reserve   — lock stock when entering checkout
   POST /api/orders/release   — release reservation on abandon
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const stockReservations = new Map();
const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15 minute hold

// Auto-release expired reservations every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, res] of stockReservations.entries()) {
    if (now > res.expiresAt) {
      console.log(`\u23f0 Reservation ${id} expired \u2014 releasing stock`);
      const db = readDB();
      (res.items || []).forEach(item => {
        const pidx = db.products.findIndex(p => p.id === (item.productId || item.id));
        if (pidx !== -1) db.products[pidx].stock += item.qty;
      });
      writeDB(db);
      stockReservations.delete(id);
    }
  }
}, 60 * 1000);

// POST /api/orders/reserve — deduct stock temporarily
app.post('/api/orders/reserve', (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ success: false, error: 'Items required' });
  }

  const db = readDB();
  const failures = [];

  for (const item of items) {
    const pid  = item.productId || item.id;
    const prod = db.products.find(p => p.id === pid);
    if (!prod) { failures.push({ productId: pid, reason: 'Product not found' }); continue; }
    if (prod.stock < item.qty) {
      failures.push({ productId: pid, name: prod.name, available: prod.stock, requested: item.qty, reason: 'Insufficient stock' });
    }
  }

  if (failures.length) {
    return res.status(409).json({ success: false, error: 'Stock conflict', failures });
  }

  // All clear — deduct stock and create reservation
  items.forEach(item => {
    const pidx = db.products.findIndex(p => p.id === (item.productId || item.id));
    if (pidx !== -1) db.products[pidx].stock -= item.qty;
  });
  writeDB(db);

  const reservationId = 'rsv-' + Date.now();
  stockReservations.set(reservationId, { items, userId: req.body.userId || null, expiresAt: Date.now() + RESERVATION_TTL_MS });

  res.json({ success: true, reservationId, expiresAt: new Date(Date.now() + RESERVATION_TTL_MS).toISOString(), message: `Stock reserved for 15 minutes` });
});

// POST /api/orders/release — return stock from an abandoned reservation
app.post('/api/orders/release', (req, res) => {
  const { reservationId } = req.body;
  if (!reservationId) return res.status(400).json({ success: false, error: 'reservationId required' });

  const reservation = stockReservations.get(reservationId);
  if (!reservation) return res.json({ success: true, message: 'Reservation not found or already consumed' });

  const db = readDB();
  (reservation.items || []).forEach(item => {
    const pidx = db.products.findIndex(p => p.id === (item.productId || item.id));
    if (pidx !== -1) db.products[pidx].stock += item.qty;
  });
  writeDB(db);
  stockReservations.delete(reservationId);
  res.json({ success: true, message: 'Stock released' });
});

// POST /api/orders/confirm-reservation — mark reservation consumed after order is placed
app.post('/api/orders/confirm-reservation', (req, res) => {
  const { reservationId } = req.body;
  if (reservationId) stockReservations.delete(reservationId);
  res.json({ success: true });
});

/* ── Start server ────────────────────────────────────────── */
app.listen(PORT, () => {
  const line = '═'.repeat(44);
  console.log('');
  console.log(`🚀 ╔${line}╗`);
  console.log(`   ║  ShopNova Backend  v2.0 — JWT + bcrypt     ║`);
  console.log(`   ║  http://localhost:${PORT}                       ║`);
  console.log(`   ╚${line}╝`);
  console.log('');
  console.log('📁 Database  :', DB_PATH);
  console.log('🔐 Auth      : JWT (', JWT_EXPIRES_IN, 'expiry)');
  console.log('☁️  Supabase  : Enabled with local fallback');
  console.log('');
  console.log('API Endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/products          POST /api/products');
  console.log('  GET  /api/products/:id      PUT  /api/products/:id');
  console.log('  DEL  /api/products/:id');
  console.log('  GET  /api/products/:id/reviews');
  console.log('  POST /api/products/:id/reviews');
  console.log('  GET  /api/categories        GET  /api/banners');
  console.log('  POST /api/auth/login        POST /api/auth/register');
  console.log('  GET  /api/users/me          PUT  /api/users/:id');
  console.log('  GET  /api/orders            POST /api/orders');
  console.log('  GET  /api/orders/:id        PUT  /api/orders/:id');
  console.log('  GET  /api/notifications');
  console.log('  POST /api/db/reset          GET  /api/db/export');
  console.log('');
  console.log('New Route Modules:');
  console.log('  /api/wishlist/*             — Wishlist management');
  console.log('  /api/cart/*                 — Server-side cart');
  console.log('  /api/search, /api/search/autocomplete');
  console.log('  /api/coupons/*              — Coupon CRUD + validate');
  console.log('  /api/admin/analytics/*      — Revenue, inventory, customers');
  console.log('  /api/seller/*               — Seller dashboard & products');
  console.log('  /api/shipping/*             — Rates, tracking, addresses');
  console.log('  /api/recommendations/*      — Similar, trending, for-you');
  console.log('  /api/payments/*             — Stripe checkout, webhooks, status');
  console.log('  /api/email/*               — Password reset, alerts, test');
  console.log('  /api/flash-deals/*         — Flash deals with countdown timer');
  console.log('  /api/returns/*             — Returns & refund workflow');
  console.log('  /api/loyalty/*             — Points, tiers, redeem coupons');
  console.log('  /api/uploads/*             — Product/avatar image uploads');
  console.log('');
});
