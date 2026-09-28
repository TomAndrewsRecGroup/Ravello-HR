-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 8: contractor workers + Safe-to-Deploy +
-- access gate (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- A contractor WORKER is a `people` row (Phase 3) with
-- `worker_type = 'contractor'` — that value has existed since 118, and
-- `workforce_readiness()`/`workforce_matrix` already include it (Phase
-- 3's own rule: "Workforce lists include only worker_type employee /
-- contractor / consultant / temporary_worker"). What was missing is the
-- link to WHICH contractor company (Group 7) a worker belongs to, and a
-- single access-gate check combining that company's status with the
-- worker's own Safe to Deploy status.
--
-- `people.contractor_id` is the one new column. It may only be set when
-- `worker_type = 'contractor'` and the contractor belongs to the SAME
-- organisation — a trigger enforces both, the same shape every other
-- same-org guard in this codebase already uses.
--
-- The access gate NEVER re-implements Safe to Deploy or contractor
-- currency — it calls `person_deployment_status()` (136, the one public
-- read of the cache-or-live engine result — Phase 3's own standing
-- rule: "Never call the raw engine from a public read") and
-- `contractor_is_current()` (150) and combines the two. It computes NO
-- new deterministic fact of its own beyond "both of these are true" —
-- no AI, no scoring, consistent with the rest of this phase.
--
-- Induction and RAMS are NOT separate checks here: an induction
-- requirement is modelled as an ordinary Phase 3 `role_requirement`
-- (`requirement_type = 'induction'`), so it is ALREADY inside the Safe
-- to Deploy calculation for anyone it applies to — a second induction
-- check here would either duplicate that or silently disagree with it.
-- RAMS/permit-specific gating belongs to Group 9 (permit to work), which
-- reads its own compliance state at the point of ISSUE — this gate is
-- the general "may this worker be on site at all" fact, not "may they
-- do this specific task".
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS people_contractor_idx ON public.people (contractor_id) WHERE contractor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.people_contractor_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record;
BEGIN
  IF NEW.contractor_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.worker_type <> 'contractor' THEN
    RAISE EXCEPTION 'Only a contractor worker may be linked to a contractor company' USING ERRCODE = '23514';
  END IF;
  SELECT company_id INTO c FROM public.contractors WHERE id = NEW.contractor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contractor not found' USING ERRCODE = '23503';
  END IF;
  IF c.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Contractor belongs to a different organisation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.people_contractor_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS people_contractor_guard ON public.people;
CREATE TRIGGER people_contractor_guard BEFORE INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_contractor_guard();

-- ── the access gate ────────────────────────────────────────────────
-- Refuses (does not merely omit) a person the caller may not see —
-- person_visible() is checked FIRST, before anything about the person
-- is touched, the same defensive order person_deployment_status()
-- itself already uses.

CREATE OR REPLACE FUNCTION public.contractor_worker_access(p_person_id uuid, p_as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d date := COALESCE(p_as_of, public.workforce_today());
  person record;
  contractor_ok boolean;
  deploy jsonb;
  deploy_status text;
  reasons jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.person_visible(p_person_id) THEN
    RAISE EXCEPTION 'You cannot see this person' USING ERRCODE = '42501';
  END IF;

  SELECT worker_type, contractor_id INTO person FROM public.people WHERE id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = '23503';
  END IF;

  IF person.worker_type <> 'contractor' OR person.contractor_id IS NULL THEN
    RETURN jsonb_build_object('person_id', p_person_id, 'as_of', d, 'access_granted', false,
      'reasons', jsonb_build_array('Not a linked contractor worker'));
  END IF;

  contractor_ok := public.contractor_is_current(person.contractor_id, d);
  deploy := public.person_deployment_status(p_person_id, d);
  deploy_status := deploy ->> 'status';

  IF NOT contractor_ok THEN
    reasons := reasons || jsonb_build_array('Contractor company is not currently approved and insured');
  END IF;
  IF deploy_status IS DISTINCT FROM 'READY' THEN
    reasons := reasons || jsonb_build_array('Worker is not Safe to Deploy (' || COALESCE(deploy_status, 'unknown') || ')');
  END IF;

  RETURN jsonb_build_object(
    'person_id', p_person_id, 'contractor_id', person.contractor_id, 'as_of', d,
    'contractor_current', contractor_ok, 'deployment_status', deploy_status,
    'access_granted', (contractor_ok AND deploy_status = 'READY'),
    'reasons', reasons
  );
END $$;
REVOKE ALL ON FUNCTION public.contractor_worker_access(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_worker_access(uuid, date) TO authenticated;

-- ── audit: people's audit_row trigger was last redefined by 132 (not
--    118 — checked, not assumed, per this codebase's own "latest
--    definition wins" rule for every re-created trigger). Re-emitted
--    with 132's exact whitelist plus contractor_id — who a worker's
--    contractor company is is exactly the kind of classifying fact that
--    trail already covers (never salary/NI/notes, unaffected here).

DROP TRIGGER IF EXISTS people_audit ON public.people;
CREATE TRIGGER people_audit AFTER INSERT OR UPDATE OR DELETE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('person', 'company_id', 'full_name', 'worker_type', 'employment_status',
    'job_title', 'department_id', 'site_id', 'manager_id', 'user_id', 'active_status',
    'lifecycle_status', 'engagement_type', 'primary_role_id', 'contractor_id');
