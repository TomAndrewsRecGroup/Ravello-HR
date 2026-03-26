-- ============================================================
-- Migration 006: E-learning marketplace
-- learning_content, learning_purchases tables
-- ============================================================

-- ── Learning content (admin-managed) ─────────────────────────
CREATE TABLE IF NOT EXISTS learning_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  creator_name    TEXT,
  category        TEXT,                -- e.g. "HR Fundamentals", "Leadership", "Compliance"
  tags            TEXT[],
  content_type    TEXT NOT NULL DEFAULT 'video' CHECK (content_type IN ('video','pdf','pptx','link','scorm')),
  file_url        TEXT,                -- Vercel Blob or Supabase Storage URL
  thumbnail_url   TEXT,
  duration_mins   INTEGER,             -- estimated duration
  price_pence     INTEGER NOT NULL DEFAULT 0,  -- 0 = free
  stripe_price_id TEXT,                -- Stripe Price ID for paid content
  is_published    BOOLEAN NOT NULL DEFAULT false,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Learning purchases ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id          UUID NOT NULL REFERENCES learning_content(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchased_by        UUID REFERENCES profiles(id),
  stripe_session_id   TEXT,
  stripe_payment_intent TEXT,
  amount_pence        INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','refunded')),
  access_expires_at   TIMESTAMPTZ,     -- 7 days from purchase
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_learning_content_published ON learning_content(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_learning_content_category  ON learning_content(category);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_company ON learning_purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_content ON learning_purchases(content_id);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_status  ON learning_purchases(status);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE learning_content   ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_purchases ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published content
CREATE POLICY "read_published_content" ON learning_content
  FOR SELECT USING (is_published = true AND auth.uid() IS NOT NULL);

-- Admin can do everything
CREATE POLICY "admin_learning_content" ON learning_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );

-- Clients can read their own purchases
CREATE POLICY "client_purchases_read" ON learning_purchases
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Clients can insert purchases (Stripe webhook will also insert via service role)
CREATE POLICY "client_purchases_insert" ON learning_purchases
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Admin full access to purchases
CREATE POLICY "admin_purchases" ON learning_purchases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );
