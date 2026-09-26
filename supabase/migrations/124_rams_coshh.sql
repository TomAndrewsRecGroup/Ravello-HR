-- ═══════════════════════════════════════════════════════════════════
-- 124: Core-OS 360 Phase 2 — RAMS and COSHH (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- Applied live in three transactions (124a RAMS + substances/SDS, 124b
-- COSHH + workflow + RLS, 124c RPCs + templates); every function body
-- md5-checked against this file. Probe: supabase/probes/124_rams_coshh.sql.
--
-- Method statements (RAMS) with structured sections and ordered work
-- steps; the acknowledgement foundation; the hazardous-substance
-- register with versioned Safety Data Sheets; COSHH assessments with
-- exposure routes and links into the control library.
--
-- Both documents ride 123's workflow unchanged: hs_doc_guard /
-- hs_doc_after with their own prefix and audit entity, the same
-- transition map (RAMS without a periodic review state, as specified),
-- the same no-self-approval and immutability rules, the same new
-- version / clone / template RPCs (extended here, never forked).
--
-- * A NEW SDS NEVER DELETES THE OLD ONE. sds_versions is insert-only
--   for every session (staff included). The newest SDS by issue date
--   is current; the others are stamped superseded, and a new current
--   SDS puts every approved COSHH assessment of that substance into
--   'review due' (reason: SDS change) — a flag for a human, never a
--   rewrite, never a compliance conclusion.
-- * GHS pictograms are recorded and CONFIRMED by a person (who, when).
--   Nothing reads them out of an SDS automatically.
-- * RAMS acknowledgements are insert-only evidence against a specific
--   approved VERSION.

-- ─── 0. Shared helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_type
    WHEN 'hazard'                THEN 'hazards'
    WHEN 'risk_assessment'       THEN 'risk_assessments'
    WHEN 'method_statement'      THEN 'method_statements'
    WHEN 'method_statement_step' THEN 'method_statement_steps'
    WHEN 'coshh_assessment'      THEN 'coshh_assessments'
    WHEN 'substance'             THEN 'substances'
    WHEN 'sds'                   THEN 'sds_versions'
    WHEN 'incident'              THEN 'hs_incidents'
    WHEN 'investigation'         THEN 'incident_investigations'
    WHEN 'equipment'             THEN 'hs_equipment'
    WHEN 'person'                THEN 'people'
    WHEN 'contractor'            THEN 'people'
    WHEN 'department'            THEN 'departments'
    WHEN 'document'              THEN 'hs_documents'
    WHEN 'company_document'      THEN 'documents'
    WHEN 'control'               THEN 'controls'
    WHEN 'training_record'       THEN 'training_records'
    WHEN 'action'                THEN 'actions'
    WHEN 'audit'                 THEN 'hs_audits'
    WHEN 'site'                  THEN 'hs_sites'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_entity
           WHEN 'register_item'         THEN 'register'
           WHEN 'register_completion'   THEN 'register'
           WHEN 'activity'              THEN 'register'
           WHEN 'site'                  THEN 'register'
           WHEN 'equipment_inspection'  THEN 'register'
           WHEN 'document'              THEN 'documents'
           WHEN 'training'              THEN 'training'
           WHEN 'audit'                 THEN 'audits'
           WHEN 'audit_response'        THEN 'audits'
           WHEN 'incident'              THEN 'incidents'
           WHEN 'investigation'         THEN 'incidents'
           WHEN 'hazard'                THEN 'register'
           WHEN 'risk_assessment'       THEN 'register'
           WHEN 'method_statement'      THEN 'register'
           WHEN 'method_statement_step' THEN 'register'
           WHEN 'substance'             THEN 'register'
           WHEN 'sds'                   THEN 'register'
           WHEN 'coshh_assessment'      THEN 'register'
           WHEN 'action'                THEN 'register'
           ELSE NULL
         END;
$$;

-- Evidence permissions (122) gain the RAMS step kind.
CREATE OR REPLACE FUNCTION public.hs_evidence_readable(p_company uuid, p_entity_type text, p_evidence_type text, p_recorded_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN public.is_tps_staff() THEN true
    WHEN p_company IS DISTINCT FROM public.my_company_id() THEN false
    WHEN p_recorded_by = auth.uid() THEN true
    WHEN p_entity_type IN ('incident','investigation') THEN
      public.has_capability(p_company, 'incident.read')
      AND (p_evidence_type NOT IN ('witness_statement','medical') OR public.has_capability(p_company, 'incident.sensitive.read'))
    WHEN p_entity_type = 'hazard' THEN
      public.has_capability(p_company, 'hazard.manage') OR public.has_capability(p_company, 'risk.read')
    WHEN p_entity_type IN ('risk_assessment','method_statement','method_statement_step','substance','sds','coshh_assessment') THEN
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
    WHEN p_entity_type IN ('risk_assessment','method_statement','method_statement_step','substance','sds','coshh_assessment')
                                         THEN public.has_capability(p_company, 'risk.create')
    WHEN p_entity_type = 'action'        THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard','risk_assessment','method_statement','method_statement_step','substance','sds',
                         'coshh_assessment','incident','investigation','action') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- The state of a versioned document, for its child-row guards. Answers
-- only for the caller's own organisation.
CREATE OR REPLACE FUNCTION public.hs_doc_state(p_table text, p_id uuid)
RETURNS TABLE (company_id uuid, status text, version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_table NOT IN ('risk_assessments','method_statements','coshh_assessments') THEN
    RAISE EXCEPTION 'Unknown document table' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT d.company_id, d.status, d.version FROM public.%I d WHERE d.id = $1
       AND ($2 OR public.is_tps_staff() OR d.company_id = public.my_company_id())', p_table)
    USING p_id, auth.uid() IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_doc_state(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_doc_state(text, uuid) TO authenticated;

-- Rows that belong to a versioned document (RAMS steps, COSHH control
-- links) change only while it is being drafted. TG_ARGV: parent table,
-- parent key column.
CREATE OR REPLACE FUNCTION public.hs_doc_child_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record;
        ptab text := TG_ARGV[0]; pcol text := TG_ARGV[1]; pid uuid;
BEGIN
  pid := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END ->> pcol)::uuid;
  SELECT * INTO st FROM public.hs_doc_state(ptab, pid);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'Parent record not found' USING ERRCODE = '23503'; END IF;
  IF session THEN
    IF st.status NOT IN ('draft','changes_requested') THEN
      RAISE EXCEPTION 'This version is locked (%). Create a new version to change it.', st.status USING ERRCODE = '23514';
    END IF;
    IF NOT public.has_capability(st.company_id, 'risk.create') THEN
      RAISE EXCEPTION 'You do not have permission to edit this record' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) ->> pcol) IS DISTINCT FROM (to_jsonb(OLD) ->> pcol) THEN
    RAISE EXCEPTION 'A row cannot move to another record' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  PERFORM public.hs_check_refs(st.company_id, to_jsonb(NEW) - pcol);
  RETURN NEW;
END $$;

-- ─── 1. RAMS ────────────────────────────────────────────────────────

-- The structured sections a method statement may carry. Any subset,
-- none mandatory; each is prose of bounded length.
CREATE OR REPLACE FUNCTION public.hs_rams_sections_valid(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_typeof(p) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p) e
        WHERE e.key NOT IN ('purpose','scope','location','work_sequence','responsibilities','plant_equipment','materials',
                            'ppe','access_egress','site_setup','exclusion_zones','lifting_arrangements','isolations',
                            'environmental_controls','emergency_arrangements','waste_disposal','supervision',
                            'communication','competency_requirements','permits_required')
           OR jsonb_typeof(e.value) NOT IN ('string','null')
           OR length(e.value #>> '{}') > 8000)
$$;

CREATE TABLE IF NOT EXISTS public.method_statements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference              text NOT NULL,
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  previous_version_id    uuid REFERENCES public.method_statements(id) ON DELETE SET NULL,
  copied_from_id         uuid REFERENCES public.method_statements(id) ON DELETE SET NULL,
  template_id            uuid REFERENCES public.hs_templates(id) ON DELETE SET NULL,
  template_version       integer,
  site_id                uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  department_id          uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  project_name           text CHECK (length(project_name) <= 200),
  title                  text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description            text CHECK (length(description) <= 8000),
  scope_of_work          text CHECK (length(scope_of_work) <= 8000),
  sections               jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (public.hs_rams_sections_valid(sections)),
  author_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsible_manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN
                           ('draft','pending_review','changes_requested','approved','active','superseded','archived')),
  start_date             date,
  end_date               date,
  review_date            date,
  submitted_at           timestamptz,
  submitted_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_comments        text CHECK (length(review_comments) <= 4000),
  approved_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  activated_at           timestamptz,
  superseded_at          timestamptz,
  superseded_by_id       uuid REFERENCES public.method_statements(id) ON DELETE SET NULL,
  review_reason          text CHECK (review_reason IN ('scheduled','incident','near_miss','equipment_change','process_change',
                           'legislation_change','new_substance','new_employee_group','audit_finding','other')),
  review_requested_at    timestamptz,
  review_requested_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_reviewed_at       timestamptz,
  last_reviewed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at            timestamptz,
  row_version            integer NOT NULL DEFAULT 1,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference, version),
  CONSTRAINT method_statements_approval_stamped CHECK (status NOT IN ('approved','active','superseded')
                                                       OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT method_statements_archived_stamped CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CONSTRAINT method_statements_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT method_statements_review_date_required CHECK (status IN ('draft','changes_requested','archived','superseded') OR review_date IS NOT NULL),
  CONSTRAINT method_statements_version_chain CHECK ((version = 1) = (previous_version_id IS NULL))
);
CREATE INDEX IF NOT EXISTS method_statements_company_status_idx ON public.method_statements (company_id, status);
CREATE INDEX IF NOT EXISTS method_statements_company_site_idx ON public.method_statements (company_id, site_id);
CREATE INDEX IF NOT EXISTS method_statements_company_review_idx ON public.method_statements (company_id, review_date) WHERE status IN ('approved','active');
CREATE INDEX IF NOT EXISTS method_statements_company_end_idx ON public.method_statements (company_id, end_date) WHERE status IN ('approved','active');
CREATE INDEX IF NOT EXISTS method_statements_reference_idx ON public.method_statements (company_id, reference, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS method_statements_one_open_idx ON public.method_statements (company_id, reference)
  WHERE status IN ('draft','pending_review','changes_requested');

CREATE TABLE IF NOT EXISTS public.method_statement_steps (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method_statement_id uuid NOT NULL REFERENCES public.method_statements(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sequence_number     integer NOT NULL CHECK (sequence_number BETWEEN 1 AND 1000000),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description         text CHECK (length(description) <= 4000),
  hazards             text CHECK (length(hazards) <= 2000),
  controls            text CHECK (length(controls) <= 2000),
  responsible_role    text CHECK (length(responsible_role) <= 200),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (method_statement_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS method_statement_steps_ms_idx ON public.method_statement_steps (method_statement_id, sequence_number);

DROP TRIGGER IF EXISTS hs_doc_child_guard ON public.method_statement_steps;
CREATE TRIGGER hs_doc_child_guard BEFORE INSERT OR UPDATE OR DELETE ON public.method_statement_steps
  FOR EACH ROW EXECUTE FUNCTION public.hs_doc_child_guard('method_statements', 'method_statement_id');

-- Reorder steps in one statement. SECURITY INVOKER: RLS and the child
-- guard apply exactly as for a direct update.
CREATE OR REPLACE FUNCTION public.hs_reorder_steps(p_method_statement uuid, p_step_ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM method_statement_steps WHERE method_statement_id = p_method_statement;
  IF n <> cardinality(p_step_ids) OR n <> (SELECT count(DISTINCT x) FROM unnest(p_step_ids) x)
     OR EXISTS (SELECT 1 FROM unnest(p_step_ids) x
                 WHERE NOT EXISTS (SELECT 1 FROM method_statement_steps s WHERE s.id = x AND s.method_statement_id = p_method_statement)) THEN
    RAISE EXCEPTION 'The new order must list every step of this method statement exactly once' USING ERRCODE = '22023';
  END IF;
  UPDATE method_statement_steps SET sequence_number = sequence_number + 500000
   WHERE method_statement_id = p_method_statement;
  UPDATE method_statement_steps s SET sequence_number = o.ord, updated_at = now()
    FROM unnest(p_step_ids) WITH ORDINALITY AS o(id, ord)
   WHERE s.id = o.id AND s.method_statement_id = p_method_statement;
END $$;
REVOKE ALL ON FUNCTION public.hs_reorder_steps(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_reorder_steps(uuid, uuid[]) TO authenticated;

-- Acknowledgement foundation: who confirmed which approved VERSION,
-- when, how. Evidence, so insert-only for every session.
CREATE TABLE IF NOT EXISTS public.rams_acknowledgements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  method_statement_id uuid NOT NULL REFERENCES public.method_statements(id) ON DELETE RESTRICT,
  method_statement_version integer NOT NULL,
  person_id           uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  acknowledged_at     timestamptz NOT NULL DEFAULT now(),
  confirmation        text NOT NULL CHECK (length(btrim(confirmation)) BETWEEN 1 AND 1000),
  method              text NOT NULL DEFAULT 'in_person' CHECK (method IN ('in_person','digital','toolbox_talk','other')),
  session_ref         text CHECK (length(session_ref) <= 200),
  evidence_file_id    uuid REFERENCES public.hs_files(id) ON DELETE SET NULL,
  recorded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (acknowledged_at <= now() + interval '1 day')
);
CREATE INDEX IF NOT EXISTS rams_ack_ms_idx ON public.rams_acknowledgements (method_statement_id);
CREATE INDEX IF NOT EXISTS rams_ack_person_idx ON public.rams_acknowledgements (person_id);

CREATE OR REPLACE FUNCTION public.hs_rams_ack_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE st record;
BEGIN
  SELECT * INTO st FROM public.hs_doc_state('method_statements', NEW.method_statement_id);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'Method statement not found' USING ERRCODE = '23503'; END IF;
  IF st.status NOT IN ('approved','active') THEN
    RAISE EXCEPTION 'Only an approved method statement can be acknowledged' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  NEW.method_statement_version := st.version;
  NEW.recorded_by := auth.uid();
  PERFORM public.hs_check_refs(st.company_id, jsonb_build_object('person_id', NEW.person_id));
  IF NEW.evidence_file_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.hs_files f WHERE f.id = NEW.evidence_file_id AND f.company_id = st.company_id) THEN
    RAISE EXCEPTION 'Evidence file is not a file of this organisation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_rams_ack_guard ON public.rams_acknowledgements;
CREATE TRIGGER hs_rams_ack_guard BEFORE INSERT ON public.rams_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.hs_rams_ack_guard();
REVOKE UPDATE, DELETE, TRUNCATE ON public.rams_acknowledgements FROM PUBLIC, anon, authenticated;

-- ─── 2. Substances and Safety Data Sheets ───────────────────────────

-- Every element of a text array is non-blank and bounded.
CREATE OR REPLACE FUNCTION public.hs_text_items_ok(p text[], p_max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(p) x WHERE x IS NULL OR length(btrim(x)) NOT BETWEEN 1 AND p_max)
$$;

CREATE TABLE IF NOT EXISTS public.substances (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference                text NOT NULL,
  product_name             text NOT NULL CHECK (length(btrim(product_name)) BETWEEN 1 AND 200),
  manufacturer             text CHECK (length(manufacturer) <= 200),
  supplier                 text CHECK (length(supplier) <= 200),
  product_code             text CHECK (length(product_code) <= 100),
  substance_type           text CHECK (substance_type IN ('liquid','solid','powder','gas','aerosol','paste','dust','fume',
                                                          'vapour','biological','other')),
  sds_version              text CHECK (length(sds_version) <= 60),
  sds_date                 date,
  hazard_statements        text[] NOT NULL DEFAULT '{}' CHECK (cardinality(hazard_statements) <= 60),
  precautionary_statements text[] NOT NULL DEFAULT '{}' CHECK (cardinality(precautionary_statements) <= 80),
  pictograms               text[] NOT NULL DEFAULT '{}' CHECK (pictograms <@ ARRAY['GHS01','GHS02','GHS03','GHS04','GHS05',
                                                                                 'GHS06','GHS07','GHS08','GHS09']::text[]),
  pictograms_confirmed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pictograms_confirmed_at  timestamptz,
  storage_requirements     text CHECK (length(storage_requirements) <= 2000),
  disposal_requirements    text CHECK (length(disposal_requirements) <= 2000),
  emergency_information    text CHECK (length(emergency_information) <= 2000),
  active_status            text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','discontinued','archived')),
  row_version              integer NOT NULL DEFAULT 1,
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference),
  CONSTRAINT substances_statements_bounded CHECK (public.hs_text_items_ok(hazard_statements, 300)
                                                  AND public.hs_text_items_ok(precautionary_statements, 300))
);
CREATE INDEX IF NOT EXISTS substances_company_status_idx ON public.substances (company_id, active_status);
CREATE INDEX IF NOT EXISTS substances_company_name_idx ON public.substances (company_id, lower(product_name));

-- The SDS columns are the database's (from the current SDS); pictogram
-- changes are stamped as a person's confirmation.
CREATE OR REPLACE FUNCTION public.hs_substance_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon');
BEGIN
  -- Deleting a substance would cascade away its SDS history.
  IF TG_OP = 'DELETE' THEN
    IF session AND EXISTS (SELECT 1 FROM public.sds_versions WHERE substance_id = OLD.id) THEN
      RAISE EXCEPTION 'A substance with safety data sheets cannot be deleted; archive it instead' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF session THEN
      NEW.reference := NULL; NEW.created_by := auth.uid();
      NEW.sds_version := NULL; NEW.sds_date := NULL;
      NEW.pictograms_confirmed_by := CASE WHEN cardinality(NEW.pictograms) > 0 THEN auth.uid() END;
      NEW.pictograms_confirmed_at := CASE WHEN cardinality(NEW.pictograms) > 0 THEN now() END;
    END IF;
    IF NEW.reference IS NULL THEN NEW.reference := public.next_record_number(NEW.company_id, 'SUB'); END IF;
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.row_version := 1;
    RETURN NEW;
  END IF;
  IF session THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Organisation, reference and author cannot be changed' USING ERRCODE = '23514';
    END IF;
    NEW.sds_version := OLD.sds_version; NEW.sds_date := OLD.sds_date;
    IF NEW.pictograms IS DISTINCT FROM OLD.pictograms THEN
      NEW.pictograms_confirmed_by := auth.uid(); NEW.pictograms_confirmed_at := now();
    ELSE
      NEW.pictograms_confirmed_by := OLD.pictograms_confirmed_by; NEW.pictograms_confirmed_at := OLD.pictograms_confirmed_at;
    END IF;
  END IF;
  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_substance_guard ON public.substances;
CREATE TRIGGER hs_substance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.substances
  FOR EACH ROW EXECUTE FUNCTION public.hs_substance_guard();

CREATE TABLE IF NOT EXISTS public.sds_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  substance_id     uuid NOT NULL REFERENCES public.substances(id) ON DELETE CASCADE,
  version_label    text NOT NULL CHECK (length(btrim(version_label)) BETWEEN 1 AND 60),
  issue_date       date NOT NULL CHECK (issue_date <= current_date + 1),
  notes            text CHECK (length(notes) <= 1000),
  uploaded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  superseded_at    timestamptz,
  superseded_by_id uuid REFERENCES public.sds_versions(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sds_versions_substance_idx ON public.sds_versions (substance_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS sds_versions_company_idx ON public.sds_versions (company_id);

CREATE OR REPLACE FUNCTION public.hs_sds_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE co uuid;
BEGIN
  SELECT company_id INTO co FROM public.substances WHERE id = NEW.substance_id;
  IF co IS NULL THEN RAISE EXCEPTION 'Substance not found' USING ERRCODE = '23503'; END IF;
  NEW.company_id := co;
  IF current_user IN ('authenticated','anon') THEN
    NEW.uploaded_by := auth.uid(); NEW.uploaded_at := now();
    NEW.superseded_at := NULL; NEW.superseded_by_id := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_sds_guard ON public.sds_versions;
CREATE TRIGGER hs_sds_guard BEFORE INSERT ON public.sds_versions
  FOR EACH ROW EXECUTE FUNCTION public.hs_sds_guard();
REVOKE UPDATE, DELETE, TRUNCATE ON public.sds_versions FROM PUBLIC, anon, authenticated;

-- The newest SDS by issue date is current. A NEW current SDS supersedes
-- the old (kept, never deleted), refreshes the substance's SDS columns
-- and flags every approved COSHH assessment of the substance for
-- review. A back-filled older SDS is filed as already superseded.
CREATE OR REPLACE FUNCTION public.hs_sds_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cur record; product text;
BEGIN
  SELECT product_name INTO product FROM substances WHERE id = NEW.substance_id;
  SELECT * INTO cur FROM sds_versions
   WHERE substance_id = NEW.substance_id AND id <> NEW.id AND superseded_at IS NULL
   ORDER BY issue_date DESC, created_at DESC LIMIT 1;
  IF cur.id IS NULL OR NEW.issue_date >= cur.issue_date THEN
    UPDATE sds_versions SET superseded_at = now(), superseded_by_id = NEW.id
     WHERE substance_id = NEW.substance_id AND id <> NEW.id AND superseded_at IS NULL;
    UPDATE substances SET sds_version = NEW.version_label, sds_date = NEW.issue_date WHERE id = NEW.substance_id;
    IF cur.id IS NOT NULL THEN
      UPDATE coshh_assessments
         SET status = 'review_due', review_reason = 'sds_change', review_requested_at = now(), review_requested_by = auth.uid()
       WHERE substance_id = NEW.substance_id AND status IN ('approved','active');
    END IF;
    PERFORM public.hs_log(NEW.company_id, 'substance', NEW.substance_id, 'sds_updated',
      'New safety data sheet for ' || left(product, 120) || ' (' || NEW.version_label || ')');
  ELSE
    UPDATE sds_versions SET superseded_at = now(), superseded_by_id = cur.id WHERE id = NEW.id;
    PERFORM public.hs_log(NEW.company_id, 'substance', NEW.substance_id, 'sds_filed',
      'Earlier safety data sheet filed for ' || left(product, 120) || ' (' || NEW.version_label || ')');
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_sds_after() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hs_event_substance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'substance', NEW.id, 'added', 'Substance added: ' || NEW.reference || ' ' || left(NEW.product_name, 150));
  ELSIF NEW.active_status IS DISTINCT FROM OLD.active_status THEN
    PERFORM public.hs_log(NEW.company_id, 'substance', NEW.id, 'status_' || NEW.active_status,
      'Substance ' || NEW.reference || ': ' || NEW.active_status);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_event_substance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS substances_hs_event ON public.substances;
CREATE TRIGGER substances_hs_event AFTER INSERT OR UPDATE ON public.substances
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_substance();
DROP TRIGGER IF EXISTS substances_audit ON public.substances;
CREATE TRIGGER substances_audit AFTER INSERT OR UPDATE OR DELETE ON public.substances
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('substance','company_id','reference','product_name','active_status','sds_version','sds_date','pictograms','pictograms_confirmed_by');
DROP TRIGGER IF EXISTS substances_platform_event ON public.substances;
CREATE TRIGGER substances_platform_event AFTER INSERT OR UPDATE ON public.substances
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('reference','active_status','sds_version','sds_date');
DROP TRIGGER IF EXISTS sds_versions_audit ON public.sds_versions;
CREATE TRIGGER sds_versions_audit AFTER INSERT OR UPDATE ON public.sds_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('sds','company_id','substance_id','version_label','issue_date','superseded_at','superseded_by_id');

-- ─── 3. COSHH assessments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coshh_assessments (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference                    text NOT NULL,
  version                      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  previous_version_id          uuid REFERENCES public.coshh_assessments(id) ON DELETE SET NULL,
  copied_from_id               uuid REFERENCES public.coshh_assessments(id) ON DELETE SET NULL,
  template_id                  uuid REFERENCES public.hs_templates(id) ON DELETE SET NULL,
  template_version             integer,
  site_id                      uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  department_id                uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  substance_id                 uuid NOT NULL REFERENCES public.substances(id) ON DELETE RESTRICT,
  title                        text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  task_or_process              text CHECK (length(task_or_process) <= 2000),
  exposure_routes              text[] NOT NULL DEFAULT '{}' CHECK (exposure_routes <@ ARRAY['inhalation','skin','ingestion','eye',
                                 'injection','combination']::text[]),
  persons_exposed              text[] NOT NULL DEFAULT '{}' CHECK (persons_exposed <@ ARRAY['employees','contractors','visitors',
                                 'members_of_public','young_workers','pregnant_workers','lone_workers','named_individuals']::text[]),
  persons_exposed_notes        text CHECK (length(persons_exposed_notes) <= 1000),
  frequency                    text CHECK (length(frequency) <= 200),
  duration                     text CHECK (length(duration) <= 200),
  quantity                     text CHECK (length(quantity) <= 200),
  existing_controls            text CHECK (length(existing_controls) <= 4000),
  ppe                          text CHECK (length(ppe) <= 2000),
  first_aid                    text CHECK (length(first_aid) <= 2000),
  spill_response               text CHECK (length(spill_response) <= 2000),
  disposal                     text CHECK (length(disposal) <= 2000),
  health_surveillance_required boolean NOT NULL DEFAULT false,
  exposure_monitoring_required boolean NOT NULL DEFAULT false,
  emergency_arrangements       text CHECK (length(emergency_arrangements) <= 2000),
  assessor_id                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsible_manager_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status                       text NOT NULL DEFAULT 'draft' CHECK (status IN
                                 ('draft','pending_review','changes_requested','approved','active','review_due','superseded','archived')),
  assessment_date              date NOT NULL DEFAULT current_date,
  review_date                  date,
  submitted_at                 timestamptz,
  submitted_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_comments              text CHECK (length(review_comments) <= 4000),
  approved_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at                  timestamptz,
  activated_at                 timestamptz,
  superseded_at                timestamptz,
  superseded_by_id             uuid REFERENCES public.coshh_assessments(id) ON DELETE SET NULL,
  review_reason                text CHECK (review_reason IN ('scheduled','sds_change','process_change','incident','near_miss',
                                 'exposure_control_change','legislation_change','audit_finding','other')),
  review_requested_at          timestamptz,
  review_requested_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_reviewed_at             timestamptz,
  last_reviewed_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at                  timestamptz,
  row_version                  integer NOT NULL DEFAULT 1,
  created_by                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference, version),
  CONSTRAINT coshh_assessments_approval_stamped CHECK (status NOT IN ('approved','active','review_due','superseded')
                                                       OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT coshh_assessments_archived_stamped CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CONSTRAINT coshh_assessments_review_after_assessment CHECK (review_date IS NULL OR review_date >= assessment_date),
  CONSTRAINT coshh_assessments_review_date_required CHECK (status IN ('draft','changes_requested','archived','superseded') OR review_date IS NOT NULL),
  CONSTRAINT coshh_assessments_version_chain CHECK ((version = 1) = (previous_version_id IS NULL))
);
CREATE INDEX IF NOT EXISTS coshh_assessments_company_status_idx ON public.coshh_assessments (company_id, status);
CREATE INDEX IF NOT EXISTS coshh_assessments_company_review_idx ON public.coshh_assessments (company_id, review_date) WHERE status IN ('approved','active','review_due');
CREATE INDEX IF NOT EXISTS coshh_assessments_substance_idx ON public.coshh_assessments (substance_id, status);
CREATE INDEX IF NOT EXISTS coshh_assessments_company_site_idx ON public.coshh_assessments (company_id, site_id);
CREATE INDEX IF NOT EXISTS coshh_assessments_reference_idx ON public.coshh_assessments (company_id, reference, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS coshh_assessments_one_open_idx ON public.coshh_assessments (company_id, reference)
  WHERE status IN ('draft','pending_review','changes_requested');

-- COSHH controls link into the same control library as risk
-- assessments, snapshotted the same way, never presumed effective.
CREATE TABLE IF NOT EXISTS public.coshh_assessment_controls (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  coshh_assessment_id       uuid NOT NULL REFERENCES public.coshh_assessments(id) ON DELETE CASCADE,
  control_id                uuid NOT NULL REFERENCES public.controls(id) ON DELETE RESTRICT,
  control_title             text NOT NULL,
  control_type              text NOT NULL CHECK (control_type IN ('elimination','substitution','engineering','administrative','ppe')),
  control_category          text,
  effectiveness             text NOT NULL DEFAULT 'verification_required' CHECK (effectiveness IN
                              ('in_place','partially_implemented','ineffective','not_implemented','verification_required')),
  effectiveness_recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  effectiveness_recorded_at timestamptz,
  notes                     text CHECK (length(notes) <= 1000),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coshh_assessment_id, control_id)
);
CREATE INDEX IF NOT EXISTS coshh_controls_control_idx ON public.coshh_assessment_controls (control_id);

CREATE OR REPLACE FUNCTION public.hs_coshh_control_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record; c record;
BEGIN
  SELECT * INTO st FROM public.hs_doc_state('coshh_assessments',
    CASE WHEN TG_OP = 'DELETE' THEN OLD.coshh_assessment_id ELSE NEW.coshh_assessment_id END);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'COSHH assessment not found' USING ERRCODE = '23503'; END IF;
  IF session THEN
    IF st.status IN ('draft','changes_requested') THEN
      IF NOT public.has_capability(st.company_id, 'risk.create') THEN
        RAISE EXCEPTION 'You do not have permission to edit COSHH assessments' USING ERRCODE = '42501';
      END IF;
    ELSIF st.status = 'pending_review' AND TG_OP = 'UPDATE' THEN
      IF NOT public.has_capability(st.company_id, 'risk.approve') THEN
        RAISE EXCEPTION 'Only a reviewer may record control effectiveness during review' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'This version is locked (%). Create a new version to change it.', st.status USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.coshh_assessment_id IS DISTINCT FROM OLD.coshh_assessment_id
                           OR NEW.control_id IS DISTINCT FROM OLD.control_id
                           OR NEW.control_title IS DISTINCT FROM OLD.control_title
                           OR NEW.control_type IS DISTINCT FROM OLD.control_type
                           OR NEW.control_category IS DISTINCT FROM OLD.control_category) THEN
    RAISE EXCEPTION 'Unlink the control and link another instead' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  PERFORM public.hs_check_refs(st.company_id, jsonb_build_object('control_id', NEW.control_id));
  IF TG_OP = 'INSERT' THEN
    SELECT title, control_type, category INTO c FROM public.controls WHERE id = NEW.control_id;
    IF session OR NEW.control_title IS NULL THEN NEW.control_title := c.title; END IF;
    IF session OR NEW.control_type IS NULL THEN NEW.control_type := c.control_type; END IF;
    IF session OR NEW.control_category IS NULL THEN NEW.control_category := c.category; END IF;
    IF session THEN NEW.effectiveness_recorded_by := NULL; NEW.effectiveness_recorded_at := NULL; END IF;
  END IF;
  IF (TG_OP = 'INSERT' AND session AND NEW.effectiveness <> 'verification_required')
     OR (TG_OP = 'UPDATE' AND NEW.effectiveness IS DISTINCT FROM OLD.effectiveness) THEN
    NEW.effectiveness_recorded_by := auth.uid();
    NEW.effectiveness_recorded_at := now();
  ELSIF TG_OP = 'UPDATE' AND session THEN
    NEW.effectiveness_recorded_by := OLD.effectiveness_recorded_by;
    NEW.effectiveness_recorded_at := OLD.effectiveness_recorded_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_coshh_control_guard ON public.coshh_assessment_controls;
CREATE TRIGGER hs_coshh_control_guard BEFORE INSERT OR UPDATE OR DELETE ON public.coshh_assessment_controls
  FOR EACH ROW EXECUTE FUNCTION public.hs_coshh_control_guard();

-- ─── 4. The shared workflow, extended ───────────────────────────────

CREATE OR REPLACE FUNCTION public.hs_doc_ready(p_kind text, p_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_kind = 'risk_assessment' THEN
    IF NOT EXISTS (SELECT 1 FROM risk_assessment_items WHERE risk_assessment_id = p_id) THEN
      RETURN 'Add at least one hazard before submitting';
    END IF;
    IF EXISTS (SELECT 1 FROM risk_assessment_items WHERE risk_assessment_id = p_id AND likelihood_after IS NULL) THEN
      RETURN 'Every hazard needs a residual risk rating before submitting';
    END IF;
  ELSIF p_kind = 'method_statement' THEN
    IF NOT EXISTS (SELECT 1 FROM method_statement_steps WHERE method_statement_id = p_id) THEN
      RETURN 'Add at least one work step before submitting';
    END IF;
  ELSIF p_kind = 'coshh_assessment' THEN
    IF EXISTS (SELECT 1 FROM coshh_assessments WHERE id = p_id
                AND (cardinality(exposure_routes) = 0 OR cardinality(persons_exposed) = 0)) THEN
      RETURN 'Record the exposure routes and who is exposed before submitting';
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS hs_doc_guard ON public.method_statements;
CREATE TRIGGER hs_doc_guard BEFORE INSERT OR UPDATE OR DELETE ON public.method_statements
  FOR EACH ROW EXECUTE FUNCTION public.hs_doc_guard('method_statement', 'RAMS');
DROP TRIGGER IF EXISTS hs_doc_after ON public.method_statements;
CREATE TRIGGER hs_doc_after AFTER INSERT OR UPDATE ON public.method_statements
  FOR EACH ROW EXECUTE FUNCTION public.hs_doc_after('method_statement', 'RAMS', 'rams', 'RAMS');
DROP TRIGGER IF EXISTS method_statements_platform_event ON public.method_statements;
CREATE TRIGGER method_statements_platform_event AFTER INSERT OR UPDATE ON public.method_statements
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('reference','version','status','review_date','end_date','site_id','author_id','responsible_manager_id');

DROP TRIGGER IF EXISTS hs_doc_guard ON public.coshh_assessments;
CREATE TRIGGER hs_doc_guard BEFORE INSERT OR UPDATE OR DELETE ON public.coshh_assessments
  FOR EACH ROW EXECUTE FUNCTION public.hs_doc_guard('coshh_assessment', 'COSHH');
DROP TRIGGER IF EXISTS hs_doc_after ON public.coshh_assessments;
CREATE TRIGGER hs_doc_after AFTER INSERT OR UPDATE ON public.coshh_assessments
  FOR EACH ROW EXECUTE FUNCTION public.hs_doc_after('coshh_assessment', 'COSHH', 'coshh', 'COSHH assessment');
DROP TRIGGER IF EXISTS coshh_assessments_platform_event ON public.coshh_assessments;
CREATE TRIGGER coshh_assessments_platform_event AFTER INSERT OR UPDATE ON public.coshh_assessments
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('reference','version','status','review_date','review_reason','site_id','substance_id','assessor_id','responsible_manager_id');

DROP TRIGGER IF EXISTS hs_sds_after ON public.sds_versions;
CREATE TRIGGER hs_sds_after AFTER INSERT ON public.sds_versions
  FOR EACH ROW EXECUTE FUNCTION public.hs_sds_after();

-- ─── 5. RLS ─────────────────────────────────────────────────────────
-- Same shape as risk assessments: risk.read to see, risk.create to
-- draft, risk.approve to decide; the guards do the rest.

ALTER TABLE public.method_statements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.method_statement_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rams_acknowledgements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substances                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sds_versions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coshh_assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coshh_assessment_controls ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  -- Versioned documents: read / insert / update (create or approve).
  FOREACH t IN ARRAY ARRAY['method_statements','coshh_assessments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_staff_all ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_staff_all ON public.%1$s FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.read'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (company_id = (SELECT public.my_company_id()) AND ((SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create'')) OR (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.approve'')))) WITH CHECK (company_id = (SELECT public.my_company_id()) AND ((SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create'')) OR (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.approve''))))', t);
  END LOOP;
  -- Mutable registers and document children: read with risk.read,
  -- write with risk.create (guards lock children of decided versions).
  FOREACH t IN ARRAY ARRAY['method_statement_steps'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_staff_all ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_staff_all ON public.%1$s FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.read'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create''))) WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create'')))', t);
  END LOOP;
  -- The substance register: read, add, edit — never delete (archive).
  EXECUTE 'DROP POLICY IF EXISTS substances_staff_all ON public.substances';
  EXECUTE 'CREATE POLICY substances_staff_all ON public.substances FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()))';
  EXECUTE 'DROP POLICY IF EXISTS substances_read ON public.substances';
  EXECUTE 'CREATE POLICY substances_read ON public.substances FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.read'')))';
  EXECUTE 'DROP POLICY IF EXISTS substances_insert ON public.substances';
  EXECUTE 'CREATE POLICY substances_insert ON public.substances FOR INSERT TO authenticated WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create'')))';
  EXECUTE 'DROP POLICY IF EXISTS substances_update ON public.substances';
  EXECUTE 'CREATE POLICY substances_update ON public.substances FOR UPDATE TO authenticated USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create''))) WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create'')))';
  -- Evidence tables: read and insert only (UPDATE/DELETE are revoked
  -- at the grant level, staff included).
  FOREACH t IN ARRAY ARRAY['rams_acknowledgements','sds_versions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_staff_read ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_staff_read ON public.%1$s FOR SELECT TO authenticated USING ((SELECT public.is_tps_staff()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_staff_insert ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_staff_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_tps_staff()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.read'')))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), ''risk.create'')))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS coshh_assessment_controls_staff_all ON public.coshh_assessment_controls;
CREATE POLICY coshh_assessment_controls_staff_all ON public.coshh_assessment_controls FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS coshh_assessment_controls_read ON public.coshh_assessment_controls;
CREATE POLICY coshh_assessment_controls_read ON public.coshh_assessment_controls FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));
DROP POLICY IF EXISTS coshh_assessment_controls_insert ON public.coshh_assessment_controls;
CREATE POLICY coshh_assessment_controls_insert ON public.coshh_assessment_controls FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS coshh_assessment_controls_delete ON public.coshh_assessment_controls;
CREATE POLICY coshh_assessment_controls_delete ON public.coshh_assessment_controls FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS coshh_assessment_controls_update ON public.coshh_assessment_controls;
CREATE POLICY coshh_assessment_controls_update ON public.coshh_assessment_controls FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.approve'))))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.approve'))));

SELECT public.apply_write_guard('public.method_statements');
SELECT public.apply_write_guard('public.method_statement_steps');
SELECT public.apply_write_guard('public.rams_acknowledgements');
SELECT public.apply_write_guard('public.substances');
SELECT public.apply_write_guard('public.sds_versions');
SELECT public.apply_write_guard('public.coshh_assessments');
SELECT public.apply_write_guard('public.coshh_assessment_controls');

-- ─── 6. New version / clone / template, extended ────────────────────

CREATE OR REPLACE FUNCTION public.hs_copy_children(p_kind text, p_from uuid, p_to uuid, p_keep_findings boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; nid uuid;
BEGIN
  IF p_kind = 'risk_assessment' THEN
    FOR r IN SELECT * FROM risk_assessment_items WHERE risk_assessment_id = p_from ORDER BY sort_order, created_at LOOP
      nid := gen_random_uuid();
      INSERT INTO risk_assessment_items (id, risk_assessment_id, company_id, hazard_id, hazard_description, persons_at_risk,
        persons_at_risk_notes, existing_controls, likelihood_before, severity_before, further_controls_required,
        likelihood_after, severity_after, owner_id, due_date, status, sort_order)
      VALUES (nid, p_to, r.company_id, r.hazard_id, r.hazard_description, r.persons_at_risk, r.persons_at_risk_notes,
        r.existing_controls, r.likelihood_before, r.severity_before, r.further_controls_required, r.likelihood_after,
        r.severity_after, r.owner_id, CASE WHEN p_keep_findings THEN r.due_date END,
        CASE WHEN p_keep_findings THEN r.status ELSE 'open' END, r.sort_order);
      INSERT INTO risk_item_controls (company_id, risk_assessment_item_id, control_id, stage, control_title, control_type,
        effectiveness, effectiveness_recorded_by, effectiveness_recorded_at, notes)
      SELECT company_id, nid, control_id, stage, control_title, control_type,
             CASE WHEN p_keep_findings THEN effectiveness ELSE 'verification_required' END,
             CASE WHEN p_keep_findings THEN effectiveness_recorded_by END,
             CASE WHEN p_keep_findings THEN effectiveness_recorded_at END, notes
        FROM risk_item_controls WHERE risk_assessment_item_id = r.id;
    END LOOP;
  ELSIF p_kind = 'method_statement' THEN
    INSERT INTO method_statement_steps (method_statement_id, company_id, sequence_number, title, description, hazards, controls, responsible_role)
    SELECT p_to, company_id, sequence_number, title, description, hazards, controls, responsible_role
      FROM method_statement_steps WHERE method_statement_id = p_from;
  ELSIF p_kind = 'coshh_assessment' THEN
    INSERT INTO coshh_assessment_controls (company_id, coshh_assessment_id, control_id, control_title, control_type, control_category,
      effectiveness, effectiveness_recorded_by, effectiveness_recorded_at, notes)
    SELECT company_id, p_to, control_id, control_title, control_type, control_category,
           CASE WHEN p_keep_findings THEN effectiveness ELSE 'verification_required' END,
           CASE WHEN p_keep_findings THEN effectiveness_recorded_by END,
           CASE WHEN p_keep_findings THEN effectiveness_recorded_at END, notes
      FROM coshh_assessment_controls WHERE coshh_assessment_id = p_from;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.hs_copy_children(text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Template instantiation now covers RAMS and COSHH (a COSHH template
-- needs the substance it is being applied to).
DROP FUNCTION IF EXISTS public.hs_instantiate_template(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.hs_instantiate_template(p_template uuid, p_site uuid DEFAULT NULL, p_title text DEFAULT NULL,
                                                          p_substance uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tpl hs_templates; co uuid := public.my_company_id(); nid uuid := gen_random_uuid(); item jsonb; ctl jsonb;
        iid uuid; cid uuid; ord integer; type_id uuid; months integer; c jsonb; rv date;
BEGIN
  SELECT * INTO tpl FROM hs_templates WHERE id = p_template AND active;
  IF NOT FOUND OR NOT public.hs_template_visible(tpl.owner_company_id, tpl.visibility) THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002';
  END IF;
  IF co IS NULL THEN RAISE EXCEPTION 'Choose an organisation first' USING ERRCODE = '22023'; END IF;
  PERFORM public.hs_require(co, 'risk.create');
  PERFORM public.hs_check_refs(co, jsonb_build_object('site_id', p_site, 'substance_id', p_substance));
  IF p_title IS NOT NULL AND length(btrim(p_title)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Title must be 1–200 characters' USING ERRCODE = '22023';
  END IF;
  c := tpl.content;
  months := NULLIF(c ->> 'review_period_months', '')::integer;
  rv := CASE WHEN months BETWEEN 1 AND 60 THEN (current_date + make_interval(months => months))::date END;

  IF tpl.kind = 'risk_assessment' THEN
    SELECT id INTO type_id FROM assessment_types
     WHERE key = c ->> 'assessment_type' AND (company_id = co OR company_id IS NULL)
     ORDER BY company_id NULLS LAST LIMIT 1;
    INSERT INTO risk_assessments (id, company_id, title, assessment_type_id, activity_or_process, description, site_id,
                                  assessor_id, status, review_date, template_id, template_version, created_by)
    VALUES (nid, co, COALESCE(btrim(p_title), tpl.title), type_id, left(c ->> 'activity', 1000), tpl.description, p_site,
            auth.uid(), 'draft', rv, tpl.id, tpl.version, auth.uid());
    ord := 0;
    FOR item IN SELECT e FROM jsonb_array_elements(COALESCE(c -> 'items', '[]'::jsonb)) e LOOP
      ord := ord + 1; iid := gen_random_uuid();
      INSERT INTO risk_assessment_items (id, risk_assessment_id, company_id, hazard_description, persons_at_risk, existing_controls,
        likelihood_before, severity_before, further_controls_required, likelihood_after, severity_after, sort_order)
      VALUES (iid, nid, co, item ->> 'hazard_description',
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(item -> 'persons_at_risk')), '{}'),
        item ->> 'existing_controls', (item ->> 'likelihood_before')::integer, (item ->> 'severity_before')::integer,
        item ->> 'further_controls_required', NULLIF(item ->> 'likelihood_after', '')::integer,
        NULLIF(item ->> 'severity_after', '')::integer, ord);
      FOR ctl IN SELECT e FROM jsonb_array_elements(COALESCE(item -> 'controls', '[]'::jsonb)) e LOOP
        SELECT id INTO cid FROM controls
         WHERE company_id = co AND lower(title) = lower(ctl ->> 'title') AND control_type = ctl ->> 'control_type' AND status = 'active'
         LIMIT 1;
        IF cid IS NULL THEN
          INSERT INTO controls (company_id, title, control_type, created_by)
          VALUES (co, ctl ->> 'title', ctl ->> 'control_type', auth.uid()) RETURNING id INTO cid;
        END IF;
        INSERT INTO risk_item_controls (company_id, risk_assessment_item_id, control_id, stage)
        VALUES (co, iid, cid, COALESCE(ctl ->> 'stage', 'existing'))
        ON CONFLICT DO NOTHING;
        cid := NULL;
      END LOOP;
    END LOOP;

  ELSIF tpl.kind = 'method_statement' THEN
    INSERT INTO method_statements (id, company_id, title, project_name, description, scope_of_work, sections, site_id,
                                   author_id, status, review_date, template_id, template_version, created_by)
    VALUES (nid, co, COALESCE(btrim(p_title), tpl.title), c ->> 'project_name', tpl.description, c ->> 'scope_of_work',
            COALESCE(c -> 'sections', '{}'::jsonb), p_site, auth.uid(), 'draft', rv, tpl.id, tpl.version, auth.uid());
    INSERT INTO method_statement_steps (method_statement_id, company_id, sequence_number, title, description, hazards, controls, responsible_role)
    SELECT nid, co, o.ord, o.e ->> 'title', o.e ->> 'description', o.e ->> 'hazards', o.e ->> 'controls', o.e ->> 'responsible_role'
      FROM jsonb_array_elements(COALESCE(c -> 'steps', '[]'::jsonb)) WITH ORDINALITY AS o(e, ord);

  ELSIF tpl.kind = 'coshh_assessment' THEN
    IF p_substance IS NULL THEN RAISE EXCEPTION 'Choose the substance this assessment is for' USING ERRCODE = '22023'; END IF;
    INSERT INTO coshh_assessments (id, company_id, substance_id, title, task_or_process, exposure_routes, persons_exposed,
      frequency, duration, existing_controls, ppe, first_aid, spill_response, disposal, health_surveillance_required,
      exposure_monitoring_required, emergency_arrangements, site_id, assessor_id, status, review_date, template_id,
      template_version, created_by)
    VALUES (nid, co, p_substance, COALESCE(btrim(p_title), tpl.title), c ->> 'task_or_process',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(c -> 'exposure_routes')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(c -> 'persons_exposed')), '{}'),
      c ->> 'frequency', c ->> 'duration', c ->> 'existing_controls', c ->> 'ppe', c ->> 'first_aid', c ->> 'spill_response',
      c ->> 'disposal', COALESCE((c ->> 'health_surveillance_required')::boolean, false),
      COALESCE((c ->> 'exposure_monitoring_required')::boolean, false), c ->> 'emergency_arrangements', p_site, auth.uid(),
      'draft', rv, tpl.id, tpl.version, auth.uid());

  ELSE
    RAISE EXCEPTION 'This template type cannot create a record' USING ERRCODE = '22023';
  END IF;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.hs_instantiate_template(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_instantiate_template(uuid, uuid, text, uuid) TO authenticated;

-- ─── 7. Platform templates ──────────────────────────────────────────
-- Starting points only; the author reviews every line for the job.

INSERT INTO public.hs_templates (owner_company_id, kind, title, description, content, visibility)
SELECT NULL, v.kind, v.title, v.description, v.content::jsonb, 'platform'
FROM (VALUES
 ('method_statement', 'Mobile access tower — erect, use and dismantle',
  'Generic method statement for short-duration work from a mobile access tower. Adapt to the tower in use and the site.',
  '{"scope_of_work":"Erection, use and dismantling of a mobile access tower for short-duration work at height.","review_period_months":12,
    "sections":{
      "purpose":"To erect, use and dismantle a mobile access tower safely.",
      "plant_equipment":"Mobile access tower to the manufacturer''s specification, including stabilisers or outriggers.",
      "ppe":"Safety helmet, safety footwear, gloves and high-visibility clothing as required by the site.",
      "access_egress":"Access only by the tower''s built-in ladder or stairway. Never climb the frame.",
      "exclusion_zones":"Barriered zone around the tower base during erection and dismantling.",
      "emergency_arrangements":"Site first aid and emergency arrangements briefed before work starts, including how a person would be brought down from height.",
      "supervision":"Work supervised by a competent person.",
      "competency_requirements":"Tower erected, altered and dismantled only by people trained to a recognised standard.",
      "permits_required":"As required by the site. Confirm before starting."},
    "steps":[
      {"title":"Pre-start checks","description":"Inspect all components against the manufacturer''s instructions. Check the ground is firm and level and there are no overhead hazards.","hazards":"Defective components; unstable ground; overhead services","controls":"Pre-use inspection; ground assessment; keep clear of overhead lines","responsible_role":"Competent tower erector"},
      {"title":"Erect the tower","description":"Erect in the sequence set out in the manufacturer''s instructions using a collective fall-prevention method (advance guardrail or through-the-trap).","hazards":"Fall from height; falling components","controls":"Advance guardrail or through-the-trap method; exclusion zone; tool lanyards","responsible_role":"Competent tower erector"},
      {"title":"Inspect before use","description":"Inspect the completed tower and record the inspection before it is used.","hazards":"Incomplete or unstable tower","controls":"Documented inspection; tag the tower as safe to use","responsible_role":"Competent person"},
      {"title":"Use the tower","description":"Lock castors and fit stabilisers before use. Do not overload the platform. Never move the tower with anyone on it.","hazards":"Overturning; fall from height; falling objects","controls":"Castors locked; stabilisers fitted; safe working load observed; guardrails and toeboards in place","responsible_role":"Tower users"},
      {"title":"Dismantle","description":"Dismantle in the reverse of the erection sequence, keeping collective fall prevention in place.","hazards":"Fall from height; falling components","controls":"Reverse sequence; exclusion zone maintained","responsible_role":"Competent tower erector"}]}'),
 ('coshh_assessment', 'Cleaning chemicals — routine use',
  'Routine use of diluted cleaning products. Check every line against the product''s safety data sheet.',
  '{"task_or_process":"Routine cleaning using cleaning products diluted as directed by the manufacturer.","review_period_months":12,
    "exposure_routes":["skin","eye","inhalation"],"persons_exposed":["employees"],
    "frequency":"Daily","duration":"Up to two hours per shift",
    "existing_controls":"Products used at the manufacturer''s recommended dilution; good general ventilation; containers kept closed and labelled; products never mixed.",
    "ppe":"Chemical-resistant gloves. Eye protection when decanting or diluting concentrate.",
    "first_aid":"Follow section 4 of the safety data sheet. Eye contact: rinse with clean water for several minutes and seek medical advice. Skin contact: wash with water.",
    "spill_response":"Contain with absorbent material, ventilate the area and dispose of as directed in the safety data sheet.",
    "disposal":"Dispose of waste and empty containers as directed in section 13 of the safety data sheet.",
    "health_surveillance_required":false,"exposure_monitoring_required":false,
    "emergency_arrangements":"Safety data sheets kept accessible where the products are used and stored; first aider available."}')
) AS v(kind, title, description, content)
WHERE NOT EXISTS (SELECT 1 FROM public.hs_templates t WHERE t.owner_company_id IS NULL AND t.kind = v.kind AND t.title = v.title);
