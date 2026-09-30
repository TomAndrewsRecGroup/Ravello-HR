-- ═══════════════════════════════════════════════════════════════════
-- 180: Worker QR badges are revoked on leaving — Phase 14, Group 3
-- ═══════════════════════════════════════════════════════════════════
--
-- Found during Group 3's adversarial review: nothing anywhere revoked
-- a worker's QR badge when they left the organisation. Phase 3's own
-- leaver trigger (workforce_employee_sync(), 137) already ends role
-- assignments and revokes exceptions/authorisations the moment
-- employee_records.status reaches 'terminated' — worker_qr_tokens
-- (179) postdates that migration and was simply never added to it, so
-- a leaver's physical badge stayed scannable indefinitely, still
-- showing their name, job title and employer to whoever held it.
--
-- Extends the EXISTING trigger function rather than adding a new one
-- — the "leaving" branch is already exactly the right place, and a
-- second trigger reacting to the same event would just be the same
-- fact checked twice. The live function body was read with
-- pg_get_functiondef() immediately before this migration was written
-- (this codebase's own standing rule for extending a shared function)
-- and is reproduced here verbatim, plus the one new UPDATE.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.workforce_employee_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE role uuid; req uuid; asg uuid; end_d date; t date := public.workforce_today();
BEGIN
  IF NEW.person_id IS NULL THEN RETURN NULL; END IF;

  -- Hire → the requisition's job role, once.
  IF TG_OP = 'INSERT' AND NEW.source_candidate_id IS NOT NULL THEN
    SELECT c.requisition_id INTO req FROM candidates c WHERE c.id = NEW.source_candidate_id AND c.company_id = NEW.company_id;
    SELECT r.job_role_id INTO role FROM requisitions r
      JOIN job_roles j ON j.id = r.job_role_id AND j.company_id = NEW.company_id
     WHERE r.id = req;
    IF role IS NOT NULL THEN
      INSERT INTO role_assignments (company_id, person_id, role_id, site_id, department_id, primary_assignment,
                                    start_date, assignment_status, source_ref)
      SELECT NEW.company_id, NEW.person_id, role,
             (SELECT id FROM hs_sites WHERE id = NEW.site_id AND company_id = NEW.company_id),
             (SELECT id FROM departments WHERE id = NEW.department_id AND company_id = NEW.company_id),
             NOT EXISTS (SELECT 1 FROM role_assignments x WHERE x.person_id = NEW.person_id
                           AND x.primary_assignment AND x.assignment_status <> 'ended'),
             NEW.start_date, CASE WHEN NEW.start_date > t THEN 'planned' ELSE 'active' END, 'hire:' || NEW.id
      ON CONFLICT (company_id, source_ref) DO NOTHING
      RETURNING id INTO asg;
      IF asg IS NOT NULL THEN
        -- The role's pre-employment checks, as outstanding work.
        INSERT INTO pre_employment_checks (company_id, person_id, check_type_id, status)
        SELECT DISTINCT NEW.company_id, NEW.person_id, rr.reference_id, 'required'
          FROM role_requirements rr
         WHERE rr.role_id = role AND rr.requirement_type = 'pre_employment_check' AND rr.reference_id IS NOT NULL
           AND rr.effective_from IS NOT NULL AND rr.effective_from <= GREATEST(NEW.start_date, t)
           AND (rr.effective_until IS NULL OR rr.effective_until >= t)
        ON CONFLICT (person_id, check_type_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- Leaving: assignments end, exceptions and authorisations lapse, and
  -- (179, added here) any active worker QR badge is revoked — a
  -- leaver's badge must stop being scannable the same moment their
  -- access does, not whenever a human happens to remember to revoke it.
  IF NEW.status::text = 'terminated' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    end_d := COALESCE(NEW.end_date, t);
    UPDATE role_assignments SET end_date = GREATEST(start_date, end_d), assignment_status = 'ended',
                                ended_reason = 'Left the organisation'
     WHERE person_id = NEW.person_id AND company_id = NEW.company_id AND assignment_status <> 'ended';
    UPDATE requirement_exceptions SET revoked_at = now(), revoke_reason = 'Left the organisation'
     WHERE person_id = NEW.person_id AND company_id = NEW.company_id AND revoked_at IS NULL AND valid_until >= t;
    UPDATE person_authorisations SET status = 'revoked', revoked_at = now(), revoke_reason = 'Left the organisation'
     WHERE person_id = NEW.person_id AND company_id = NEW.company_id AND status = 'active';
    UPDATE worker_qr_tokens SET revoked_at = now(), revoked_by = NULL
     WHERE person_id = NEW.person_id AND company_id = NEW.company_id AND revoked_at IS NULL;
  END IF;

  PERFORM public.workforce_apply_lifecycle(NEW.person_id);
  RETURN NULL;
END $$;
