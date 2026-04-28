-- ═══════════════════════════════════════════════════════════
-- Training & Workshops module (Athletes To Industry channel)
--
-- Sits alongside `partners` in the same A2I channel. Where partners
-- offer paid roles, training providers offer courses or workshops
-- (free or paid) that athletes can register interest in. Same shape
-- as partners + athlete_partner_interests so the admin and portal
-- UIs can mirror the partners flow with a blue accent instead of
-- purple.
--
-- Feature flag: reuses `companies.feature_flags.athletes_to_industry`
-- (the whole Athletes To Industry channel turns on together).
-- ═══════════════════════════════════════════════════════════

-- ── Training providers: platform-wide, admin-managed ────
CREATE TABLE IF NOT EXISTS training_providers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  locations     TEXT,
  category      TEXT,                                  -- "Workshop", "Certification", "Coaching"…
  website       TEXT,
  -- offerings JSONB: [{ id, title, description?, location?, format?, url? }]
  -- format = "course" | "workshop" | "webinar" (free text, not enforced)
  offerings     JSONB NOT NULL DEFAULT '[]'::jsonb,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_training_providers_active_created
  ON training_providers (active, created_at DESC);

-- ── Interest matches: athlete ↔ training offering ────────
CREATE TABLE IF NOT EXISTS athlete_training_interests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id   UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  provider_id  UUID NOT NULL REFERENCES training_providers(id) ON DELETE CASCADE,
  offering_id  UUID,                                   -- NULL = general interest
  status       TEXT NOT NULL DEFAULT 'interested'
                 CHECK (status IN ('interested','enrolled','completed','passed')),
  notes        TEXT,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, provider_id, offering_id)
);
CREATE INDEX IF NOT EXISTS idx_training_interests_athlete
  ON athlete_training_interests (athlete_id);
CREATE INDEX IF NOT EXISTS idx_training_interests_provider
  ON athlete_training_interests (provider_id);
CREATE INDEX IF NOT EXISTS idx_training_interests_offering
  ON athlete_training_interests (offering_id);

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE training_providers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_training_interests  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_providers_auth_read   ON training_providers;
DROP POLICY IF EXISTS training_providers_staff_write ON training_providers;
DROP POLICY IF EXISTS training_interests_client_rw   ON athlete_training_interests;
DROP POLICY IF EXISTS training_interests_staff_rw    ON athlete_training_interests;

-- All authenticated users see active providers; staff see paused too.
CREATE POLICY training_providers_auth_read ON training_providers FOR SELECT
  TO authenticated USING (active = true OR is_tps_staff());
CREATE POLICY training_providers_staff_write ON training_providers FOR ALL
  USING (is_tps_staff()) WITH CHECK (is_tps_staff());

-- Clients can read interests scoped to their athletes; staff full RW.
-- Mirrors athlete_partner_interests.
CREATE POLICY training_interests_client_rw ON athlete_training_interests FOR ALL
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
CREATE POLICY training_interests_staff_rw ON athlete_training_interests FOR ALL
  USING (is_tps_staff()) WITH CHECK (is_tps_staff());
