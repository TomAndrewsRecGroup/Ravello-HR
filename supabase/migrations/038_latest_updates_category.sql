-- ═══════════════════════════════════════════════════════════
-- Phase 43: Latest Updates category + filter indexes
--
-- Lets the public feed filter by category without joining
-- feed_sources. Category on a latest_updates row defaults to
-- the parent feed_source category on insert; it may be
-- overridden per-entry (useful for manual entries which have
-- no feed_source_id).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE latest_updates
  ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE latest_updates u
   SET category = fs.category
  FROM feed_sources fs
 WHERE u.feed_source_id = fs.id
   AND u.category IS NULL
   AND fs.category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_latest_updates_category
  ON latest_updates (category)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_latest_updates_feed_source_published
  ON latest_updates (feed_source_id, published_at DESC NULLS LAST)
  WHERE status = 'published';
