-- ═══════════════════════════════════════════════════════════════════
-- 114: Equipment inspection evidence trail (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 5 (112) shipped hs_equipment register-shaped like
-- compliance_items — a mutable next_inspection_due a session updates
-- directly — and its own CLAUDE.md entry called out the gap this
-- closes: "there is no separate 'was it inspected' evidence trail."
-- An inspection was a bare date on the equipment row with no history,
-- no certificate, no photo, and no record of what a FAILED inspection
-- actually found.
--
-- hs_equipment_inspections mirrors hs_register_completions' shape and
-- posture exactly: insert-only (a correction is a new row), company_id
-- filled from the parent (never trusted from the caller, same as
-- hs_completion_fill()/hs_audit_response_fill()), and a roll-forward
-- trigger that only advances the parent's dates on a PASS — a FAILED
-- inspection is recorded and shown on the Timeline but never silently
-- advances next_inspection_due, the same X8 lesson hs_completion_roll()
-- already learned (CLAUDE.md, "a failed H&S check marks the item
-- in_review and never rolls the register forward").
--
-- The Timeline duty for "was this equipment inspected" moves ENTIRELY
-- to this new table's own trigger — hs_equipment's existing
-- 'inspected' branch (112) is removed from hs_event_equipment() so a
-- pass is never logged twice (once by the roll's column UPDATE, once
-- by the inspection row itself) and a fail is logged at all (the old
-- branch only fired on last_inspected_on actually changing, which a
-- fail deliberately does not do).
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.hs_equipment_inspections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id     uuid NOT NULL REFERENCES public.hs_equipment(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inspected_on     date NOT NULL CHECK (inspected_on <= current_date + 1),
  outcome          text NOT NULL CHECK (outcome IN ('pass', 'fail')),
  next_due_on      date,
  notes            text CHECK (length(notes) <= 2000),
  recorded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind text NOT NULL DEFAULT 'system',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_equipment_inspections_equipment_idx ON public.hs_equipment_inspections (equipment_id, inspected_on DESC);

-- company_id from the parent equipment, never the caller — the same
-- discipline hs_audit_response_fill() (110) and
-- hs_activity_attendee_fill() (112) already use.
CREATE OR REPLACE FUNCTION public.hs_equipment_inspection_fill()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE eq record;
BEGIN
  SELECT company_id INTO eq FROM public.hs_equipment WHERE id = NEW.equipment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Equipment not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id       := eq.company_id;
  NEW.recorded_by      := auth.uid();
  NEW.recorded_by_kind := public.hs_actor_kind();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hs_equipment_inspection_fill ON public.hs_equipment_inspections;
CREATE TRIGGER hs_equipment_inspection_fill
  BEFORE INSERT ON public.hs_equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION public.hs_equipment_inspection_fill();
REVOKE ALL ON FUNCTION public.hs_equipment_inspection_fill() FROM PUBLIC, anon, authenticated;

-- AFTER INSERT: roll the equipment forward, only on a PASS and only if
-- this is the newest inspection. A fail is recorded and timelined but
-- moves nothing — see the header comment.
CREATE OR REPLACE FUNCTION public.hs_equipment_inspection_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.outcome = 'fail' THEN RETURN NULL; END IF;
  UPDATE public.hs_equipment eq
     SET last_inspected_on   = NEW.inspected_on,
         next_inspection_due = coalesce(NEW.next_due_on, eq.next_inspection_due),
         updated_at          = now()
   WHERE eq.id = NEW.equipment_id
     AND (eq.last_inspected_on IS NULL OR eq.last_inspected_on <= NEW.inspected_on);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hs_equipment_inspection_roll ON public.hs_equipment_inspections;
CREATE TRIGGER hs_equipment_inspection_roll
  AFTER INSERT ON public.hs_equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION public.hs_equipment_inspection_roll();
REVOKE ALL ON FUNCTION public.hs_equipment_inspection_roll() FROM PUBLIC, anon, authenticated;

-- ── evidence: a certificate or photo for a specific inspection ───────
-- Shares the 'register' scope — equipment maintenance is part of the
-- H&S register domain, and scope no longer gates anything RLS-wise
-- (105 removed the provider grants it once decided), so this is purely
-- a CHECK-satisfying label, not a new permission dimension. Adding a
-- distinct 'equipment' scope to HS_SCOPES would also disturb the
-- vocab test's pin against 094's now-historical (pre-105) scopes CHECK
-- for no real benefit.
CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_entity
           WHEN 'register_item'       THEN 'register'
           WHEN 'register_completion' THEN 'register'
           WHEN 'activity'            THEN 'register'
           WHEN 'site'                THEN 'register'
           WHEN 'equipment_inspection' THEN 'register'
           WHEN 'document'            THEN 'documents'
           WHEN 'training'            THEN 'training'
           WHEN 'audit'               THEN 'audits'
           WHEN 'audit_response'      THEN 'audits'
           WHEN 'incident'            THEN 'incidents'
           ELSE NULL
         END;
$$;

ALTER TABLE public.hs_equipment_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hs_equipment_inspections_staff_all ON public.hs_equipment_inspections;
CREATE POLICY hs_equipment_inspections_staff_all ON public.hs_equipment_inspections FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_equipment_inspections_client_read ON public.hs_equipment_inspections;
CREATE POLICY hs_equipment_inspections_client_read ON public.hs_equipment_inspections FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- Insert-only, same as hs_register_completions/hs_activities/hs_files:
-- a correction is a new row.
REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_equipment_inspections FROM PUBLIC, anon, authenticated;

-- ── Safety Timeline: this table is now the sole source of "was this
-- equipment inspected", pass or fail ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.hs_event_equipment_inspection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE eq record;
BEGIN
  SELECT name INTO eq FROM public.hs_equipment WHERE id = NEW.equipment_id;
  PERFORM public.hs_log(NEW.company_id, 'equipment_inspection', NEW.id,
    CASE WHEN NEW.outcome = 'fail' THEN 'inspection_failed' ELSE 'inspected' END,
    coalesce(eq.name, 'Equipment') || ' inspected ' || to_char(NEW.inspected_on, 'DD Mon YYYY')
    || CASE WHEN NEW.outcome = 'fail' THEN ' — FAILED' ELSE '' END);
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_equipment_inspections_hs_event ON public.hs_equipment_inspections;
CREATE TRIGGER hs_equipment_inspections_hs_event
  AFTER INSERT ON public.hs_equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_equipment_inspection();
REVOKE ALL ON FUNCTION public.hs_event_equipment_inspection() FROM PUBLIC, anon, authenticated;

-- hs_equipment's own trigger loses the 'inspected' branch: that duty
-- now belongs entirely to hs_equipment_inspections' own trigger above
-- (a pass no longer logs twice; a fail — which deliberately never
-- changes last_inspected_on — now logs at all). 'added' and
-- 'status_<x>' are unchanged.
CREATE OR REPLACE FUNCTION public.hs_event_equipment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'equipment', NEW.id, 'added', 'Equipment added: ' || NEW.name);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'equipment', NEW.id, 'status_' || NEW.status,
      NEW.name || ': ' || replace(NEW.status, '_', ' '));
  END IF;
  RETURN NULL;
END; $$;
