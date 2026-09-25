-- ═══════════════════════════════════════════════════════════════════
-- 112: Health & Safety Phase 5 — incidents/RIDDOR, toolbox talks,
--      equipment register (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════
--
-- Four things in one migration because three of them are small
-- extensions of existing H&S infrastructure, not new subsystems:
--
--   * INCIDENTS is a new table, mutable like the register (an
--     investigation is updated over time, unlike an audit or a
--     completion) — staff record it, the client reads it (this is
--     THEIR legal RIDDOR record-keeping duty; Core OS 360 maintains it
--     on their behalf, so client visibility is the point, not a risk).
--   * TOOLBOX TALKS is NOT a new table for the talk itself — it is
--     'toolbox_talk' added to hs_activities.activity_type (095 already
--     has 'meeting'; a toolbox talk is close enough in shape that a
--     second near-identical table would just be the same Timeline
--     entry logic copied). What toolbox talks need that hs_activities
--     never had is an ATTENDEE list, so hs_activity_attendees is the
--     one genuinely new table here.
--   * EQUIPMENT REGISTER is a new table, register-shaped like
--     compliance_items (a mutable next_inspection_due a session
--     updates directly) rather than completion-shaped like
--     hs_register_completions (there is no separate "was it inspected"
--     evidence trail here — MVP scope, a real gap noted in CLAUDE.md).
--   * KPIs is not a table at all — lib/hs/kpis.ts computes them from
--     the rows above at read time, the same way lib/health/scoring.ts
--     computes a client health score from existing rows.
--
-- Idempotent. Safe to re-run.

-- ── incidents ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_incidents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id             uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  incident_type       text NOT NULL CHECK (incident_type IN (
                        'injury', 'near_miss', 'dangerous_occurrence', 'disease', 'property_damage', 'other')),
  occurred_on         date NOT NULL CHECK (occurred_on <= current_date + 1),
  injured_person_name text CHECK (length(injured_person_name) <= 200),
  description         text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  severity            text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'significant', 'major', 'fatal')),
  riddor_reportable   boolean NOT NULL DEFAULT false,
  riddor_reported_on  date,
  immediate_action    text CHECK (length(immediate_action) <= 2000),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'closed')),
  recorded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind    text NOT NULL DEFAULT 'system',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_incidents_company_idx ON public.hs_incidents (company_id, occurred_on DESC);

DROP TRIGGER IF EXISTS hs_incidents_author ON public.hs_incidents;
CREATE TRIGGER hs_incidents_author
  BEFORE INSERT ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.hs_stamp_author();

CREATE OR REPLACE FUNCTION public.hs_incidents_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS hs_incidents_touch ON public.hs_incidents;
CREATE TRIGGER hs_incidents_touch
  BEFORE UPDATE ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.hs_incidents_touch();
REVOKE ALL ON FUNCTION public.hs_incidents_touch() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hs_event_incident()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'incident', NEW.id, 'reported',
      initcap(replace(NEW.incident_type, '_', ' ')) || ' reported: ' || left(NEW.description, 200)
      || CASE WHEN NEW.riddor_reportable THEN ' (RIDDOR reportable)' ELSE '' END);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'incident', NEW.id, 'status_' || NEW.status,
      initcap(replace(NEW.incident_type, '_', ' ')) || ': ' || replace(NEW.status, '_', ' '));
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_incidents_hs_event ON public.hs_incidents;
CREATE TRIGGER hs_incidents_hs_event
  AFTER INSERT OR UPDATE ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_incident();
REVOKE ALL ON FUNCTION public.hs_event_incident() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_incidents_platform_event ON public.hs_incidents;
CREATE TRIGGER hs_incidents_platform_event AFTER INSERT OR UPDATE ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('incident_type','severity','riddor_reportable','riddor_reported_on','status','site_id');

ALTER TABLE public.hs_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hs_incidents_staff_all ON public.hs_incidents;
CREATE POLICY hs_incidents_staff_all ON public.hs_incidents FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_incidents_client_read ON public.hs_incidents;
CREATE POLICY hs_incidents_client_read ON public.hs_incidents FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- ── equipment register ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_equipment (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id              uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  category             text CHECK (category IS NULL OR length(category) <= 100),
  serial_number        text CHECK (serial_number IS NULL OR length(serial_number) <= 100),
  status               text NOT NULL DEFAULT 'in_service' CHECK (status IN ('in_service', 'out_of_service', 'decommissioned')),
  last_inspected_on    date,
  next_inspection_due  date,
  notes                text CHECK (length(notes) <= 2000),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_equipment_company_idx ON public.hs_equipment (company_id);
CREATE INDEX IF NOT EXISTS hs_equipment_due_idx ON public.hs_equipment (next_inspection_due) WHERE next_inspection_due IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hs_equipment_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS hs_equipment_touch ON public.hs_equipment;
CREATE TRIGGER hs_equipment_touch
  BEFORE UPDATE ON public.hs_equipment
  FOR EACH ROW EXECUTE FUNCTION public.hs_equipment_touch();
REVOKE ALL ON FUNCTION public.hs_equipment_touch() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hs_event_equipment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'equipment', NEW.id, 'added', 'Equipment added: ' || NEW.name);
  ELSIF TG_OP = 'UPDATE' AND NEW.last_inspected_on IS DISTINCT FROM OLD.last_inspected_on AND NEW.last_inspected_on IS NOT NULL THEN
    PERFORM public.hs_log(NEW.company_id, 'equipment', NEW.id, 'inspected',
      NEW.name || ' inspected ' || to_char(NEW.last_inspected_on, 'DD Mon YYYY'));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'equipment', NEW.id, 'status_' || NEW.status,
      NEW.name || ': ' || replace(NEW.status, '_', ' '));
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_equipment_hs_event ON public.hs_equipment;
CREATE TRIGGER hs_equipment_hs_event
  AFTER INSERT OR UPDATE ON public.hs_equipment
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_equipment();
REVOKE ALL ON FUNCTION public.hs_event_equipment() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.hs_equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hs_equipment_staff_all ON public.hs_equipment;
CREATE POLICY hs_equipment_staff_all ON public.hs_equipment FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_equipment_client_read ON public.hs_equipment;
CREATE POLICY hs_equipment_client_read ON public.hs_equipment FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- ── toolbox talks: 'toolbox_talk' joins hs_activities.activity_type ──

ALTER TABLE public.hs_activities DROP CONSTRAINT IF EXISTS hs_activities_activity_type_check;
ALTER TABLE public.hs_activities ADD CONSTRAINT hs_activities_activity_type_check
  CHECK (activity_type IN (
    'site_visit', 'advice_call', 'fire_drill', 'ssip_submission',
    'inspection', 'meeting', 'toolbox_talk', 'other'));

CREATE TABLE IF NOT EXISTS public.hs_activity_attendees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  uuid NOT NULL REFERENCES public.hs_activities(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES public.employee_records(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, employee_id)
);
CREATE INDEX IF NOT EXISTS hs_activity_attendees_activity_idx ON public.hs_activity_attendees (activity_id);

-- company_id filled from the parent activity, never trusted from the
-- caller — the same discipline hs_audit_response_fill() (110) uses.
CREATE OR REPLACE FUNCTION public.hs_activity_attendee_fill()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE act record;
BEGIN
  SELECT company_id INTO act FROM public.hs_activities WHERE id = NEW.activity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := act.company_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hs_activity_attendee_fill ON public.hs_activity_attendees;
CREATE TRIGGER hs_activity_attendee_fill
  BEFORE INSERT ON public.hs_activity_attendees
  FOR EACH ROW EXECUTE FUNCTION public.hs_activity_attendee_fill();
REVOKE ALL ON FUNCTION public.hs_activity_attendee_fill() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.hs_activity_attendees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hs_activity_attendees_staff_all ON public.hs_activity_attendees;
CREATE POLICY hs_activity_attendees_staff_all ON public.hs_activity_attendees FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_activity_attendees_client_read ON public.hs_activity_attendees;
CREATE POLICY hs_activity_attendees_client_read ON public.hs_activity_attendees FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
