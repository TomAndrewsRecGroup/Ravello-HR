-- ═══════════════════════════════════════════════════════════
-- BD Roles: pay_type column for IvyLens-enriched salaries
--
-- IvyLens is starting to push a `pay_type` field alongside
-- salary_min / salary_max for every role (Annual, Hourly, Daily,
-- etc.). Their UPDATE writes the enrichment into
-- partner_bd_leads.roles[] JSONB; for direct rows in our local
-- bd_scanned_roles table we need a column to land it in too.
--
-- Existing salary_text (raw scraped string) is left in place — it
-- still serves as the human-readable display fallback when min/max
-- are absent. pay_type is purely additive: nullable, no default,
-- existing rows are unaffected.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE bd_scanned_roles
  ADD COLUMN IF NOT EXISTS pay_type TEXT;

COMMENT ON COLUMN bd_scanned_roles.pay_type IS
  'Pay frequency from the source listing — e.g. Annual, Hourly, Daily, Contract. Free text; not enforced.';
