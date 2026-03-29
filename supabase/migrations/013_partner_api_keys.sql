-- ══════════════════════════════════════════════════════════════
--  Migration 013: Partner API Keys
--  Allows admin to create API keys for partner integrations
--  (e.g. IvyLens BD pipeline, role analysis, assessments)
-- ══════════════════════════════════════════════════════════════

-- ── Partner API Keys ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,                  -- human-readable name, e.g. "IvyLens Production"
  key_hash     TEXT NOT NULL,                  -- SHA-256 hash of the ivl_ prefixed key
  key_prefix   TEXT NOT NULL,                  -- first 8 chars for display, e.g. "ivl_a3f8"
  permissions  TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {'bd_pipeline','role_analyze','company_lens'}
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_partner_api_keys_hash   ON partner_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_active ON partner_api_keys(is_active);

-- RLS — admin only
ALTER TABLE partner_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ravello_partner_api_keys" ON partner_api_keys
  FOR ALL USING (is_ravello_staff());

-- ── BD Leads View ────────────────────────────────────────────
-- Materialises the leads format that partners pull via the API:
-- Each lead = { company_name, company_location, roles[], sent_at }

CREATE OR REPLACE VIEW bd_leads_view AS
SELECT
  bc.id            AS company_id,
  bc.company_name,
  bc.notes         AS company_location,
  bc.status,
  bc.last_seen_at  AS sent_at,
  COALESCE(
    json_agg(
      json_build_object(
        'role_title',    r.role_title,
        'salary_text',   r.salary_text,
        'location',      r.location,
        'working_model', r.working_model,
        'source_board',  r.source_board,
        'date_posted',   r.date_posted
      )
    ) FILTER (WHERE r.id IS NOT NULL),
    '[]'::json
  ) AS roles
FROM bd_companies bc
LEFT JOIN bd_scanned_roles r ON r.company_id = bc.id AND r.still_active = TRUE
WHERE bc.status IN ('prospect', 'contacted')
GROUP BY bc.id, bc.company_name, bc.notes, bc.status, bc.last_seen_at
ORDER BY bc.last_seen_at DESC;
