-- ============================================================
--  ShopNova — Supabase Database Schema
--  Run this entire file in Supabase SQL Editor:
--  https://app.supabase.com → Your Project → SQL Editor → New Query
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- enables fast text search (LIKE queries)

-- ─────────────────────────────────────────────────────────────
-- 2. CATEGORIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,        -- e.g. "electronics"
  name       TEXT NOT NULL,
  icon       TEXT,                    -- emoji icon
  color      TEXT,                    -- hex color
  count      INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3. PRODUCTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT REFERENCES categories(id) ON DELETE SET NULL,
  subcategory     TEXT,
  brand           TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  original_price  NUMERIC(10,2),
  discount        INTEGER DEFAULT 0,          -- percent
  rating          NUMERIC(3,1) DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  stock           INTEGER DEFAULT 0,
  sold            INTEGER DEFAULT 0,
  image           TEXT,                       -- primary image URL
  images          JSONB DEFAULT '[]',         -- array of image URLs
  badge           TEXT,                       -- "bestseller","sale","new","trending","premium"
  tags            JSONB DEFAULT '[]',         -- text[] stored as jsonb
  description     TEXT,
  specs           JSONB DEFAULT '{}',         -- key-value pairs
  colors          JSONB DEFAULT '[]',
  sizes           JSONB DEFAULT '[]',
  free_shipping   BOOLEAN DEFAULT FALSE,
  delivery_days   INTEGER DEFAULT 5,
  warranty        TEXT,
  is_trending     BOOLEAN DEFAULT FALSE,
  is_featured     BOOLEAN DEFAULT FALSE,
  is_new          BOOLEAN DEFAULT FALSE,
  seller          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index on products
CREATE INDEX IF NOT EXISTS products_name_search_idx  ON products USING GIN (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS products_brand_search_idx ON products USING GIN (to_tsvector('english', COALESCE(brand, '')));
CREATE INDEX IF NOT EXISTS products_category_idx     ON products (category);
CREATE INDEX IF NOT EXISTS products_price_idx        ON products (price);
CREATE INDEX IF NOT EXISTS products_rating_idx       ON products (rating DESC);
CREATE INDEX IF NOT EXISTS products_trending_idx     ON products (is_trending) WHERE is_trending = TRUE;
CREATE INDEX IF NOT EXISTS products_featured_idx     ON products (is_featured) WHERE is_featured = TRUE;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT 'u-' || substr(uuid_generate_v4()::TEXT, 1, 8),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,                       -- null for OAuth users
  avatar          TEXT,                       -- initials or URL
  join_date       DATE DEFAULT CURRENT_DATE,
  tier            TEXT DEFAULT 'Bronze',      -- Bronze/Silver/Gold/Platinum
  orders          INTEGER DEFAULT 0,
  total_spent     NUMERIC(10,2) DEFAULT 0,
  is_admin        BOOLEAN DEFAULT FALSE,
  is_seller       BOOLEAN DEFAULT FALSE,
  loyalty_points  INTEGER DEFAULT 0,
  phone           TEXT,
  addresses       JSONB DEFAULT '[]',
  oauth_provider  TEXT,                       -- "google", "github", etc.
  oauth_id        TEXT,
  two_fa_enabled  BOOLEAN DEFAULT FALSE,
  two_fa_secret   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_idx ON users (oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. ORDERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,           -- e.g. SN-2024-001
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  date            DATE DEFAULT CURRENT_DATE,
  status          TEXT DEFAULT 'processing',  -- processing/confirmed/shipped/out_for_delivery/delivered/cancelled/returned
  items           JSONB NOT NULL DEFAULT '[]',-- [{productId, qty, price, name}]
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping        NUMERIC(10,2) DEFAULT 0,
  discount        NUMERIC(10,2) DEFAULT 0,
  address         TEXT,
  payment_method  TEXT DEFAULT 'card',
  payment_intent  TEXT,                       -- Stripe payment_intent id
  coupon_code     TEXT,
  notes           TEXT,
  tracking_number TEXT,
  carrier         TEXT,
  estimated_delivery DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_user_idx    ON orders (user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON orders (status);
CREATE INDEX IF NOT EXISTS orders_date_idx    ON orders (date DESC);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. REVIEWS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY DEFAULT 'r-' || substr(uuid_generate_v4()::TEXT, 1, 8),
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name   TEXT,
  avatar      TEXT,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  text        TEXT,
  verified    BOOLEAN DEFAULT FALSE,
  helpful     INTEGER DEFAULT 0,
  unhelpful   INTEGER DEFAULT 0,
  images      JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews (product_id);
CREATE INDEX IF NOT EXISTS reviews_user_idx    ON reviews (user_id);
CREATE INDEX IF NOT EXISTS reviews_rating_idx  ON reviews (rating);

-- Auto-update product rating & review_count on review insert/delete
CREATE OR REPLACE FUNCTION sync_product_rating()
RETURNS TRIGGER AS $$
DECLARE
  pid INTEGER;
BEGIN
  pid := COALESCE(NEW.product_id, OLD.product_id);
  UPDATE products
  SET
    rating       = ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = pid)::NUMERIC, 1),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = pid)
  WHERE id = pid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_sync_rating ON reviews;
CREATE TRIGGER reviews_sync_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION sync_product_rating();

-- ─────────────────────────────────────────────────────────────
-- 7. CART (server-side)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
  qty         INTEGER DEFAULT 1 CHECK (qty > 0),
  size        TEXT,
  color       TEXT,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id, size, color)
);

CREATE INDEX IF NOT EXISTS cart_user_idx ON cart_items (user_id);

-- ─────────────────────────────────────────────────────────────
-- 8. WISHLIST
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS wishlist_user_idx ON wishlist (user_id);

-- ─────────────────────────────────────────────────────────────
-- 9. COUPONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  type            TEXT DEFAULT 'percent',     -- "percent" or "fixed"
  value           NUMERIC(10,2) NOT NULL,
  min_order       NUMERIC(10,2) DEFAULT 0,
  max_uses        INTEGER,
  used_count      INTEGER DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  description     TEXT,
  categories      JSONB DEFAULT '[]',         -- restrict to specific categories
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 10. FLASH DEALS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flash_deals (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER REFERENCES products(id) ON DELETE CASCADE,
  deal_price      NUMERIC(10,2) NOT NULL,
  original_price  NUMERIC(10,2) NOT NULL,
  stock_limit     INTEGER DEFAULT 50,
  sold_count      INTEGER DEFAULT 0,
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS flash_deals_active_idx ON flash_deals (ends_at) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────
-- 11. RETURNS / REFUNDS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
  id              TEXT PRIMARY KEY DEFAULT 'RET-' || substr(uuid_generate_v4()::TEXT, 1, 8),
  order_id        TEXT REFERENCES orders(id) ON DELETE SET NULL,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  items           JSONB DEFAULT '[]',         -- which items being returned
  reason          TEXT,
  status          TEXT DEFAULT 'pending',     -- pending/approved/rejected/refunded
  refund_amount   NUMERIC(10,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS returns_updated_at ON returns;
CREATE TRIGGER returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 12. LOYALTY POINTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL,               -- positive = earned, negative = spent
  type        TEXT,                           -- "earn_order","redeem","bonus","referral"
  reference   TEXT,                           -- order_id or coupon_code
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loyalty_user_idx ON loyalty_transactions (user_id);

-- ─────────────────────────────────────────────────────────────
-- 13. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY DEFAULT 'n-' || substr(uuid_generate_v4()::TEXT, 1, 8),
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT,                           -- "order","deal","review","promo","system"
  icon        TEXT,
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx  ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx  ON notifications (user_id, read) WHERE read = FALSE;

-- ─────────────────────────────────────────────────────────────
-- 14. CHAT SESSIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id          SERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,                  -- user_id or guest_xxx
  sender      TEXT NOT NULL,                  -- "user" or "bot" or "agent"
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_session_idx ON chat_messages (session_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- 15. BANNERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  subtitle      TEXT,
  cta           TEXT,
  cta_link      TEXT,
  badge         TEXT,
  accent_color  TEXT DEFAULT '#6C63FF',
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 16. SUBSCRIPTIONS (Prime / Premium plans)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL,              -- "basic","prime","platinum"
  status          TEXT DEFAULT 'active',      -- active/cancelled/expired
  stripe_sub_id   TEXT,
  price           NUMERIC(10,2),
  starts_at       TIMESTAMPTZ DEFAULT NOW(),
  ends_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id);

-- ─────────────────────────────────────────────────────────────
-- 17. BUNDLES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bundles (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  products        JSONB DEFAULT '[]',         -- [{productId, qty}]
  bundle_price    NUMERIC(10,2) NOT NULL,
  savings         NUMERIC(10,2),
  badge           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  image           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 18. ANALYTICS EVENTS (lightweight)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  event       TEXT NOT NULL,                  -- "page_view","product_view","add_to_cart","purchase"
  user_id     TEXT,
  session_id  TEXT,
  product_id  INTEGER,
  data        JSONB DEFAULT '{}',
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_event_idx    ON analytics_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_user_idx     ON analytics_events (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_product_idx  ON analytics_events (product_id) WHERE product_id IS NOT NULL;

-- Auto-cleanup analytics older than 90 days (run via pg_cron in production)
-- SELECT cron.schedule('cleanup-analytics', '0 2 * * *', 'DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL ''90 days''');

-- ─────────────────────────────────────────────────────────────
-- 19. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────
-- Enable RLS on user-sensitive tables
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns             ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own row
CREATE POLICY users_own_row ON users
  FOR ALL USING (id = auth.uid()::TEXT OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()::TEXT AND u.is_admin = TRUE
  ));

-- Orders: own only
CREATE POLICY orders_own ON orders
  FOR ALL USING (user_id = auth.uid()::TEXT OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = auth.uid()::TEXT AND u.is_admin = TRUE
  ));

-- Cart: own only
CREATE POLICY cart_own ON cart_items
  FOR ALL USING (user_id = auth.uid()::TEXT);

-- Wishlist: own only
CREATE POLICY wishlist_own ON wishlist
  FOR ALL USING (user_id = auth.uid()::TEXT);

-- Notifications: own only
CREATE POLICY notifications_own ON notifications
  FOR ALL USING (user_id = auth.uid()::TEXT);

-- Loyalty: own only
CREATE POLICY loyalty_own ON loyalty_transactions
  FOR ALL USING (user_id = auth.uid()::TEXT);

-- Subscriptions: own only
CREATE POLICY subscriptions_own ON subscriptions
  FOR ALL USING (user_id = auth.uid()::TEXT);

-- Returns: own only
CREATE POLICY returns_own ON returns
  FOR ALL USING (user_id = auth.uid()::TEXT);

-- Public tables (anyone can read, only admins via service_role can write)
-- Products, categories, banners, flash_deals, bundles, coupons are publicly readable
-- NOTE: our Express backend uses service_role key so it bypasses RLS for writes

-- ─────────────────────────────────────────────────────────────
-- 20. SEED: CATEGORIES
-- ─────────────────────────────────────────────────────────────
INSERT INTO categories (id, name, icon, color, count) VALUES
  ('electronics', 'Electronics',     '💻', '#6C63FF', 1420),
  ('fashion',     'Fashion',          '👗', '#EC4899', 3250),
  ('home',        'Home & Living',    '🛋️', '#F59E0B', 890),
  ('sports',      'Sports & Fitness', '⚽', '#43E97B', 640),
  ('beauty',      'Beauty & Care',    '💄', '#F472B6', 1100),
  ('books',       'Books',            '📚', '#60A5FA', 5200),
  ('toys',        'Toys & Games',     '🎮', '#A78BFA', 760),
  ('automotive',  'Automotive',       '🚗', '#34D399', 420),
  ('grocery',     'Grocery',          '🛒', '#FBBF24', 980),
  ('jewelry',     'Jewelry',          '💍', '#FCD34D', 310)
ON CONFLICT (id) DO UPDATE SET
  name  = EXCLUDED.name,
  icon  = EXCLUDED.icon,
  color = EXCLUDED.color,
  count = EXCLUDED.count;

-- ─────────────────────────────────────────────────────────────
-- 21. SEED: BANNERS
-- ─────────────────────────────────────────────────────────────
INSERT INTO banners (title, subtitle, cta, cta_link, badge, accent_color, product_id, sort_order) VALUES
  ('The Future of Sound',   'Sony WH-1000XM5 — Industry-leading noise cancellation', 'Shop Now',    'product-detail.html?id=1', '🎵 Up to 30hrs battery', '#6C63FF', 1, 1),
  ('Powered by M3',         'MacBook Air — Outrageously thin. Seriously powerful.',   'Explore Now', 'product-detail.html?id=2', '✨ New Arrival',          '#4776E6', 2, 2),
  ('Season''s Biggest Sale','Up to 50% off on thousands of products',                 'View Deals',  'products.html?sale=true',  '🔥 Limited Time',         '#FF6B35', 3, 3)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────
-- Run this schema, then use the sync script (supabase-sync.js)
-- to upload your existing db.json products into Supabase.
