-- ═══════════════════════════════════════════════════════════════════
-- 185: consultancy_visits gets a database-level lifecycle guard
-- (Core-OS 360 Completion Programme, Phase 22, closes C4.13)
-- ═══════════════════════════════════════════════════════════════════
--
-- Migration 173's own header comment already flagged this, explicitly,
-- as debt: "173 deliberately left consultancy_visits.status with no
-- lifecycle GUARD trigger (unlike permits/isolations), so any
-- authorised session may move between any two listed values; the UI is
-- what keeps the sequence sane for now." The UI (VisitCaptureClient.tsx)
-- has never checked the CURRENT status before writing a new one — its
-- own `startVisit()`/`finishCapturing()` are plain
-- `.update({ status: ... }).eq('id', visitId)` calls, so a second click,
-- a stale tab, or a direct API/database write could move a visit
-- backwards (report_issued -> in_progress) or skip states entirely.
--
-- The shape is copied deliberately from the two sibling tables that
-- already have this discipline: permits_lifecycle_guard() (152) and
-- isolations_lifecycle_guard() (153) — a BEFORE UPDATE trigger, firing
-- only when status actually changes, one ELSIF per allowed
-- OLD -> NEW pair, RAISE EXCEPTION on anything else.
--
-- WHY these specific transitions, not a maximally-permissive graph:
-- read directly off the ONLY two real write paths that exist today
-- (grepped, not guessed) — VisitCaptureClient.tsx's start/finish
-- buttons (`in_progress`, `awaiting_report`) and the report-issue
-- route's own application-side check (`awaiting_report`/`report_draft`
-- -> `report_issued`) — PLUS the two states nothing currently writes
-- (`confirmed`, `closed`) and a `cancelled` exit, included because the
-- CHECK constraint (173) already names all eight as the intended
-- vocabulary; refusing them outright would make this guard narrower
-- than the schema it is meant to protect, the same trap a maximally-
-- narrow guard would fall into the moment a future group builds a
-- "confirm"/"close" button.
--
-- `planned -> confirmed -> in_progress` is a genuine two-step path
-- (dates confirmed with the client before the visit starts), but
-- `planned -> in_progress` (skip confirm) is ALSO allowed — that IS
-- what `startVisit()` does today for a visit nobody explicitly
-- confirmed first, and refusing it would break the one code path that
-- actually exists.
--
-- `cancelled` is reachable from every non-terminal status (a visit can
-- be called off at any stage before it closes) but not FROM `closed`
-- or `cancelled` themselves — both are terminal, matching the sibling
-- guards' own "closed/revoked is a dead end" rule.
--
-- No extra required-reason-field checks (unlike permits' suspended_
-- reason/closeout_notes/revoked_reason) — consultancy_visits carries
-- no such columns, and inventing ones nothing writes yet would be
-- speculative schema this codebase's own standing rules reject.

CREATE OR REPLACE FUNCTION public.consultancy_visits_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' AND OLD.status = 'planned' THEN
      -- no-op beyond the status move itself
    ELSIF NEW.status = 'in_progress' AND OLD.status IN ('planned', 'confirmed') THEN
      -- no-op beyond the status move itself
    ELSIF NEW.status = 'awaiting_report' AND OLD.status = 'in_progress' THEN
      -- no-op beyond the status move itself
    ELSIF NEW.status = 'report_draft' AND OLD.status = 'awaiting_report' THEN
      -- no-op beyond the status move itself
    ELSIF NEW.status = 'report_issued' AND OLD.status IN ('awaiting_report', 'report_draft') THEN
      -- no-op beyond the status move itself
    ELSIF NEW.status = 'closed' AND OLD.status = 'report_issued' THEN
      -- no-op beyond the status move itself
    ELSIF NEW.status = 'cancelled' AND OLD.status IN
      ('planned', 'confirmed', 'in_progress', 'awaiting_report', 'report_draft') THEN
      -- no-op beyond the status move itself
    ELSE
      RAISE EXCEPTION 'Cannot move a visit from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visits_lifecycle_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consultancy_visits_lifecycle_guard ON public.consultancy_visits;
CREATE TRIGGER consultancy_visits_lifecycle_guard BEFORE UPDATE ON public.consultancy_visits
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_visits_lifecycle_guard();
