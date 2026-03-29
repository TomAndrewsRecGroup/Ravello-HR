-- ══════════════════════════════════════════════════════════════
--  Migration 013: Partner API Keys
--  Stores IvyLens ivl_ partner keys per company.
--  Used to call GET /api/partner/bd/leads on the IvyLens API.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'IvyLens Partner Key',
  key_value    TEXT NOT NULL,
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  created_by   UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_partner_api_keys_company ON partner_api_keys(company_id);

ALTER TABLE partner_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_partner_keys_select" ON partner_api_keys
  FOR SELECT USING (company_id = my_company_id() OR is_ravello_staff());

CREATE POLICY "client_partner_keys_insert" ON partner_api_keys
  FOR INSERT WITH CHECK (company_id = my_company_id());

CREATE POLICY "client_partner_keys_update" ON partner_api_keys
  FOR UPDATE USING (company_id = my_company_id() OR is_ravello_staff());

CREATE POLICY "client_partner_keys_delete" ON partner_api_keys
  FOR DELETE USING (company_id = my_company_id() OR is_ravello_staff());
