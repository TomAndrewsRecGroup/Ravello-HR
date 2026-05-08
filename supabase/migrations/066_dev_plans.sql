-- ═══════════════════════════════════════════════════════════
-- Phase 66: Development Plans (Programmes module)
--
-- Adds a Development Plans feature for athletes (and, more
-- broadly, any client contact) sitting under the Programmes
-- sub-heading alongside Athletes To Industry. Free module —
-- no feature flag gate.
--
-- Tables:
--   dev_plans              one plan per athlete (or company)
--   dev_plan_milestones    ordered milestones per plan
--   dev_plan_templates     reusable plan templates (admin-shared)
--   brand_profiles         per-company brand snapshot used to style plans
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE dev_plan_status AS ENUM ('draft', 'active', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dev_plan_milestone_status AS ENUM ('pending', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── dev_plans ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dev_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  athlete_id    UUID REFERENCES athletes(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  summary       TEXT,
  status        dev_plan_status NOT NULL DEFAULT 'draft',
  brand_profile_id UUID,
  assigned_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_plans_company_idx ON dev_plans(company_id);
CREATE INDEX IF NOT EXISTS dev_plans_athlete_idx ON dev_plans(athlete_id);
CREATE INDEX IF NOT EXISTS dev_plans_status_idx  ON dev_plans(status);

-- ── dev_plan_milestones ────────────────────────────────────
CREATE TABLE IF NOT EXISTS dev_plan_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES dev_plans(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    DATE,
  status      dev_plan_milestone_status NOT NULL DEFAULT 'pending',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_plan_milestones_plan_idx ON dev_plan_milestones(plan_id, sort_order);

-- ── dev_plan_templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS dev_plan_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  -- milestones JSONB shape: [{ title, description, due_offset_days, sort_order }]
  milestones   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── brand_profiles ─────────────────────────────────────────
-- Per-company brand snapshot used to style the plan (logo,
-- primary/secondary colours, font, source URL). Admin can
-- extract from a website URL (or override with a GitHub raw
-- CSS URL) and edit any field before save.
CREATE TABLE IF NOT EXISTS brand_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  source_url      TEXT,
  github_css_url  TEXT,
  logo_url        TEXT,
  primary_color   TEXT,
  secondary_color TEXT,
  accent_color    TEXT,
  font_family     TEXT,
  raw             JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_profiles_company_idx ON brand_profiles(company_id);

ALTER TABLE dev_plans
  DROP CONSTRAINT IF EXISTS dev_plans_brand_profile_fk;
ALTER TABLE dev_plans
  ADD  CONSTRAINT dev_plans_brand_profile_fk
       FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

-- ── updated_at triggers ────────────────────────────────────
CREATE OR REPLACE FUNCTION dev_plans_touch_updated() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dev_plans_touch ON dev_plans;
CREATE TRIGGER dev_plans_touch BEFORE UPDATE ON dev_plans
  FOR EACH ROW EXECUTE FUNCTION dev_plans_touch_updated();

DROP TRIGGER IF EXISTS dev_plan_milestones_touch ON dev_plan_milestones;
CREATE TRIGGER dev_plan_milestones_touch BEFORE UPDATE ON dev_plan_milestones
  FOR EACH ROW EXECUTE FUNCTION dev_plans_touch_updated();

DROP TRIGGER IF EXISTS dev_plan_templates_touch ON dev_plan_templates;
CREATE TRIGGER dev_plan_templates_touch BEFORE UPDATE ON dev_plan_templates
  FOR EACH ROW EXECUTE FUNCTION dev_plans_touch_updated();

DROP TRIGGER IF EXISTS brand_profiles_touch ON brand_profiles;
CREATE TRIGGER brand_profiles_touch BEFORE UPDATE ON brand_profiles
  FOR EACH ROW EXECUTE FUNCTION dev_plans_touch_updated();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE dev_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_plan_milestones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_plan_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles       ENABLE ROW LEVEL SECURITY;

-- Drop any prior versions for idempotency.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname FROM pg_policies
     WHERE tablename IN ('dev_plans','dev_plan_milestones','dev_plan_templates','brand_profiles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- dev_plans: TPS staff full; client users SELECT plans for their company.
CREATE POLICY dev_plans_staff_all ON dev_plans
  FOR ALL TO authenticated
  USING      (public.is_tps_staff())
  WITH CHECK (public.is_tps_staff());

CREATE POLICY dev_plans_client_select ON dev_plans
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND status IN ('active', 'completed')
  );

-- dev_plan_milestones: inherit access from parent plan.
CREATE POLICY dev_plan_milestones_staff_all ON dev_plan_milestones
  FOR ALL TO authenticated
  USING      (public.is_tps_staff())
  WITH CHECK (public.is_tps_staff());

CREATE POLICY dev_plan_milestones_client_select ON dev_plan_milestones
  FOR SELECT TO authenticated
  USING (
    plan_id IN (
      SELECT id FROM dev_plans
       WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
         AND status IN ('active', 'completed')
    )
  );

-- dev_plan_templates: TPS staff only (admin-shared library).
CREATE POLICY dev_plan_templates_staff_all ON dev_plan_templates
  FOR ALL TO authenticated
  USING      (public.is_tps_staff())
  WITH CHECK (public.is_tps_staff());

-- brand_profiles: TPS staff full; client users SELECT their own.
CREATE POLICY brand_profiles_staff_all ON brand_profiles
  FOR ALL TO authenticated
  USING      (public.is_tps_staff())
  WITH CHECK (public.is_tps_staff());

CREATE POLICY brand_profiles_client_select ON brand_profiles
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
