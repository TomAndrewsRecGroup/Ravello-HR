-- ═══════════════════════════════════════════════════════════
-- Phase 46: Athletes To Industry channel
--
-- Per-client portal channel surfacing two lists:
--   - Athletes:  per-company roster (client + staff writable)
--   - Partners:  platform-wide pool (staff writable, all clients read)
-- Plus a junction table for "interest" matches between an
-- athlete and a specific partner role opportunity.
--
-- Feature flag: companies.feature_flags.athletes_to_industry
-- (no schema change — uses existing JSONB column).
-- ═══════════════════════════════════════════════════════════

-- ── Partners: platform-wide, admin-managed ───────────────
CREATE TABLE IF NOT EXISTS partners (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name       TEXT NOT NULL,
  locations          TEXT,
  industry           TEXT,
  website            TEXT,
  role_opportunities JSONB NOT NULL DEFAULT '[]'::jsonb,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partners_active_created
  ON partners (active, created_at DESC);

-- ── Athletes: per-company, client + admin writable ───────
CREATE TABLE IF NOT EXISTS athletes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT,
  sport         TEXT,
  previous_role TEXT,
  bio           TEXT,
  linkedin_url  TEXT,
  avatar_url    TEXT,
  cv_kind       TEXT CHECK (cv_kind IN ('file','text')),
  cv_url        TEXT,
  cv_filename   TEXT,
  cv_mime       TEXT,
  cv_text       TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_athletes_company_created
  ON athletes (company_id, created_at DESC);

-- ── Interest matches: junction athlete ↔ partner role ────
CREATE TABLE IF NOT EXISTS athlete_partner_interests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id           UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  partner_id           UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  role_opportunity_id  UUID,
  status               TEXT NOT NULL DEFAULT 'interested'
                         CHECK (status IN ('interested','introduced','passed')),
  notes                TEXT,
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, partner_id, role_opportunity_id)
);
CREATE INDEX IF NOT EXISTS idx_interests_athlete
  ON athlete_partner_interests (athlete_id);
CREATE INDEX IF NOT EXISTS idx_interests_partner
  ON athlete_partner_interests (partner_id);
CREATE INDEX IF NOT EXISTS idx_interests_role
  ON athlete_partner_interests (role_opportunity_id);

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE partners                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_partner_interests  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partners_auth_read     ON partners;
DROP POLICY IF EXISTS partners_staff_write   ON partners;
DROP POLICY IF EXISTS athletes_client_rw     ON athletes;
DROP POLICY IF EXISTS athletes_staff_rw      ON athletes;
DROP POLICY IF EXISTS interests_client_rw    ON athlete_partner_interests;
DROP POLICY IF EXISTS interests_staff_rw     ON athlete_partner_interests;

CREATE POLICY partners_auth_read ON partners FOR SELECT
  TO authenticated USING (active = true OR is_tps_staff());
CREATE POLICY partners_staff_write ON partners FOR ALL
  USING (is_tps_staff()) WITH CHECK (is_tps_staff());

CREATE POLICY athletes_client_rw ON athletes FOR ALL
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY athletes_staff_rw ON athletes FOR ALL
  USING (is_tps_staff()) WITH CHECK (is_tps_staff());

CREATE POLICY interests_client_rw ON athlete_partner_interests FOR ALL
  USING (
    athlete_id IN (
      SELECT a.id FROM athletes a
       WHERE a.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    athlete_id IN (
      SELECT a.id FROM athletes a
       WHERE a.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY interests_staff_rw ON athlete_partner_interests FOR ALL
  USING (is_tps_staff()) WITH CHECK (is_tps_staff());
