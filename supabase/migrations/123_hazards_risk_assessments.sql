-- ═══════════════════════════════════════════════════════════════════
-- 123: Core-OS 360 Phase 2 — hazards and structured risk assessments
-- (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- Applied live in four transactions (123a config+hazards, 123b controls
-- +risk tables, 123c workflow+RLS, 123d versioning+templates); every
-- function body was then checked byte-for-byte against this file
-- (md5 of pg_proc.prosrc). Probe: supabase/probes/123_hazards_risk.sql.
--
-- Hazard register, configurable categories / assessment types / risk
-- matrices, structured risk assessments with multiple risk items,
-- initial and residual risk, the control hierarchy, approval workflow,
-- versioning, cloning and templates.
--
-- The rules that matter, all enforced HERE rather than in a page:
--
-- * WHO. Accountable parties (owner, assessor, responsible manager)
--   are USERS who can work in the organisation — including a
--   consultant with a live grant. Affected parties (persons at risk,
--   incident people) are PEOPLE. hs_check_refs() refuses any id that
--   is not in the record's own organisation.
-- * WORKFLOW. hs_doc_guard() (SECURITY INVOKER, keyed on current_user
--   exactly like 088) is the one gate for every status change of a
--   risk assessment — and, from 124, RAMS and COSHH. The allowed
--   transitions are a fixed map; each needs a capability; nobody but
--   staff approves a version they authored or submitted; approved
--   content is IMMUTABLE — a material change is a new version.
-- * VERSIONS. Every version is a row sharing a `reference`. Approving
--   vN supersedes every earlier live version of that reference (the
--   AFTER trigger, SECURITY DEFINER). One open draft per reference.
--   Sessions can never delete anything but a draft. `row_version`
--   gives the UI an optimistic-concurrency check.
-- * CONTROLS are an organisation library; the link row SNAPSHOTS the
--   control's title and type, so editing the library can never
--   rewrite an approved assessment. Effectiveness starts at
--   "verification required": a control is never presumed effective.
-- * MATRICES are configurable, validated (bands contiguous from 1 to
--   L×S) and frozen once any assessment uses them.

-- ─── 0. Helpers ─────────────────────────────────────────────────────

-- Record numbers: sessions may now draw numbers for their OWN
-- organisation (triggers running as `authenticated` need it). Burning a
-- number is harmless; another organisation's sequence is refused.
CREATE OR REPLACE FUNCTION public.next_record_number(p_company uuid, p_prefix text, p_yearly boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE yr integer := CASE WHEN p_yearly THEN extract(year FROM now())::integer ELSE 0 END; n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_tps_staff() AND p_company IS DISTINCT FROM public.my_company_id() THEN
    RAISE EXCEPTION 'Not your organisation' USING ERRCODE = '42501';
  END IF;
  INSERT INTO record_sequences (company_id, prefix, period, last_value) VALUES (p_company, p_prefix, yr, 1)
  ON CONFLICT (company_id, prefix, period) DO UPDATE SET last_value = record_sequences.last_value + 1
  RETURNING last_value INTO n;
  RETURN p_prefix || '-' || CASE WHEN p_yearly THEN yr::text || '-' ELSE '' END || lpad(n::text, 6, '0');
END $$;
REVOKE ALL ON FUNCTION public.next_record_number(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_record_number(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_type
    WHEN 'hazard'           THEN 'hazards'
    WHEN 'risk_assessment'  THEN 'risk_assessments'
    WHEN 'method_statement' THEN 'method_statements'
    WHEN 'coshh_assessment' THEN 'coshh_assessments'
    WHEN 'substance'        THEN 'substances'
    WHEN 'sds'              THEN 'sds_versions'
    WHEN 'incident'         THEN 'hs_incidents'
    WHEN 'investigation'    THEN 'incident_investigations'
    WHEN 'equipment'        THEN 'hs_equipment'
    WHEN 'person'           THEN 'people'
    WHEN 'contractor'       THEN 'people'
    WHEN 'department'       THEN 'departments'
    WHEN 'document'         THEN 'hs_documents'
    WHEN 'company_document' THEN 'documents'
    WHEN 'control'          THEN 'controls'
    WHEN 'training_record'  THEN 'training_records'
    WHEN 'action'           THEN 'actions'
    WHEN 'audit'            THEN 'hs_audits'
    WHEN 'site'             THEN 'hs_sites'
    ELSE NULL END
$$;

-- May this user work in this organisation? (home member, live grant,
-- or Core OS 360 staff). Internal only.
CREATE OR REPLACE FUNCTION public.hs_user_in_org(p_user uuid, p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_user AND (p.role = 'tps_admin' OR p.company_id = p_org))
      OR EXISTS (SELECT 1 FROM user_organisation_access g
                  WHERE g.user_id = p_user AND g.organisation_id = p_org AND g.active_status = 'active'
                    AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now()))
$$;
REVOKE ALL ON FUNCTION public.hs_user_in_org(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Every id a Phase 2 row points at must be in the row's organisation.
-- One function so that 124/125 extend a list, not re-invent a check.
-- Refuses outright for a session asking about another organisation,
-- so it cannot be used as an existence oracle.
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
      ('person_id','people'), ('linked_contractor_id','people'), ('risk_assessment_id','risk_assessments'),
      ('method_statement_id','method_statements'), ('coshh_assessment_id','coshh_assessments'),
      ('linked_risk_assessment_id','risk_assessments'), ('incident_id','hs_incidents')) x(k, t) LOOP
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
REVOKE ALL ON FUNCTION public.hs_check_refs(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_check_refs(uuid, jsonb) TO authenticated;

-- The gate every Phase 2 RPC opens with. DEFINER functions bypass RLS
-- AND the read-only write guard, so both are re-checked here.
CREATE OR REPLACE FUNCTION public.hs_require(p_company uuid, p_cap text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_tps_staff() AND p_company IS DISTINCT FROM public.my_company_id() THEN
    RAISE EXCEPTION 'Not your organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_capability(p_company, p_cap) THEN
    RAISE EXCEPTION 'You do not have permission to do that (%)', p_cap USING ERRCODE = '42501';
  END IF;
  IF NOT public.session_can_write() THEN
    RAISE EXCEPTION 'Your access to this organisation is read-only' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.hs_require(uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 1. Configuration: categories, assessment types, risk matrices ──
-- company_id NULL = platform-wide (staff-maintained). An organisation
-- adds its own alongside; nothing makes the seed list final.

CREATE TABLE IF NOT EXISTS public.hazard_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hazard_categories_key_idx
  ON public.hazard_categories (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

CREATE TABLE IF NOT EXISTS public.assessment_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS assessment_types_key_idx
  ON public.assessment_types (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

INSERT INTO public.hazard_categories (company_id, key, name, sort_order)
SELECT NULL, k, n, o FROM (VALUES
  ('mechanical','Mechanical',10), ('electrical','Electrical',20), ('chemical','Chemical',30),
  ('biological','Biological',40), ('ergonomic','Ergonomic',50), ('fire','Fire',60),
  ('explosion','Explosion',70), ('vehicle_traffic','Vehicle / Traffic',80), ('work_at_height','Work at Height',90),
  ('confined_space','Confined Space',100), ('manual_handling','Manual Handling',110), ('noise','Noise',120),
  ('vibration','Vibration',130), ('dust_fume','Dust / Fume',140), ('pressure','Pressure',150),
  ('temperature','Temperature',160), ('radiation','Radiation',170), ('psychosocial','Psychosocial',180),
  ('environmental','Environmental',190), ('other','Other',999)) v(k, n, o)
WHERE NOT EXISTS (SELECT 1 FROM public.hazard_categories c WHERE c.company_id IS NULL AND c.key = v.k);

INSERT INTO public.assessment_types (company_id, key, name, sort_order)
SELECT NULL, k, n, o FROM (VALUES
  ('general','General',10), ('task','Task',20), ('workplace','Workplace',30), ('equipment','Equipment',40),
  ('manual_handling','Manual Handling',50), ('fire','Fire',60), ('young_person','Young Person',70),
  ('new_expectant_mother','New / Expectant Mother',80), ('display_screen','Display Screen',90),
  ('work_at_height','Work at Height',100), ('confined_space','Confined Space',110), ('lone_working','Lone Working',120),
  ('chemical_coshh','Chemical / COSHH',130), ('environmental','Environmental',140),
  ('project_specific','Project-specific',150), ('other','Other',999)) v(k, n, o)
WHERE NOT EXISTS (SELECT 1 FROM public.assessment_types t WHERE t.company_id IS NULL AND t.key = v.k);

-- A matrix is L labels × S labels; bands cover every score 1..L×S
-- exactly once, in order, each with one of four display levels.
CREATE OR REPLACE FUNCTION public.hs_matrix_valid(p_l text[], p_s text[], p_bands jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE b jsonb; expect_min integer := 1; mx integer;
BEGIN
  IF p_l IS NULL OR p_s IS NULL OR cardinality(p_l) NOT BETWEEN 2 AND 10 OR cardinality(p_s) NOT BETWEEN 2 AND 10 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_l || p_s) x WHERE x IS NULL OR length(btrim(x)) NOT BETWEEN 1 AND 40) THEN RETURN false; END IF;
  IF jsonb_typeof(p_bands) <> 'array' OR jsonb_array_length(p_bands) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
  mx := cardinality(p_l) * cardinality(p_s);
  FOR b IN SELECT e FROM jsonb_array_elements(p_bands) e LOOP
    IF jsonb_typeof(b -> 'min') <> 'number' OR jsonb_typeof(b -> 'max') <> 'number'
       OR (b ->> 'min')::integer <> expect_min OR (b ->> 'max')::integer < (b ->> 'min')::integer
       OR COALESCE(b ->> 'level', '') NOT IN ('low','medium','high','very_high')
       OR length(btrim(COALESCE(b ->> 'label', ''))) NOT BETWEEN 1 AND 40 THEN
      RETURN false;
    END IF;
    expect_min := (b ->> 'max')::integer + 1;
  END LOOP;
  RETURN expect_min = mx + 1;
END $$;

-- The display level ('low'…'very_high') of a score under a matrix.
CREATE OR REPLACE FUNCTION public.hs_risk_level(p_bands jsonb, p_score integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT b ->> 'level' FROM jsonb_array_elements(p_bands) b
   WHERE p_score BETWEEN (b ->> 'min')::integer AND (b ->> 'max')::integer LIMIT 1
$$;

CREATE TABLE IF NOT EXISTS public.risk_matrices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  likelihood_labels text[] NOT NULL,
  severity_labels   text[] NOT NULL,
  bands             jsonb NOT NULL,
  is_default        boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_matrices_valid CHECK (public.hs_matrix_valid(likelihood_labels, severity_labels, bands))
);
CREATE UNIQUE INDEX IF NOT EXISTS risk_matrices_one_default_idx
  ON public.risk_matrices (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_default;

INSERT INTO public.risk_matrices (company_id, name, likelihood_labels, severity_labels, bands, is_default)
SELECT NULL, 'Standard 5 × 5',
  ARRAY['Rare','Unlikely','Possible','Likely','Almost Certain'],
  ARRAY['Insignificant','Minor','Moderate','Major','Catastrophic'],
  '[{"min":1,"max":4,"label":"Low","level":"low"},
    {"min":5,"max":9,"label":"Medium","level":"medium"},
    {"min":10,"max":16,"label":"High","level":"high"},
    {"min":17,"max":25,"label":"Very High","level":"very_high"}]'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.risk_matrices WHERE company_id IS NULL AND is_default);

-- Configuration RLS: everyone in an organisation reads platform rows
-- and its own; the organisation's H&S leads maintain its own; only
-- staff maintain platform rows.
ALTER TABLE public.hazard_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_matrices     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hazard_categories_read ON public.hazard_categories;
CREATE POLICY hazard_categories_read ON public.hazard_categories FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = (SELECT public.my_company_id()) OR (SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hazard_categories_staff_all ON public.hazard_categories;
CREATE POLICY hazard_categories_staff_all ON public.hazard_categories FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hazard_categories_org_write ON public.hazard_categories;
CREATE POLICY hazard_categories_org_write ON public.hazard_categories FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage')));
SELECT public.apply_write_guard('public.hazard_categories');

DROP POLICY IF EXISTS assessment_types_read ON public.assessment_types;
CREATE POLICY assessment_types_read ON public.assessment_types FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = (SELECT public.my_company_id()) OR (SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS assessment_types_staff_all ON public.assessment_types;
CREATE POLICY assessment_types_staff_all ON public.assessment_types FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS assessment_types_org_write ON public.assessment_types;
CREATE POLICY assessment_types_org_write ON public.assessment_types FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'templates.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'templates.manage')));
SELECT public.apply_write_guard('public.assessment_types');

DROP POLICY IF EXISTS risk_matrices_read ON public.risk_matrices;
CREATE POLICY risk_matrices_read ON public.risk_matrices FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = (SELECT public.my_company_id()) OR (SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS risk_matrices_staff_all ON public.risk_matrices;
CREATE POLICY risk_matrices_staff_all ON public.risk_matrices FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS risk_matrices_org_write ON public.risk_matrices;
CREATE POLICY risk_matrices_org_write ON public.risk_matrices FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'templates.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND (SELECT public.has_capability((SELECT public.my_company_id()), 'templates.manage')));
SELECT public.apply_write_guard('public.risk_matrices');

-- ─── 2. Hazard register ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hazards (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference              text NOT NULL,
  title                  text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description            text CHECK (length(description) <= 4000),
  hazard_category_id     uuid REFERENCES public.hazard_categories(id) ON DELETE SET NULL,
  source                 text NOT NULL DEFAULT 'quick_report' CHECK (source IN
                           ('quick_report','inspection','audit','risk_assessment','incident','near_miss','consultation','other')),
  status                 text NOT NULL DEFAULT 'identified' CHECK (status IN
                           ('identified','under_assessment','controlled','monitoring','closed','archived')),
  perceived_seriousness  text CHECK (perceived_seriousness IN ('low','medium','high','very_high')),
  immediate_action_taken text CHECK (length(immediate_action_taken) <= 2000),
  site_id                uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  department_id          uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  linked_asset_id        uuid REFERENCES public.hs_equipment(id) ON DELETE SET NULL,
  linked_process         text CHECK (length(linked_process) <= 300),
  linked_location        text CHECK (length(linked_location) <= 300),
  owner_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  identified_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  identified_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  closed_at              timestamptz,
  notes                  text CHECK (length(notes) <= 4000),
  archived_at            timestamptz,
  row_version            integer NOT NULL DEFAULT 1,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference),
  CHECK (site_id IS NOT NULL OR linked_location IS NOT NULL),
  CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CHECK (identified_at <= now() + interval '1 day')
);
CREATE INDEX IF NOT EXISTS hazards_company_status_idx ON public.hazards (company_id, status);
CREATE INDEX IF NOT EXISTS hazards_company_site_idx ON public.hazards (company_id, site_id);
CREATE INDEX IF NOT EXISTS hazards_company_category_idx ON public.hazards (company_id, hazard_category_id);
CREATE INDEX IF NOT EXISTS hazards_owner_idx ON public.hazards (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hazards_company_identified_idx ON public.hazards (company_id, identified_at DESC);
CREATE INDEX IF NOT EXISTS hazards_identified_by_idx ON public.hazards (identified_by);

-- A reporter without hazard.manage files a report and nothing more:
-- it lands as 'identified', unowned, for H&S review. Everything else
-- is the H&S lead's call.
CREATE OR REPLACE FUNCTION public.hs_hazard_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF session THEN
      NEW.reference := NULL;
      NEW.created_by := auth.uid();
      NEW.identified_by := auth.uid();
      NEW.reviewed_by := NULL; NEW.reviewed_at := NULL; NEW.closed_at := NULL; NEW.archived_at := NULL;
      IF NOT public.has_capability(NEW.company_id, 'hazard.manage') THEN
        NEW.status := 'identified';
        NEW.owner_id := NULL;
        NEW.source := 'quick_report';
      END IF;
      IF NEW.status = 'archived' THEN NEW.archived_at := now(); END IF;
    END IF;
    IF NEW.reference IS NULL THEN NEW.reference := public.next_record_number(NEW.company_id, 'HAZ'); END IF;
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.row_version := 1;
    PERFORM public.hs_check_refs(NEW.company_id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF session AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.identified_by IS DISTINCT FROM OLD.identified_by OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Organisation, reference and reporter cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'identified' AND NEW.reviewed_at IS NULL THEN
      NEW.reviewed_at := now(); NEW.reviewed_by := auth.uid();
    END IF;
    NEW.closed_at   := CASE WHEN NEW.status = 'closed' THEN now() WHEN NEW.status = 'archived' THEN OLD.closed_at ELSE NULL END;
    NEW.archived_at := CASE WHEN NEW.status = 'archived' THEN now() ELSE NULL END;
  ELSIF session THEN
    NEW.reviewed_at := OLD.reviewed_at; NEW.reviewed_by := OLD.reviewed_by;
    NEW.closed_at := OLD.closed_at; NEW.archived_at := OLD.archived_at;
  END IF;
  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  PERFORM public.hs_check_refs(NEW.company_id, to_jsonb(NEW));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_hazard_guard ON public.hazards;
CREATE TRIGGER hs_hazard_guard BEFORE INSERT OR UPDATE ON public.hazards
  FOR EACH ROW EXECUTE FUNCTION public.hs_hazard_guard();

ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hazards_staff_all ON public.hazards;
CREATE POLICY hazards_staff_all ON public.hazards FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
-- The register is for the people who manage risk; a reporter always
-- sees what they reported.
DROP POLICY IF EXISTS hazards_read ON public.hazards;
CREATE POLICY hazards_read ON public.hazards FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read'))
           OR identified_by = (SELECT auth.uid())));
DROP POLICY IF EXISTS hazards_report ON public.hazards;
CREATE POLICY hazards_report ON public.hazards FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.report')));
DROP POLICY IF EXISTS hazards_manage ON public.hazards;
CREATE POLICY hazards_manage ON public.hazards FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage')));
SELECT public.apply_write_guard('public.hazards');

DROP TRIGGER IF EXISTS hazards_audit ON public.hazards;
CREATE TRIGGER hazards_audit AFTER INSERT OR UPDATE OR DELETE ON public.hazards
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('hazard','company_id','reference','title','status','site_id','department_id','hazard_category_id','owner_id','perceived_seriousness','linked_asset_id','archived_at');

CREATE OR REPLACE FUNCTION public.hs_event_hazard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'hazard', NEW.id, 'reported', 'Hazard reported: ' || NEW.reference || ' ' || left(NEW.title, 150));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'hazard', NEW.id, 'status_' || NEW.status,
      'Hazard ' || NEW.reference || ': ' || replace(NEW.status, '_', ' '));
  ELSIF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NEW.owner_id IS NOT NULL THEN
    PERFORM public.hs_log(NEW.company_id, 'hazard', NEW.id, 'owner_assigned', 'Hazard ' || NEW.reference || ': owner assigned');
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_event_hazard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hazards_hs_event ON public.hazards;
CREATE TRIGGER hazards_hs_event AFTER INSERT OR UPDATE ON public.hazards
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_hazard();

DROP TRIGGER IF EXISTS hazards_platform_event ON public.hazards;
CREATE TRIGGER hazards_platform_event AFTER INSERT OR UPDATE ON public.hazards
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('reference','status','site_id','owner_id','hazard_category_id','perceived_seriousness','source');

-- ─── 3. Control library ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.controls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description           text CHECK (length(description) <= 2000),
  control_type          text NOT NULL CHECK (control_type IN ('elimination','substitution','engineering','administrative','ppe')),
  category              text CHECK (category IN ('lev','enclosure','substitution','ventilation','ppe_rpe','restricted_access',
                                                 'hygiene','exposure_monitoring','health_surveillance','other')),
  owner_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  verification_required boolean NOT NULL DEFAULT false,
  review_date           date,
  row_version           integer NOT NULL DEFAULT 1,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS controls_company_type_idx ON public.controls (company_id, control_type);
CREATE INDEX IF NOT EXISTS controls_company_title_idx ON public.controls (company_id, lower(title));

CREATE OR REPLACE FUNCTION public.hs_control_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(CASE WHEN current_user IN ('authenticated','anon') THEN auth.uid() END, NEW.created_by, auth.uid());
    NEW.row_version := 1;
  ELSE
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'A control cannot move organisation' USING ERRCODE = '23514';
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := now();
  END IF;
  PERFORM public.hs_check_refs(NEW.company_id, to_jsonb(NEW));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_control_guard ON public.controls;
CREATE TRIGGER hs_control_guard BEFORE INSERT OR UPDATE ON public.controls
  FOR EACH ROW EXECUTE FUNCTION public.hs_control_guard();

ALTER TABLE public.controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS controls_staff_all ON public.controls;
CREATE POLICY controls_staff_all ON public.controls FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS controls_read ON public.controls;
CREATE POLICY controls_read ON public.controls FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage'))));
DROP POLICY IF EXISTS controls_insert ON public.controls;
CREATE POLICY controls_insert ON public.controls FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS controls_update ON public.controls;
CREATE POLICY controls_update ON public.controls FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
SELECT public.apply_write_guard('public.controls');

-- ─── 4. Risk assessments ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference              text NOT NULL,
  version                integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  previous_version_id    uuid REFERENCES public.risk_assessments(id) ON DELETE SET NULL,
  copied_from_id         uuid REFERENCES public.risk_assessments(id) ON DELETE SET NULL,
  template_id            uuid REFERENCES public.hs_templates(id) ON DELETE SET NULL,
  template_version       integer,
  title                  text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  assessment_type_id     uuid REFERENCES public.assessment_types(id) ON DELETE SET NULL,
  activity_or_process    text CHECK (length(activity_or_process) <= 1000),
  description            text CHECK (length(description) <= 8000),
  site_id                uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  department_id          uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  assessor_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsible_manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  risk_matrix_id         uuid NOT NULL REFERENCES public.risk_matrices(id),
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN
                           ('draft','pending_review','changes_requested','approved','active','review_due','superseded','archived')),
  assessment_date        date NOT NULL DEFAULT current_date,
  review_date            date,
  submitted_at           timestamptz,
  submitted_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_comments        text CHECK (length(review_comments) <= 4000),
  approved_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  activated_at           timestamptz,
  superseded_at          timestamptz,
  superseded_by_id       uuid REFERENCES public.risk_assessments(id) ON DELETE SET NULL,
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
  CONSTRAINT risk_assessments_approval_stamped CHECK (status NOT IN ('approved','active','review_due','superseded')
                                                      OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT risk_assessments_archived_stamped CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CONSTRAINT risk_assessments_review_after_assessment CHECK (review_date IS NULL OR review_date >= assessment_date),
  CONSTRAINT risk_assessments_review_date_required CHECK (status IN ('draft','changes_requested','archived','superseded') OR review_date IS NOT NULL),
  CONSTRAINT risk_assessments_version_chain CHECK ((version = 1) = (previous_version_id IS NULL))
);
CREATE INDEX IF NOT EXISTS risk_assessments_company_status_idx ON public.risk_assessments (company_id, status);
CREATE INDEX IF NOT EXISTS risk_assessments_company_review_idx ON public.risk_assessments (company_id, review_date) WHERE status IN ('approved','active','review_due');
CREATE INDEX IF NOT EXISTS risk_assessments_company_site_idx ON public.risk_assessments (company_id, site_id);
CREATE INDEX IF NOT EXISTS risk_assessments_reference_idx ON public.risk_assessments (company_id, reference, version DESC);
CREATE INDEX IF NOT EXISTS risk_assessments_template_idx ON public.risk_assessments (template_id) WHERE template_id IS NOT NULL;
-- One open (not yet decided) version per assessment at a time.
CREATE UNIQUE INDEX IF NOT EXISTS risk_assessments_one_open_idx ON public.risk_assessments (company_id, reference)
  WHERE status IN ('draft','pending_review','changes_requested');

CREATE TABLE IF NOT EXISTS public.risk_assessment_items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id        uuid NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  company_id                uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hazard_id                 uuid REFERENCES public.hazards(id) ON DELETE SET NULL,
  hazard_description        text NOT NULL CHECK (length(btrim(hazard_description)) BETWEEN 1 AND 2000),
  persons_at_risk           text[] NOT NULL DEFAULT '{}' CHECK (persons_at_risk <@ ARRAY['employees','contractors','visitors',
                              'members_of_public','young_workers','pregnant_workers','lone_workers','named_individuals']::text[]),
  persons_at_risk_notes     text CHECK (length(persons_at_risk_notes) <= 1000),
  existing_controls         text CHECK (length(existing_controls) <= 4000),
  likelihood_before         integer NOT NULL CHECK (likelihood_before BETWEEN 1 AND 10),
  severity_before           integer NOT NULL CHECK (severity_before BETWEEN 1 AND 10),
  initial_risk_score        integer GENERATED ALWAYS AS (likelihood_before * severity_before) STORED,
  further_controls_required text CHECK (length(further_controls_required) <= 4000),
  likelihood_after          integer CHECK (likelihood_after BETWEEN 1 AND 10),
  severity_after            integer CHECK (severity_after BETWEEN 1 AND 10),
  residual_risk_score       integer GENERATED ALWAYS AS (likelihood_after * severity_after) STORED,
  owner_id                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date                  date,
  status                    text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','complete','not_required')),
  sort_order                integer NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_items_residual_pair CHECK ((likelihood_after IS NULL) = (severity_after IS NULL)),
  CONSTRAINT risk_items_residual_not_above_initial CHECK (likelihood_after IS NULL OR likelihood_after * severity_after <= likelihood_before * severity_before)
);
CREATE INDEX IF NOT EXISTS risk_items_assessment_idx ON public.risk_assessment_items (risk_assessment_id, sort_order);
CREATE INDEX IF NOT EXISTS risk_items_company_hazard_idx ON public.risk_assessment_items (company_id, hazard_id) WHERE hazard_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS risk_items_company_residual_idx ON public.risk_assessment_items (company_id, residual_risk_score);
CREATE INDEX IF NOT EXISTS risk_items_owner_idx ON public.risk_assessment_items (owner_id) WHERE owner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.risk_item_controls (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  risk_assessment_item_id    uuid NOT NULL REFERENCES public.risk_assessment_items(id) ON DELETE CASCADE,
  control_id                 uuid NOT NULL REFERENCES public.controls(id) ON DELETE RESTRICT,
  stage                      text NOT NULL DEFAULT 'existing' CHECK (stage IN ('existing','additional')),
  control_title              text NOT NULL,
  control_type               text NOT NULL CHECK (control_type IN ('elimination','substitution','engineering','administrative','ppe')),
  effectiveness              text NOT NULL DEFAULT 'verification_required' CHECK (effectiveness IN
                               ('in_place','partially_implemented','ineffective','not_implemented','verification_required')),
  effectiveness_recorded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  effectiveness_recorded_at  timestamptz,
  notes                      text CHECK (length(notes) <= 1000),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (risk_assessment_item_id, control_id, stage)
);
CREATE INDEX IF NOT EXISTS risk_item_controls_control_idx ON public.risk_item_controls (control_id);

-- Where does a risk assessment stand? (company, status, matrix size).
-- Answers only for the caller's own organisation.
CREATE OR REPLACE FUNCTION public.hs_ra_state(p_ra uuid)
RETURNS TABLE (company_id uuid, status text, l_max integer, s_max integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ra.company_id, ra.status, cardinality(m.likelihood_labels), cardinality(m.severity_labels)
    FROM risk_assessments ra JOIN risk_matrices m ON m.id = ra.risk_matrix_id
   WHERE ra.id = p_ra
     AND (auth.uid() IS NULL OR public.is_tps_staff() OR ra.company_id = public.my_company_id())
$$;
REVOKE ALL ON FUNCTION public.hs_ra_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_ra_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hs_ra_item_state(p_item uuid)
RETURNS TABLE (company_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ra.company_id, ra.status
    FROM risk_assessment_items i JOIN risk_assessments ra ON ra.id = i.risk_assessment_id
   WHERE i.id = p_item
     AND (auth.uid() IS NULL OR public.is_tps_staff() OR ra.company_id = public.my_company_id())
$$;
REVOKE ALL ON FUNCTION public.hs_ra_item_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_ra_item_state(uuid) TO authenticated;

-- Items can change only while their assessment is being drafted.
CREATE OR REPLACE FUNCTION public.hs_ra_item_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record;
BEGIN
  SELECT * INTO st FROM public.hs_ra_state(CASE WHEN TG_OP = 'DELETE' THEN OLD.risk_assessment_id ELSE NEW.risk_assessment_id END);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'Risk assessment not found' USING ERRCODE = '23503'; END IF;
  IF session THEN
    IF st.status NOT IN ('draft','changes_requested') THEN
      RAISE EXCEPTION 'This version is locked (%). Create a new version to change it.', st.status USING ERRCODE = '23514';
    END IF;
    IF NOT public.has_capability(st.company_id, 'risk.create') THEN
      RAISE EXCEPTION 'You do not have permission to edit risk assessments' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.risk_assessment_id IS DISTINCT FROM OLD.risk_assessment_id THEN
    RAISE EXCEPTION 'A risk item cannot move to another assessment' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  IF NEW.likelihood_before > st.l_max OR NEW.severity_before > st.s_max
     OR NEW.likelihood_after > st.l_max OR NEW.severity_after > st.s_max THEN
    RAISE EXCEPTION 'Likelihood must be 1–% and severity 1–% on this risk matrix', st.l_max, st.s_max USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  PERFORM public.hs_check_refs(st.company_id, to_jsonb(NEW));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_ra_item_guard ON public.risk_assessment_items;
CREATE TRIGGER hs_ra_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.risk_assessment_items
  FOR EACH ROW EXECUTE FUNCTION public.hs_ra_item_guard();

-- Linking a control snapshots its title and type. While the version is
-- a draft anything goes; under review the reviewer may record
-- effectiveness only; once decided, nothing.
CREATE OR REPLACE FUNCTION public.hs_ra_control_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE session boolean := current_user IN ('authenticated','anon'); st record; c record;
BEGIN
  SELECT * INTO st FROM public.hs_ra_item_state(CASE WHEN TG_OP = 'DELETE' THEN OLD.risk_assessment_item_id ELSE NEW.risk_assessment_item_id END);
  IF st.company_id IS NULL THEN RAISE EXCEPTION 'Risk item not found' USING ERRCODE = '23503'; END IF;
  IF session THEN
    IF st.status IN ('draft','changes_requested') THEN
      IF NOT public.has_capability(st.company_id, 'risk.create') THEN
        RAISE EXCEPTION 'You do not have permission to edit risk assessments' USING ERRCODE = '42501';
      END IF;
    ELSIF st.status = 'pending_review' AND TG_OP = 'UPDATE' THEN
      IF NOT public.has_capability(st.company_id, 'risk.approve') THEN
        RAISE EXCEPTION 'Only a reviewer may record control effectiveness during review' USING ERRCODE = '42501';
      END IF;
      IF NEW.stage IS DISTINCT FROM OLD.stage THEN
        RAISE EXCEPTION 'During review only effectiveness and notes can be recorded' USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'This version is locked (%). Create a new version to change it.', st.status USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  -- The snapshot is the control as it stood when linked: relink to change it.
  IF TG_OP = 'UPDATE' AND (NEW.risk_assessment_item_id IS DISTINCT FROM OLD.risk_assessment_item_id
                           OR NEW.control_id IS DISTINCT FROM OLD.control_id
                           OR NEW.control_title IS DISTINCT FROM OLD.control_title
                           OR NEW.control_type IS DISTINCT FROM OLD.control_type) THEN
    RAISE EXCEPTION 'Unlink the control and link another instead' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := st.company_id;
  PERFORM public.hs_check_refs(st.company_id, to_jsonb(NEW));
  IF TG_OP = 'INSERT' THEN
    SELECT title, control_type INTO c FROM public.controls WHERE id = NEW.control_id;
    IF session OR NEW.control_title IS NULL THEN NEW.control_title := c.title; END IF;
    IF session OR NEW.control_type IS NULL THEN NEW.control_type := c.control_type; END IF;
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
DROP TRIGGER IF EXISTS hs_ra_control_guard ON public.risk_item_controls;
CREATE TRIGGER hs_ra_control_guard BEFORE INSERT OR UPDATE OR DELETE ON public.risk_item_controls
  FOR EACH ROW EXECUTE FUNCTION public.hs_ra_control_guard();

-- A matrix any assessment uses is frozen: changing a band would change
-- what an approved record says. A different matrix is a new row.
CREATE OR REPLACE FUNCTION public.hs_matrix_frozen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM risk_assessments WHERE risk_matrix_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'This risk matrix is in use and cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.likelihood_labels IS DISTINCT FROM OLD.likelihood_labels OR NEW.severity_labels IS DISTINCT FROM OLD.severity_labels
     OR NEW.bands IS DISTINCT FROM OLD.bands OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'This risk matrix is in use and cannot be changed; create a new matrix instead' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_matrix_frozen() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_matrix_frozen ON public.risk_matrices;
CREATE TRIGGER hs_matrix_frozen BEFORE UPDATE OR DELETE ON public.risk_matrices
  FOR EACH ROW EXECUTE FUNCTION public.hs_matrix_frozen();

-- ─── 5. The document workflow (risk assessments; RAMS/COSHH in 124) ──

CREATE OR REPLACE FUNCTION public.hs_doc_transition_ok(p_kind text, p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT (p_from, p_to) IN (
      ('draft','pending_review'), ('draft','archived'),
      ('pending_review','changes_requested'), ('pending_review','approved'), ('pending_review','draft'),
      ('changes_requested','pending_review'), ('changes_requested','draft'), ('changes_requested','archived'),
      ('approved','active'), ('approved','review_due'), ('approved','superseded'), ('approved','archived'),
      ('active','review_due'), ('active','superseded'), ('active','archived'),
      ('review_due','active'), ('review_due','superseded'), ('review_due','archived'),
      ('superseded','archived'))
    -- RAMS have no periodic review state in the specification
    AND NOT (p_kind = 'method_statement' AND 'review_due' IN (p_from, p_to))
$$;

-- Is this version complete enough to submit? 124 adds RAMS and COSHH.
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
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_doc_ready(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_doc_ready(text, uuid) TO authenticated;

-- THE gate. SECURITY INVOKER: current_user is 'authenticated' for a
-- browser session and the function owner inside the DEFINER helpers
-- (supersede, new version, clone, template), which are trusted paths
-- with their own checks.
CREATE OR REPLACE FUNCTION public.hs_doc_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  kind    text := TG_ARGV[0];
  prefix  text := TG_ARGV[1];
  session boolean := current_user IN ('authenticated','anon');
  o jsonb; n jsonb; k text; msg text; author uuid;
  locked  text[] := ARRAY['company_id','reference','version','previous_version_id','copied_from_id','template_id',
                          'template_version','created_by','created_at','risk_matrix_id'];
  stamps  text[] := ARRAY['approved_by','approved_at','submitted_at','submitted_by','activated_at','superseded_at',
                          'superseded_by_id','archived_at','review_requested_at','review_requested_by','last_reviewed_at',
                          'last_reviewed_by','review_comments','review_reason'];
  workflow text[];
BEGIN
  workflow := stamps || ARRAY['status','row_version','updated_at','review_date'];

  IF TG_OP = 'DELETE' THEN
    IF session AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Only a draft can be deleted; archive it instead' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF session THEN
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'A new record starts as a draft' USING ERRCODE = '23514';
      END IF;
      IF NEW.version <> 1 OR NEW.previous_version_id IS NOT NULL THEN
        RAISE EXCEPTION 'Use "New version" to revise an approved record' USING ERRCODE = '23514';
      END IF;
      NEW := jsonb_populate_record(NEW, (SELECT jsonb_object_agg(s, 'null'::jsonb) FROM unnest(stamps) s));
      NEW.copied_from_id := NULL; NEW.template_id := NULL; NEW.template_version := NULL;
      NEW.reference := NULL;
      NEW.created_by := auth.uid();
    END IF;
    IF NEW.reference IS NULL THEN NEW.reference := public.next_record_number(NEW.company_id, prefix); END IF;
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.row_version := 1;
    PERFORM public.hs_check_refs(NEW.company_id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  -- UPDATE
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  IF NOT session THEN RETURN NEW; END IF;

  FOREACH k IN ARRAY locked LOOP
    IF n -> k IS DISTINCT FROM o -> k THEN
      RAISE EXCEPTION '% cannot be changed', k USING ERRCODE = '23514';
    END IF;
  END LOOP;
  -- Workflow stamps are the database's to set, never the caller's.
  NEW := jsonb_populate_record(NEW, (SELECT jsonb_object_agg(s, o -> s) FROM unnest(stamps) s WHERE s NOT IN ('review_comments','review_reason')));
  author := COALESCE(NULLIF(o ->> 'assessor_id', '')::uuid, NULLIF(o ->> 'author_id', '')::uuid);

  IF NEW.status = OLD.status THEN
    IF OLD.status IN ('draft','changes_requested') THEN
      IF NOT public.has_capability(OLD.company_id, 'risk.create') THEN
        RAISE EXCEPTION 'You do not have permission to edit this record' USING ERRCODE = '42501';
      END IF;
      NEW.review_comments := OLD.review_comments;
      NEW.review_reason := OLD.review_reason;
      PERFORM public.hs_check_refs(NEW.company_id, to_jsonb(NEW));
      RETURN NEW;
    END IF;
    -- A decided version: content is immutable. Only an approver may
    -- reschedule the next review.
    IF (n - workflow) IS DISTINCT FROM (o - workflow) THEN
      RAISE EXCEPTION 'An approved or submitted version cannot be edited. Create a new version.' USING ERRCODE = '23514';
    END IF;
    NEW.review_comments := OLD.review_comments;
    NEW.review_reason := OLD.review_reason;
    IF NEW.review_date IS DISTINCT FROM OLD.review_date THEN
      IF OLD.status NOT IN ('approved','active','review_due') OR NOT public.has_capability(OLD.company_id, 'risk.approve') THEN
        RAISE EXCEPTION 'Only an approver can change the review date of an approved record' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- A status change. Content never changes in the same statement.
  IF NOT public.hs_doc_transition_ok(kind, OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Cannot move from % to %', replace(OLD.status, '_', ' '), replace(NEW.status, '_', ' ') USING ERRCODE = '23514';
  END IF;
  IF (n - workflow) IS DISTINCT FROM (o - workflow) THEN
    RAISE EXCEPTION 'Save your changes before changing status' USING ERRCODE = '23514';
  END IF;
  IF NEW.review_date IS DISTINCT FROM OLD.review_date AND NOT (OLD.status = 'review_due' AND NEW.status = 'active') THEN
    NEW.review_date := OLD.review_date;
  END IF;

  CASE NEW.status
    WHEN 'pending_review' THEN
      IF NOT public.has_capability(OLD.company_id, 'risk.create') THEN
        RAISE EXCEPTION 'You do not have permission to submit this record' USING ERRCODE = '42501';
      END IF;
      IF author IS NULL THEN RAISE EXCEPTION 'Name the assessor before submitting' USING ERRCODE = '23514'; END IF;
      IF NEW.review_date IS NULL THEN RAISE EXCEPTION 'Set a review date before submitting' USING ERRCODE = '23514'; END IF;
      msg := public.hs_doc_ready(kind, OLD.id);
      IF msg IS NOT NULL THEN RAISE EXCEPTION '%', msg USING ERRCODE = '23514'; END IF;
      NEW.submitted_at := now(); NEW.submitted_by := auth.uid();
      NEW.review_comments := OLD.review_comments;
      NEW.review_reason := OLD.review_reason;
    WHEN 'changes_requested' THEN
      IF NOT public.has_capability(OLD.company_id, 'risk.approve') THEN
        RAISE EXCEPTION 'Only an approver can request changes' USING ERRCODE = '42501';
      END IF;
      IF length(btrim(COALESCE(NEW.review_comments, ''))) = 0 OR NEW.review_comments IS NOT DISTINCT FROM OLD.review_comments THEN
        RAISE EXCEPTION 'Say what needs to change' USING ERRCODE = '23514';
      END IF;
      NEW.review_reason := OLD.review_reason;
    WHEN 'draft' THEN
      IF NOT public.has_capability(OLD.company_id, 'risk.create') THEN
        RAISE EXCEPTION 'You do not have permission to edit this record' USING ERRCODE = '42501';
      END IF;
      NEW.review_comments := OLD.review_comments;
      NEW.review_reason := OLD.review_reason;
    WHEN 'approved' THEN
      IF NOT public.has_capability(OLD.company_id, 'risk.approve') THEN
        RAISE EXCEPTION 'You do not have permission to approve this record' USING ERRCODE = '42501';
      END IF;
      IF NOT public.is_tps_staff() AND auth.uid() IN (OLD.created_by, OLD.submitted_by, author) THEN
        RAISE EXCEPTION 'You cannot approve a version you authored or submitted; another approver must review it' USING ERRCODE = '42501';
      END IF;
      NEW.approved_by := auth.uid(); NEW.approved_at := now();
      NEW.review_reason := OLD.review_reason;
    WHEN 'active' THEN
      IF NOT public.has_capability(OLD.company_id, 'risk.approve') THEN
        RAISE EXCEPTION 'You do not have permission to do that' USING ERRCODE = '42501';
      END IF;
      IF OLD.status = 'review_due' THEN
        IF NEW.review_date IS NULL OR NEW.review_date <= current_date OR NEW.review_date IS NOT DISTINCT FROM OLD.review_date THEN
          RAISE EXCEPTION 'Set the next review date to confirm the review' USING ERRCODE = '23514';
        END IF;
        NEW.last_reviewed_at := now(); NEW.last_reviewed_by := auth.uid();
        NEW.review_reason := NULL;
      ELSE
        NEW.activated_at := now();
        NEW.review_reason := OLD.review_reason;
      END IF;
      NEW.review_comments := OLD.review_comments;
    WHEN 'review_due' THEN
      IF NOT public.has_capability(OLD.company_id, 'risk.create') THEN
        RAISE EXCEPTION 'You do not have permission to request a review' USING ERRCODE = '42501';
      END IF;
      IF NEW.review_reason IS NULL THEN RAISE EXCEPTION 'Give the reason for the review' USING ERRCODE = '23514'; END IF;
      NEW.review_requested_at := now(); NEW.review_requested_by := auth.uid();
      NEW.review_comments := OLD.review_comments;
    WHEN 'superseded' THEN
      RAISE EXCEPTION 'A version is superseded automatically when a newer version is approved' USING ERRCODE = '23514';
    WHEN 'archived' THEN
      IF NOT (public.has_capability(OLD.company_id, 'risk.approve')
              OR (OLD.status IN ('draft','changes_requested') AND public.has_capability(OLD.company_id, 'risk.create'))) THEN
        RAISE EXCEPTION 'You do not have permission to archive this record' USING ERRCODE = '42501';
      END IF;
      NEW.archived_at := now();
      NEW.review_comments := OLD.review_comments;
      NEW.review_reason := OLD.review_reason;
  END CASE;
  RETURN NEW;
END $$;

-- After a status change: supersede older live versions, write the
-- Safety Timeline and the audit trail. DEFINER so the supersede can
-- update rows the approver's session could not (and so the audit
-- insert is possible at all).
CREATE OR REPLACE FUNCTION public.hs_doc_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  kind   text := TG_ARGV[0];
  entity text := TG_ARGV[2];
  label  text := TG_ARGV[3];
  verb   text;
  head   text;
BEGIN
  head := label || ' ' || NEW.reference || ' v' || NEW.version;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, kind, NEW.id, 'created',
      head || ' created' || CASE WHEN NEW.copied_from_id IS NOT NULL THEN ' (copied)'
                                 WHEN NEW.template_id IS NOT NULL THEN ' (from template)' ELSE '' END);
    INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (NEW.company_id, NEW.site_id, auth.uid(), public.audit_actor_kind(), entity || '.created', TG_TABLE_NAME, NEW.id::text, NULL,
            jsonb_build_object('reference', NEW.reference, 'version', NEW.version, 'status', NEW.status,
                               'previous_version_id', NEW.previous_version_id, 'copied_from_id', NEW.copied_from_id,
                               'template_id', NEW.template_id), public.audit_context());
    RETURN NULL;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;

  IF NEW.status = 'approved' THEN
    EXECUTE format('UPDATE public.%I SET status = ''superseded'', superseded_at = now(), superseded_by_id = $1
                     WHERE company_id = $2 AND reference = $3 AND id <> $1 AND status IN (''approved'',''active'',''review_due'')',
                   TG_TABLE_NAME)
      USING NEW.id, NEW.company_id, NEW.reference;
  END IF;

  verb := CASE NEW.status
    WHEN 'pending_review'    THEN 'submitted'
    WHEN 'changes_requested' THEN 'changes_requested'
    WHEN 'approved'          THEN 'approved'
    WHEN 'active'            THEN CASE WHEN OLD.status = 'review_due' THEN 'reviewed' ELSE 'activated' END
    WHEN 'review_due'        THEN 'review_due'
    WHEN 'superseded'        THEN 'superseded'
    WHEN 'archived'          THEN 'archived'
    WHEN 'draft'             THEN 'reopened'
    ELSE NEW.status END;
  PERFORM public.hs_log(NEW.company_id, kind, NEW.id, verb, head || ': ' || replace(verb, '_', ' '));
  INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
  VALUES (NEW.company_id, NEW.site_id, auth.uid(), public.audit_actor_kind(), entity || '.' || verb, TG_TABLE_NAME, NEW.id::text,
          jsonb_build_object('status', OLD.status),
          jsonb_build_object('status', NEW.status, 'reference', NEW.reference, 'version', NEW.version,
                             'superseded_by_id', NEW.superseded_by_id),
          public.audit_context());
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.hs_doc_after() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_doc_guard ON public.risk_assessments;
CREATE TRIGGER hs_doc_guard BEFORE INSERT OR UPDATE OR DELETE ON public.risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.hs_doc_guard('risk_assessment', 'RA');
DROP TRIGGER IF EXISTS hs_doc_after ON public.risk_assessments;
CREATE TRIGGER hs_doc_after AFTER INSERT OR UPDATE ON public.risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.hs_doc_after('risk_assessment', 'RA', 'risk', 'Risk assessment');

-- The matrix defaults to the organisation's own default, else the
-- platform's — before the guard runs (BEFORE triggers fire by name).
CREATE OR REPLACE FUNCTION public.hs_ra_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.risk_matrix_id IS NULL THEN
    SELECT id INTO NEW.risk_matrix_id FROM risk_matrices
     WHERE is_default AND (company_id = NEW.company_id OR company_id IS NULL)
     ORDER BY company_id NULLS LAST LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_ra_defaults() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_a_ra_defaults ON public.risk_assessments;
CREATE TRIGGER hs_a_ra_defaults BEFORE INSERT ON public.risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.hs_ra_defaults();

DROP TRIGGER IF EXISTS risk_assessments_platform_event ON public.risk_assessments;
CREATE TRIGGER risk_assessments_platform_event AFTER INSERT OR UPDATE ON public.risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('reference','version','status','review_date','site_id','assessor_id','responsible_manager_id');

ALTER TABLE public.risk_assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_item_controls    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS risk_assessments_staff_all ON public.risk_assessments;
CREATE POLICY risk_assessments_staff_all ON public.risk_assessments FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS risk_assessments_read ON public.risk_assessments;
CREATE POLICY risk_assessments_read ON public.risk_assessments FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));
DROP POLICY IF EXISTS risk_assessments_insert ON public.risk_assessments;
CREATE POLICY risk_assessments_insert ON public.risk_assessments FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS risk_assessments_update ON public.risk_assessments;
CREATE POLICY risk_assessments_update ON public.risk_assessments FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.approve'))))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.approve'))));
SELECT public.apply_write_guard('public.risk_assessments');

DROP POLICY IF EXISTS risk_items_staff_all ON public.risk_assessment_items;
CREATE POLICY risk_items_staff_all ON public.risk_assessment_items FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS risk_items_read ON public.risk_assessment_items;
CREATE POLICY risk_items_read ON public.risk_assessment_items FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));
DROP POLICY IF EXISTS risk_items_write ON public.risk_assessment_items;
CREATE POLICY risk_items_write ON public.risk_assessment_items FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
SELECT public.apply_write_guard('public.risk_assessment_items');

DROP POLICY IF EXISTS risk_item_controls_staff_all ON public.risk_item_controls;
CREATE POLICY risk_item_controls_staff_all ON public.risk_item_controls FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS risk_item_controls_read ON public.risk_item_controls;
CREATE POLICY risk_item_controls_read ON public.risk_item_controls FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));
DROP POLICY IF EXISTS risk_item_controls_insert ON public.risk_item_controls;
CREATE POLICY risk_item_controls_insert ON public.risk_item_controls FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS risk_item_controls_delete ON public.risk_item_controls;
CREATE POLICY risk_item_controls_delete ON public.risk_item_controls FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create')));
DROP POLICY IF EXISTS risk_item_controls_update ON public.risk_item_controls;
CREATE POLICY risk_item_controls_update ON public.risk_item_controls FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.approve'))))
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.approve'))));
SELECT public.apply_write_guard('public.risk_item_controls');

-- ─── 6. New version, clone, template ────────────────────────────────

-- Copy a version's risk items and their controls onto another version.
-- keep_findings: a new version inherits the effectiveness findings and
-- item progress; a clone for another site starts them afresh, so the
-- copy never implies it was reviewed where it now applies.
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
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.hs_copy_children(text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Revise the CURRENT approved version: a new draft vN+1 with the same
-- reference, items, controls and links. The approved version is not
-- touched until the new one is approved.
CREATE OR REPLACE FUNCTION public.hs_new_version(p_kind text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t text := public.hs_entity_table(p_kind); src jsonb; co uuid; later boolean; nid uuid := gen_random_uuid();
BEGIN
  IF p_kind NOT IN ('risk_assessment','method_statement','coshh_assessment') THEN
    RAISE EXCEPTION 'Not a versioned record' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id = $1', t) INTO src USING p_id;
  IF src IS NULL THEN RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002'; END IF;
  co := (src ->> 'company_id')::uuid;
  PERFORM public.hs_require(co, 'risk.create');
  IF src ->> 'status' NOT IN ('approved','active','review_due') THEN
    RAISE EXCEPTION 'Only the current approved version can be revised' USING ERRCODE = '23514';
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE company_id = $1 AND reference = $2 AND version > $3)', t)
    INTO later USING co, src ->> 'reference', (src ->> 'version')::integer;
  IF later THEN RAISE EXCEPTION 'A newer version already exists' USING ERRCODE = '23505'; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE company_id = $1 AND reference = $2 AND status IN (''draft'',''pending_review'',''changes_requested''))', t)
    INTO later USING co, src ->> 'reference';
  IF later THEN RAISE EXCEPTION 'A new version is already being drafted' USING ERRCODE = '23505'; END IF;

  src := (src - ARRAY['approved_by','approved_at','submitted_at','submitted_by','activated_at','superseded_at','superseded_by_id',
                      'archived_at','review_requested_at','review_requested_by','last_reviewed_at','last_reviewed_by',
                      'review_comments','review_date'])
         || jsonb_build_object('id', nid, 'status', 'draft', 'version', (src ->> 'version')::integer + 1,
                               'previous_version_id', p_id, 'created_by', auth.uid(), 'created_at', now(),
                               'updated_at', now(), 'row_version', 1, 'assessment_date', current_date);
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)', t, t) USING src;
  PERFORM public.hs_copy_children(p_kind, p_id, nid, true);
  INSERT INTO hs_links (company_id, from_type, from_id, to_type, to_id, relation, note, created_by)
  SELECT company_id, from_type, nid, to_type, to_id, relation, note, auth.uid() FROM hs_links WHERE from_type = p_kind AND from_id = p_id
  UNION ALL
  SELECT company_id, from_type, from_id, to_type, nid, relation, note, auth.uid() FROM hs_links WHERE to_type = p_kind AND to_id = p_id
  ON CONFLICT DO NOTHING;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.hs_new_version(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_new_version(text, uuid) TO authenticated;

-- Duplicate for another site or a similar activity: a NEW record
-- (new reference, version 1, draft) marked "copied from", with every
-- effectiveness finding reset — the copy must be reviewed where it now
-- applies. Same organisation only.
CREATE OR REPLACE FUNCTION public.hs_clone(p_kind text, p_id uuid, p_site uuid DEFAULT NULL, p_title text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t text := public.hs_entity_table(p_kind); src jsonb; co uuid; nid uuid := gen_random_uuid();
BEGIN
  IF p_kind NOT IN ('risk_assessment','method_statement','coshh_assessment') THEN
    RAISE EXCEPTION 'This record cannot be copied' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NOT NULL AND length(btrim(p_title)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Title must be 1–200 characters' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE id = $1', t) INTO src USING p_id;
  IF src IS NULL THEN RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002'; END IF;
  co := (src ->> 'company_id')::uuid;
  PERFORM public.hs_require(co, 'risk.create');
  PERFORM public.hs_check_refs(co, jsonb_build_object('site_id', p_site));

  src := (src - ARRAY['approved_by','approved_at','submitted_at','submitted_by','activated_at','superseded_at','superseded_by_id',
                      'archived_at','review_requested_at','review_requested_by','last_reviewed_at','last_reviewed_by',
                      'review_comments','review_reason','review_date','previous_version_id','reference'])
         || jsonb_build_object('id', nid, 'status', 'draft', 'version', 1, 'copied_from_id', p_id,
                               'created_by', auth.uid(), 'created_at', now(), 'updated_at', now(), 'row_version', 1,
                               'assessment_date', current_date,
                               'title', COALESCE(btrim(p_title), src ->> 'title'),
                               'site_id', COALESCE(p_site, (src ->> 'site_id')::uuid))
         || CASE WHEN p_site IS NOT NULL AND p_site IS DISTINCT FROM (src ->> 'site_id')::uuid
                 THEN jsonb_build_object('department_id', NULL) ELSE '{}'::jsonb END;
  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)', t, t) USING src;
  PERFORM public.hs_copy_children(p_kind, p_id, nid, false);
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.hs_clone(text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_clone(text, uuid, uuid, text) TO authenticated;

-- Create an organisation-owned draft from a visible template. The
-- record remembers which template VERSION it came from; a later edit
-- to the template never touches it (hs_template_update_available).
CREATE OR REPLACE FUNCTION public.hs_instantiate_template(p_template uuid, p_site uuid DEFAULT NULL, p_title text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE tpl hs_templates; co uuid := public.my_company_id(); nid uuid := gen_random_uuid(); item jsonb; ctl jsonb;
        iid uuid; cid uuid; ord integer; type_id uuid; months integer;
BEGIN
  SELECT * INTO tpl FROM hs_templates WHERE id = p_template AND active;
  IF NOT FOUND OR NOT public.hs_template_visible(tpl.owner_company_id, tpl.visibility) THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002';
  END IF;
  IF co IS NULL THEN RAISE EXCEPTION 'Choose an organisation first' USING ERRCODE = '22023'; END IF;
  PERFORM public.hs_require(co, 'risk.create');
  PERFORM public.hs_check_refs(co, jsonb_build_object('site_id', p_site));
  IF p_title IS NOT NULL AND length(btrim(p_title)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Title must be 1–200 characters' USING ERRCODE = '22023';
  END IF;

  IF tpl.kind = 'risk_assessment' THEN
    SELECT id INTO type_id FROM assessment_types
     WHERE key = tpl.content ->> 'assessment_type' AND (company_id = co OR company_id IS NULL)
     ORDER BY company_id NULLS LAST LIMIT 1;
    months := NULLIF(tpl.content ->> 'review_period_months', '')::integer;
    INSERT INTO risk_assessments (id, company_id, title, assessment_type_id, activity_or_process, description, site_id,
                                  assessor_id, status, review_date, template_id, template_version, created_by)
    VALUES (nid, co, COALESCE(btrim(p_title), tpl.title), type_id, left(tpl.content ->> 'activity', 1000), tpl.description, p_site,
            auth.uid(), 'draft',
            CASE WHEN months BETWEEN 1 AND 60 THEN (current_date + make_interval(months => months))::date END,
            tpl.id, tpl.version, auth.uid());
    ord := 0;
    FOR item IN SELECT e FROM jsonb_array_elements(COALESCE(tpl.content -> 'items', '[]'::jsonb)) e LOOP
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
  ELSE
    RAISE EXCEPTION 'This template type is not available yet' USING ERRCODE = '22023';
  END IF;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.hs_instantiate_template(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_instantiate_template(uuid, uuid, text) TO authenticated;

-- "Template update available": the template has moved on since this
-- record was made from it. Computed, never stored, never acted on.
CREATE OR REPLACE FUNCTION public.hs_template_update_available(p_template uuid, p_version integer)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT version > p_version AND active FROM public.hs_templates WHERE id = p_template), false)
$$;

-- ─── 7. Platform risk assessment templates ──────────────────────────
-- Starting points only: every rating is a suggestion the assessor must
-- confirm for their own workplace before the assessment is submitted.

INSERT INTO public.hs_templates (owner_company_id, kind, title, description, content, visibility)
SELECT NULL, 'risk_assessment', v.title, v.description, v.content::jsonb, 'platform'
FROM (VALUES
 ('Manual handling — lifting and carrying',
  'General manual handling of loads. Review every rating against the actual loads, people and environment.',
  '{"assessment_type":"manual_handling","activity":"Lifting, carrying, pushing and pulling loads by hand","review_period_months":12,
    "items":[
     {"hazard_description":"Lifting and carrying loads — musculoskeletal injury to back and shoulders","persons_at_risk":["employees","young_workers","pregnant_workers"],
      "existing_controls":"Loads assessed before lifting; mechanical aids available","likelihood_before":3,"severity_before":3,
      "further_controls_required":"Manual handling training for everyone who lifts; individual assessment of heavy or awkward loads","likelihood_after":2,"severity_after":3,
      "controls":[{"title":"Mechanical handling aids (trolleys, sack trucks)","control_type":"engineering","stage":"existing"},
                  {"title":"Manual handling training (TILE principles)","control_type":"administrative","stage":"additional"}]},
     {"hazard_description":"Repetitive handling — upper limb disorders","persons_at_risk":["employees"],
      "existing_controls":"Task rotation","likelihood_before":2,"severity_before":3,
      "further_controls_required":"Review workstation layout to reduce reaching and twisting","likelihood_after":2,"severity_after":2,
      "controls":[{"title":"Job and task rotation","control_type":"administrative","stage":"existing"},
                  {"title":"Workstation layout reviewed to minimise reaching and twisting","control_type":"engineering","stage":"additional"}]},
     {"hazard_description":"Handling sharp or rough-edged items — cuts and abrasions","persons_at_risk":["employees","contractors"],
      "existing_controls":"Cut-resistant gloves issued","likelihood_before":3,"severity_before":2,
      "further_controls_required":"Gloves inspected and replaced when damaged","likelihood_after":2,"severity_after":2,
      "controls":[{"title":"Cut-resistant gloves","control_type":"ppe","stage":"existing"}]}]}'),
 ('Work at height — ladders and stepladders',
  'Short-duration work from ladders and stepladders. Consider whether the work at height can be avoided first.',
  '{"assessment_type":"work_at_height","activity":"Short-duration tasks from ladders and stepladders","review_period_months":12,
    "items":[
     {"hazard_description":"Fall from a ladder or stepladder","persons_at_risk":["employees","contractors"],
      "existing_controls":"Ladders used only for short-duration, low-risk work; pre-use checks","likelihood_before":3,"severity_before":4,
      "further_controls_required":"Ladder register with formal inspections; podium steps instead of stepladders where practicable","likelihood_after":2,"severity_after":4,
      "controls":[{"title":"Avoid work at height where reasonably practicable (e.g. long-reach tools)","control_type":"elimination","stage":"additional"},
                  {"title":"Podium steps or mobile platform in place of stepladders","control_type":"substitution","stage":"additional"},
                  {"title":"Pre-use ladder checks and ladder inspection register","control_type":"administrative","stage":"existing"},
                  {"title":"Ladder training for users","control_type":"administrative","stage":"existing"}]},
     {"hazard_description":"Falling objects striking people below","persons_at_risk":["employees","visitors","members_of_public"],
      "existing_controls":"Area below cordoned off","likelihood_before":2,"severity_before":4,
      "further_controls_required":"Tools and materials secured against falling","likelihood_after":1,"severity_after":4,
      "controls":[{"title":"Physical exclusion zone below the work area","control_type":"engineering","stage":"existing"},
                  {"title":"Tool lanyards and secured materials","control_type":"engineering","stage":"additional"}]},
     {"hazard_description":"Fall through a fragile surface","persons_at_risk":["employees","contractors"],
      "existing_controls":"Fragile surfaces identified and marked; access prohibited","likelihood_before":2,"severity_before":5,
      "further_controls_required":"Crawling boards or covers where access cannot be avoided","likelihood_after":1,"severity_after":5,
      "controls":[{"title":"Fragile surfaces identified, marked and access prohibited","control_type":"administrative","stage":"existing"},
                  {"title":"Crawling boards or covers over fragile surfaces","control_type":"engineering","stage":"additional"}]}]}'),
 ('Office and general workplace',
  'Everyday hazards of an office or light-work environment.',
  '{"assessment_type":"workplace","activity":"General office and workplace activities","review_period_months":12,
    "items":[
     {"hazard_description":"Slips, trips and falls — floors, cables and walkways","persons_at_risk":["employees","visitors"],
      "existing_controls":"Good housekeeping; cables routed or covered","likelihood_before":3,"severity_before":2,
      "further_controls_required":"Spill kit and prompt cleaning; routine walkway inspections","likelihood_after":2,"severity_after":2,
      "controls":[{"title":"Good housekeeping and clear walkways","control_type":"administrative","stage":"existing"},
                  {"title":"Cable covers and cable management","control_type":"engineering","stage":"existing"}]},
     {"hazard_description":"Display screen equipment — posture and eye strain","persons_at_risk":["employees"],
      "existing_controls":"Workstation assessments for display screen users","likelihood_before":3,"severity_before":2,
      "further_controls_required":"Adjustable chairs and monitor arms where assessments identify a need","likelihood_after":2,"severity_after":2,
      "controls":[{"title":"Display screen workstation assessment for each user","control_type":"administrative","stage":"existing"},
                  {"title":"Adjustable chairs and monitor arms","control_type":"engineering","stage":"additional"}]},
     {"hazard_description":"Fire — ignition sources and blocked escape routes","persons_at_risk":["employees","visitors"],
      "existing_controls":"Fire risk assessment in place; weekly alarm test; escape routes kept clear","likelihood_before":2,"severity_before":5,
      "further_controls_required":"Fire warden training and regular evacuation drills","likelihood_after":1,"severity_after":5,
      "controls":[{"title":"Fire detection and alarm system, tested weekly","control_type":"engineering","stage":"existing"},
                  {"title":"Fire warden training and evacuation drills","control_type":"administrative","stage":"additional"}]},
     {"hazard_description":"Electrical equipment — electric shock and fire","persons_at_risk":["employees"],
      "existing_controls":"Portable appliance inspection and testing; user visual checks","likelihood_before":2,"severity_before":4,
      "further_controls_required":null,"likelihood_after":1,"severity_after":4,
      "controls":[{"title":"Portable appliance inspection and testing","control_type":"administrative","stage":"existing"}]}]}')
) AS v(title, description, content)
WHERE NOT EXISTS (SELECT 1 FROM public.hs_templates t WHERE t.owner_company_id IS NULL AND t.kind = 'risk_assessment' AND t.title = v.title);
