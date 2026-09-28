-- ═══════════════════════════════════════════════════════════════════
-- 129: trigram indexes for the safety search (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- search_records() (126) and the register search boxes match with
-- ILIKE '%term%'. A leading wildcard cannot use a btree, so without
-- these every search is a sequential scan of each register — fine at
-- today's sizes (≤1 ms per branch, measured 2026-09-28), linear at the
-- spec's QA volumes (10k hazards, 5k incidents, 50k actions). GIN
-- trigram indexes keep those searches index-backed. pg_trgm is already
-- installed in the `extensions` schema.
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS hazards_title_trgm_idx            ON public.hazards            USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hs_incidents_title_trgm_idx       ON public.hs_incidents       USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hs_incidents_number_trgm_idx      ON public.hs_incidents       USING gin (incident_number extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS actions_title_trgm_idx            ON public.actions            USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS risk_assessments_title_trgm_idx   ON public.risk_assessments   USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS method_statements_title_trgm_idx  ON public.method_statements  USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS coshh_assessments_title_trgm_idx  ON public.coshh_assessments  USING gin (title extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS substances_product_trgm_idx       ON public.substances         USING gin (product_name extensions.gin_trgm_ops);
