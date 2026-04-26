-- ═══════════════════════════════════════════════════════════
-- Phase 42: Latest Updates HTML scrape config
--
-- feed_sources.scrape_config is a JSONB blob consumed only when
-- source_type='html'. Shape (all fields optional except item):
--   {
--     "list_url":    "https://www.cipd.org/knowledge/",
--     "item":        "article.card",
--     "title":       "h3",
--     "link":        "a",
--     "link_attr":   "href",
--     "image":       "img",
--     "image_attr":  "src",
--     "date":        "time",
--     "date_attr":   "datetime",
--     "description": "p.summary",
--     "base_url":    "https://www.cipd.org"
--   }
-- If list_url is omitted the scraper uses feed_url.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE feed_sources
  ADD COLUMN IF NOT EXISTS scrape_config JSONB;
