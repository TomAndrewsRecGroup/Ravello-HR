-- ═══════════════════════════════════════════════════════════════════
-- 138: Core-OS 360 Phase 3 — the workforce matrix read (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- workforce_readiness (136) returns one summary row per person. The
-- training / compliance matrix and the dashboard's counts (expired
-- training, missing competencies, health reviews due, safety-critical
-- gaps) need each person's REQUIREMENT LIST as well, in one round trip,
-- with exactly the same rules:
--   * the caller must be acting in the organisation (or be staff);
--   * only people the caller may see (person_visible) — so a manager
--     gets their team, a workforce.read holder everyone;
--   * the cache is used only when clean, in date and calculated today,
--     otherwise the person is calculated live (never a stale READY);
--   * a calculation failure is REVIEW_REQUIRED (the safe wrapper).
-- The result is the engine's own JSON: statuses, names, dates. No
-- medical text exists in it to leak (136 never reads restrictions).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.workforce_matrix(p_company uuid)
RETURNS TABLE (person_id uuid, full_name text, worker_type text, engagement_type text, lifecycle_status text,
               primary_role_id uuid, site_id uuid, department_id uuid, manager_id uuid, result jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE today date := public.workforce_today(); pr record; c person_deployment_status%ROWTYPE;
BEGIN
  IF p_company IS DISTINCT FROM public.my_company_id() AND NOT public.is_tps_staff() THEN
    RAISE EXCEPTION 'Not your organisation' USING ERRCODE = '42501';
  END IF;
  FOR pr IN
    SELECT p.* FROM people p
     WHERE p.company_id = p_company
       AND p.worker_type IN ('employee','contractor','consultant','temporary_worker')
       AND p.lifecycle_status IN ('pre_employment','active','notice','leave_of_absence')
       AND public.person_visible(p.id)
     ORDER BY p.full_name
  LOOP
    SELECT * INTO c FROM person_deployment_status s WHERE s.person_id = pr.id;
    IF FOUND AND NOT c.dirty AND (c.valid_until IS NULL OR c.valid_until > today) AND c.computed_at::date = today THEN
      result := c.result || jsonb_build_object('source', 'cache');
    ELSE
      result := public._wf_deployment_safe(pr.id, today) || jsonb_build_object('source', 'live');
    END IF;
    person_id := pr.id; full_name := pr.full_name; worker_type := pr.worker_type; engagement_type := pr.engagement_type;
    lifecycle_status := pr.lifecycle_status; primary_role_id := pr.primary_role_id; site_id := pr.site_id;
    department_id := pr.department_id; manager_id := pr.manager_id;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.workforce_matrix(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workforce_matrix(uuid) TO authenticated, service_role;
