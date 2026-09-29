-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 3: shared ISO 45001/14001 management-
-- system framework + a purely factual readiness dashboard (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on Groups 1-2 (migrations 156-157). Read
-- docs/CORE_OS_360_PHASE5_GOVERNANCE_MAP.md before touching this.
--
-- Hard rules this migration is built to (see the task brief):
--   1. ONE shared framework for ISO 45001 (H&S) and ISO 14001
--      (Environmental) — management_system_standards (rows: the two
--      standards, extensible to more later) and ONE standard_clauses
--      table shared by both via standard_id, never two parallel clause
--      tables.
--   2. No copyrighted standard text. Every clause title is a SHORT
--      (<=200 char), hand-written, one-sentence paraphrase — never the
--      actual ISO document text. A CHECK enforces the length; nothing
--      enforces "is this a paraphrase", which is a drafting discipline
--      this migration's own seed data follows, not something SQL can
--      verify.
--   3. standard_evidence_links is the foundation for a LATER Evidence
--      Engine, not the Evidence Engine itself: a bare polymorphic
--      (entity_type, entity_id) reference into EXISTING evidence,
--      reusing hs_entity_table()/hs_entity_company() (122) for the
--      cross-organisation check — never a new copy of the evidence.
--   4. Readiness is COUNTS ONLY: clauses total / with evidence /
--      without. No score, no percentage, no significance judgement.
--      Computed at read time in TypeScript from these two tables —
--      exactly the same posture lib/hs/kpis.ts and lib/health/
--      scoring.ts already take for other "no stored aggregate that can
--      drift" dashboards. No view or function to keep in step.
--   5. No certification/compliance claim ANYWHERE except a real,
--      user-entered iso_certifications row — the readiness dashboard's
--      own copy says "Recorded evidence mapped to applicable
--      management-system requirements", never "compliant"/"certified".
--   6. RLS: management_system_standards/standard_clauses are STAFF-
--      WRITE, but — unlike hs_sector_packs/hs_audit_templates, which a
--      client never browses directly because they only ever see the
--      MATERIALISED result on their own register — the UI spec here
--      explicitly needs a client to read the clause catalogue itself
--      (to show a clause-by-clause evidence view). So this follows
--      inspection_templates' (145) precedent instead: staff ALL, any
--      signed-in user with the read capability may SELECT the
--      catalogue. standard_evidence_links/iso_certifications are
--      per-company, client-read + staff-manage, the ordinary shape.
--   7. Capability reuse, never invented: 'risk.read'/'risk.create' —
--      the broadest existing "can see/add to the H&S register" pair,
--      already held by every role capable of contributing evidence,
--      spans both standards (ISO 45001 is H&S; ISO 14001 is
--      Environmental, and every environmental.manage role already
--      holds risk.read/risk.create too — checked against 156's ENV_ALL
--      role list before relying on it). No new capability seeded.
--   8. apply_write_guard() on every new client-writable table.
--   9. Audit trail on every new table; iso_certifications additionally
--      joins REMINDER_ENTITIES for expiry (due_30/due_7/overdue).
--  10. Evidence for a certificate itself rides hs_files via a new
--      'iso_certification' branch on the four evidence functions — the
--      exact pattern Group 1/2's 'environmental_aspect'/'environmental_
--      permit' branches already established.
--
-- Idempotent. Safe to re-run.

-- ── management_system_standards: the two standards, extensible ──────

CREATE TABLE IF NOT EXISTS public.management_system_standards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{3,40}$'),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── standard_clauses: ONE table shared by every standard (rule 1) ───
--
-- title is a short, hand-written paraphrase (rule 2) — never copied
-- standard text. maps_to_hint names which of this platform's EXISTING
-- record kinds typically satisfies this clause (an hs_entity_table()
-- key, e.g. 'document'/'risk_assessment'/'training_record'/
-- 'environmental_aspect'/'compliance_item') — a drafting HINT for the
-- person adding evidence, not an enforced FK: a single clause can
-- legitimately be satisfied by more than one kind of record.

CREATE TABLE IF NOT EXISTS public.standard_clauses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id    uuid NOT NULL REFERENCES public.management_system_standards(id) ON DELETE CASCADE,
  clause_number  text NOT NULL CHECK (length(btrim(clause_number)) BETWEEN 1 AND 20),
  title          text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  maps_to_hint   text CHECK (maps_to_hint IS NULL OR length(maps_to_hint) <= 60),
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (standard_id, clause_number)
);
CREATE INDEX IF NOT EXISTS standard_clauses_standard_idx ON public.standard_clauses (standard_id, display_order);

-- ── standard_evidence_links: the Evidence Engine's foundation only ──
--
-- Rule 3: a bare polymorphic reference into EXISTING evidence, reusing
-- hs_entity_table()/hs_entity_company() (122) rather than a new
-- duplicate copy of the evidence. 'compliance_item' is added to
-- hs_entity_table() below (it was never mapped — a real gap, since the
-- HR/H&S register is an obvious evidence source for a clause).

CREATE TABLE IF NOT EXISTS public.standard_evidence_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  clause_id    uuid NOT NULL REFERENCES public.standard_clauses(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  added_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, clause_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS standard_evidence_links_company_idx ON public.standard_evidence_links (company_id, clause_id);

CREATE OR REPLACE FUNCTION public.standard_evidence_links_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  NEW.added_by := auth.uid();
  IF public.hs_entity_table(NEW.entity_type) IS NULL THEN
    RAISE EXCEPTION 'Unknown evidence entity type: %', NEW.entity_type USING ERRCODE = '23514';
  END IF;
  owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
  IF owner IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.standard_evidence_links_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS standard_evidence_links_fill ON public.standard_evidence_links;
CREATE TRIGGER standard_evidence_links_fill
  BEFORE INSERT ON public.standard_evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.standard_evidence_links_fill();

-- ── iso_certifications: USER-ENTERED evidence of a real certificate ──
--
-- Rule 5's one exception: this is the ONLY table anything in this
-- subsystem may point to when saying a standard is certified — never a
-- computed conclusion. Mutable (a renewal updates the same row), the
-- same "ongoing state with one current expiry" shape contractor_
-- insurances (150) already established, not "a correction is a new
-- row" — a certificate has one current expiry, not a history of them.

CREATE TABLE IF NOT EXISTS public.iso_certifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  standard_id         uuid NOT NULL REFERENCES public.management_system_standards(id) ON DELETE RESTRICT,
  certificate_number  text CHECK (length(certificate_number) <= 100),
  certifying_body     text CHECK (length(certifying_body) <= 200),
  issued_on           date,
  expires_on          date,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iso_certifications_company_idx ON public.iso_certifications (company_id, standard_id);

CREATE OR REPLACE FUNCTION public.iso_certifications_stamp()
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
REVOKE ALL ON FUNCTION public.iso_certifications_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS iso_certifications_stamp ON public.iso_certifications;
CREATE TRIGGER iso_certifications_stamp BEFORE INSERT OR UPDATE ON public.iso_certifications
  FOR EACH ROW EXECUTE FUNCTION public.iso_certifications_stamp();

-- ── evidence: 'compliance_item' + 'iso_certification' branches ──────
--
-- Re-creates hs_entity_table()/hs_scope_for_entity()/hs_evidence_
-- readable()/hs_evidence_writable()/hs_files_entity_check() (157's
-- latest bodies), adding only two branches — every other branch copied
-- unchanged so this migration is provably additive, the exact
-- discipline 156/157 already document.

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
                         'iso_certification') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── audit trail (117) — identifying/classifying only, never notes ──

DROP TRIGGER IF EXISTS standard_evidence_links_audit ON public.standard_evidence_links;
CREATE TRIGGER standard_evidence_links_audit AFTER INSERT OR DELETE ON public.standard_evidence_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('standard_evidence_link', 'company_id', 'clause_id', 'entity_type', 'entity_id');

DROP TRIGGER IF EXISTS iso_certifications_audit ON public.iso_certifications;
CREATE TRIGGER iso_certifications_audit AFTER INSERT OR UPDATE OR DELETE ON public.iso_certifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('iso_certification', 'company_id', 'standard_id', 'certificate_number', 'expires_on');

-- ── write guards (117) — every new client-writable table ───────────

SELECT public.apply_write_guard('public.standard_evidence_links');
SELECT public.apply_write_guard('public.iso_certifications');

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE public.management_system_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_clauses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_evidence_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_certifications          ENABLE ROW LEVEL SECURITY;

-- Standards/clauses (rule 6): staff full access; any signed-in user
-- with risk.read may browse the catalogue, the inspection_templates
-- (145) precedent, since the UI genuinely needs a client to read the
-- clause list itself (unlike a sector pack, which a client only ever
-- sees AFTER it materialises into real per-company register rows).
DROP POLICY IF EXISTS management_system_standards_staff_all ON public.management_system_standards;
CREATE POLICY management_system_standards_staff_all ON public.management_system_standards FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS management_system_standards_read ON public.management_system_standards;
CREATE POLICY management_system_standards_read ON public.management_system_standards FOR SELECT TO authenticated
  USING ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

DROP POLICY IF EXISTS standard_clauses_staff_all ON public.standard_clauses;
CREATE POLICY standard_clauses_staff_all ON public.standard_clauses FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS standard_clauses_read ON public.standard_clauses;
CREATE POLICY standard_clauses_read ON public.standard_clauses FOR SELECT TO authenticated
  USING ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

-- Evidence links: per-company, client-read + client-insert (never
-- update — a wrong link is removed, not edited), staff full access.
DROP POLICY IF EXISTS standard_evidence_links_staff_all ON public.standard_evidence_links;
CREATE POLICY standard_evidence_links_staff_all ON public.standard_evidence_links FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS standard_evidence_links_read ON public.standard_evidence_links;
CREATE POLICY standard_evidence_links_read ON public.standard_evidence_links FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));
DROP POLICY IF EXISTS standard_evidence_links_insert ON public.standard_evidence_links;
CREATE POLICY standard_evidence_links_insert ON public.standard_evidence_links FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS standard_evidence_links_delete ON public.standard_evidence_links;
CREATE POLICY standard_evidence_links_delete ON public.standard_evidence_links FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));

DROP POLICY IF EXISTS iso_certifications_staff_all ON public.iso_certifications;
CREATE POLICY iso_certifications_staff_all ON public.iso_certifications FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS iso_certifications_read ON public.iso_certifications;
CREATE POLICY iso_certifications_read ON public.iso_certifications FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));
DROP POLICY IF EXISTS iso_certifications_insert ON public.iso_certifications;
CREATE POLICY iso_certifications_insert ON public.iso_certifications FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS iso_certifications_update ON public.iso_certifications;
CREATE POLICY iso_certifications_update ON public.iso_certifications FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));

-- ── seed: exactly two standards, short hand-written clause titles ──
--
-- Rule 2: every title below is a one-sentence PARAPHRASE this migration
-- writes itself — never copied ISO document text. 8-12 clauses each,
-- covering the well-known top-level structure plus the standard's own
-- distinguishing sub-clauses (Hazard ID/OH&S for 45001; Environmental
-- Aspects/Compliance Obligations/Emergency Preparedness for 14001).

INSERT INTO public.management_system_standards (id, code, name) VALUES
  ('11111111-4501-4501-4501-450145014501', 'iso_45001_2018', 'ISO 45001:2018 — Occupational Health & Safety Management Systems'),
  ('11111111-1400-1400-1400-140014001400', 'iso_14001_2015', 'ISO 14001:2015 — Environmental Management Systems')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.standard_clauses (standard_id, clause_number, title, maps_to_hint, display_order) VALUES
  ('11111111-4501-4501-4501-450145014501', '4',     'Understanding the organisation and the scope of its safety management system', 'document', 1),
  ('11111111-4501-4501-4501-450145014501', '5',     'Leadership commitment, worker participation and an OH&S policy statement', 'document', 2),
  ('11111111-4501-4501-4501-450145014501', '6.1.2', 'Hazard identification and assessment of OH&S risks and opportunities', 'hazard', 3),
  ('11111111-4501-4501-4501-450145014501', '6.1.3', 'Determining the legal and other requirements that apply', 'compliance_item', 4),
  ('11111111-4501-4501-4501-450145014501', '6.2',   'Setting OH&S objectives and planning how to achieve them', 'document', 5),
  ('11111111-4501-4501-4501-450145014501', '7.2',   'Ensuring workers are competent, including through training records', 'training_record', 6),
  ('11111111-4501-4501-4501-450145014501', '7.5',   'Keeping documented information under control', 'document', 7),
  ('11111111-4501-4501-4501-450145014501', '8.1.2', 'Eliminating hazards and reducing OH&S risks through controls', 'risk_assessment', 8),
  ('11111111-4501-4501-4501-450145014501', '8.2',   'Emergency preparedness and response arrangements', 'action', 9),
  ('11111111-4501-4501-4501-450145014501', '9.1',   'Monitoring, measuring and evaluating OH&S performance', 'inspection', 10),
  ('11111111-4501-4501-4501-450145014501', '9.2',   'Conducting internal audits of the OH&S management system', 'audit', 11),
  ('11111111-4501-4501-4501-450145014501', '10.2',  'Investigating incidents and taking corrective action', 'incident', 12)
ON CONFLICT (standard_id, clause_number) DO NOTHING;

INSERT INTO public.standard_clauses (standard_id, clause_number, title, maps_to_hint, display_order) VALUES
  ('11111111-1400-1400-1400-140014001400', '4',     'Understanding the organisation and the scope of its environmental management system', 'document', 1),
  ('11111111-1400-1400-1400-140014001400', '5',     'Leadership commitment and an environmental policy statement', 'document', 2),
  ('11111111-1400-1400-1400-140014001400', '6.1.1', 'Identifying environmental aspects and their impacts', 'environmental_aspect', 3),
  ('11111111-1400-1400-1400-140014001400', '6.1.3', 'Determining compliance obligations that apply to the organisation', 'compliance_item', 4),
  ('11111111-1400-1400-1400-140014001400', '6.2',   'Setting environmental objectives and planning how to achieve them', 'document', 5),
  ('11111111-1400-1400-1400-140014001400', '7.2',   'Ensuring workers are competent on environmental matters', 'training_record', 6),
  ('11111111-1400-1400-1400-140014001400', '8.1',   'Operational controls over significant environmental aspects', 'environmental_aspect', 7),
  ('11111111-1400-1400-1400-140014001400', '8.2',   'Emergency preparedness and response for environmental incidents', 'environmental_permit', 8),
  ('11111111-1400-1400-1400-140014001400', '9.1.1', 'Monitoring and measuring environmental performance', 'environmental_monitoring', 9),
  ('11111111-1400-1400-1400-140014001400', '9.1.2', 'Evaluating compliance with legal and other requirements', 'environmental_permit', 10),
  ('11111111-1400-1400-1400-140014001400', '9.2',   'Conducting internal audits of the environmental management system', 'audit', 11),
  ('11111111-1400-1400-1400-140014001400', '10.2',  'Managing nonconformity and taking corrective action', 'waste_movement', 12)
ON CONFLICT (standard_id, clause_number) DO NOTHING;
