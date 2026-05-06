-- ═══════════════════════════════════════════════════════════
-- Phase 60: Latest Updates auto-prune helper
--
-- Two pieces:
--   1. prune_latest_updates() — SECURITY DEFINER function that
--      deletes published items older than the cutoff (default
--      1 year). Returns the count deleted so the cron route can
--      log / surface it.
--   2. A new index on (status, published_at) so the prune scan
--      stays cheap as the table grows.
--
-- The function is invoked from the daily cron at
-- admin/api/cron/prune-latest-updates so we don't need pg_cron.
--
-- Manual / featured items are kept regardless of age — operators
-- pin those deliberately and shouldn't lose them to the prune.
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_latest_updates_status_published
  ON latest_updates (status, published_at);

CREATE OR REPLACE FUNCTION prune_latest_updates(p_max_age_days INT DEFAULT 365)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF p_max_age_days < 30 THEN
    RAISE EXCEPTION 'prune_latest_updates: refusing to prune below 30 days (got %)', p_max_age_days;
  END IF;

  WITH deleted AS (
    DELETE FROM latest_updates
     WHERE source_type IN ('rss', 'html')              -- never auto-prune manual / pinned items
       AND featured = false
       AND COALESCE(published_at, created_at) < NOW() - (p_max_age_days || ' days')::interval
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

-- Lock down: only service-role / staff should call this.
REVOKE ALL ON FUNCTION prune_latest_updates(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION prune_latest_updates(INT) TO service_role;
