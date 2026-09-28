-- ═══════════════════════════════════════════════════════════════════
-- 125: Core-OS 360 Phase 2 — incidents, investigations, RIDDOR review,
-- escalation and corrective-action verification (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- Applied live in three transactions (125a helpers + actions, 125b
-- incidents + people, 125c investigations + RIDDOR + escalation +
-- evidence view + template); function bodies md5-checked against this
-- file. Probe: supabase/probes/125_incidents.sql. The probe's first
-- run found hs_riddor_after writing riddor_reportable = NULL for a
-- review with no decision yet (NOT NULL violation); fixed here and
-- re-applied live as 125d (hs_riddor_after only).
--
-- hs_incidents is EXTENDED, not replaced (0 live rows, so its
-- vocabularies are replaced safely). Everything a Phase 2 incident
-- needs hangs off it: people (with a separately permissioned injury
-- record), evidence (hs_files, surfaced as the incident_evidence view),
-- one investigation with a timeline, classified causes and 5-Whys,
-- a RIDDOR review, and corrective actions in the Phase 1 universal
-- action table — no second action system.
--
-- Rules enforced here:
-- * A reporter reports and sees their own report. incident.read sees
--   the organisation's incidents; injury, contact and medical detail
--   needs incident.sensitive.read; investigating needs
--   incident.investigate; closing and approving need incident.approve;
--   the RIDDOR decision needs riddor.review.
-- * Severity is a HUMAN confirmation (who, when), never inferred.
-- * CLOSURE IS BLOCKED while corrective actions are open or unverified,
--   the required investigation is not approved, or the RIDDOR review is
--   unresolved — unless an authorised user records an override reason.
-- * A root cause counts only when a PERSON confirmed it; an
--   investigation cannot be submitted without one; nothing closes an
--   investigation automatically.
-- * RIDDOR: the system captures prompts and computes "potentially
--   reportable" as decision support; only a person with riddor.review
--   records the decision, with a rationale. Nothing is submitted to the
--   HSE. The incident's riddor_reportable flag is derived from that
--   human decision and nothing else.
-- * Actions: Open → In Progress → Awaiting Verification → Verified
--   Complete. Verification is forced for actions raised from a major,
--   critical or fatal incident; a verifier is never the person who did
--   the work.

-- ─── 0. Shared helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hs_check_refs(p_company uuid, p_row jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k text; t text; v uuid; owner uuid; ok boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_tps_staff() AND p_company IS DISTINCT FROM public.my_company_id() THEN
    RAISE EXCEPTION 'Not your organisation' USING ERRCODE = '42501';
  END IF;
  FOR k, t IN SELECT * FROM (VALUES
      ('site_id','hs_sites'), ('department_id','departments'), ('linked_asset_id','hs_equipment'),
      ('hazard_id','hazards'), ('control_id','controls'), ('substance_id','substances'),
      ('person_id','people'), ('linked_contractor_id','people'), ('person_in_charge_id','people'),
      ('risk_assessment_id','risk_assessments'), ('method_statement_id','method_statements'),
      ('coshh_assessment_id','coshh_assessments'), ('linked_risk_assessment_id','risk_assessments'),
      ('incident_id','hs_incidents'), ('investigation_id','incident_investigations'),
      ('incident_person_id','incident_people'), ('evidence_id','hs_files')) x(k, t) LOOP
    v := NULLIF(p_row ->> k, '')::uuid;
    CONTINUE WHEN v IS NULL OR to_regclass('public.' || t) IS NULL;
    EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', t) INTO owner USING v;
    IF owner IS DISTINCT FROM p_company THEN
      RAISE EXCEPTION '% is not a record of this organisation', replace(k, '_id', '') USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOR k, t IN SELECT * FROM (VALUES
      ('hazard_category_id','hazard_categories'), ('assessment_type_id','assessment_types'),
      ('risk_matrix_id','risk_matrices')) x(k, t) LOOP
    v := NULLIF(p_row ->> k, '')::uuid;
    CONTINUE WHEN v IS NULL;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND (company_id IS NULL OR company_id = $2))', t)
      INTO ok USING v, p_company;
    IF NOT ok THEN
      RAISE EXCEPTION '% is not available to this organisation', replace(k, '_id', '') USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['owner_id','assessor_id','responsible_manager_id','author_id','lead_investigator_id','verifier_id'] LOOP
    v := NULLIF(p_row ->> k, '')::uuid;
    CONTINUE WHEN v IS NULL;
    IF NOT public.hs_user_in_org(v, p_company) THEN
      RAISE EXCEPTION '% must be a user of this organisation', replace(k, '_id', '') USING ERRCODE = '23514';
    END IF;
  END LOOP;
END $$;

-- Who in ORG holds one of these ROLES (escalation audiences).
CREATE OR REPLACE FUNCTION public.org_user_ids_with_role(p_org uuid, p_roles text[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id FROM profiles p
    JOIN companies c ON c.id = p.company_id
    JOIN legacy_role_map m ON m.legacy_role = p.role::text
     AND m.org_kind = CASE WHEN c.organisation_type = 'consultancy'
                            AND EXISTS (SELECT 1 FROM legacy_role_map x WHERE x.legacy_role = p.role::text AND x.org_kind = 'consultancy')
                           THEN 'consultancy' ELSE 'any' END
   WHERE p.company_id = p_org AND m.role_key = ANY (p_roles)
  UNION
  SELECT g.user_id FROM user_organisation_access g
   WHERE g.organisation_id = p_org AND g.role_key = ANY (p_roles) AND g.active_status = 'active'
     AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
$$;
REVOKE ALL ON FUNCTION public.org_user_ids_with_role(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_user_ids_with_role(uuid, text[]) TO service_role;

-- ─── 1. Corrective actions on the universal action table ────────────

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_status_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_status_check
  CHECK (status IN ('active','in_progress','awaiting_verification','complete','dismissed','cancelled'));
ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_source_type_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_source_type_check CHECK (source_type IS NULL OR source_type IN (
  'incident','audit','audit_finding','risk_assessment','inspection','equipment_inspection','consultant_visit',
  'service_request','legal_requirement','regulatory_broadcast','broadcast','hr_process','training_gap',
  'contractor_review','compliance_item','hs_check','onboarding','manual','other',
  'hazard','method_statement','coshh_assessment','investigation','riddor_review'));

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS action_class                  text CHECK (action_class IN ('immediate_correction','corrective','preventive','improvement')),
  ADD COLUMN IF NOT EXISTS verification_required         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verifier_id                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_required             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_comments         text CHECK (length(verification_comments) <= 2000),
  ADD COLUMN IF NOT EXISTS verification_rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS verification_rejected_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_rejection_reason text CHECK (length(verification_rejection_reason) <= 2000),
  ADD COLUMN IF NOT EXISTS effectiveness_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS effectiveness_review_date     date,
  ADD COLUMN IF NOT EXISTS effectiveness_reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS effectiveness_reviewed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS effectiveness_outcome         text CHECK (effectiveness_outcome IN ('effective','partially_effective','not_effective')),
  ADD COLUMN IF NOT EXISTS effectiveness_notes           text CHECK (length(effectiveness_notes) <= 2000),
  ADD COLUMN IF NOT EXISTS additional_action_required    boolean;
DO $$ BEGIN
  ALTER TABLE public.actions ADD CONSTRAINT actions_effectiveness_after_complete
    CHECK (effectiveness_outcome IS NULL OR status = 'complete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS actions_source_idx ON public.actions (source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS actions_company_open_due_idx ON public.actions (company_id, due_date)
  WHERE status IN ('active','in_progress','awaiting_verification');

-- The action lifecycle (119) gains the verification workflow. DEFINER,
-- so a session is recognised by auth.uid(): the consumer and service
-- role have none.
CREATE OR REPLACE FUNCTION public.actions_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE human boolean := auth.uid() IS NOT NULL; sev text; src_org uuid; has_evidence boolean;
BEGIN
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.assigned_person_id);
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    IF NOT public.hs_user_in_org(NEW.assigned_to, NEW.company_id) THEN
      RAISE EXCEPTION 'That person has no access to this organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.verifier_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.verifier_id IS DISTINCT FROM OLD.verifier_id) THEN
    IF NOT public.hs_user_in_org(NEW.verifier_id, NEW.company_id) THEN
      RAISE EXCEPTION 'The verifier has no access to this organisation' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- A safety source must be a record of the same organisation.
  IF NEW.source_id IS NOT NULL AND NEW.source_type IN ('incident','investigation','hazard','risk_assessment',
                                                        'method_statement','coshh_assessment','riddor_review') THEN
    IF NEW.source_type = 'riddor_review' THEN
      SELECT company_id INTO src_org FROM riddor_reviews WHERE id = NEW.source_id;
    ELSE
      src_org := public.hs_entity_company(NEW.source_type, NEW.source_id);
    END IF;
    IF src_org IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'The action''s source is not a record of this organisation' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Verification is mandatory for actions from serious incidents.
  IF NEW.source_type IN ('incident','investigation') AND NEW.source_id IS NOT NULL THEN
    SELECT i.severity INTO sev FROM hs_incidents i
     WHERE i.id = CASE WHEN NEW.source_type = 'incident' THEN NEW.source_id
                       ELSE (SELECT v.incident_id FROM incident_investigations v WHERE v.id = NEW.source_id) END;
    IF sev IN ('major','critical','fatal') THEN NEW.verification_required := true; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND human AND OLD.verification_required AND NOT NEW.verification_required
     AND NOT (public.is_tps_staff() OR public.has_capability(NEW.company_id, 'actions.assign')) THEN
    RAISE EXCEPTION 'Only someone who assigns actions can remove the verification requirement' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    IF NEW.status IN ('awaiting_verification','complete') AND NEW.verification_required AND human THEN
      RAISE EXCEPTION 'An action that needs verification starts open' USING ERRCODE = '23514';
    END IF;
  END IF;

  has_evidence := NEW.completion_evidence IS NOT NULL AND NEW.completion_evidence NOT IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb);

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'awaiting_verification' THEN
      IF OLD.status NOT IN ('active','in_progress') THEN
        RAISE EXCEPTION 'Only an open action can be submitted for verification' USING ERRCODE = '23514';
      END IF;
      IF NEW.evidence_required AND NOT has_evidence THEN
        RAISE EXCEPTION 'Add the completion evidence before submitting for verification' USING ERRCODE = '23514';
      END IF;
      NEW.completed_at := now();
      NEW.completed_by := COALESCE(auth.uid(), NEW.completed_by);
    ELSIF NEW.status = 'complete' THEN
      IF NEW.verification_required THEN
        IF OLD.status <> 'awaiting_verification' THEN
          RAISE EXCEPTION 'This action must be verified: submit it for verification first' USING ERRCODE = '23514';
        END IF;
        NEW.verified_at := COALESCE(NEW.verified_at, now());
      ELSIF NEW.evidence_required AND NOT has_evidence THEN
        RAISE EXCEPTION 'Add the completion evidence before completing this action' USING ERRCODE = '23514';
      END IF;
    ELSIF OLD.status = 'awaiting_verification' AND NEW.status IN ('active','in_progress') THEN
      IF human AND (length(btrim(COALESCE(NEW.verification_rejection_reason, ''))) = 0
                    OR NEW.verification_rejection_reason IS NOT DISTINCT FROM OLD.verification_rejection_reason) THEN
        RAISE EXCEPTION 'Say why the action was not verified' USING ERRCODE = '23514';
      END IF;
      IF human AND NOT (public.is_tps_staff() OR auth.uid() = NEW.verifier_id OR public.has_capability(NEW.company_id, 'actions.assign')) THEN
        RAISE EXCEPTION 'Only the verifier or someone who assigns actions can reject verification' USING ERRCODE = '42501';
      END IF;
      IF human AND auth.uid() = OLD.completed_by AND NOT public.is_tps_staff() THEN
        RAISE EXCEPTION 'The person who did the work cannot reject its verification' USING ERRCODE = '42501';
      END IF;
      NEW.verification_rejected_at := now();
      NEW.verification_rejected_by := auth.uid();
      NEW.completed_at := NULL; NEW.completed_by := NULL;
    END IF;
  END IF;

  IF NEW.status = 'complete' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'complete') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'complete' AND NEW.status <> 'complete' THEN
    NEW.completed_at := NULL; NEW.completed_by := NULL; NEW.verified_at := NULL; NEW.verified_by := NULL;
    NEW.effectiveness_outcome := NULL; NEW.effectiveness_reviewed_at := NULL; NEW.effectiveness_reviewed_by := NULL;
  END IF;
  IF NEW.verified_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.verified_at IS NULL) THEN
    NEW.verified_by := COALESCE(CASE WHEN human THEN auth.uid() END, NEW.verified_by);
    IF NEW.verified_by IS NOT NULL AND NEW.verified_by = NEW.completed_by AND NOT public.is_tps_staff() THEN
      RAISE EXCEPTION 'An action is verified by someone other than the person who completed it' USING ERRCODE = '23514';
    END IF;
    IF human AND NOT (public.is_tps_staff() OR auth.uid() = NEW.verifier_id OR public.has_capability(NEW.company_id, 'actions.assign')) THEN
      RAISE EXCEPTION 'Only the named verifier or someone who assigns actions can verify this action' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.status = 'cancelled' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'cancelled') THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  END IF;
  -- Effectiveness review: a person's finding, stamped.
  IF NEW.effectiveness_outcome IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.effectiveness_outcome END)
     AND NEW.effectiveness_outcome IS NOT NULL THEN
    NEW.effectiveness_reviewed_by := COALESCE(auth.uid(), NEW.effectiveness_reviewed_by);
    NEW.effectiveness_reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;

-- The register's "overdue" means open and past due.
CREATE OR REPLACE VIEW public.action_register WITH (security_invoker = true) AS
 SELECT 'action'::text AS register,
    a.id,
    a.company_id AS organisation_id,
    a.site_id,
    COALESCE(a.source_type, a.action_type) AS source_type,
    a.source_id,
    a.title,
    a.priority,
    a.severity,
    a.assigned_to,
    a.due_date,
    a.status,
    a.completed_at,
    a.verified_at,
    ((a.status = ANY (ARRAY['active'::text, 'in_progress'::text])) AND (a.due_date IS NOT NULL) AND (a.due_date < CURRENT_DATE)) AS is_overdue,
    a.created_at
   FROM actions a
UNION ALL
 SELECT 'internal_task'::text AS register,
    t.id,
    t.company_id AS organisation_id,
    NULL::uuid AS site_id,
        CASE
            WHEN (t.source_ref IS NULL) THEN 'manual'::text
            ELSE split_part(t.source_ref, ':'::text, 1)
        END AS source_type,
    NULL::uuid AS source_id,
    t.title,
    t.priority,
    NULL::text AS severity,
    t.assigned_to,
    t.due_date,
    t.status,
    t.completed_at,
    NULL::timestamp with time zone AS verified_at,
    ((COALESCE(t.status, 'open'::text) <> ALL (ARRAY['done'::text, 'complete'::text, 'completed'::text, 'cancelled'::text])) AND (t.due_date IS NOT NULL) AND (t.due_date < CURRENT_DATE)) AS is_overdue,
    t.created_at
   FROM internal_tasks t;

DROP TRIGGER IF EXISTS actions_platform_event ON public.actions;
CREATE TRIGGER actions_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','priority','action_type','title','source_ref','related_entity_type','related_entity_id','source_type','source_id','action_class','assigned_to','verifier_id','due_date','verification_required');
DROP TRIGGER IF EXISTS actions_audit ON public.actions;
CREATE TRIGGER actions_audit AFTER INSERT OR UPDATE OR DELETE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('action','company_id','status','priority','severity','due_date','assigned_to','assigned_person_id','source_type','source_id','action_class','completed_at','completed_by','verification_required','verifier_id','verified_by','verified_at','verification_rejected_at','effectiveness_outcome','cancelled_at');

-- The named milestones of an action, as audit events (the row trigger
-- above records created/updated with whitelisted columns).
CREATE OR REPLACE FUNCTION public.hs_action_milestones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE verb text;
BEGIN
  verb := CASE
    WHEN NEW.status = 'awaiting_verification' AND OLD.status IS DISTINCT FROM 'awaiting_verification' THEN 'completed'
    WHEN NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' AND NEW.verified_at IS NULL THEN 'completed'
    WHEN NEW.verified_at IS NOT NULL AND OLD.verified_at IS NULL THEN 'verified'
    WHEN OLD.status = 'awaiting_verification' AND NEW.status IN ('active','in_progress') THEN 'verification_rejected'
    WHEN NEW.effectiveness_outcome IS DISTINCT FROM OLD.effectiveness_outcome AND NEW.effectiveness_outcome IS NOT NULL THEN 'effectiveness_reviewed'
    ELSE NULL END;
  IF verb IS NULL THEN RETURN NULL; END IF;
  INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
  VALUES (NEW.company_id, NEW.site_id, auth.uid(), public.audit_actor_kind(), 'action.' || verb, 'actions', NEW.id::text,
          jsonb_build_object('status', OLD.status),
          jsonb_build_object('status', NEW.status, 'source_type', NEW.source_type, 'source_id', NEW.source_id,
                             'completed_by', NEW.completed_by, 'verified_by', NEW.verified_by,
                             'effectiveness_outcome', NEW.effectiveness_outcome),
          public.audit_context());
  IF NEW.source_type IN ('incident','investigation','hazard','risk_assessment','method_statement','coshh_assessment') AND NEW.source_id IS NOT NULL THEN
    PERFORM public.hs_log(NEW.company_id, 'action', NEW.id, verb, 'Action ' || replace(verb, '_', ' ') || ': ' || left(NEW.title, 150));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_action_milestones() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS actions_milestones ON public.actions;
CREATE TRIGGER actions_milestones AFTER UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.hs_action_milestones();

-- ─── 2. Incidents ───────────────────────────────────────────────────

ALTER TABLE public.hs_incidents DROP CONSTRAINT IF EXISTS hs_incidents_incident_type_check;
ALTER TABLE public.hs_incidents DROP CONSTRAINT IF EXISTS hs_incidents_severity_check;
ALTER TABLE public.hs_incidents DROP CONSTRAINT IF EXISTS hs_incidents_status_check;
ALTER TABLE public.hs_incidents ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE public.hs_incidents ALTER COLUMN severity DROP DEFAULT;
ALTER TABLE public.hs_incidents ALTER COLUMN status SET DEFAULT 'reported';

ALTER TABLE public.hs_incidents
  ADD COLUMN IF NOT EXISTS incident_number           text,
  ADD COLUMN IF NOT EXISTS title                     text CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS incident_time             time,
  ADD COLUMN IF NOT EXISTS reported_at               timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reported_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS person_in_charge_id       uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exact_location            text CHECK (length(exact_location) <= 300),
  ADD COLUMN IF NOT EXISTS activity_underway         text CHECK (length(activity_underway) <= 1000),
  ADD COLUMN IF NOT EXISTS department_id             uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS immediate_actions         text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS investigation_required    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS riddor_review_status      text NOT NULL DEFAULT 'not_reviewed',
  ADD COLUMN IF NOT EXISTS linked_risk_assessment_id uuid REFERENCES public.risk_assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_assessment_existed     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_asset_id           uuid REFERENCES public.hs_equipment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_contractor_id      uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS severity_confirmed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS severity_confirmed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS triaged_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triaged_at                timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS close_override_reason     text CHECK (length(close_override_reason) <= 2000),
  ADD COLUMN IF NOT EXISTS archived_at               timestamptz,
  ADD COLUMN IF NOT EXISTS row_version               integer NOT NULL DEFAULT 1;

ALTER TABLE public.hs_incidents
  ADD CONSTRAINT hs_incidents_incident_type_check CHECK (incident_type IN ('accident','injury','near_miss','dangerous_occurrence',
    'property_damage','environmental','occupational_ill_health','security','other')),
  ADD CONSTRAINT hs_incidents_severity_check CHECK (severity IS NULL OR severity IN ('minor','moderate','serious','major','critical','fatal')),
  ADD CONSTRAINT hs_incidents_status_check CHECK (status IN ('reported','triage','under_investigation','awaiting_actions',
    'awaiting_verification','closed','archived')),
  ADD CONSTRAINT hs_incidents_riddor_status_check CHECK (riddor_review_status IN ('not_reviewed','review_required',
    'potentially_reportable','confirmed_reportable','confirmed_not_reportable','reported')),
  ADD CONSTRAINT hs_incidents_immediate_actions_check CHECK (immediate_actions <@ ARRAY['stop_work','isolate_equipment',
    'cordon_area','first_aid','notify_manager','emergency_services','remove_substance','secure_evidence']::text[]),
  -- The person's name lives in incident_people (+ the restricted
  -- sensitive record). The legacy free-text column is closed.
  ADD CONSTRAINT hs_incidents_no_legacy_injured_name CHECK (injured_person_name IS NULL),
  ADD CONSTRAINT hs_incidents_location CHECK (site_id IS NOT NULL OR exact_location IS NOT NULL),
  ADD CONSTRAINT hs_incidents_closed_stamped CHECK (status NOT IN ('closed','archived') OR closed_at IS NOT NULL),
  ADD CONSTRAINT hs_incidents_archived_stamped CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  ADD CONSTRAINT hs_incidents_reported_date CHECK (occurred_on <= (reported_at AT TIME ZONE 'Europe/London')::date + 1);
CREATE UNIQUE INDEX IF NOT EXISTS hs_incidents_number_idx ON public.hs_incidents (company_id, incident_number);
CREATE INDEX IF NOT EXISTS hs_incidents_company_status_idx ON public.hs_incidents (company_id, status);
CREATE INDEX IF NOT EXISTS hs_incidents_company_date_idx ON public.hs_incidents (company_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS hs_incidents_company_type_idx ON public.hs_incidents (company_id, incident_type);
CREATE INDEX IF NOT EXISTS hs_incidents_company_severity_idx ON public.hs_incidents (company_id, severity);
CREATE INDEX IF NOT EXISTS hs_incidents_company_site_idx ON public.hs_incidents (company_id, site_id);
CREATE INDEX IF NOT EXISTS hs_incidents_reported_by_idx ON public.hs_incidents (reported_by);
CREATE INDEX IF NOT EXISTS hs_incidents_asset_idx ON public.hs_incidents (linked_asset_id) WHERE linked_asset_id IS NOT NULL;

-- Where an incident stands, for child-row guards. Own organisation only.
CREATE OR REPLACE FUNCTION public.hs_incident_state(p_incident uuid)
RETURNS TABLE (company_id uuid, status text, reported_by uuid, severity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.company_id, i.status, i.reported_by, i.severity FROM hs_incidents i
   WHERE i.id = p_incident
     AND (auth.uid() IS NULL OR public.is_tps_staff() OR i.company_id = public.my_company_id())
$$;
REVOKE ALL ON FUNCTION public.hs_incident_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_incident_state(uuid) TO authenticated;


-- Why an incident cannot close yet (NULL = nothing outstanding).
CREATE OR REPLACE FUNCTION public.hs_incident_close_blockers(p_incident uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inc hs_incidents; n integer; out text[] := '{}';
BEGIN
  SELECT * INTO inc FROM hs_incidents WHERE id = p_incident;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_tps_staff() AND inc.company_id IS DISTINCT FROM public.my_company_id() THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO n FROM actions a
   WHERE ((a.source_type = 'incident' AND a.source_id = p_incident)
       OR (a.source_type = 'investigation' AND a.source_id IN (SELECT v.id FROM incident_investigations v WHERE v.incident_id = p_incident)))
     AND COALESCE(a.action_class, 'corrective') <> 'improvement'
     AND (a.status IN ('active','in_progress','awaiting_verification')
          OR (a.status = 'complete' AND a.verification_required AND a.verified_at IS NULL));
  IF n > 0 THEN out := out || (n || ' corrective action' || CASE WHEN n = 1 THEN ' is' ELSE 's are' END || ' still open or awaiting verification'); END IF;
  IF inc.investigation_required AND NOT EXISTS (SELECT 1 FROM incident_investigations v WHERE v.incident_id = p_incident AND v.status = 'approved') THEN
    out := out || 'the investigation has not been approved'::text;
  END IF;
  IF inc.riddor_review_status IN ('review_required','potentially_reportable') THEN
    out := out || 'the RIDDOR review has no decision'::text;
  ELSIF inc.riddor_review_status = 'confirmed_reportable' THEN
    out := out || 'the RIDDOR report has not been recorded as made'::text;
  END IF;
  RETURN NULLIF(array_to_string(out, '; '), '');
END $$;
REVOKE ALL ON FUNCTION public.hs_incident_close_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_incident_close_blockers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hs_incident_transition_ok(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT (p_from, p_to) IN (
    ('reported','triage'),
    ('triage','under_investigation'), ('triage','awaiting_actions'), ('triage','closed'),
    ('under_investigation','awaiting_actions'), ('under_investigation','closed'), ('under_investigation','triage'),
    ('awaiting_actions','awaiting_verification'), ('awaiting_actions','closed'), ('awaiting_actions','under_investigation'),
    ('awaiting_verification','closed'), ('awaiting_verification','awaiting_actions'),
    ('closed','archived'), ('closed','triage'))
$$;

-- THE incident gate. SECURITY INVOKER, keyed on current_user.
CREATE OR REPLACE FUNCTION public.hs_incident_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); blockers text; o jsonb; n jsonb;
        content_keys text[] := ARRAY['incident_type','title','occurred_on','incident_time','description','site_id','department_id',
          'exact_location','activity_underway','immediate_action','immediate_actions','person_in_charge_id','investigation_required',
          'linked_risk_assessment_id','no_assessment_existed','linked_asset_id','linked_contractor_id','severity'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF session THEN
      NEW.incident_number := NULL; NEW.status := 'reported';
      NEW.reported_by := auth.uid(); NEW.reported_at := now();
      NEW.severity_confirmed_by := NULL; NEW.severity_confirmed_at := NULL;
      NEW.triaged_by := NULL; NEW.triaged_at := NULL; NEW.closed_by := NULL; NEW.closed_at := NULL;
      NEW.close_override_reason := NULL; NEW.archived_at := NULL;
      NEW.riddor_reportable := false; NEW.riddor_reported_on := NULL;
      NEW.riddor_review_status := NULL;
    END IF;
    -- A prompt, not a conclusion: these types always get a RIDDOR review.
    NEW.riddor_review_status := COALESCE(NEW.riddor_review_status,
      CASE WHEN NEW.incident_type IN ('accident','injury','dangerous_occurrence','occupational_ill_health')
           THEN 'review_required' ELSE 'not_reviewed' END);
    IF NEW.incident_number IS NULL THEN NEW.incident_number := public.next_record_number(NEW.company_id, 'INC', true); END IF;
    NEW.reported_by := COALESCE(NEW.reported_by, auth.uid());
    NEW.row_version := 1;
    PERFORM public.hs_check_refs(NEW.company_id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  NEW.row_version := OLD.row_version + 1;
  IF NOT session THEN RETURN NEW; END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.incident_number IS DISTINCT FROM OLD.incident_number
     OR NEW.reported_by IS DISTINCT FROM OLD.reported_by OR NEW.reported_at IS DISTINCT FROM OLD.reported_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN
    RAISE EXCEPTION 'The incident number, organisation and reporter cannot be changed' USING ERRCODE = '23514';
  END IF;
  -- The RIDDOR outcome is written by the RIDDOR review, never directly.
  NEW.riddor_reportable := OLD.riddor_reportable; NEW.riddor_reported_on := OLD.riddor_reported_on;
  NEW.riddor_review_status := OLD.riddor_review_status;
  NEW.triaged_by := OLD.triaged_by; NEW.triaged_at := OLD.triaged_at;
  NEW.closed_by := OLD.closed_by; NEW.closed_at := OLD.closed_at; NEW.archived_at := OLD.archived_at;

  o := to_jsonb(OLD); n := to_jsonb(NEW);
  IF OLD.status IN ('closed','archived') AND NEW.status = OLD.status THEN
    IF (SELECT bool_or(n -> k IS DISTINCT FROM o -> k) FROM unnest(content_keys) k) OR NEW.close_override_reason IS DISTINCT FROM OLD.close_override_reason THEN
      RAISE EXCEPTION 'A closed incident cannot be edited; reopen it first' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (SELECT bool_or(n -> k IS DISTINCT FROM o -> k) FROM unnest(content_keys) k)
     AND NOT public.has_capability(OLD.company_id, 'incident.investigate') THEN
    RAISE EXCEPTION 'You do not have permission to edit this incident' USING ERRCODE = '42501';
  END IF;

  -- Severity: a person confirms it, and is recorded.
  IF NEW.severity IS DISTINCT FROM OLD.severity OR NEW.severity_confirmed_at IS DISTINCT FROM OLD.severity_confirmed_at THEN
    IF NOT public.has_capability(OLD.company_id, 'incident.investigate') THEN
      RAISE EXCEPTION 'You do not have permission to confirm severity' USING ERRCODE = '42501';
    END IF;
    IF NEW.severity IS NULL THEN
      NEW.severity_confirmed_by := NULL; NEW.severity_confirmed_at := NULL;
    ELSE
      NEW.severity_confirmed_by := auth.uid(); NEW.severity_confirmed_at := now();
    END IF;
  ELSE
    NEW.severity_confirmed_by := OLD.severity_confirmed_by; NEW.severity_confirmed_at := OLD.severity_confirmed_at;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.hs_incident_transition_ok(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'An incident cannot move from % to %', replace(OLD.status, '_', ' '), replace(NEW.status, '_', ' ') USING ERRCODE = '23514';
    END IF;
    IF NEW.status IN ('closed','archived') OR OLD.status = 'closed' THEN
      IF NOT public.has_capability(OLD.company_id, 'incident.approve') THEN
        RAISE EXCEPTION 'Only someone who approves incidents can close, archive or reopen one' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT public.has_capability(OLD.company_id, 'incident.investigate') THEN
      RAISE EXCEPTION 'You do not have permission to move this incident on' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'reported' AND NEW.status = 'triage' THEN
      NEW.triaged_by := auth.uid(); NEW.triaged_at := now();
    END IF;
    IF NEW.status = 'closed' THEN
      IF NEW.severity IS NULL OR NEW.severity_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'A person must confirm the severity before the incident is closed' USING ERRCODE = '23514';
      END IF;
      blockers := public.hs_incident_close_blockers(OLD.id);
      IF blockers IS NOT NULL THEN
        IF length(btrim(COALESCE(NEW.close_override_reason, ''))) < 10 THEN
          RAISE EXCEPTION 'This incident cannot be closed yet: %. To close it anyway, record the reason for the override.', blockers USING ERRCODE = '23514';
        END IF;
      ELSE
        NEW.close_override_reason := NULL;
      END IF;
      NEW.closed_by := auth.uid(); NEW.closed_at := now();
    ELSIF NEW.status = 'archived' THEN
      NEW.archived_at := now();
    ELSIF OLD.status = 'closed' THEN
      NEW.closed_by := NULL; NEW.closed_at := NULL; NEW.close_override_reason := NULL;
    ELSE
      NEW.close_override_reason := OLD.close_override_reason;
    END IF;
  ELSE
    NEW.close_override_reason := OLD.close_override_reason;
  END IF;
  PERFORM public.hs_check_refs(NEW.company_id, to_jsonb(NEW));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_incidents_guard ON public.hs_incidents;
CREATE TRIGGER hs_incidents_guard BEFORE INSERT OR UPDATE ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.hs_incident_guard();

-- Nobody deletes an incident record from a session (staff included);
-- closing and archiving are the end of its life.
CREATE OR REPLACE FUNCTION public.hs_incident_no_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'Incident records cannot be deleted; archive them instead' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS hs_incidents_no_delete ON public.hs_incidents;
CREATE TRIGGER hs_incidents_no_delete BEFORE DELETE ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.hs_incident_no_delete();

-- Safety Timeline + audit for incidents. The summary carries the number
-- and the short title — never the description, which can hold medical
-- detail. (Replaces 112's version and the generic audit_row trigger.)
CREATE OR REPLACE FUNCTION public.hs_event_incident()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE label text; verb text;
BEGIN
  label := initcap(replace(NEW.incident_type, '_', ' ')) || ' ' || NEW.incident_number;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'incident', NEW.id, 'reported',
      label || ' reported' || COALESCE(': ' || left(NEW.title, 120), ''));
    INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, NEW.site_id, auth.uid(), public.audit_actor_kind(), 'incident.reported', 'hs_incidents', NEW.id::text, NULL,
            jsonb_build_object('incident_number', NEW.incident_number, 'incident_type', NEW.incident_type, 'severity', NEW.severity,
                               'status', NEW.status, 'riddor_review_status', NEW.riddor_review_status),
            public.audit_context());
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    verb := CASE WHEN NEW.status = 'closed' THEN 'closed' WHEN NEW.status = 'archived' THEN 'archived'
                 WHEN OLD.status = 'closed' THEN 'reopened' WHEN NEW.status = 'triage' AND OLD.status = 'reported' THEN 'triaged'
                 ELSE 'status_changed' END;
    PERFORM public.hs_log(NEW.company_id, 'incident', NEW.id, CASE WHEN verb = 'status_changed' THEN 'status_' || NEW.status ELSE verb END,
      label || ': ' || replace(NEW.status, '_', ' ') || CASE WHEN verb = 'closed' AND NEW.close_override_reason IS NOT NULL THEN ' (override recorded)' ELSE '' END);
    INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, NEW.site_id, auth.uid(), public.audit_actor_kind(), 'incident.' || verb, 'hs_incidents', NEW.id::text,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'override', NEW.close_override_reason IS NOT NULL,
                               'override_reason', CASE WHEN verb = 'closed' THEN NEW.close_override_reason END),
            public.audit_context());
  END IF;
  IF NEW.severity_confirmed_at IS DISTINCT FROM OLD.severity_confirmed_at AND NEW.severity_confirmed_at IS NOT NULL THEN
    INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, NEW.site_id, auth.uid(), public.audit_actor_kind(), 'incident.severity_confirmed', 'hs_incidents', NEW.id::text,
            jsonb_build_object('severity', OLD.severity), jsonb_build_object('severity', NEW.severity), public.audit_context());
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status AND (
       NEW.incident_type IS DISTINCT FROM OLD.incident_type OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.department_id IS DISTINCT FROM OLD.department_id OR NEW.occurred_on IS DISTINCT FROM OLD.occurred_on
    OR NEW.linked_risk_assessment_id IS DISTINCT FROM OLD.linked_risk_assessment_id OR NEW.linked_asset_id IS DISTINCT FROM OLD.linked_asset_id
    OR NEW.investigation_required IS DISTINCT FROM OLD.investigation_required OR NEW.riddor_review_status IS DISTINCT FROM OLD.riddor_review_status) THEN
    INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, NEW.site_id, auth.uid(), public.audit_actor_kind(), 'incident.updated', 'hs_incidents', NEW.id::text,
            jsonb_build_object('incident_type', OLD.incident_type, 'site_id', OLD.site_id, 'department_id', OLD.department_id,
                               'occurred_on', OLD.occurred_on, 'linked_risk_assessment_id', OLD.linked_risk_assessment_id,
                               'linked_asset_id', OLD.linked_asset_id, 'investigation_required', OLD.investigation_required,
                               'riddor_review_status', OLD.riddor_review_status),
            jsonb_build_object('incident_type', NEW.incident_type, 'site_id', NEW.site_id, 'department_id', NEW.department_id,
                               'occurred_on', NEW.occurred_on, 'linked_risk_assessment_id', NEW.linked_risk_assessment_id,
                               'linked_asset_id', NEW.linked_asset_id, 'investigation_required', NEW.investigation_required,
                               'riddor_review_status', NEW.riddor_review_status),
            public.audit_context());
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_event_incident() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_incidents_audit ON public.hs_incidents;

DROP TRIGGER IF EXISTS hs_incidents_platform_event ON public.hs_incidents;
CREATE TRIGGER hs_incidents_platform_event AFTER INSERT OR UPDATE ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('incident_number','incident_type','severity','severity_confirmed_at','riddor_reportable','riddor_reported_on','riddor_review_status','status','site_id','investigation_required','reported_by');

-- RLS: report with incident.create; see your own report; see all with
-- incident.read; work incidents with incident.investigate / approve.
DROP POLICY IF EXISTS hs_incidents_client_read ON public.hs_incidents;
DROP POLICY IF EXISTS hs_incidents_read ON public.hs_incidents;
CREATE POLICY hs_incidents_read ON public.hs_incidents FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'incident.read'))
           OR reported_by = (SELECT auth.uid())));
DROP POLICY IF EXISTS hs_incidents_report ON public.hs_incidents;
CREATE POLICY hs_incidents_report ON public.hs_incidents FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.create')));
DROP POLICY IF EXISTS hs_incidents_work ON public.hs_incidents;
CREATE POLICY hs_incidents_work ON public.hs_incidents FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.approve'))))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.approve'))));

-- ─── 3. People in an incident, and their restricted injury record ───

CREATE TABLE IF NOT EXISTS public.incident_people (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id      uuid NOT NULL REFERENCES public.hs_incidents(id) ON DELETE CASCADE,
  person_id        uuid REFERENCES public.people(id) ON DELETE SET NULL,
  external_name    text CHECK (length(btrim(external_name)) BETWEEN 1 AND 200),
  role_in_incident text NOT NULL CHECK (role_in_incident IN ('injured_person','affected_person','witness','supervisor',
                                                             'first_aider','contractor_employee','member_of_public')),
  employer         text CHECK (length(employer) <= 200),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (person_id IS NOT NULL OR external_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS incident_people_incident_idx ON public.incident_people (incident_id);
CREATE INDEX IF NOT EXISTS incident_people_person_idx ON public.incident_people (person_id) WHERE person_id IS NOT NULL;

-- Injury, treatment and contact detail. Readable ONLY with
-- incident.sensitive.read. The reporter may record it at report time
-- (writing is not seeing) but cannot read it back.
CREATE TABLE IF NOT EXISTS public.incident_person_sensitive (
  incident_person_id  uuid PRIMARY KEY REFERENCES public.incident_people(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_phone       text CHECK (length(contact_phone) <= 60),
  contact_email       text CHECK (length(contact_email) <= 320),
  contact_address     text CHECK (length(contact_address) <= 500),
  body_parts          text[] NOT NULL DEFAULT '{}' CHECK (body_parts <@ ARRAY['head','face','eye','neck','back','chest','abdomen',
                        'shoulder','arm','elbow','wrist','hand','finger','hip','leg','knee','ankle','foot','toe','multiple',
                        'internal','other']::text[]),
  injury_types        text[] NOT NULL DEFAULT '{}' CHECK (injury_types <@ ARRAY['cut_laceration','bruise_contusion','fracture',
                        'sprain_strain','burn','crush','amputation','puncture','dislocation','concussion','eye_injury',
                        'electric_shock','poisoning','asphyxiation','hearing_damage','occupational_disease','psychological','other']::text[]),
  treatment           text CHECK (treatment IN ('none','first_aid_only','medical_treatment','hospital')),
  first_aid_given     boolean,
  hospital_attendance text CHECK (hospital_attendance IN ('none','treated_and_released','admitted','admitted_over_24h')),
  time_lost           boolean,
  days_lost           integer CHECK (days_lost BETWEEN 0 AND 3650),
  work_restriction    text CHECK (length(work_restriction) <= 1000),
  return_date         date,
  notes               text CHECK (length(notes) <= 4000),
  recorded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.hs_incident_person_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record;
BEGIN
  SELECT * INTO st FROM public.hs_incident_state(CASE WHEN TG_OP = 'DELETE' THEN OLD.incident_id ELSE NEW.incident_id END);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = '23503'; END IF;
  IF session THEN
    IF st.status IN ('closed','archived') THEN
      RAISE EXCEPTION 'The incident is closed' USING ERRCODE = '23514';
    END IF;
    IF NOT (public.has_capability(st.company_id, 'incident.investigate')
            OR (TG_OP = 'INSERT' AND st.reported_by = auth.uid() AND st.status = 'reported')) THEN
      RAISE EXCEPTION 'You do not have permission to change the people in this incident' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.incident_id IS DISTINCT FROM OLD.incident_id THEN
    RAISE EXCEPTION 'A person cannot move to another incident' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  IF TG_OP = 'INSERT' THEN NEW.created_by := COALESCE(CASE WHEN session THEN auth.uid() END, NEW.created_by, auth.uid()); END IF;
  PERFORM public.hs_check_refs(st.company_id, jsonb_build_object('person_id', NEW.person_id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_incident_person_guard ON public.incident_people;
CREATE TRIGGER hs_incident_person_guard BEFORE INSERT OR UPDATE OR DELETE ON public.incident_people
  FOR EACH ROW EXECUTE FUNCTION public.hs_incident_person_guard();

CREATE OR REPLACE FUNCTION public.hs_incident_sensitive_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ip record; st record;
BEGIN
  SELECT p.company_id, p.incident_id INTO ip FROM incident_people p WHERE p.id = NEW.incident_person_id;
  IF ip.company_id IS NULL THEN RAISE EXCEPTION 'Incident person not found' USING ERRCODE = '23503'; END IF;
  SELECT i.status, i.reported_by, i.company_id INTO st FROM hs_incidents i WHERE i.id = ip.incident_id;
  IF auth.uid() IS NOT NULL AND NOT public.is_tps_staff() THEN
    IF ip.company_id IS DISTINCT FROM public.my_company_id() THEN
      RAISE EXCEPTION 'Not your organisation' USING ERRCODE = '42501';
    END IF;
    IF st.status IN ('closed','archived') THEN RAISE EXCEPTION 'The incident is closed' USING ERRCODE = '23514'; END IF;
    IF NOT (public.has_capability(ip.company_id, 'incident.sensitive.read')
            OR (TG_OP = 'INSERT' AND st.reported_by = auth.uid() AND st.status = 'reported')) THEN
      RAISE EXCEPTION 'You do not have permission to record injury details' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.incident_person_id IS DISTINCT FROM OLD.incident_person_id THEN
    RAISE EXCEPTION 'An injury record cannot move to another person' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := ip.company_id;
  NEW.recorded_by := COALESCE(auth.uid(), NEW.recorded_by);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_incident_sensitive_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_incident_sensitive_guard ON public.incident_person_sensitive;
CREATE TRIGGER hs_incident_sensitive_guard BEFORE INSERT OR UPDATE ON public.incident_person_sensitive
  FOR EACH ROW EXECUTE FUNCTION public.hs_incident_sensitive_guard();

ALTER TABLE public.incident_people           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_person_sensitive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incident_people_staff_all ON public.incident_people;
CREATE POLICY incident_people_staff_all ON public.incident_people FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS incident_people_read ON public.incident_people;
CREATE POLICY incident_people_read ON public.incident_people FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'incident.read')) OR created_by = (SELECT auth.uid())));
DROP POLICY IF EXISTS incident_people_insert ON public.incident_people;
CREATE POLICY incident_people_insert ON public.incident_people FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))
                OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.create'))));
DROP POLICY IF EXISTS incident_people_change ON public.incident_people;
CREATE POLICY incident_people_change ON public.incident_people FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate')));
DROP POLICY IF EXISTS incident_people_delete ON public.incident_people;
CREATE POLICY incident_people_delete ON public.incident_people FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate')));
SELECT public.apply_write_guard('public.incident_people');

DROP POLICY IF EXISTS incident_person_sensitive_staff_all ON public.incident_person_sensitive;
CREATE POLICY incident_person_sensitive_staff_all ON public.incident_person_sensitive FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS incident_person_sensitive_read ON public.incident_person_sensitive;
CREATE POLICY incident_person_sensitive_read ON public.incident_person_sensitive FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.sensitive.read')));
DROP POLICY IF EXISTS incident_person_sensitive_insert ON public.incident_person_sensitive;
CREATE POLICY incident_person_sensitive_insert ON public.incident_person_sensitive FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'incident.sensitive.read'))
                OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.create'))));
DROP POLICY IF EXISTS incident_person_sensitive_update ON public.incident_person_sensitive;
CREATE POLICY incident_person_sensitive_update ON public.incident_person_sensitive FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.sensitive.read')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.sensitive.read')));
SELECT public.apply_write_guard('public.incident_person_sensitive');

-- ─── 4. Investigations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.incident_investigations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id            uuid NOT NULL UNIQUE REFERENCES public.hs_incidents(id) ON DELETE CASCADE,
  reference              text NOT NULL,
  lead_investigator_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team_member_ids        uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(team_member_ids) <= 20),
  started_at             timestamptz NOT NULL DEFAULT now(),
  target_completion_date date,
  completed_at           timestamptz,
  summary                text CHECK (length(summary) <= 8000),
  sequence_of_events     text CHECK (length(sequence_of_events) <= 8000),
  immediate_causes       text CHECK (length(immediate_causes) <= 8000),
  underlying_causes      text CHECK (length(underlying_causes) <= 8000),
  root_causes            text CHECK (length(root_causes) <= 8000),
  contributing_factors   text CHECK (length(contributing_factors) <= 8000),
  findings               text CHECK (length(findings) <= 8000),
  lessons_learned        text CHECK (length(lessons_learned) <= 8000),
  status                 text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','pending_approval','changes_requested','approved')),
  submitted_at           timestamptz,
  submitted_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_comments        text CHECK (length(review_comments) <= 4000),
  approved_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  template_id            uuid REFERENCES public.hs_templates(id) ON DELETE SET NULL,
  template_version       integer,
  row_version            integer NOT NULL DEFAULT 1,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference),
  CONSTRAINT incident_investigations_approval_stamped CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS incident_investigations_company_status_idx ON public.incident_investigations (company_id, status);
CREATE INDEX IF NOT EXISTS incident_investigations_lead_idx ON public.incident_investigations (lead_investigator_id);

CREATE OR REPLACE FUNCTION public.hs_investigation_state(p_investigation uuid)
RETURNS TABLE (company_id uuid, status text, incident_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT v.company_id, v.status, v.incident_id FROM incident_investigations v
   WHERE v.id = p_investigation
     AND (auth.uid() IS NULL OR public.is_tps_staff() OR v.company_id = public.my_company_id())
$$;
REVOKE ALL ON FUNCTION public.hs_investigation_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_investigation_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hs_investigation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record; m uuid; o jsonb; n jsonb;
        workflow text[] := ARRAY['status','submitted_at','submitted_by','review_comments','approved_by','approved_at',
                                 'completed_at','row_version','updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO st FROM public.hs_incident_state(NEW.incident_id);
    IF st.company_id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = '23503'; END IF;
    NEW.company_id := st.company_id;
    IF session THEN
      IF st.status IN ('closed','archived') THEN RAISE EXCEPTION 'The incident is closed' USING ERRCODE = '23514'; END IF;
      IF NOT public.has_capability(st.company_id, 'incident.investigate') THEN
        RAISE EXCEPTION 'You do not have permission to investigate incidents' USING ERRCODE = '42501';
      END IF;
      NEW.status := 'in_progress'; NEW.reference := NULL; NEW.created_by := auth.uid();
      NEW.submitted_at := NULL; NEW.submitted_by := NULL; NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.completed_at := NULL;
      NEW.lead_investigator_id := COALESCE(NEW.lead_investigator_id, auth.uid());
    END IF;
    IF NEW.reference IS NULL THEN NEW.reference := public.next_record_number(NEW.company_id, 'INV'); END IF;
    NEW.row_version := 1;
  ELSE
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := now();
    IF session THEN
      IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.incident_id IS DISTINCT FROM OLD.incident_id
         OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'The investigation''s incident and reference cannot be changed' USING ERRCODE = '23514';
      END IF;
      NEW.submitted_at := OLD.submitted_at; NEW.submitted_by := OLD.submitted_by;
      NEW.approved_by := OLD.approved_by; NEW.approved_at := OLD.approved_at; NEW.completed_at := OLD.completed_at;
      o := to_jsonb(OLD); n := to_jsonb(NEW);
      IF NEW.status = OLD.status THEN
        IF (n - workflow) IS DISTINCT FROM (o - workflow) THEN
          IF OLD.status NOT IN ('in_progress','changes_requested') THEN
            RAISE EXCEPTION 'This investigation is % and cannot be edited', replace(OLD.status, '_', ' ') USING ERRCODE = '23514';
          END IF;
          IF NOT public.has_capability(OLD.company_id, 'incident.investigate') THEN
            RAISE EXCEPTION 'You do not have permission to edit this investigation' USING ERRCODE = '42501';
          END IF;
        END IF;
        NEW.review_comments := OLD.review_comments;
      ELSE
        IF (n - workflow) IS DISTINCT FROM (o - workflow) THEN
          RAISE EXCEPTION 'Save your changes before changing status' USING ERRCODE = '23514';
        END IF;
        IF (OLD.status, NEW.status) NOT IN (('in_progress','pending_approval'), ('changes_requested','pending_approval'),
             ('pending_approval','approved'), ('pending_approval','changes_requested'), ('pending_approval','in_progress'),
             ('changes_requested','in_progress'), ('approved','in_progress')) THEN
          RAISE EXCEPTION 'An investigation cannot move from % to %', replace(OLD.status, '_', ' '), replace(NEW.status, '_', ' ') USING ERRCODE = '23514';
        END IF;
        IF NEW.status = 'pending_approval' THEN
          IF NOT public.has_capability(OLD.company_id, 'incident.investigate') THEN
            RAISE EXCEPTION 'You do not have permission to submit this investigation' USING ERRCODE = '42501';
          END IF;
          -- Root cause is a human conclusion: at least one must be confirmed.
          IF NOT EXISTS (SELECT 1 FROM incident_causes c WHERE c.investigation_id = OLD.id AND c.cause_level = 'root' AND c.confirmed_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Confirm at least one root cause before submitting the investigation' USING ERRCODE = '23514';
          END IF;
          IF length(btrim(COALESCE(OLD.summary, ''))) = 0 THEN
            RAISE EXCEPTION 'Write the investigation summary before submitting' USING ERRCODE = '23514';
          END IF;
          NEW.submitted_at := now(); NEW.submitted_by := auth.uid();
          NEW.review_comments := OLD.review_comments;
        ELSIF NEW.status IN ('approved','changes_requested') THEN
          IF NOT public.has_capability(OLD.company_id, 'incident.approve') THEN
            RAISE EXCEPTION 'Only someone who approves incidents can decide on an investigation' USING ERRCODE = '42501';
          END IF;
          IF NEW.status = 'approved' THEN
            IF NOT public.is_tps_staff() AND auth.uid() IN (OLD.lead_investigator_id, OLD.submitted_by) THEN
              RAISE EXCEPTION 'The lead investigator or submitter cannot approve their own investigation' USING ERRCODE = '42501';
            END IF;
            NEW.approved_by := auth.uid(); NEW.approved_at := now(); NEW.completed_at := now();
          ELSIF length(btrim(COALESCE(NEW.review_comments, ''))) = 0 OR NEW.review_comments IS NOT DISTINCT FROM OLD.review_comments THEN
            RAISE EXCEPTION 'Say what needs to change' USING ERRCODE = '23514';
          END IF;
        ELSE
          -- back to in progress: withdrawn, or an approved one reopened
          IF OLD.status = 'approved' AND NOT public.has_capability(OLD.company_id, 'incident.approve') THEN
            RAISE EXCEPTION 'Only someone who approves incidents can reopen an investigation' USING ERRCODE = '42501';
          ELSIF NOT public.has_capability(OLD.company_id, 'incident.investigate') THEN
            RAISE EXCEPTION 'You do not have permission to do that' USING ERRCODE = '42501';
          END IF;
          IF OLD.status = 'approved' THEN NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.completed_at := NULL; END IF;
          NEW.review_comments := OLD.review_comments;
        END IF;
      END IF;
    END IF;
  END IF;
  PERFORM public.hs_check_refs(NEW.company_id, jsonb_build_object('lead_investigator_id', NEW.lead_investigator_id, 'incident_id', NEW.incident_id));
  FOREACH m IN ARRAY NEW.team_member_ids LOOP
    PERFORM public.hs_check_refs(NEW.company_id, jsonb_build_object('lead_investigator_id', m));
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_investigation_guard ON public.incident_investigations;
CREATE TRIGGER hs_investigation_guard BEFORE INSERT OR UPDATE ON public.incident_investigations
  FOR EACH ROW EXECUTE FUNCTION public.hs_investigation_guard();

-- Opening an investigation moves the incident into investigation;
-- approving one moves it on to its actions. Timeline + audit.
CREATE OR REPLACE FUNCTION public.hs_investigation_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE num text;
BEGIN
  SELECT incident_number INTO num FROM hs_incidents WHERE id = NEW.incident_id;
  IF TG_OP = 'INSERT' THEN
    UPDATE hs_incidents SET investigation_required = true,
           status = CASE WHEN status IN ('reported','triage') THEN 'under_investigation' ELSE status END,
           triaged_at = CASE WHEN status = 'reported' THEN now() ELSE triaged_at END,
           triaged_by = CASE WHEN status = 'reported' THEN auth.uid() ELSE triaged_by END
     WHERE id = NEW.incident_id;
    PERFORM public.hs_log(NEW.company_id, 'investigation', NEW.id, 'started', 'Investigation ' || NEW.reference || ' started for ' || num);
    INSERT INTO audit_events (organisation_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, auth.uid(), public.audit_actor_kind(), 'investigation.started', 'incident_investigations', NEW.id::text, NULL,
            jsonb_build_object('reference', NEW.reference, 'incident_id', NEW.incident_id, 'lead_investigator_id', NEW.lead_investigator_id),
            public.audit_context());
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      UPDATE hs_incidents SET status = 'awaiting_actions' WHERE id = NEW.incident_id AND status = 'under_investigation';
    END IF;
    PERFORM public.hs_log(NEW.company_id, 'investigation', NEW.id,
      CASE NEW.status WHEN 'approved' THEN 'completed' WHEN 'pending_approval' THEN 'submitted' ELSE 'status_' || NEW.status END,
      'Investigation ' || NEW.reference || ': ' || CASE NEW.status WHEN 'approved' THEN 'completed and approved' ELSE replace(NEW.status, '_', ' ') END);
    INSERT INTO audit_events (organisation_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, auth.uid(), public.audit_actor_kind(),
            'investigation.' || CASE NEW.status WHEN 'approved' THEN 'completed' WHEN 'pending_approval' THEN 'submitted'
                                                WHEN 'changes_requested' THEN 'changes_requested' ELSE 'reopened' END,
            'incident_investigations', NEW.id::text, jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'approved_by', NEW.approved_by), public.audit_context());
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_investigation_after() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_investigation_after ON public.incident_investigations;
CREATE TRIGGER hs_investigation_after AFTER INSERT OR UPDATE ON public.incident_investigations
  FOR EACH ROW EXECUTE FUNCTION public.hs_investigation_after();
DROP TRIGGER IF EXISTS incident_investigations_platform_event ON public.incident_investigations;
CREATE TRIGGER incident_investigations_platform_event AFTER INSERT OR UPDATE ON public.incident_investigations
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('reference','incident_id','status','lead_investigator_id','target_completion_date','approved_by');

-- The investigation's working rows: editable only while it is open.
CREATE TABLE IF NOT EXISTS public.incident_timeline_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  investigation_id uuid NOT NULL REFERENCES public.incident_investigations(id) ON DELETE CASCADE,
  sequence         integer NOT NULL CHECK (sequence BETWEEN 1 AND 100000),
  event_time       timestamptz,
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description      text CHECK (length(description) <= 4000),
  evidence_id      uuid REFERENCES public.hs_files(id) ON DELETE SET NULL,
  person_id        uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incident_timeline_inv_idx ON public.incident_timeline_events (investigation_id, sequence);

CREATE TABLE IF NOT EXISTS public.incident_causes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  investigation_id uuid NOT NULL REFERENCES public.incident_investigations(id) ON DELETE CASCADE,
  cause_level      text NOT NULL CHECK (cause_level IN ('immediate','underlying','root')),
  category         text NOT NULL CHECK (category IN ('people','plant_equipment','process','procedure','environment','management',
                                                    'training','supervision','maintenance','communication','design','contractor',
                                                    'organisational')),
  description      text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  confirmed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at     timestamptz,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL))
);
CREATE INDEX IF NOT EXISTS incident_causes_inv_idx ON public.incident_causes (investigation_id);
CREATE INDEX IF NOT EXISTS incident_causes_company_category_idx ON public.incident_causes (company_id, category, cause_level);

-- 5 Whys: any number of whys from one to ten — never forced to five.
CREATE TABLE IF NOT EXISTS public.investigation_why_analyses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  investigation_id uuid NOT NULL REFERENCES public.incident_investigations(id) ON DELETE CASCADE,
  problem          text NOT NULL CHECK (length(btrim(problem)) BETWEEN 1 AND 1000),
  whys             text[] NOT NULL CHECK (cardinality(whys) BETWEEN 1 AND 10 AND public.hs_text_items_ok(whys, 1000)),
  conclusion       text CHECK (length(conclusion) <= 2000),
  linked_cause_id  uuid REFERENCES public.incident_causes(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investigation_whys_inv_idx ON public.investigation_why_analyses (investigation_id);

CREATE OR REPLACE FUNCTION public.hs_investigation_child_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record; r jsonb;
BEGIN
  SELECT * INTO st FROM public.hs_investigation_state(CASE WHEN TG_OP = 'DELETE' THEN OLD.investigation_id ELSE NEW.investigation_id END);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'Investigation not found' USING ERRCODE = '23503'; END IF;
  IF session THEN
    IF st.status NOT IN ('in_progress','changes_requested') THEN
      RAISE EXCEPTION 'This investigation is % and cannot be edited', replace(st.status, '_', ' ') USING ERRCODE = '23514';
    END IF;
    IF NOT public.has_capability(st.company_id, 'incident.investigate') THEN
      RAISE EXCEPTION 'You do not have permission to edit this investigation' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.investigation_id IS DISTINCT FROM OLD.investigation_id THEN
    RAISE EXCEPTION 'A row cannot move to another investigation' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  IF TG_OP = 'INSERT' THEN NEW.created_by := COALESCE(CASE WHEN session THEN auth.uid() END, NEW.created_by, auth.uid()); END IF;
  r := to_jsonb(NEW);
  PERFORM public.hs_check_refs(st.company_id, jsonb_build_object('evidence_id', r ->> 'evidence_id', 'person_id', r ->> 'person_id'));
  IF TG_TABLE_NAME = 'investigation_why_analyses' THEN
    NEW.updated_at := now();
    IF (r ->> 'linked_cause_id') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM incident_causes c WHERE c.id = (r ->> 'linked_cause_id')::uuid AND c.investigation_id = NEW.investigation_id) THEN
      RAISE EXCEPTION 'The linked cause belongs to another investigation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- A root cause is confirmed by a PERSON: the confirmation is stamped
-- with who and when, and nothing without a signed-in user can confirm.
CREATE OR REPLACE FUNCTION public.hs_cause_confirm()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.confirmed_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.confirmed_at IS NULL) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'A cause can only be confirmed by a person' USING ERRCODE = '42501';
    END IF;
    NEW.confirmed_by := auth.uid(); NEW.confirmed_at := now();
  ELSIF NEW.confirmed_at IS NULL THEN
    NEW.confirmed_by := NULL;
  ELSE
    NEW.confirmed_by := OLD.confirmed_by; NEW.confirmed_at := OLD.confirmed_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hs_investigation_child_guard ON public.incident_timeline_events;
CREATE TRIGGER hs_investigation_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public.incident_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.hs_investigation_child_guard();
DROP TRIGGER IF EXISTS hs_investigation_child_guard ON public.incident_causes;
CREATE TRIGGER hs_investigation_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public.incident_causes
  FOR EACH ROW EXECUTE FUNCTION public.hs_investigation_child_guard();
DROP TRIGGER IF EXISTS hs_zz_cause_confirm ON public.incident_causes;
CREATE TRIGGER hs_zz_cause_confirm BEFORE INSERT OR UPDATE ON public.incident_causes
  FOR EACH ROW EXECUTE FUNCTION public.hs_cause_confirm();
DROP TRIGGER IF EXISTS hs_investigation_child_guard ON public.investigation_why_analyses;
CREATE TRIGGER hs_investigation_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public.investigation_why_analyses
  FOR EACH ROW EXECUTE FUNCTION public.hs_investigation_child_guard();
DROP TRIGGER IF EXISTS incident_causes_audit ON public.incident_causes;
CREATE TRIGGER incident_causes_audit AFTER INSERT OR UPDATE OR DELETE ON public.incident_causes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('cause','company_id','investigation_id','cause_level','category','confirmed_by','confirmed_at');

-- ─── 5. RIDDOR review ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.riddor_reviews (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id               uuid NOT NULL UNIQUE REFERENCES public.hs_incidents(id) ON DELETE CASCADE,
  death                     boolean,
  specified_injury          boolean,
  over_seven_day_incapacity boolean,
  dangerous_occurrence      boolean,
  occupational_disease      boolean,
  gas_incident              boolean,
  non_worker_hospital       boolean,
  notes                     text CHECK (length(notes) <= 4000),
  status                    text NOT NULL DEFAULT 'review_required' CHECK (status IN ('review_required','potentially_reportable',
                              'confirmed_reportable','confirmed_not_reportable','reported')),
  decision                  text CHECK (decision IN ('reportable','not_reportable','further_review')),
  decision_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_at               timestamptz,
  rationale                 text CHECK (length(rationale) <= 4000),
  reporting_reference       text CHECK (length(reporting_reference) <= 100),
  report_date               date CHECK (report_date <= current_date + 1),
  row_version               integer NOT NULL DEFAULT 1,
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT riddor_decision_stamped CHECK (decision IS NULL OR (decision_by IS NOT NULL AND decision_at IS NOT NULL
                                                                 AND length(btrim(COALESCE(rationale, ''))) > 0)),
  CONSTRAINT riddor_report_only_when_reportable CHECK ((reporting_reference IS NULL AND report_date IS NULL) OR decision = 'reportable')
);
CREATE INDEX IF NOT EXISTS riddor_reviews_company_status_idx ON public.riddor_reviews (company_id, status);

-- Decision support computes a status; only a person with riddor.review
-- records the decision, with a rationale. Nothing here submits anything.
CREATE OR REPLACE FUNCTION public.hs_riddor_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record; flags boolean; decided boolean;
BEGIN
  SELECT * INTO st FROM public.hs_incident_state(NEW.incident_id);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = '23503'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.incident_id IS DISTINCT FROM OLD.incident_id THEN
    RAISE EXCEPTION 'A RIDDOR review cannot move to another incident' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  decided := NEW.decision IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.decision END)
          OR NEW.rationale IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.rationale END)
          OR NEW.reporting_reference IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.reporting_reference END)
          OR NEW.report_date IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.report_date END);
  IF session THEN
    IF st.status IN ('closed','archived') THEN RAISE EXCEPTION 'The incident is closed' USING ERRCODE = '23514'; END IF;
    IF decided AND NOT public.has_capability(st.company_id, 'riddor.review') THEN
      RAISE EXCEPTION 'Only an authorised person can record the RIDDOR decision' USING ERRCODE = '42501';
    END IF;
    IF NOT decided AND NOT (public.has_capability(st.company_id, 'riddor.review') OR public.has_capability(st.company_id, 'incident.investigate')) THEN
      RAISE EXCEPTION 'You do not have permission to edit the RIDDOR review' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF decided THEN
    IF NEW.decision IS NOT NULL AND auth.uid() IS NULL THEN
      RAISE EXCEPTION 'A RIDDOR decision can only be made by a person' USING ERRCODE = '42501';
    END IF;
    IF NEW.decision IS NOT NULL AND length(btrim(COALESCE(NEW.rationale, ''))) = 0 THEN
      RAISE EXCEPTION 'Record the rationale for the RIDDOR decision' USING ERRCODE = '23514';
    END IF;
    IF NEW.decision IS NOT NULL THEN
      NEW.decision_by := auth.uid(); NEW.decision_at := now();
    ELSE
      NEW.decision_by := NULL; NEW.decision_at := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.decision_by := OLD.decision_by; NEW.decision_at := OLD.decision_at;
  ELSE
    NEW.decision_by := NULL; NEW.decision_at := NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by); NEW.row_version := 1;
  ELSE
    NEW.created_by := OLD.created_by; NEW.row_version := OLD.row_version + 1; NEW.updated_at := now();
  END IF;
  flags := COALESCE(NEW.death, false) OR COALESCE(NEW.specified_injury, false) OR COALESCE(NEW.over_seven_day_incapacity, false)
        OR COALESCE(NEW.dangerous_occurrence, false) OR COALESCE(NEW.occupational_disease, false)
        OR COALESCE(NEW.gas_incident, false) OR COALESCE(NEW.non_worker_hospital, false);
  NEW.status := CASE
    WHEN NEW.decision = 'reportable' AND NEW.report_date IS NOT NULL THEN 'reported'
    WHEN NEW.decision = 'reportable' THEN 'confirmed_reportable'
    WHEN NEW.decision = 'not_reportable' THEN 'confirmed_not_reportable'
    WHEN NEW.decision = 'further_review' THEN 'review_required'
    WHEN flags THEN 'potentially_reportable'
    ELSE 'review_required' END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_riddor_guard ON public.riddor_reviews;
CREATE TRIGGER hs_riddor_guard BEFORE INSERT OR UPDATE ON public.riddor_reviews
  FOR EACH ROW EXECUTE FUNCTION public.hs_riddor_guard();

CREATE OR REPLACE FUNCTION public.hs_riddor_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE num text;
BEGIN
  UPDATE hs_incidents SET riddor_review_status = NEW.status,
         riddor_reportable = COALESCE(NEW.decision = 'reportable', false),
         riddor_reported_on = NEW.report_date
   WHERE id = NEW.incident_id;
  IF NEW.decision IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.decision END)
     OR NEW.report_date IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.report_date END) THEN
    SELECT incident_number INTO num FROM hs_incidents WHERE id = NEW.incident_id;
    IF NEW.decision IS NOT NULL THEN
      PERFORM public.hs_log(NEW.company_id, 'incident', NEW.incident_id, 'riddor_' || NEW.status,
        'RIDDOR review for ' || num || ': ' || replace(NEW.status, '_', ' '));
    END IF;
    INSERT INTO audit_events (organisation_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, auth.uid(), public.audit_actor_kind(), 'riddor.reviewed', 'riddor_reviews', NEW.id::text,
            CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('decision', OLD.decision, 'status', OLD.status) END,
            jsonb_build_object('decision', NEW.decision, 'status', NEW.status, 'decision_by', NEW.decision_by,
                               'report_date', NEW.report_date, 'incident_id', NEW.incident_id),
            public.audit_context());
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_riddor_after() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_riddor_after ON public.riddor_reviews;
CREATE TRIGGER hs_riddor_after AFTER INSERT OR UPDATE ON public.riddor_reviews
  FOR EACH ROW EXECUTE FUNCTION public.hs_riddor_after();

-- ─── 6. Escalation rules ────────────────────────────────────────────
-- Who hears about a confirmed severity, by ROLE — configurable per
-- organisation; the platform rows apply only where an organisation has
-- none of its own. No organisation or consultancy is hardcoded.

CREATE TABLE IF NOT EXISTS public.incident_escalation_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  severity     text NOT NULL CHECK (severity IN ('minor','moderate','serious','major','critical','fatal')),
  notify_roles text[] NOT NULL CHECK (cardinality(notify_roles) BETWEEN 1 AND 15),
  notify_staff boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS incident_escalation_rules_idx
  ON public.incident_escalation_rules (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), severity);

CREATE OR REPLACE FUNCTION public.hs_escalation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.notify_roles) r WHERE NOT EXISTS (SELECT 1 FROM access_roles a WHERE a.key = r)) THEN
    RAISE EXCEPTION 'Unknown role in escalation rule' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_by := COALESCE(auth.uid(), NEW.created_by); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_escalation_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_escalation_guard ON public.incident_escalation_rules;
CREATE TRIGGER hs_escalation_guard BEFORE INSERT OR UPDATE ON public.incident_escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.hs_escalation_guard();

INSERT INTO public.incident_escalation_rules (company_id, severity, notify_roles, notify_staff)
SELECT NULL, s, r, st FROM (VALUES
  ('fatal',    ARRAY['organisation_owner','organisation_admin','hse_manager','consultant','consultancy_owner'], true),
  ('critical', ARRAY['organisation_owner','organisation_admin','hse_manager','consultant','consultancy_owner'], true),
  ('major',    ARRAY['hse_manager','site_manager','consultant'], true),
  ('serious',  ARRAY['site_manager','hse_advisor'], false)) v(s, r, st)
WHERE NOT EXISTS (SELECT 1 FROM public.incident_escalation_rules e WHERE e.company_id IS NULL AND e.severity = v.s);

-- ─── 7. RLS for the investigation, RIDDOR and escalation tables ─────

ALTER TABLE public.incident_investigations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_timeline_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_causes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_why_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riddor_reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_escalation_rules  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['incident_investigations','incident_timeline_events','incident_causes','investigation_why_analyses'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_staff_all ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_staff_all ON public.%1$s FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''incident.read'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated USING (company_id = (SELECT public.my_company_id()) AND ((SELECT public.has_capability((SELECT public.my_company_id()), ''incident.investigate'')) OR (SELECT public.has_capability((SELECT public.my_company_id()), ''incident.approve'')))) WITH CHECK (company_id = (SELECT public.my_company_id()) AND ((SELECT public.has_capability((SELECT public.my_company_id()), ''incident.investigate'')) OR (SELECT public.has_capability((SELECT public.my_company_id()), ''incident.approve''))))', t);
    EXECUTE format('SELECT public.apply_write_guard(''public.%1$s'')', t);
  END LOOP;
END $$;
-- No session may delete an investigation (staff included): reopen it.
CREATE OR REPLACE FUNCTION public.hs_investigation_no_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'Investigations cannot be deleted' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS hs_investigation_no_delete ON public.incident_investigations;
CREATE TRIGGER hs_investigation_no_delete BEFORE DELETE ON public.incident_investigations
  FOR EACH ROW EXECUTE FUNCTION public.hs_investigation_no_delete();

DROP POLICY IF EXISTS riddor_reviews_staff_all ON public.riddor_reviews;
CREATE POLICY riddor_reviews_staff_all ON public.riddor_reviews FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS riddor_reviews_read ON public.riddor_reviews;
CREATE POLICY riddor_reviews_read ON public.riddor_reviews FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'riddor.review'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.sensitive.read'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))));
DROP POLICY IF EXISTS riddor_reviews_insert ON public.riddor_reviews;
CREATE POLICY riddor_reviews_insert ON public.riddor_reviews FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'riddor.review'))
                OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))));
DROP POLICY IF EXISTS riddor_reviews_update ON public.riddor_reviews;
CREATE POLICY riddor_reviews_update ON public.riddor_reviews FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'riddor.review'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'riddor.review'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))));
SELECT public.apply_write_guard('public.riddor_reviews');

DROP POLICY IF EXISTS incident_escalation_rules_staff_all ON public.incident_escalation_rules;
CREATE POLICY incident_escalation_rules_staff_all ON public.incident_escalation_rules FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS incident_escalation_rules_read ON public.incident_escalation_rules;
CREATE POLICY incident_escalation_rules_read ON public.incident_escalation_rules FOR SELECT TO authenticated
  USING (company_id IS NULL OR (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.read'))));
DROP POLICY IF EXISTS incident_escalation_rules_write ON public.incident_escalation_rules;
CREATE POLICY incident_escalation_rules_write ON public.incident_escalation_rules FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.approve')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.approve')));
SELECT public.apply_write_guard('public.incident_escalation_rules');

-- ─── 8. Incident evidence, as one view over the evidence store ──────
-- security_invoker: the hs_files policies (and so the capability rules
-- in hs_evidence_readable) decide every row.
CREATE OR REPLACE VIEW public.incident_evidence WITH (security_invoker = true) AS
  SELECT f.id, f.company_id,
         CASE WHEN f.entity_type = 'incident' THEN f.entity_id
              ELSE (SELECT v.incident_id FROM public.incident_investigations v WHERE v.id = f.entity_id) END AS incident_id,
         f.entity_type, f.entity_id, f.evidence_type, f.description, f.file_name, f.mime_type, f.size_bytes,
         f.storage_path, f.recorded_by AS uploaded_by, f.created_at AS uploaded_at
    FROM public.hs_files f
   WHERE f.entity_type IN ('incident','investigation');
REVOKE ALL ON public.incident_evidence FROM anon;

-- ─── 9. Platform investigation template ─────────────────────────────

INSERT INTO public.hs_templates (owner_company_id, kind, title, description, content, visibility)
SELECT NULL, 'investigation', 'Standard incident investigation',
  'Prompts for a proportionate investigation. The investigator decides the causes.',
  '{"prompts":[
     "What was happening immediately before the incident?",
     "What was the task, and was it being done as planned?",
     "Which risk assessment, method statement or permit covered the task, and was it followed?",
     "What equipment, substances or vehicles were involved, and what condition were they in?",
     "Who was involved, what training or competence records apply, and when were they last completed?",
     "What controls were expected to be in place, and which were in place at the time?",
     "What did the witnesses see, and what evidence (photographs, CCTV, records) has been secured?",
     "What directly caused the event (immediate cause)?",
     "What conditions allowed it to happen (underlying causes)?",
     "What systemic reason needs correcting to stop it recurring (root cause)?"],
    "suggest_five_whys":true}'::jsonb,
  'platform'
WHERE NOT EXISTS (SELECT 1 FROM public.hs_templates t WHERE t.owner_company_id IS NULL AND t.kind = 'investigation');
