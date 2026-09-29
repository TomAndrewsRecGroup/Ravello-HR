-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 11: emergency planning (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- `emergency_plans` reuses `hs_documents`' own versioning discipline
-- (106) rather than the hs_documents TABLE itself: a plan needs
-- structure hs_documents was never built for — required roles and
-- linked equipment — so bolting those onto the generic document
-- library would have widened its purpose past "metadata for a file".
-- The DISCIPLINE is copied verbatim: a new version is a new ROW
-- (`emergency_plans_stamp`), never an edit; the old row flips to
-- 'superseded' via its own UPDATE, which fires the Safety Timeline
-- entry (`emergency_plans_event`, mirroring `hs_document_event`).
--
-- `emergency_plan_roles` links a plan to the Phase 3 authorisation
-- catalogue (e.g. "Fire Warden", "First Aider") with a minimum
-- headcount — never a duplicate roles/competency system: who currently
-- holds that authorisation is read live from `person_authorisations`
-- via the same tables Group 9's `person_holds_authorisation()` already
-- reads, not stored here.
--
-- `emergency_plan_equipment` links a plan to `hs_equipment` (e.g. fire
-- extinguishers, muster-point equipment, defibrillators) — a plain
-- linking table, no new equipment concept.
--
-- `emergency_drills` is insert-only, the register's own "a correction
-- is a new row" discipline (hs_register_completions/hs_audits). DRILL
-- FINDINGS ARE NEVER A SECOND TABLE: an `outcome` of 'issues_found' or
-- 'failed' raises exactly ONE row on the existing `actions` table (the
-- consuming rule, in `hsRules.ts`, the same shape `hs_check_failed`
-- already uses) — never a bespoke findings table, and never more than
-- one action per drill (a 20-point drill report raising 20 separate
-- actions would be the same notification-storm mistake Phase 4's own
-- on-site-audit engine (110) already avoided by design).
--
-- RLS on every new table here is staff-write / client-read-only, the
-- exact `hs_activities`/`hs_register_completions` shape: nothing about
-- emergency planning is self-certified by a client, matching this
-- codebase's standing H&S posture since Phase 1b.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.emergency_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id        uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  plan_type      text NOT NULL CHECK (plan_type IN ('fire', 'evacuation', 'medical', 'chemical_spill', 'severe_weather', 'security', 'other')),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description    text CHECK (length(description) <= 4000),
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  review_due_at  date,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  supersedes_id  uuid REFERENCES public.emergency_plans(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emergency_plans_company_idx ON public.emergency_plans (company_id, status);
CREATE INDEX IF NOT EXISTS emergency_plans_review_idx  ON public.emergency_plans (review_due_at) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.emergency_plans_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'emergency_plans', NEW.supersedes_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.emergency_plans_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS emergency_plans_stamp ON public.emergency_plans;
CREATE TRIGGER emergency_plans_stamp BEFORE INSERT OR UPDATE ON public.emergency_plans
  FOR EACH ROW EXECUTE FUNCTION public.emergency_plans_stamp();

-- Safety Timeline entry on add/supersede, mirroring hs_document_event().
CREATE OR REPLACE FUNCTION public.emergency_plans_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'emergency_plan', NEW.id, 'plan_added',
      'Emergency plan added: ' || NEW.title || ' (v' || NEW.version || ')');
  ELSIF NEW.status = 'superseded' AND OLD.status = 'active' THEN
    PERFORM public.hs_log(NEW.company_id, 'emergency_plan', NEW.id, 'plan_superseded',
      'Emergency plan superseded: ' || NEW.title);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.emergency_plans_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS emergency_plans_hs_event ON public.emergency_plans;
CREATE TRIGGER emergency_plans_hs_event AFTER INSERT OR UPDATE ON public.emergency_plans
  FOR EACH ROW EXECUTE FUNCTION public.emergency_plans_event();

DROP TRIGGER IF EXISTS emergency_plans_platform_event ON public.emergency_plans;
CREATE TRIGGER emergency_plans_platform_event AFTER INSERT OR UPDATE ON public.emergency_plans
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('plan_type', 'title', 'version', 'review_due_at', 'status');

DROP TRIGGER IF EXISTS emergency_plans_audit ON public.emergency_plans;
CREATE TRIGGER emergency_plans_audit AFTER INSERT OR UPDATE OR DELETE ON public.emergency_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('emergency_plan', 'company_id', 'plan_type', 'title', 'version', 'status');

SELECT public.apply_write_guard('public.emergency_plans');

ALTER TABLE public.emergency_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emergency_plans_staff_all   ON public.emergency_plans;
DROP POLICY IF EXISTS emergency_plans_client_read ON public.emergency_plans;
CREATE POLICY emergency_plans_staff_all ON public.emergency_plans FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY emergency_plans_client_read ON public.emergency_plans FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- ── required roles: links to the Phase 3 authorisation catalogue,
--    never a duplicate competency system ───────────────────────────

CREATE TABLE IF NOT EXISTS public.emergency_plan_roles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                uuid NOT NULL REFERENCES public.emergency_plans(id) ON DELETE CASCADE,
  authorisation_type_id  uuid NOT NULL REFERENCES public.authorisation_types(id) ON DELETE RESTRICT,
  min_count              integer NOT NULL DEFAULT 1 CHECK (min_count >= 1),
  notes                  text CHECK (length(notes) <= 1000),
  UNIQUE (plan_id, authorisation_type_id)
);

CREATE OR REPLACE FUNCTION public.emergency_plan_roles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE plan_company uuid;
BEGIN
  SELECT company_id INTO plan_company FROM public.emergency_plans WHERE id = NEW.plan_id;
  IF plan_company IS NULL THEN
    RAISE EXCEPTION 'Emergency plan not found' USING ERRCODE = '23503';
  END IF;
  PERFORM public.assert_same_org(plan_company, 'authorisation_types', NEW.authorisation_type_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.emergency_plan_roles_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS emergency_plan_roles_guard ON public.emergency_plan_roles;
CREATE TRIGGER emergency_plan_roles_guard BEFORE INSERT OR UPDATE ON public.emergency_plan_roles
  FOR EACH ROW EXECUTE FUNCTION public.emergency_plan_roles_guard();

SELECT public.apply_write_guard('public.emergency_plan_roles');

ALTER TABLE public.emergency_plan_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emergency_plan_roles_staff_all   ON public.emergency_plan_roles;
DROP POLICY IF EXISTS emergency_plan_roles_client_read ON public.emergency_plan_roles;
CREATE POLICY emergency_plan_roles_staff_all ON public.emergency_plan_roles FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY emergency_plan_roles_client_read ON public.emergency_plan_roles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.emergency_plans p WHERE p.id = plan_id AND p.company_id = (SELECT public.my_company_id())));

-- ── linked equipment (fire extinguishers, muster-point kit,
--    defibrillators, ...) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.emergency_plan_equipment (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id  uuid NOT NULL REFERENCES public.emergency_plans(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.hs_equipment(id) ON DELETE RESTRICT,
  notes    text CHECK (length(notes) <= 1000),
  UNIQUE (plan_id, asset_id)
);

CREATE OR REPLACE FUNCTION public.emergency_plan_equipment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE plan_company uuid;
BEGIN
  SELECT company_id INTO plan_company FROM public.emergency_plans WHERE id = NEW.plan_id;
  IF plan_company IS NULL THEN
    RAISE EXCEPTION 'Emergency plan not found' USING ERRCODE = '23503';
  END IF;
  PERFORM public.assert_same_org(plan_company, 'hs_equipment', NEW.asset_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.emergency_plan_equipment_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS emergency_plan_equipment_guard ON public.emergency_plan_equipment;
CREATE TRIGGER emergency_plan_equipment_guard BEFORE INSERT OR UPDATE ON public.emergency_plan_equipment
  FOR EACH ROW EXECUTE FUNCTION public.emergency_plan_equipment_guard();

SELECT public.apply_write_guard('public.emergency_plan_equipment');

ALTER TABLE public.emergency_plan_equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emergency_plan_equipment_staff_all   ON public.emergency_plan_equipment;
DROP POLICY IF EXISTS emergency_plan_equipment_client_read ON public.emergency_plan_equipment;
CREATE POLICY emergency_plan_equipment_staff_all ON public.emergency_plan_equipment FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY emergency_plan_equipment_client_read ON public.emergency_plan_equipment FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.emergency_plans p WHERE p.id = plan_id AND p.company_id = (SELECT public.my_company_id())));

-- ── drills: insert-only, one row per exercise. Findings are NEVER a
--    second table — an outcome of 'issues_found'/'failed' raises ONE
--    row on the existing `actions` table, from the consuming rule ────

CREATE TABLE IF NOT EXISTS public.emergency_drills (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id                 uuid NOT NULL REFERENCES public.emergency_plans(id) ON DELETE RESTRICT,
  site_id                 uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  drill_date              date NOT NULL CHECK (drill_date <= current_date + 1),
  conducted_by            uuid REFERENCES public.people(id) ON DELETE SET NULL,
  evacuation_time_seconds integer CHECK (evacuation_time_seconds IS NULL OR evacuation_time_seconds >= 0),
  outcome                 text NOT NULL CHECK (outcome IN ('successful', 'issues_found', 'failed')),
  findings                text CHECK (length(findings) <= 4000),
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emergency_drills_company_idx ON public.emergency_drills (company_id, drill_date);
CREATE INDEX IF NOT EXISTS emergency_drills_plan_idx    ON public.emergency_drills (plan_id);

CREATE OR REPLACE FUNCTION public.emergency_drills_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.created_by := auth.uid();
  PERFORM public.assert_same_org(NEW.company_id, 'emergency_plans', NEW.plan_id);
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.conducted_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.emergency_drills_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS emergency_drills_guard ON public.emergency_drills;
CREATE TRIGGER emergency_drills_guard BEFORE INSERT ON public.emergency_drills
  FOR EACH ROW EXECUTE FUNCTION public.emergency_drills_guard();

-- One Safety Timeline line per drill (never per finding).
CREATE OR REPLACE FUNCTION public.emergency_drills_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.hs_log(NEW.company_id, 'emergency_drill', NEW.id, 'drill_conducted',
    'Emergency drill (' || NEW.outcome || ') — ' || NEW.drill_date::text);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.emergency_drills_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS emergency_drills_hs_event ON public.emergency_drills;
CREATE TRIGGER emergency_drills_hs_event AFTER INSERT ON public.emergency_drills
  FOR EACH ROW EXECUTE FUNCTION public.emergency_drills_event();

DROP TRIGGER IF EXISTS emergency_drills_platform_event ON public.emergency_drills;
CREATE TRIGGER emergency_drills_platform_event AFTER INSERT ON public.emergency_drills
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('plan_id', 'site_id', 'drill_date', 'outcome', 'evacuation_time_seconds');

DROP TRIGGER IF EXISTS emergency_drills_audit ON public.emergency_drills;
CREATE TRIGGER emergency_drills_audit AFTER INSERT ON public.emergency_drills
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('emergency_drill', 'company_id', 'plan_id', 'site_id', 'drill_date', 'outcome');

SELECT public.apply_write_guard('public.emergency_drills');
-- Insert-only: a correction is a new drill row, the register's own
-- discipline (hs_register_completions/hs_audits) — never an edit to a
-- record of what was actually observed on the day.
REVOKE UPDATE, DELETE, TRUNCATE ON public.emergency_drills FROM PUBLIC, anon, authenticated;

ALTER TABLE public.emergency_drills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emergency_drills_staff_all   ON public.emergency_drills;
DROP POLICY IF EXISTS emergency_drills_client_read ON public.emergency_drills;
CREATE POLICY emergency_drills_staff_all ON public.emergency_drills FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY emergency_drills_client_read ON public.emergency_drills FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
