-- ═══════════════════════════════════════════════════════════
-- Phase 41 — IvyLens integration: response cache + role backlink
-- ═══════════════════════════════════════════════════════════
-- IvyLens enforces 1000 requests/day. A 24h TTL cache on shared
-- read endpoints (BD leads, market salary aggregates) keeps us
-- well inside that limit and protects against API latency spikes.
-- Cache rows are keyed by a free-form `cache_key` like
--   bd:leads
--   market:salary:software-engineer:london

CREATE TABLE IF NOT EXISTS ivylens_cache (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  TEXT NOT NULL UNIQUE,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ivylens_cache_key     ON ivylens_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_ivylens_cache_expires ON ivylens_cache (expires_at);

ALTER TABLE ivylens_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ivylens_cache_staff_read  ON ivylens_cache;
DROP POLICY IF EXISTS ivylens_cache_staff_write ON ivylens_cache;

CREATE POLICY ivylens_cache_staff_read
  ON ivylens_cache FOR SELECT
  USING (is_tps_staff());

CREATE POLICY ivylens_cache_staff_write
  ON ivylens_cache FOR ALL
  USING (is_tps_staff())
  WITH CHECK (is_tps_staff());

-- ── Requisition backlink to IvyLens role analysis ───────────
-- IvyLens returns a role_id on every /roles/analyze response.
-- Persist it so we can cross-reference later (re-fetch analytics,
-- link from admin detail to IvyLens dashboards, etc.).
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS ivylens_role_id UUID;

CREATE INDEX IF NOT EXISTS idx_requisitions_ivylens_role_id
  ON requisitions (ivylens_role_id)
  WHERE ivylens_role_id IS NOT NULL;
