-- ═══════════════════════════════════════════════════════════
-- Phase 41: Latest Updates feed (replaces /playbook)
--
-- Public marketing site renders a live feed of:
--   - admin-pasted URLs (source_type='manual')
--   - RSS-ingested items (source_type='rss', Phase 2)
--   - HTML-scraped items (source_type='html', Phase 3)
-- Admin portal has full CRUD. Public site reads with anon key
-- via the latest_updates_public_read policy.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feed_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  feed_url        TEXT NOT NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN ('rss','html','manual')),
  category        TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS latest_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT NOT NULL CHECK (source_type IN ('rss','html','manual')),
  feed_source_id  UUID REFERENCES feed_sources(id) ON DELETE SET NULL,
  source_url      TEXT NOT NULL,
  url_hash        TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT,
  image_url       TEXT,
  site_name       TEXT,
  author          TEXT,
  published_at    TIMESTAMPTZ,
  render_mode     TEXT NOT NULL DEFAULT 'card' CHECK (render_mode IN ('card','embed')),
  embed_html      TEXT,
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','hidden')),
  featured        BOOLEAN NOT NULL DEFAULT false,
  featured_order  INT,
  raw             JSONB,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_latest_updates_published
  ON latest_updates (published_at DESC NULLS LAST)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_latest_updates_source
  ON latest_updates (feed_source_id);

CREATE INDEX IF NOT EXISTS idx_latest_updates_featured
  ON latest_updates (featured_order NULLS LAST, published_at DESC)
  WHERE featured = true AND status = 'published';

ALTER TABLE latest_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sources   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS latest_updates_public_read ON latest_updates;
CREATE POLICY latest_updates_public_read ON latest_updates
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS latest_updates_staff_write ON latest_updates;
CREATE POLICY latest_updates_staff_write ON latest_updates
  FOR ALL
  USING (is_tps_staff())
  WITH CHECK (is_tps_staff());

DROP POLICY IF EXISTS feed_sources_staff_all ON feed_sources;
CREATE POLICY feed_sources_staff_all ON feed_sources
  FOR ALL
  USING (is_tps_staff())
  WITH CHECK (is_tps_staff());
