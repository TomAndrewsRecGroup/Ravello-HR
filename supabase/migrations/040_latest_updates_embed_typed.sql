-- ═══════════════════════════════════════════════════════════
-- Phase 45: Typed embed refs instead of free-form HTML
--
-- Replaces latest_updates.embed_html (a staff-writable blob that
-- got rendered through dangerouslySetInnerHTML) with two narrow
-- columns:
--   embed_kind  : 'linkedin'              -- only value today
--   embed_ref   : the activity ID, not an iframe
--
-- The public page now builds the iframe from a known-safe
-- template around embed_ref. No HTML ever goes through the DB.
--
-- embed_html stays for backfill but nothing reads from it; it
-- can be dropped in a later migration once all code paths have
-- been verified in production.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE latest_updates
  ADD COLUMN IF NOT EXISTS embed_kind TEXT CHECK (embed_kind IN ('linkedin')),
  ADD COLUMN IF NOT EXISTS embed_ref  TEXT;

-- Backfill: extract the LinkedIn activity ID out of any existing
-- embed_html iframe. Phase-1 buildLinkedInEmbed produced iframes
-- of the form: src="https://www.linkedin.com/embed/feed/update/urn:li:activity:NNNN"
UPDATE latest_updates
   SET embed_kind = 'linkedin',
       embed_ref  = substring(embed_html FROM 'urn:li:activity:([0-9]+)')
 WHERE render_mode = 'embed'
   AND embed_html IS NOT NULL
   AND embed_html ~ 'urn:li:activity:[0-9]+'
   AND embed_ref IS NULL;

-- Any leftover embed rows with no extractable ID get downgraded
-- to card mode so the public page has something valid to render.
UPDATE latest_updates
   SET render_mode = 'card',
       embed_html = NULL
 WHERE render_mode = 'embed'
   AND embed_ref IS NULL;
