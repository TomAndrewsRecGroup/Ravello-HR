-- ═══════════════════════════════════════════════════════════
-- Phase 47: Drop legacy embed_html column
--
-- Migration 040 introduced typed embed_kind + embed_ref to
-- replace free-form HTML, but kept embed_html in place as a
-- safety net during the production cutover. All code paths are
-- now migrated; the column is dead weight.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE latest_updates DROP COLUMN IF EXISTS embed_html;
