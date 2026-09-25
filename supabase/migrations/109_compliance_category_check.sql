-- H&S Phase 1c follow-up (2026-09-25): compliance_items.category was a
-- free-text column with THREE independent, mutually-inconsistent vocab
-- lists feeding it (two generic-form hand-typed arrays, now unified onto
-- COMPLIANCE_CATEGORIES in statusMaps.ts, plus the H&S register's
-- HS_REGISTER_CATEGORIES). 'health_safety' is a fourth, legacy-only
-- value: no writer may produce it any more (both generic-form routes
-- refuse it, and a live H&S item is written with an 'hs_*' category),
-- but old rows recorded before 2026-09-25 may still hold it, so it stays
-- in the allowed set for reads/updates rather than being disallowed.
--
-- Verified live before writing this: compliance_items had 0 rows at the
-- time of this migration (checked via `select count(*)`), so this CHECK
-- cannot fail against existing data. Applied together with the deploy
-- that unifies every writer onto these two tuples, not held back for a
-- separate "after deploy" step — there is no gap for old code to write
-- through, because there is no data for old code to have written yet.

-- Values below: COMPLIANCE_CATEGORIES (statusMaps.ts, shared-dupe pair),
-- then the legacy-only 'health_safety', then HS_REGISTER_CATEGORIES
-- (lib/hs/vocab.ts, shared-dupe pair). No parenthesised comments inside
-- the list itself — statusMaps.test.ts extracts it with a regex that
-- stops at the first ')', which a comment's own closing paren would
-- trip before the list's real end.
ALTER TABLE public.compliance_items
  ADD CONSTRAINT compliance_items_category_check
  CHECK (category IN (
    'contract', 'policy', 'handbook', 'training', 'data', 'hr', 'other',
    'health_safety',
    'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
    'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
    'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other'
  ));
