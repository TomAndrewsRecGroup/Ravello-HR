-- Core-OS 360 Completion Programme, Phase 24, Group 1 (closes the
-- Phase-24 slice of gap-ledger row C1.12 — "optimistic locking on
-- shared records").
--
-- Checked live before writing this, not assumed from the gap-ledger's
-- own one-line description: `consultancy_service_scopes` has NO
-- update writer anywhere in either app (POST /api/consultancy/clients/
-- [id]/service-scope is insert-only) — there is no concurrent-edit
-- path to protect, so it is deliberately left untouched here rather
-- than adding a column nothing can race on. `consultancy_visits`'
-- status transitions already have a real guard
-- (consultancy_visits_lifecycle_guard(), 185): a double-click race is
-- already refused, because the SECOND call's OLD.status no longer
-- matches an allowed source state for the transition it is attempting
-- — no row_version needed on top of a state machine that already
-- rejects the race.
--
-- The one genuine gap: `consultancy_visit_reports`' DRAFT SAVE
-- (ReportBuilderClient.tsx's `saveDraft()`) is free-text narrative
-- (summary/recommendations/next_visit_recommended_date) with no state
-- machine protecting it at all — two consultants editing the same
-- draft would have the second save silently overwrite the first's
-- text with no detection, the exact class of bug this row already
-- documents the ISSUE route once had for a different reason (Phase 7
-- Group 8's claim-first restructure). This closes the draft-save half
-- of that same risk surface.
--
-- Same pattern this codebase already uses throughout (123's hazard/RA
-- guards, 124's RAMS/COSHH guards, 125's incident guard): a `row_version`
-- column, forced to 1 on INSERT and to OLD+1 on every UPDATE regardless
-- of whatever the caller sent — the trigger's own overwrite is what
-- makes a client's `.eq('row_version', report.row_version)` conditional
-- update an honest optimistic-lock check, not a value the caller could
-- game by sending a higher number.

ALTER TABLE public.consultancy_visit_reports
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.consultancy_visit_report_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_consultancy uuid; v_client uuid; prev_visit uuid;
BEGIN
  SELECT consultancy_organisation_id, client_organisation_id INTO v_consultancy, v_client
    FROM public.consultancy_visits WHERE id = NEW.visit_id;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'visit_id does not reference a real visit' USING ERRCODE = '23503';
  END IF;
  NEW.consultancy_organisation_id := v_consultancy;
  NEW.client_organisation_id := v_client;

  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT visit_id INTO prev_visit FROM public.consultancy_visit_reports WHERE id = NEW.supersedes_id;
    IF prev_visit IS DISTINCT FROM NEW.visit_id THEN
      RAISE EXCEPTION 'A revision must supersede a report for the SAME visit' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.row_version := 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visit_report_fill() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consultancy_visit_report_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  -- consultancy_organisation_id/client_organisation_id/visit_id are
  -- derived facts, not editable state — refuse a session trying to
  -- move a report to a different visit or organisation after the fact.
  -- supersedes_id is a permanent "this row is a revision of X" fact,
  -- set only at INSERT (where consultancy_visit_report_fill() already
  -- proves it names a report for the SAME visit) — a bare UPDATE has
  -- no such check of its own, so this must refuse it too.
  IF NEW.visit_id IS DISTINCT FROM OLD.visit_id
     OR NEW.consultancy_organisation_id IS DISTINCT FROM OLD.consultancy_organisation_id
     OR NEW.client_organisation_id IS DISTINCT FROM OLD.client_organisation_id
     OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id THEN
    RAISE EXCEPTION 'visit_id/organisation/supersedes_id cannot be changed after creation' USING ERRCODE = '42501';
  END IF;
  -- Always OLD+1, regardless of whatever row_version the caller sent —
  -- this is what makes the client's own `.eq('row_version', ...)`
  -- conditional update an honest optimistic-lock check.
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visit_report_touch() FROM PUBLIC, anon, authenticated;

-- Triggers already exist (176); CREATE OR REPLACE FUNCTION above is
-- sufficient — no DROP/CREATE TRIGGER needed since neither trigger's
-- event/timing changed.
