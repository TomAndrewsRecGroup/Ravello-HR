-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 4: defects + return-to-service (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- "Never build a second action table" (this file's own standing rule,
-- already applied to H&S findings, incidents and corrective actions) —
-- a defect is an `actions` row, not a new table. `actions.source_type`
-- already allows 'inspection' (119/125's CHECK), so no CHECK change is
-- needed here at all: a defect raised from a failed inspection response
-- is `source_type = 'inspection'`, `source_id = <inspection_response.id>`,
-- `related_entity_type = 'hs_equipment'`, `related_entity_id = <asset>`.
--
-- A CRITICAL defect (the item was marked `critical` on the template)
-- gets `severity = 'critical'`, `verification_required = true` — the
-- exact mechanism 125's incident-severity escalation already uses for
-- major/critical/fatal incidents. Reaching `status = 'complete'` on a
-- verification-required action is only possible via 'awaiting_
-- verification' first (`actions_lifecycle()`, 125), which always stamps
-- `verified_at`, and nobody may verify their own submitted work
-- (`actions_party_guard()`, 126). So "this defect is properly resolved"
-- is exactly `status = 'complete'` — no separate flag needed.
--
-- Return-to-service is therefore a database GUARD, not a UI convention:
-- an asset may not leave 'quarantined' while an OPEN critical defect
-- (source_type = 'inspection', severity = 'critical', status NOT IN
-- ('complete','dismissed','cancelled')) still points at it. The guard
-- applies to every session, staff included — the same posture 125's
-- own document/incident workflow guards take ("workflow lives in
-- BEFORE triggers, never only in the UI").
--
-- Quarantining itself happens AT SUBMISSION, inside hs_submit_inspection
-- (145) — extended here, not duplicated — rather than waiting five
-- minutes for the platform_events consumer: a critical failure needs
-- the asset off the floor the moment it is recorded, not on the next
-- cron tick. A quarantine never touches a 'decommissioned' asset (a
-- stronger, terminal state) and never re-quarantines one already
-- quarantined.
--
-- Idempotent. Safe to re-run.

-- ── the return-to-service gate ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hs_equipment_return_to_service_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status = 'quarantined' AND NEW.status IS DISTINCT FROM 'quarantined' THEN
    IF EXISTS (
      SELECT 1 FROM public.actions a
       WHERE a.related_entity_type = 'hs_equipment'
         AND a.related_entity_id = NEW.id
         AND a.source_type = 'inspection'
         AND a.severity = 'critical'
         AND a.status NOT IN ('complete', 'dismissed', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'This asset has an unresolved critical defect and cannot return to service until it is verified complete'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_equipment_return_to_service_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_equipment_return_to_service_guard ON public.hs_equipment;
CREATE TRIGGER hs_equipment_return_to_service_guard BEFORE UPDATE ON public.hs_equipment
  FOR EACH ROW EXECUTE FUNCTION public.hs_equipment_return_to_service_guard();

-- ── quarantine helper, SECURITY DEFINER ───────────────────────────────
-- hs_equipment has only hs_equipment_staff_all (ALL, staff) and
-- hs_equipment_client_read (SELECT) — 112 never gave a client an UPDATE
-- policy, and Group 2 did not widen that. But recording a routine
-- pre-use inspection is exactly a CLIENT action (an operator doing their
-- own forklift check), so a plain session UPDATE from inside
-- hs_submit_inspection would be silently no-op'd by RLS for anyone but
-- staff — the asset would stay 'in_service' after a critical failure.
-- This DEFINER helper is scoped to exactly that one job: it re-derives
-- the caller's own organisation from my_company_id() (never trusts an
-- argument), so it can only ever quarantine an asset already known to
-- belong to the caller's own company, and only ever writes the two
-- columns a quarantine needs. It is never granted to anon.
CREATE OR REPLACE FUNCTION public.hs_quarantine_asset(p_asset_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller_company uuid;
BEGIN
  IF NOT public.is_tps_staff() THEN
    caller_company := public.my_company_id();
    IF caller_company IS NULL THEN RETURN; END IF;
    UPDATE public.hs_equipment
       SET status = 'quarantined', updated_at = now()
     WHERE id = p_asset_id AND company_id = caller_company AND status IN ('in_service', 'out_of_service');
  ELSE
    UPDATE public.hs_equipment
       SET status = 'quarantined', updated_at = now()
     WHERE id = p_asset_id AND status IN ('in_service', 'out_of_service');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.hs_quarantine_asset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_quarantine_asset(uuid) TO authenticated;

-- ── hs_submit_inspection (145): quarantine on a critical failure ─────
-- Re-emitted in full so this migration is provably additive: every
-- branch is 145's unchanged body, plus the quarantine UPDATE at the end.

CREATE OR REPLACE FUNCTION public.hs_submit_inspection(
  p_id uuid, p_company_id uuid, p_site_id uuid, p_asset_id uuid, p_template_id uuid,
  p_title text, p_conducted_on date, p_notes text, p_responses jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing uuid;
  r        jsonb;
  any_fail boolean := false;
  crit_fail boolean := false;
BEGIN
  SELECT id INTO existing FROM public.inspections WHERE id = p_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    IF r->>'rating' = 'fail' THEN
      any_fail := true;
      IF COALESCE((r->>'critical')::boolean, false) THEN crit_fail := true; END IF;
    END IF;
  END LOOP;

  INSERT INTO public.inspections (id, company_id, site_id, asset_id, template_id, title, conducted_on,
                                   overall_outcome, has_critical_failure, notes)
  VALUES (p_id, p_company_id, p_site_id, p_asset_id, p_template_id, p_title, p_conducted_on,
          CASE WHEN any_fail THEN 'fail' ELSE 'pass' END, crit_fail, p_notes);

  FOR r IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    INSERT INTO public.inspection_responses (id, inspection_id, template_item_id, prompt, critical, rating, comment, sort_order)
    VALUES (
      COALESCE(NULLIF(r->>'id', '')::uuid, gen_random_uuid()),
      p_id,
      NULLIF(r->>'template_item_id', '')::uuid,
      r->>'prompt',
      COALESCE((r->>'critical')::boolean, false),
      r->>'rating',
      NULLIF(r->>'comment', ''),
      COALESCE((r->>'sort_order')::integer, 0)
    );
  END LOOP;

  -- Group 4: a critical failure quarantines the asset immediately, not
  -- on the next automation tick. hs_quarantine_asset() is SECURITY
  -- DEFINER because a client user (recording their own routine
  -- inspection) has no UPDATE policy on hs_equipment at all — see its
  -- own header comment. Never touches a decommissioned asset, never
  -- re-quarantines one already quarantined.
  IF crit_fail THEN
    PERFORM public.hs_quarantine_asset(p_asset_id);
  END IF;

  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.hs_submit_inspection(uuid, uuid, uuid, uuid, uuid, text, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_submit_inspection(uuid, uuid, uuid, uuid, uuid, text, date, text, jsonb) TO authenticated;
