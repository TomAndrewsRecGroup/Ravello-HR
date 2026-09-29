-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 7: Internal Audit Enhancement, Governance
-- Calendar, Worker Consultation, Environmental Complaints (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on Groups 1-6 (migrations 156-161). Read docs/CORE_OS_360_
-- PHASE5_GOVERNANCE_MAP.md before touching this.
--
-- Four pieces, none of them a new engine:
--
--   1. AUDIT ENHANCEMENT extends the EXISTING hs_audits/hs_audit_
--      responses/hs_audit_templates system (110/113), never a second
--      audit engine. audit_programmes is a planned SCHEDULE of audits
--      (a new, small table — nothing existing already models "we run
--      a fire audit here quarterly"). audit_findings is the richer
--      finding record the task asks for, layered ON TOP of the
--      insert-only hs_audit_responses: it references one
--      hs_audit_response_id, holds severity/root_cause/a linked
--      corrective action, and is ITSELF mutable (unlike hs_audit_
--      responses) because a finding is a workflow object worked on
--      over days or weeks — investigate, find the root cause, raise
--      and verify a corrective action, then close.
--   2. A MAJOR/CRITICAL finding cannot be closed without a root cause
--      AND a linked corrective action AND that action's OWN
--      effectiveness verification — enforced by a database trigger
--      (audit_findings_closure_guard()), never the UI. "Effectiveness
--      verification" reuses the EXISTING actions.verified_at/
--      effectiveness_outcome columns from Phase 2 (125/126) — no
--      parallel verification mechanism.
--   3. Never a second action table. A finding's corrective action is
--      an ordinary `actions` row, source_type = 'audit_finding' (this
--      value already exists on actions_source_type_check since 161 —
--      confirmed by reading the live CHECK before writing this
--      migration; no ALTER needed here for that value).
--   4. The Governance Calendar is a READ-TIME AGGREGATE, computed in
--      TypeScript (admin/src/lib/governance/calendar.ts) from the
--      several already-dated tables it lists — never a new events/
--      scheduling table of its own. See that file's own header for
--      why TypeScript was chosen over a SQL function (a UNION over
--      six differently-shaped tables is materially easier to keep
--      correct, test and extend in TypeScript than in one large SQL
--      view, and nothing here needs it to run inside a policy or a
--      trigger).
--   5. consultation_records and environmental_complaints are simple,
--      insert-mostly record-keeping tables — not workflow engines. A
--      follow-up from either is, again, an ordinary `actions` row
--      (source_type 'consultation' / 'environmental_complaint').
--
-- Idempotent. Safe to re-run.

-- ── audit_programmes: a planned schedule of audits ──────────────────
-- Staff-managed like the audits themselves; a client reads their own
-- company's programme, no capability gate — the exact hs_audits/
-- hs_audit_responses posture (094/095/110), since this extends that
-- same system.

CREATE TABLE IF NOT EXISTS public.audit_programmes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  frequency       text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'biannual', 'annual', 'other')),
  standard_id     uuid REFERENCES public.management_system_standards(id) ON DELETE SET NULL,
  template_id     uuid REFERENCES public.hs_audit_templates(id) ON DELETE SET NULL,
  next_due_date   date,
  active          boolean NOT NULL DEFAULT true,
  notes           text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_programmes_company_idx ON public.audit_programmes (company_id, next_due_date);

CREATE OR REPLACE FUNCTION public.audit_programmes_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_programmes_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_programmes_stamp ON public.audit_programmes;
CREATE TRIGGER audit_programmes_stamp BEFORE INSERT OR UPDATE ON public.audit_programmes
  FOR EACH ROW EXECUTE FUNCTION public.audit_programmes_stamp();

-- ── hs_audit_template_items gains a per-item severity hint ──────────
-- Mirrors inspection_template_items' own `critical` flag (145) — the
-- one thing a failed audit answer needs to derive a finding's default
-- severity from. Nullable: an existing item with none set defaults to
-- 'minor' at finding-creation time (see hs_submit_audit below), never
-- silently promoted to 'major'.

ALTER TABLE public.hs_audit_template_items
  ADD COLUMN IF NOT EXISTS default_severity text CHECK (default_severity IS NULL OR default_severity IN ('minor', 'major', 'critical'));

-- ── audit_findings ───────────────────────────────────────────────────
-- One row per FAILED hs_audit_responses row (UNIQUE), created
-- synchronously inside hs_submit_audit() (below) — never by the async
-- event consumer, so a finding exists the instant the audit itself
-- does, with no window where a failed answer has no finding record.
-- Unlike hs_audit_responses, this table is MUTABLE: a finding is
-- worked on over time (root cause added, a corrective action linked,
-- eventually closed) — the audit's own insert-only "correction is a
-- new row" discipline applies to the AUDIT, not to the investigation
-- of one of its findings.

CREATE TABLE IF NOT EXISTS public.audit_findings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hs_audit_response_id  uuid NOT NULL UNIQUE REFERENCES public.hs_audit_responses(id) ON DELETE CASCADE,
  audit_id              uuid NOT NULL REFERENCES public.hs_audits(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  severity              text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'critical')),
  root_cause            text CHECK (root_cause IS NULL OR length(root_cause) <= 2000),
  corrective_action_id  uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  closed_at             timestamptz,
  closed_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_findings_company_idx ON public.audit_findings (company_id, severity, closed_at);
CREATE INDEX IF NOT EXISTS audit_findings_audit_idx   ON public.audit_findings (audit_id);

-- company_id/audit_id are derived from the parent response, never
-- trusted from the caller — the hs_audit_response_fill()/
-- objective_measurements_fill() discipline.
CREATE OR REPLACE FUNCTION public.audit_findings_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  SELECT resp.audit_id, aud.company_id
    INTO r
    FROM public.hs_audit_responses resp
    JOIN public.hs_audits aud ON aud.id = resp.audit_id
    WHERE resp.id = NEW.hs_audit_response_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit response not found' USING ERRCODE = '23503';
  END IF;
  NEW.audit_id   := r.audit_id;
  NEW.company_id := r.company_id;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_findings_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_findings_fill ON public.audit_findings;
CREATE TRIGGER audit_findings_fill BEFORE INSERT OR UPDATE ON public.audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.audit_findings_fill();

-- The closure gate (rule 2). A MAJOR or CRITICAL finding may only be
-- closed (closed_at set, whether at insert or update) once it holds a
-- non-blank root_cause, a linked corrective_action_id, AND that
-- action has ITSELF reached a verified/effective state — reusing the
-- EXISTING actions.status/verified_at/effectiveness_outcome columns
-- from Phase 2 (125/126), never a parallel verification mechanism. A
-- MINOR finding may be closed freely — the gate is severity-scoped,
-- not universal. Runs BEFORE audit_findings_fill in trigger name
-- order ("aa_" sorts first) is unnecessary here since this function
-- reads NEW.severity/root_cause/corrective_action_id directly, none
-- of which audit_findings_fill touches.
CREATE OR REPLACE FUNCTION public.audit_findings_closure_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a record;
BEGIN
  IF NEW.closed_at IS NULL THEN
    NEW.closed_by := NULL;
    RETURN NEW;
  END IF;
  -- Nothing new to check if this row was already closed and closed_at
  -- is unchanged (an ordinary UPDATE to some other column).
  IF TG_OP = 'UPDATE' AND OLD.closed_at IS NOT NULL AND NEW.closed_at = OLD.closed_at THEN
    RETURN NEW;
  END IF;

  IF NEW.severity IN ('major', 'critical') THEN
    IF NEW.root_cause IS NULL OR length(btrim(NEW.root_cause)) = 0 THEN
      RAISE EXCEPTION 'A major or critical finding cannot be closed without a recorded root cause' USING ERRCODE = '23514';
    END IF;
    IF NEW.corrective_action_id IS NULL THEN
      RAISE EXCEPTION 'A major or critical finding cannot be closed without a linked corrective action' USING ERRCODE = '23514';
    END IF;
    SELECT status, verified_at, effectiveness_outcome INTO a
      FROM public.actions WHERE id = NEW.corrective_action_id;
    IF NOT FOUND OR a.status <> 'complete' OR a.verified_at IS NULL OR a.effectiveness_outcome <> 'effective' THEN
      RAISE EXCEPTION 'A major or critical finding cannot be closed until its linked corrective action has been completed, verified and confirmed effective' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.closed_by := COALESCE(auth.uid(), NEW.closed_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_findings_closure_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_findings_closure_guard ON public.audit_findings;
CREATE TRIGGER audit_findings_closure_guard BEFORE INSERT OR UPDATE ON public.audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.audit_findings_closure_guard();

-- ── hs_submit_audit(): also raise a finding for every failed answer ──
-- Extends the EXISTING atomic idempotent submit function (110/113)
-- rather than a second write path — a finding is created in the SAME
-- transaction as the audit and its responses, so a retried submit
-- (same client-generated ids) never double-creates one: the response
-- id is unique, so ON CONFLICT DO NOTHING makes the finding insert
-- idempotent too.
CREATE OR REPLACE FUNCTION public.hs_submit_audit(
  p_id uuid, p_company_id uuid, p_site_id uuid, p_template_id uuid,
  p_title text, p_conducted_on date, p_notes text, p_score numeric,
  p_responses jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing     uuid;
  r            jsonb;
  v_resp_id    uuid;
  v_item_sev   text;
BEGIN
  SELECT id INTO existing FROM public.hs_audits WHERE id = p_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  INSERT INTO public.hs_audits (id, company_id, site_id, template_id, title, conducted_on, score, notes)
  VALUES (p_id, p_company_id, p_site_id, p_template_id, p_title, p_conducted_on, p_score, p_notes);

  FOR r IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    v_resp_id := COALESCE(NULLIF(r->>'id', '')::uuid, gen_random_uuid());

    INSERT INTO public.hs_audit_responses (id, audit_id, template_item_id, prompt, category, rating, comment, sort_order)
    VALUES (
      v_resp_id,
      p_id,
      NULLIF(r->>'template_item_id', '')::uuid,
      r->>'prompt',
      NULLIF(r->>'category', ''),
      r->>'rating',
      NULLIF(r->>'comment', ''),
      COALESCE((r->>'sort_order')::integer, 0)
    );

    IF r->>'rating' = 'fail' THEN
      v_item_sev := NULL;
      IF NULLIF(r->>'template_item_id', '') IS NOT NULL THEN
        SELECT default_severity INTO v_item_sev FROM public.hs_audit_template_items
          WHERE id = (r->>'template_item_id')::uuid;
      END IF;
      INSERT INTO public.audit_findings (hs_audit_response_id, audit_id, company_id, severity)
      VALUES (v_resp_id, p_id, p_company_id, COALESCE(v_item_sev, 'minor'))
      ON CONFLICT (hs_audit_response_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_submit_audit(uuid, uuid, uuid, uuid, text, date, text, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_submit_audit(uuid, uuid, uuid, uuid, text, date, text, numeric, jsonb) TO authenticated;

-- ── consultation_records: staff-manage, client-read ─────────────────
-- Simple record-keeping — not a workflow engine. Reuses 'risk.read',
-- the broadest existing "can see the register" capability, the same
-- 158/159/161 precedent, since this is a cross-pillar governance
-- record rather than an environmental-specific one.

CREATE TABLE IF NOT EXISTS public.consultation_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id               uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  consultation_date     date NOT NULL,
  topic                 text NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 300),
  method                text NOT NULL CHECK (method IN ('meeting', 'survey', 'committee', 'one_to_one', 'other')),
  participants          text[] NOT NULL DEFAULT '{}',
  outcome_summary       text CHECK (outcome_summary IS NULL OR length(outcome_summary) <= 4000),
  linked_action_id      uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultation_records_company_idx ON public.consultation_records (company_id, consultation_date DESC);

CREATE OR REPLACE FUNCTION public.consultation_records_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  IF NEW.linked_action_id IS NOT NULL THEN
    PERFORM public.assert_same_org(NEW.company_id, 'actions', NEW.linked_action_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultation_records_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS consultation_records_stamp ON public.consultation_records;
CREATE TRIGGER consultation_records_stamp BEFORE INSERT OR UPDATE ON public.consultation_records
  FOR EACH ROW EXECUTE FUNCTION public.consultation_records_stamp();

-- ── environmental_complaints: same shape as Group 2's spills/waste ───
-- Reuses environmental.read/environmental.manage (156) — this is
-- environmental register content, the exact Group 2 posture.

CREATE TABLE IF NOT EXISTS public.environmental_complaints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id       uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL CHECK (source IN ('neighbour', 'regulator', 'employee', 'public', 'other')),
  description   text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  investigated  boolean NOT NULL DEFAULT false,
  outcome       text CHECK (outcome IS NULL OR length(outcome) <= 4000),
  linked_action_id uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  closed_at     timestamptz,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS environmental_complaints_company_idx ON public.environmental_complaints (company_id, received_at DESC);

CREATE OR REPLACE FUNCTION public.environmental_complaints_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  IF NEW.linked_action_id IS NOT NULL THEN
    PERFORM public.assert_same_org(NEW.company_id, 'actions', NEW.linked_action_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_complaints_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_complaints_stamp ON public.environmental_complaints;
CREATE TRIGGER environmental_complaints_stamp BEFORE INSERT OR UPDATE ON public.environmental_complaints
  FOR EACH ROW EXECUTE FUNCTION public.environmental_complaints_stamp();

-- ── evidence: hs_files gains 'audit_finding'/'consultation_record'/
--    'environmental_complaint' branches ───────────────────────────────
-- The exact pattern every Phase 4/5 group before this one used to add
-- a new evidence kind (Group 2's 'equipment', Group 3's 'inspection',
-- Group 1's 'environmental_aspect'). IMPORTANT: these five functions
-- had moved well past migration 113's snapshot by the time this group
-- was written (extra branches from Phase 2/3/4/Group-3, different
-- parameter names/order on hs_evidence_readable/writable) — the LIVE
-- bodies were fetched via execute_sql immediately before writing this
-- migration and are reproduced here verbatim, with only the new
-- branches added, never guessed from an older migration file.

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE p_type
    WHEN 'hazard'                    THEN 'hazards'
    WHEN 'risk_assessment'           THEN 'risk_assessments'
    WHEN 'method_statement'          THEN 'method_statements'
    WHEN 'coshh_assessment'          THEN 'coshh_assessments'
    WHEN 'substance'                 THEN 'substances'
    WHEN 'sds'                       THEN 'sds_versions'
    WHEN 'incident'                  THEN 'hs_incidents'
    WHEN 'investigation'             THEN 'incident_investigations'
    WHEN 'equipment'                 THEN 'hs_equipment'
    WHEN 'person'                    THEN 'people'
    WHEN 'document'                  THEN 'hs_documents'
    WHEN 'control'                   THEN 'controls'
    WHEN 'training_record'           THEN 'training_records'
    WHEN 'action'                    THEN 'actions'
    WHEN 'audit'                     THEN 'hs_audits'
    WHEN 'site'                      THEN 'hs_sites'
    WHEN 'inspection'                THEN 'inspections'
    WHEN 'puwer_assessment'          THEN 'puwer_assessments'
    WHEN 'contractor'                THEN 'contractors'
    WHEN 'environmental_aspect'      THEN 'environmental_aspects'
    WHEN 'environmental_spill'       THEN 'environmental_spills'
    WHEN 'waste_movement'            THEN 'waste_movements'
    WHEN 'environmental_monitoring'  THEN 'environmental_monitoring'
    WHEN 'environmental_permit'      THEN 'environmental_permits'
    WHEN 'compliance_item'           THEN 'compliance_items'
    WHEN 'iso_certification'         THEN 'iso_certifications'
    WHEN 'compliance_evaluation'     THEN 'compliance_evaluations'
    WHEN 'audit_finding'             THEN 'audit_findings'
    WHEN 'consultation_record'       THEN 'consultation_records'
    WHEN 'environmental_complaint'   THEN 'environmental_complaints'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE p_entity
    WHEN 'register_item'          THEN 'register'
    WHEN 'register_completion'    THEN 'register'
    WHEN 'activity'                THEN 'register'
    WHEN 'site'                    THEN 'register'
    WHEN 'equipment'               THEN 'register'
    WHEN 'equipment_inspection'    THEN 'register'
    WHEN 'inspection'              THEN 'register'
    WHEN 'inspection_response'     THEN 'register'
    WHEN 'puwer_assessment'        THEN 'register'
    WHEN 'contractor'              THEN 'register'
    WHEN 'environmental_aspect'    THEN 'register'
    WHEN 'environmental_spill'     THEN 'register'
    WHEN 'waste_movement'          THEN 'register'
    WHEN 'environmental_monitoring' THEN 'register'
    WHEN 'environmental_permit'    THEN 'register'
    WHEN 'iso_certification'       THEN 'register'
    WHEN 'compliance_evaluation'   THEN 'register'
    WHEN 'document'                THEN 'documents'
    WHEN 'training'                THEN 'training'
    WHEN 'audit'                   THEN 'audits'
    WHEN 'audit_response'          THEN 'audits'
    WHEN 'audit_finding'           THEN 'audits'
    WHEN 'incident'                THEN 'incidents'
    WHEN 'investigation'           THEN 'incidents'
    WHEN 'hazard'                  THEN 'register'
    WHEN 'risk_assessment'         THEN 'register'
    WHEN 'method_statement'        THEN 'register'
    WHEN 'method_statement_step'   THEN 'register'
    WHEN 'substance'               THEN 'register'
    WHEN 'sds'                     THEN 'register'
    WHEN 'coshh_assessment'        THEN 'register'
    WHEN 'action'                  THEN 'register'
    WHEN 'consultation_record'     THEN 'register'
    WHEN 'environmental_complaint' THEN 'register'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_evidence_readable(p_company uuid, p_entity_type text, p_evidence_type text, p_recorded_by uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE
    WHEN public.is_tps_staff() THEN true
    WHEN p_company IS DISTINCT FROM public.my_company_id() THEN false
    WHEN p_recorded_by = auth.uid() THEN true
    WHEN p_entity_type IN ('incident', 'investigation') THEN
      public.has_capability(p_company, 'incident.read')
      AND (p_evidence_type NOT IN ('witness_statement', 'medical') OR public.has_capability(p_company, 'incident.sensitive.read'))
    WHEN p_entity_type = 'hazard' THEN
      public.has_capability(p_company, 'hazard.manage') OR public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type IN ('risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds', 'coshh_assessment') THEN
      public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type IN ('equipment', 'equipment_inspection', 'puwer_assessment') THEN
      public.has_capability(p_company, 'asset.read')
    WHEN p_entity_type IN ('inspection', 'inspection_response') THEN
      public.has_capability(p_company, 'asset.read') OR public.has_capability(p_company, 'inspection.perform')
    WHEN p_entity_type = 'contractor' THEN
      public.has_capability(p_company, 'contractors.manage')
    WHEN p_entity_type IN ('environmental_aspect', 'environmental_spill', 'waste_movement', 'environmental_monitoring', 'environmental_permit') THEN
      public.has_capability(p_company, 'environmental.read')
    WHEN p_entity_type = 'iso_certification' THEN
      public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type = 'compliance_evaluation' THEN
      public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type = 'consultation_record' THEN
      public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type = 'environmental_complaint' THEN
      public.has_capability(p_company, 'environmental.read')
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_evidence_writable(p_company uuid, p_entity_type text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT CASE
    WHEN public.is_tps_staff() THEN true
    WHEN p_company IS DISTINCT FROM public.my_company_id() THEN false
    WHEN p_entity_type = 'hazard'        THEN public.has_capability(p_company, 'hazard.report')
    WHEN p_entity_type = 'incident'      THEN public.has_capability(p_company, 'incident.create')
    WHEN p_entity_type = 'investigation' THEN public.has_capability(p_company, 'incident.investigate')
    WHEN p_entity_type IN ('risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds', 'coshh_assessment')
                                         THEN public.has_capability(p_company, 'risk.create')
    WHEN p_entity_type = 'action'        THEN true
    WHEN p_entity_type IN ('equipment', 'equipment_inspection', 'puwer_assessment') THEN public.has_capability(p_company, 'asset.manage')
    WHEN p_entity_type IN ('inspection', 'inspection_response') THEN public.has_capability(p_company, 'inspection.perform')
    WHEN p_entity_type = 'contractor'     THEN public.has_capability(p_company, 'contractors.manage')
    WHEN p_entity_type IN ('environmental_aspect', 'environmental_spill', 'waste_movement', 'environmental_monitoring', 'environmental_permit')
                                          THEN public.has_capability(p_company, 'environmental.manage')
    WHEN p_entity_type = 'iso_certification' THEN public.has_capability(p_company, 'risk.create')
    WHEN p_entity_type = 'compliance_evaluation' THEN false
    WHEN p_entity_type = 'audit_finding' THEN public.has_capability(p_company, 'risk.create')
    WHEN p_entity_type = 'environmental_complaint' THEN public.has_capability(p_company, 'environmental.manage')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment', 'inspection',
                         'puwer_assessment', 'contractor', 'environmental_aspect',
                         'environmental_spill', 'waste_movement', 'environmental_monitoring', 'environmental_permit',
                         'iso_certification', 'compliance_evaluation', 'audit_finding', 'consultation_record',
                         'environmental_complaint') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── actions.source_type already allows 'audit_finding' — confirmed
--    live before writing this migration (161's CHECK). No ALTER here.
--    'consultation' and 'environmental_complaint' are NEW values. ────

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_source_type_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_source_type_check CHECK (
  source_type IS NULL OR source_type = ANY (ARRAY[
    'incident', 'audit', 'audit_finding', 'risk_assessment', 'inspection', 'equipment_inspection',
    'consultant_visit', 'service_request', 'legal_requirement', 'regulatory_broadcast', 'broadcast',
    'hr_process', 'training_gap', 'contractor_review', 'compliance_item', 'hs_check', 'onboarding',
    'manual', 'other', 'hazard', 'method_statement', 'coshh_assessment', 'investigation', 'riddor_review',
    'puwer_assessment', 'environmental_aspect', 'environmental_spill', 'waste_movement',
    'environmental_monitoring', 'environmental_permit_condition',
    'objective', 'management_review',
    'consultation', 'environmental_complaint'
  ]::text[])
);

-- ── audit trail (117) — identifying/classifying only, never free text ─

DROP TRIGGER IF EXISTS audit_programmes_audit ON public.audit_programmes;
CREATE TRIGGER audit_programmes_audit AFTER INSERT OR UPDATE OR DELETE ON public.audit_programmes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('audit_programme', 'company_id', 'name', 'frequency', 'active', 'next_due_date');

DROP TRIGGER IF EXISTS audit_findings_audit ON public.audit_findings;
CREATE TRIGGER audit_findings_audit AFTER INSERT OR UPDATE ON public.audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('audit_finding', 'company_id', 'severity', 'closed_at', 'corrective_action_id');

DROP TRIGGER IF EXISTS consultation_records_audit ON public.consultation_records;
CREATE TRIGGER consultation_records_audit AFTER INSERT OR UPDATE OR DELETE ON public.consultation_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('consultation_record', 'company_id', 'consultation_date', 'method');

DROP TRIGGER IF EXISTS environmental_complaints_audit ON public.environmental_complaints;
CREATE TRIGGER environmental_complaints_audit AFTER INSERT OR UPDATE OR DELETE ON public.environmental_complaints
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_complaint', 'company_id', 'source', 'investigated', 'closed_at');

-- ── outbox: classifying fields only, never description/root_cause/
--    outcome_summary/outcome ───────────────────────────────────────

DROP TRIGGER IF EXISTS audit_findings_platform_event ON public.audit_findings;
CREATE TRIGGER audit_findings_platform_event AFTER INSERT OR UPDATE ON public.audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('severity', 'closed_at', 'corrective_action_id');

DROP TRIGGER IF EXISTS consultation_records_platform_event ON public.consultation_records;
CREATE TRIGGER consultation_records_platform_event AFTER INSERT ON public.consultation_records
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('consultation_date', 'method', 'site_id');

DROP TRIGGER IF EXISTS environmental_complaints_platform_event ON public.environmental_complaints;
CREATE TRIGGER environmental_complaints_platform_event AFTER INSERT OR UPDATE ON public.environmental_complaints
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('source', 'investigated', 'closed_at', 'site_id');

-- ── write guards (117) — client-readable tables ─────────────────────

SELECT public.apply_write_guard('public.audit_programmes');
SELECT public.apply_write_guard('public.audit_findings');
SELECT public.apply_write_guard('public.consultation_records');
SELECT public.apply_write_guard('public.environmental_complaints');

-- ── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE public.audit_programmes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_findings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environmental_complaints ENABLE ROW LEVEL SECURITY;

-- audit_programmes/audit_findings: the exact hs_audits posture — staff
-- full access, plain-company client read, no capability gate.
DROP POLICY IF EXISTS audit_programmes_staff_all ON public.audit_programmes;
CREATE POLICY audit_programmes_staff_all ON public.audit_programmes FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS audit_programmes_client_read ON public.audit_programmes;
CREATE POLICY audit_programmes_client_read ON public.audit_programmes FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

DROP POLICY IF EXISTS audit_findings_staff_all ON public.audit_findings;
CREATE POLICY audit_findings_staff_all ON public.audit_findings FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS audit_findings_client_read ON public.audit_findings;
CREATE POLICY audit_findings_client_read ON public.audit_findings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- consultation_records: staff-manage, client-read (reusing risk.read,
-- the 158/159/161 precedent for a cross-pillar governance record).
DROP POLICY IF EXISTS consultation_records_staff_all ON public.consultation_records;
CREATE POLICY consultation_records_staff_all ON public.consultation_records FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS consultation_records_read ON public.consultation_records;
CREATE POLICY consultation_records_read ON public.consultation_records FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

-- environmental_complaints: the exact Group 2 spills/waste shape —
-- staff full access; a client with environmental.read may see their
-- own company's rows, and with environmental.manage may raise/update
-- one (a client is often the one who receives the complaint).
DROP POLICY IF EXISTS environmental_complaints_staff_all ON public.environmental_complaints;
CREATE POLICY environmental_complaints_staff_all ON public.environmental_complaints FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS environmental_complaints_read ON public.environmental_complaints;
CREATE POLICY environmental_complaints_read ON public.environmental_complaints FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));
DROP POLICY IF EXISTS environmental_complaints_insert ON public.environmental_complaints;
CREATE POLICY environmental_complaints_insert ON public.environmental_complaints FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));
DROP POLICY IF EXISTS environmental_complaints_update ON public.environmental_complaints;
CREATE POLICY environmental_complaints_update ON public.environmental_complaints FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));
