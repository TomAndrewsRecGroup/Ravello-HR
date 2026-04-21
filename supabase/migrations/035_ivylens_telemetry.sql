-- ═══════════════════════════════════════════════════════════
-- Phase 42 — IvyLens telemetry for the Health Status dashboard
-- ═══════════════════════════════════════════════════════════
-- Records every outbound IvyLens call so we can show real rate-limit
-- usage and error trends, rather than estimating from cache freshness.
-- Rows are written from admin/src/lib/ivylens.ts on every request.
-- Retention: truncate rows older than 7 days via a periodic cron (not
-- yet scheduled — 1000 calls/day × 7 days ≈ 7k rows, trivial to keep).

CREATE TABLE IF NOT EXISTS ivylens_api_calls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  endpoint    TEXT NOT NULL,               -- e.g. /bd/leads, /roles/analyze
  method      TEXT NOT NULL DEFAULT 'GET',
  status      INTEGER NOT NULL,            -- HTTP status, 0 for network error
  duration_ms INTEGER NOT NULL,
  rate_limited BOOLEAN NOT NULL DEFAULT false,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ivylens_calls_called_at ON ivylens_api_calls (called_at DESC);
CREATE INDEX IF NOT EXISTS idx_ivylens_calls_endpoint  ON ivylens_api_calls (endpoint, called_at DESC);

ALTER TABLE ivylens_api_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ivylens_api_calls_staff_read  ON ivylens_api_calls;
DROP POLICY IF EXISTS ivylens_api_calls_staff_write ON ivylens_api_calls;

CREATE POLICY ivylens_api_calls_staff_read
  ON ivylens_api_calls FOR SELECT
  USING (is_tps_staff());

CREATE POLICY ivylens_api_calls_staff_write
  ON ivylens_api_calls FOR ALL
  USING (is_tps_staff())
  WITH CHECK (is_tps_staff());
