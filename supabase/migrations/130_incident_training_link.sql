-- ═══════════════════════════════════════════════════════════════════
-- 130: incident → training link (spec 59, 2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- "Allow investigators to review relevant person training/competency.
--  Do not automatically label inadequate training as the cause. Show
--  factual status… This is evidence. The investigator decides causation."
--
-- The join already exists: incident_people.person_id → employee_records
-- .person_id (118) → training_records.employee_id (111). What is added:
--
-- 1. hs_training_status_at() — ONE definition of "what did this record
--    say on the day of the incident": current | no_expiry | expired |
--    completed_after. Used by both functions below.
--
-- 2. incident_training_evidence(incident) — every training record held
--    for the people named on ONE incident, with its status on the
--    incident date. DEFINER because an investigator (e.g. a site
--    manager working under a grant) is not otherwise shown the whole
--    workforce's training. It is narrow on purpose: only the people on
--    this incident, only for someone holding incident.investigate or
--    incident.approve in the organisation they are acting in, only
--    course facts (never notes). Anyone else gets 42501.
--
-- 3. incident_training_checks — what the investigator RECORDED as
--    relevant ("Training required: Working at Height") with a SNAPSHOT
--    of the finding at that moment. Evidence must not change silently
--    because a training record is edited later, so the finding is
--    copied, not joined. Written only by the two RPCs below (no session
--    write policy exists); withdrawn, never deleted.
--
-- Nothing here writes an incident_cause, sets a category, or scores
-- anyone. Causation stays a human, confirmed incident_causes row.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hs_training_status_at(p_completed date, p_expires date, p_at date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_completed > p_at      THEN 'completed_after'
    WHEN p_expires IS NULL       THEN 'no_expiry'
    WHEN p_expires >= p_at       THEN 'current'
    ELSE 'expired' END
$$;
GRANT EXECUTE ON FUNCTION public.hs_training_status_at(date, date, date) TO authenticated;

-- ─── Evidence (read) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.incident_training_evidence(p_incident uuid)
RETURNS TABLE (incident_person_id uuid, person_id uuid, training_record_id uuid, course_name text, provider text,
               completed_on date, expires_on date, status_at_incident text, incident_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE co uuid; at date;
BEGIN
  SELECT i.company_id, i.occurred_on INTO co, at FROM hs_incidents i WHERE i.id = p_incident;
  IF co IS NULL OR auth.uid() IS NULL OR co IS DISTINCT FROM public.my_company_id()
     OR NOT (public.has_capability(co, 'incident.investigate') OR public.has_capability(co, 'incident.approve')) THEN
    RAISE EXCEPTION 'You do not have permission to review training for this incident' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT ip.id, ip.person_id, t.id, t.course_name, t.provider, t.completed_on, t.expires_on,
           public.hs_training_status_at(t.completed_on, t.expires_on, at), at
      FROM incident_people ip
      JOIN employee_records e ON e.person_id = ip.person_id AND e.company_id = co
      JOIN training_records t ON t.employee_id = e.id AND t.company_id = co
     WHERE ip.incident_id = p_incident AND ip.company_id = co AND ip.person_id IS NOT NULL
     ORDER BY ip.created_at, lower(t.course_name), t.completed_on DESC;
END $$;
REVOKE ALL ON FUNCTION public.incident_training_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incident_training_evidence(uuid) TO authenticated;

-- ─── Recorded checks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incident_training_checks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id          uuid NOT NULL REFERENCES public.hs_incidents(id) ON DELETE CASCADE,
  incident_person_id   uuid NOT NULL REFERENCES public.incident_people(id) ON DELETE CASCADE,
  course_name          text NOT NULL CHECK (length(btrim(course_name)) BETWEEN 1 AND 200),
  training_record_id   uuid REFERENCES public.training_records(id) ON DELETE SET NULL,
  completed_on         date,
  expires_on           date,
  status_at_incident   text NOT NULL CHECK (status_at_incident IN ('current','no_expiry','expired','completed_after','not_recorded')),
  incident_date        date NOT NULL,
  note                 text CHECK (length(note) <= 1000),
  checked_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at           timestamptz NOT NULL DEFAULT now(),
  withdrawn_at         timestamptz,
  withdrawn_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  withdrawn_reason     text CHECK (length(withdrawn_reason) <= 500),
  CHECK ((status_at_incident = 'not_recorded') = (training_record_id IS NULL AND completed_on IS NULL)),
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL))
);
CREATE INDEX IF NOT EXISTS incident_training_checks_incident_idx ON public.incident_training_checks (incident_id);
-- One live check per person per course; a withdrawn one can be re-recorded.
CREATE UNIQUE INDEX IF NOT EXISTS incident_training_checks_live_idx
  ON public.incident_training_checks (incident_person_id, lower(btrim(course_name))) WHERE withdrawn_at IS NULL;

ALTER TABLE public.incident_training_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incident_training_checks_read ON public.incident_training_checks;
CREATE POLICY incident_training_checks_read ON public.incident_training_checks FOR SELECT TO authenticated
  USING ((company_id = (SELECT public.my_company_id())
          AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.read')))
         OR (SELECT public.is_tps_staff()));
-- No INSERT / UPDATE / DELETE policy: sessions write only through the
-- RPCs below, which compute the finding themselves.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.incident_training_checks FROM anon, authenticated;
GRANT SELECT ON public.incident_training_checks TO authenticated;

DROP TRIGGER IF EXISTS incident_training_checks_audit ON public.incident_training_checks;
CREATE TRIGGER incident_training_checks_audit AFTER INSERT OR UPDATE OR DELETE ON public.incident_training_checks
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('incident_training_check','company_id','incident_id','course_name',
    'status_at_incident','training_record_id','withdrawn_at');

-- Shared gate for both writers: same organisation, investigator, a
-- session allowed to write (read-only grants are refused here too —
-- DEFINER bypasses the restrictive write-guard policies), incident open.
CREATE OR REPLACE FUNCTION public.hs_training_check_gate(p_incident uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE co uuid; st text;
BEGIN
  SELECT company_id, status INTO co, st FROM hs_incidents WHERE id = p_incident;
  IF co IS NULL OR auth.uid() IS NULL OR co IS DISTINCT FROM public.my_company_id()
     OR NOT public.has_capability(co, 'incident.investigate') OR NOT public.session_can_write() THEN
    RAISE EXCEPTION 'You do not have permission to record training for this incident' USING ERRCODE = '42501';
  END IF;
  IF st IN ('closed','archived') THEN
    RAISE EXCEPTION 'This incident is closed; reopen it to change the investigation' USING ERRCODE = '23514';
  END IF;
  RETURN co;
END $$;
REVOKE ALL ON FUNCTION public.hs_training_check_gate(uuid) FROM PUBLIC, anon, authenticated;

-- The finding is the most recent completion on or before the incident;
-- failing that, the first completion after it; failing that, nothing on
-- record. The timeline line carries the course and finding only, never
-- the person's name.
CREATE OR REPLACE FUNCTION public.record_incident_training_check(p_incident_person uuid, p_course text, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ip record; co uuid; at date; course text := btrim(COALESCE(p_course, '')); rec record; st text; nid uuid; label text;
BEGIN
  SELECT * INTO ip FROM incident_people WHERE id = p_incident_person;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not found on this incident' USING ERRCODE = 'P0002'; END IF;
  co := public.hs_training_check_gate(ip.incident_id);
  IF ip.company_id IS DISTINCT FROM co THEN RAISE EXCEPTION 'Person not found on this incident' USING ERRCODE = 'P0002'; END IF;
  IF ip.person_id IS NULL THEN
    RAISE EXCEPTION 'Training can be checked only for someone on the organisation''s records' USING ERRCODE = '23514';
  END IF;
  IF length(course) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Name the training (1–200 characters)' USING ERRCODE = '22023'; END IF;
  IF p_note IS NOT NULL AND length(p_note) > 1000 THEN RAISE EXCEPTION 'Note must be 1,000 characters or fewer' USING ERRCODE = '22023'; END IF;
  SELECT occurred_on INTO at FROM hs_incidents WHERE id = ip.incident_id;

  SELECT t.id, t.completed_on, t.expires_on INTO rec
    FROM training_records t JOIN employee_records e ON e.id = t.employee_id
   WHERE e.person_id = ip.person_id AND e.company_id = co AND t.company_id = co
     AND lower(btrim(t.course_name)) = lower(course) AND t.completed_on <= at
   ORDER BY t.completed_on DESC, t.expires_on DESC NULLS FIRST LIMIT 1;
  IF NOT FOUND THEN
    SELECT t.id, t.completed_on, t.expires_on INTO rec
      FROM training_records t JOIN employee_records e ON e.id = t.employee_id
     WHERE e.person_id = ip.person_id AND e.company_id = co AND t.company_id = co
       AND lower(btrim(t.course_name)) = lower(course)
     ORDER BY t.completed_on LIMIT 1;
  END IF;
  st := CASE WHEN rec.id IS NULL THEN 'not_recorded' ELSE public.hs_training_status_at(rec.completed_on, rec.expires_on, at) END;

  INSERT INTO incident_training_checks (company_id, incident_id, incident_person_id, course_name, training_record_id,
    completed_on, expires_on, status_at_incident, incident_date, note, checked_by)
  VALUES (co, ip.incident_id, ip.id, course, rec.id, rec.completed_on, rec.expires_on, st, at, NULLIF(btrim(p_note), ''), auth.uid())
  RETURNING id INTO nid;

  label := CASE st WHEN 'current' THEN 'in date' WHEN 'no_expiry' THEN 'completed, no expiry' WHEN 'expired' THEN 'expired'
                   WHEN 'completed_after' THEN 'completed after the incident' ELSE 'no completion on record' END;
  PERFORM public.hs_log(co, 'incident', ip.incident_id, 'training_checked', 'Training checked: ' || left(course, 120) || ' — ' || label);
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.record_incident_training_check(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_incident_training_check(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_incident_training_check(p_check uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c record; n int;
BEGIN
  SELECT * INTO c FROM incident_training_checks WHERE id = p_check;
  IF NOT FOUND THEN RAISE EXCEPTION 'Check not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.hs_training_check_gate(c.incident_id);
  IF length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Say why it is being withdrawn' USING ERRCODE = '22023';
  END IF;
  UPDATE incident_training_checks SET withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawn_reason = btrim(p_reason)
   WHERE id = p_check AND withdrawn_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Already withdrawn' USING ERRCODE = '23514'; END IF;
  PERFORM public.hs_log(c.company_id, 'incident', c.incident_id, 'training_check_withdrawn',
    'Training check withdrawn: ' || left(c.course_name, 120));
END $$;
REVOKE ALL ON FUNCTION public.withdraw_incident_training_check(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_incident_training_check(uuid, text) TO authenticated;
