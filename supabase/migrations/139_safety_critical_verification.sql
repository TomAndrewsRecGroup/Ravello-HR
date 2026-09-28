-- ═══════════════════════════════════════════════════════════════════
-- 139: one definition of "safety-critical" for verification (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the Phase 3 QA probe (QA 10), severity HIGH. Safe to Deploy
-- (136) treats a requirement as safety-critical when the RULE says so,
-- when its CATALOGUE item is, OR when it is MANDATORY FOR A
-- SAFETY-CRITICAL ROLE. The verification check (134,
-- workforce_item_safety_critical) knew only the first two. So for every
-- mandatory item of a safety-critical role — exactly the evidence the
-- engine insists must be verified — workforce_verify skipped both
-- safety-critical controls: any training.verify / competency.verify
-- holder could verify it, and an assessor could verify their OWN
-- assessment. Live data affected: none (every workforce table was empty).
--
-- The fix makes verification use the engine's rule, including the
-- catalogue flags on authorisation types and occupational health
-- requirements, so the two can no longer disagree.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.workforce_item_safety_critical(p_person uuid, p_type text, p_ref uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_assignments a
      JOIN role_requirements r ON r.role_id = a.role_id
      JOIN job_roles jr ON jr.id = r.role_id
     WHERE a.person_id = p_person AND a.assignment_status <> 'ended'
       AND r.requirement_type = p_type AND r.reference_id = p_ref
       AND (r.safety_critical OR (jr.safety_critical AND r.mandatory))
       AND r.effective_from IS NOT NULL AND r.effective_from <= current_date
       AND (r.effective_until IS NULL OR r.effective_until >= current_date)
    UNION ALL
    SELECT 1 FROM role_assignments a JOIN site_requirements r ON r.site_id = a.site_id
     WHERE a.person_id = p_person AND a.assignment_status <> 'ended'
       AND r.requirement_type = p_type AND r.reference_id = p_ref AND r.safety_critical
       AND r.effective_from IS NOT NULL AND r.effective_from <= current_date
       AND (r.effective_until IS NULL OR r.effective_until >= current_date)
    UNION ALL
    SELECT 1 FROM person_requirements r
     WHERE r.person_id = p_person AND r.requirement_type = p_type AND r.reference_id = p_ref AND r.safety_critical
       AND r.effective_from IS NOT NULL AND r.effective_from <= current_date
       AND (r.effective_until IS NULL OR r.effective_until >= current_date))
  OR (p_type = 'training'      AND EXISTS (SELECT 1 FROM training_courses WHERE id = p_ref AND safety_critical))
  OR (p_type = 'competency'    AND EXISTS (SELECT 1 FROM competencies WHERE id = p_ref AND safety_critical))
  OR (p_type = 'authorisation' AND EXISTS (SELECT 1 FROM authorisation_types WHERE id = p_ref AND safety_critical))
  OR (p_type = 'medical'       AND EXISTS (SELECT 1 FROM occupational_health_requirements WHERE id = p_ref AND safety_critical))
$$;
-- As in 134: only workforce_verify (DEFINER) calls it.
REVOKE ALL ON FUNCTION public.workforce_item_safety_critical(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
