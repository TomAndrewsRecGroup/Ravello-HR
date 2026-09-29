-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 4: the Legal Register (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on Groups 1-3 (migrations 156-158). Read docs/CORE_OS_360_
-- PHASE5_GOVERNANCE_MAP.md before touching this.
--
-- Three tables: legal_requirements (staff reference catalogue of source
-- material — never reproduced legislation text), organisation_legal_
-- obligations (a company's link to a requirement + the HUMAN
-- applicability decision) and compliance_evaluations (one row per
-- evaluation EVENT, insert-mostly, so history is preserved). A fourth,
-- legal_requirement_research_notes, is an inert foundation for a LATER
-- Tavily-based external legal research feature — no live API call
-- anywhere in this migration or the TypeScript it ships with.
--
-- Absolute rules this migration is built to (see the task brief):
--   1. AI never decides applicability. organisation_legal_obligations'
--      applicability_status is a human decision; assessed_by/assessed_at
--      must both be set, by the database's own gate, before the status
--      may read 'applicable'/'not_applicable' — the exact "the database
--      refuses an unconfirmed decision, not just the UI" discipline
--      environmental_aspect_assessments_fill() (156) already
--      established for a different, non-AI reason. No AI is wired
--      anywhere in this group; the gate exists so a LATER group cannot
--      wire one in without also rewriting this trigger.
--   2. Cautious, factual compliance vocabulary ONLY. compliance_
--      evaluations.status is exactly: evidence_current |
--      evidence_incomplete | review_due | potential_noncompliance |
--      confirmed_noncompliance | not_evaluated. Never "compliant" /
--      "non-compliant" / "legal" / "illegal" anywhere in this
--      subsystem's labels, copy or notifications.
--   3. No automatic legal advice or compliance conclusion asserted on
--      the platform's own authority — this schema tracks evaluation
--      STATE and evidence gaps; it never declares a verdict.
--   4. legal_requirements is a REGISTER OF SOURCE MATERIAL: a short,
--      staff-written internal summary and an optional link OUT to the
--      real legislation — never the statute text itself, mirroring
--      standard_clauses' (158) own "short hand-written paraphrase,
--      never copied text" discipline.
--   5. Never build a second action table. A confirmed_noncompliance or
--      potential_noncompliance evaluation raises an `actions` row via
--      the EXISTING `source_type = 'legal_requirement'` value — already
--      present in actions_source_type_check since Phase 4 (156's own
--      CHECK list carries it forward unchanged; no ALTER needed here).
--   6. Insert-only history for compliance_evaluations — a correction is
--      a NEW evaluation row, never an edit, the hs_register_completions/
--      puwer_assessments discipline. The one live-review-date field a
--      reminder needs is rolled FORWARD onto organisation_legal_
--      obligations.next_review_due by an AFTER INSERT trigger, guarded
--      "only when this is the newest evaluation for this obligation" —
--      the EXACT 148a (PUWER) lesson this codebase already learned the
--      hard way: reading an insert-only table directly for a reminder
--      fires once per historical row, not just the current one.
--   7. RLS: legal_requirements/legal_requirement_research_notes are
--      STAFF-ONLY — never client-visible, even read-only. organisation_
--      legal_obligations/compliance_evaluations are CLIENT-READ +
--      STAFF-MANAGE only (no client write path at all): this is a
--      staff-delivered service, the same posture the H&S register has
--      held since Phase 1b ("nothing here is self-certified"). The read
--      capability reused is 'risk.read' — Group 3's (158) own choice
--      for "an EHS governance catalogue a client genuinely needs to
--      read" — never a new capability.
--   8. apply_write_guard() on the two client-readable tables (a
--      read-only consultancy grant must not be able to write even
--      though only staff RLS otherwise permits it) — not on the two
--      staff-only reference tables, the exact precedent 158 set
--      (management_system_standards/standard_clauses got no write
--      guard; only the client-facing standard_evidence_links/
--      iso_certifications did).
--   9. Evidence rides the existing hs_files/hs-evidence infrastructure
--      via a new 'compliance_evaluation' branch (evidence hangs off the
--      EVALUATION that the proof was gathered for, not the standing
--      obligation link) on the four evidence functions — the exact
--      pattern every Phase 4/5 group before this one established.
--  10. Outbox + audit trail + reminders, never a text field in a
--      whitelist: organisation_legal_obligations (applicability_status
--      changes) and compliance_evaluations (a new evaluation) join
--      TRIGGERED_ENTITIES; organisation_legal_obligations.next_
--      review_due joins REMINDER_ENTITIES (see rule 6's rolled column).
--
-- Idempotent. Safe to re-run.

-- ── legal_requirements: staff reference catalogue of SOURCE MATERIAL ─

CREATE TABLE IF NOT EXISTS public.legal_requirements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  -- A parallel, small legal-domain category set — genuinely different
  -- from COMPLIANCE_CATEGORIES (contract/policy/handbook/training/
  -- data/hr/other, a client's own item categories) and from
  -- HS_REGISTER_CATEGORIES (recurring H&S check types): a piece of
  -- LEGISLATION is neither. Checked against statusMaps.ts/hs/vocab.ts
  -- before deciding this — neither union names anything like
  -- "employment law" or "environmental law" as a value, and forcing
  -- legislation categories onto either would be the same category
  -- error the 2026-09-25 compliance-form sweep (CLAUDE.md) already
  -- fixed once for HR vs H&S.
  category     text NOT NULL CHECK (category IN (
                 'health_safety', 'environmental', 'employment_law', 'data_protection',
                 'fire_safety', 'food_safety', 'licensing', 'consumer', 'general', 'other')),
  jurisdiction text NOT NULL DEFAULT 'UK' CHECK (length(btrim(jurisdiction)) BETWEEN 1 AND 100),
  -- A SHORT internal summary staff write themselves — never the actual
  -- statute text (rule 4). Nothing in SQL can verify "is this a
  -- paraphrase"; that discipline lives in who is allowed to write here
  -- (staff only) and in this comment, the same honesty 158's own
  -- header already records about standard_clauses.title.
  summary      text CHECK (summary IS NULL OR length(summary) <= 2000),
  source_url   text CHECK (source_url IS NULL OR length(source_url) <= 500),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_requirements_category_idx ON public.legal_requirements (category);

CREATE OR REPLACE FUNCTION public.legal_requirements_stamp()
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
REVOKE ALL ON FUNCTION public.legal_requirements_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS legal_requirements_stamp ON public.legal_requirements;
CREATE TRIGGER legal_requirements_stamp BEFORE INSERT OR UPDATE ON public.legal_requirements
  FOR EACH ROW EXECUTE FUNCTION public.legal_requirements_stamp();

-- ── organisation_legal_obligations: per-company link + the HUMAN
--    applicability decision (rule 1) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organisation_legal_obligations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  legal_requirement_id  uuid NOT NULL REFERENCES public.legal_requirements(id) ON DELETE CASCADE,
  applicability_status  text NOT NULL DEFAULT 'not_assessed' CHECK (applicability_status IN (
                          'not_assessed', 'applicable', 'not_applicable', 'under_review')),
  assessed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at           timestamptz,
  assessment_rationale  text CHECK (assessment_rationale IS NULL OR length(assessment_rationale) <= 4000),
  -- Rolled forward from the newest compliance_evaluations row for this
  -- obligation (rule 6) — the ONE denormalised field this migration
  -- keeps, purely to give the reminders cron a live column to read
  -- instead of an insert-only history table it would have to
  -- re-derive "the latest" from on every run.
  next_review_due       date,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, legal_requirement_id)
);
CREATE INDEX IF NOT EXISTS organisation_legal_obligations_company_idx ON public.organisation_legal_obligations (company_id, applicability_status);

-- The database's own gate on rule 1: a real applicability DECISION
-- ('applicable'/'not_applicable') may not be recorded without a named
-- assessor and a timestamp — 'under_review' is a staff FLAG, not a
-- decision, and 'not_assessed' is the un-touched default, so neither
-- needs a confirmer. Never auto-stamps assessed_by from auth.uid():
-- unlike created_by/updated_at (bookkeeping nobody should be able to
-- spoof), WHO made the applicability call is itself part of the
-- decision the UI records, the exact choice environmental_aspect_
-- assessments_fill() (156) already made for confirmed_by.
CREATE OR REPLACE FUNCTION public.organisation_legal_obligations_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  IF NEW.applicability_status IN ('applicable', 'not_applicable')
     AND (NEW.assessed_by IS NULL OR NEW.assessed_at IS NULL) THEN
    RAISE EXCEPTION 'An applicability decision must be confirmed by a named assessor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.organisation_legal_obligations_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS organisation_legal_obligations_stamp ON public.organisation_legal_obligations;
CREATE TRIGGER organisation_legal_obligations_stamp BEFORE INSERT OR UPDATE ON public.organisation_legal_obligations
  FOR EACH ROW EXECUTE FUNCTION public.organisation_legal_obligations_stamp();

-- ── compliance_evaluations: one row per evaluation EVENT (rule 6) ───

CREATE TABLE IF NOT EXISTS public.compliance_evaluations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id  uuid NOT NULL REFERENCES public.organisation_legal_obligations(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Rule 2's exact cautious vocabulary. Never widen this list with
  -- "compliant"/"non_compliant"/"legal"/"illegal" — that is the one
  -- thing this whole group exists to avoid saying.
  status         text NOT NULL CHECK (status IN (
                   'evidence_current', 'evidence_incomplete', 'review_due',
                   'potential_noncompliance', 'confirmed_noncompliance', 'not_evaluated')),
  evaluated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evaluated_at   timestamptz NOT NULL DEFAULT now(),
  notes          text CHECK (notes IS NULL OR length(notes) <= 4000),
  next_review_due date,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_evaluations_obligation_idx ON public.compliance_evaluations (obligation_id, evaluated_at DESC);

-- company_id filled from the parent obligation, never trusted from the
-- caller (the same discipline environmental_aspect_assessments_fill()/
-- contractor_insurances_fill() already use). evaluated_by is always the
-- acting session, never a caller-supplied value — an evaluation is a
-- bookkeeping fact about WHO is recording it right now, unlike the
-- applicability decision above.
CREATE OR REPLACE FUNCTION public.compliance_evaluations_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  SELECT company_id INTO o FROM public.organisation_legal_obligations WHERE id = NEW.obligation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Legal obligation not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := o.company_id;
  NEW.evaluated_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.compliance_evaluations_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS compliance_evaluations_fill ON public.compliance_evaluations;
CREATE TRIGGER compliance_evaluations_fill
  BEFORE INSERT ON public.compliance_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.compliance_evaluations_fill();

REVOKE UPDATE, DELETE, TRUNCATE ON public.compliance_evaluations FROM PUBLIC, anon, authenticated;

-- Rule 6: roll the NEWEST evaluation's next_review_due forward onto the
-- obligation, guarded "only when nothing newer already exists for this
-- obligation" so a late-backfilled old evaluation can never move a
-- newer one's review date backwards — the exact 148a lesson.
CREATE OR REPLACE FUNCTION public.compliance_evaluations_roll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.organisation_legal_obligations
  SET next_review_due = NEW.next_review_due,
      updated_at = now()
  WHERE id = NEW.obligation_id
    AND NOT EXISTS (
      SELECT 1 FROM public.compliance_evaluations ce2
      WHERE ce2.obligation_id = NEW.obligation_id
        AND ce2.id <> NEW.id
        AND ce2.evaluated_at > NEW.evaluated_at
    );
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.compliance_evaluations_roll() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS compliance_evaluations_roll ON public.compliance_evaluations;
CREATE TRIGGER compliance_evaluations_roll
  AFTER INSERT ON public.compliance_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.compliance_evaluations_roll();

-- ── legal_requirement_research_notes: inert Tavily foundation ───────
--
-- Rule 3/Tavily foundation: storage shape only. No API call anywhere in
-- this migration or the TypeScript it ships with — a LATER group wires
-- a live call and populates raw_result_summary; today it is either
-- empty or staff-entered by hand ('manual'). Never automates a legal
-- conclusion or a compliance-status change from anything in this table.

CREATE TABLE IF NOT EXISTS public.legal_requirement_research_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_requirement_id  uuid NOT NULL REFERENCES public.legal_requirements(id) ON DELETE CASCADE,
  source                text NOT NULL CHECK (source IN ('tavily', 'manual')),
  query_used            text CHECK (query_used IS NULL OR length(query_used) <= 500),
  raw_result_summary    text CHECK (raw_result_summary IS NULL OR length(raw_result_summary) <= 4000),
  reviewed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  action_taken          text CHECK (action_taken IS NULL OR length(action_taken) <= 2000),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_requirement_research_notes_req_idx ON public.legal_requirement_research_notes (legal_requirement_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.legal_requirement_research_notes_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.legal_requirement_research_notes_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS legal_requirement_research_notes_fill ON public.legal_requirement_research_notes;
CREATE TRIGGER legal_requirement_research_notes_fill
  BEFORE INSERT ON public.legal_requirement_research_notes
  FOR EACH ROW EXECUTE FUNCTION public.legal_requirement_research_notes_fill();

-- ── evidence: 'compliance_evaluation' branch (rule 9) ───────────────
--
-- Re-creates hs_entity_table()/hs_scope_for_entity()/hs_evidence_
-- readable()/hs_evidence_writable()/hs_files_entity_check() (158's
-- latest bodies), adding only this one branch — every other branch
-- copied unchanged so this migration is provably additive, the exact
-- discipline 156/157/158 already document. Evidence hangs off the
-- EVALUATION (the specific event the proof was gathered for), not the
-- standing obligation link — a documented choice, not the only
-- possible one.

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
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
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
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
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_evidence_readable(p_company uuid, p_entity_type text, p_evidence_type text, p_recorded_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    ELSE true
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_evidence_writable(p_company uuid, p_entity_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    -- Evaluations are client-READ, staff-MANAGE only (rule 7) — no
    -- client capability grants a client-side evidence upload here.
    WHEN p_entity_type = 'compliance_evaluation' THEN false
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment', 'inspection',
                         'puwer_assessment', 'contractor', 'environmental_aspect',
                         'environmental_spill', 'waste_movement', 'environmental_monitoring', 'environmental_permit',
                         'iso_certification', 'compliance_evaluation') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── audit trail (117) — identifying/classifying only, never free text ─

DROP TRIGGER IF EXISTS organisation_legal_obligations_audit ON public.organisation_legal_obligations;
CREATE TRIGGER organisation_legal_obligations_audit AFTER INSERT OR UPDATE OR DELETE ON public.organisation_legal_obligations
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('organisation_legal_obligation', 'company_id', 'legal_requirement_id', 'applicability_status');

DROP TRIGGER IF EXISTS compliance_evaluations_audit ON public.compliance_evaluations;
CREATE TRIGGER compliance_evaluations_audit AFTER INSERT ON public.compliance_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('compliance_evaluation', 'company_id', 'obligation_id', 'status');

-- ── outbox: whitelist is classifying fields only, never notes/
--    assessment_rationale/raw_result_summary/action_taken (rule 10) ──

DROP TRIGGER IF EXISTS organisation_legal_obligations_platform_event ON public.organisation_legal_obligations;
CREATE TRIGGER organisation_legal_obligations_platform_event AFTER INSERT OR UPDATE ON public.organisation_legal_obligations
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('legal_requirement_id', 'applicability_status');

DROP TRIGGER IF EXISTS compliance_evaluations_platform_event ON public.compliance_evaluations;
CREATE TRIGGER compliance_evaluations_platform_event AFTER INSERT ON public.compliance_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('obligation_id', 'status', 'next_review_due');

-- ── write guards (117) — the two client-READABLE tables only, the
--    exact 158 precedent (staff-only reference tables get none) ─────

SELECT public.apply_write_guard('public.organisation_legal_obligations');
SELECT public.apply_write_guard('public.compliance_evaluations');

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE public.legal_requirements                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_legal_obligations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_evaluations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_requirement_research_notes    ENABLE ROW LEVEL SECURITY;

-- Rule 7: legal_requirements is STAFF-ONLY — never client-visible even
-- read-only, unlike 158's standard_clauses (which a client genuinely
-- needs to read for its own clause-by-clause evidence view). A legal
-- requirement's applicability to a SPECIFIC company is what a client
-- may see, via organisation_legal_obligations below — not the raw
-- catalogue of every requirement Core OS 360 tracks for every client.
DROP POLICY IF EXISTS legal_requirements_staff_all ON public.legal_requirements;
CREATE POLICY legal_requirements_staff_all ON public.legal_requirements FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS legal_requirement_research_notes_staff_all ON public.legal_requirement_research_notes;
CREATE POLICY legal_requirement_research_notes_staff_all ON public.legal_requirement_research_notes FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- organisation_legal_obligations / compliance_evaluations: client-READ
-- + staff-MANAGE only (rule 7) — no client INSERT/UPDATE/DELETE policy
-- at all. This is a staff-delivered service, matching the H&S register's
-- own "nothing here is self-certified" posture since Phase 1b.
DROP POLICY IF EXISTS organisation_legal_obligations_staff_all ON public.organisation_legal_obligations;
CREATE POLICY organisation_legal_obligations_staff_all ON public.organisation_legal_obligations FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS organisation_legal_obligations_read ON public.organisation_legal_obligations;
CREATE POLICY organisation_legal_obligations_read ON public.organisation_legal_obligations FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

DROP POLICY IF EXISTS compliance_evaluations_staff_all ON public.compliance_evaluations;
CREATE POLICY compliance_evaluations_staff_all ON public.compliance_evaluations FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS compliance_evaluations_read ON public.compliance_evaluations;
CREATE POLICY compliance_evaluations_read ON public.compliance_evaluations FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));
