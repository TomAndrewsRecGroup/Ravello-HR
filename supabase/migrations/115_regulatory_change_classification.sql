-- Regulatory-change broadcast (2026-09-25).
--
-- The public "Latest Updates" feed (036/038) already ingests RSS/HTML
-- news items; nothing on the platform ever asked whether one of them is
-- a regulatory change that matters to a specific client's own register.
-- This adds three columns so a daily cron (lib/latestUpdates/classify.ts)
-- can ask Jev, and — when it is confident AND at least one client's
-- register actually holds that category — tell STAFF, never a client
-- directly. A human always decides whether and to whom to broadcast, via
-- the existing /broadcast page (Tom's decision: no auto-send to clients
-- from anything Jev classifies out of public text).
--
-- regulatory_classified_at is the "already processed" marker (NOT the
-- category), so the cron never reclassifies a row twice — including the
-- "this is not a regulatory change" case, which is recorded as category
-- 'none' rather than left NULL forever.
--
-- Verified live before writing this: latest_updates has 0 rows on the
-- live project today (`select count(*)`), so this CHECK cannot fail
-- against existing data either way — but the column is written the same
-- way regardless of row count: always NULL until the cron classifies a
-- row, and no writer existed before today to have gotten it wrong.
--
-- Vocabulary: COMPLIANCE_CATEGORIES (statusMaps.ts) + legacy
-- 'health_safety' + HS_REGISTER_CATEGORIES (lib/hs/vocab.ts) + 'none' —
-- the exact same union 109 already put on compliance_items.category,
-- plus the one extra 'none' value this table alone needs (a compliance
-- item is never created to record "not applicable"; this row is).
-- No parenthesised comments inside the value list itself —
-- regulatoryChangeSql.test.ts extracts it with a regex that stops at the
-- first ')', which a comment's own closing paren would trip early.

ALTER TABLE public.latest_updates
  ADD COLUMN IF NOT EXISTS regulatory_category      TEXT,
  ADD COLUMN IF NOT EXISTS regulatory_confidence     NUMERIC,
  ADD COLUMN IF NOT EXISTS regulatory_classified_at  TIMESTAMPTZ;

ALTER TABLE public.latest_updates
  ADD CONSTRAINT latest_updates_regulatory_category_check
  CHECK (regulatory_category IS NULL OR regulatory_category IN (
    'contract', 'policy', 'handbook', 'training', 'data', 'hr', 'other',
    'health_safety',
    'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
    'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
    'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other',
    'none'
  ));

-- The cron's own "what still needs classifying" query — published rows
-- with no classification yet, oldest-published-first is not needed
-- (it orders newest first, same as the admin list), so this only needs
-- to make the NULL filter cheap.
CREATE INDEX IF NOT EXISTS idx_latest_updates_unclassified
  ON public.latest_updates (published_at DESC NULLS LAST)
  WHERE status = 'published' AND regulatory_classified_at IS NULL;
