-- ═══════════════════════════════════════════════════════════════════
-- 133: Core-OS 360 Phase 3 — requirement catalogues and rules (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Plan §3. A requirement is a RULE ("everyone in role X needs course Y,
-- renewed every 36 months") on a SCOPE (role, site or one person),
-- pointing at a CATALOGUE item. Evidence (134) satisfies it; the engine
-- (136) consolidates the rules for a person and judges the evidence.
--
-- Catalogues: organisation-owned (company_id) or global (company_id NULL,
-- staff-maintained, read by everyone signed in).
--   training_courses · competency_levels · competencies · credential_types
--   (qualification / certification / licence / card / permit — one
--   configurable model, not a hardcoded UK list) · induction_templates ·
--   occupational_health_requirements · authorisation_types · ppe_types ·
--   pre_employment_check_types
--
-- Rules: role_requirements · site_requirements · person_requirements.
--
-- VERSIONING. Once a rule is in force its meaning cannot change: only its
-- end date (never retroactively), notes and supersession link may. To
-- change a rule, copy it as a draft (requirement_supersede), edit the
-- draft, and activate it from a date; activation ends the old rule the
-- day before. A past date is therefore always judged by the rule that was
-- in force then (spec 105-107). Enforced by trigger, not by the UI.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Catalogues ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_courses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  title                text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description          text CHECK (length(description) <= 4000),
  category             text CHECK (length(category) <= 100),
  delivery_method      text NOT NULL DEFAULT 'classroom' CHECK (delivery_method IN
                         ('internal','external','classroom','elearning','practical','toolbox','certification','refresher')),
  provider             text CHECK (length(provider) <= 200),
  validity_months      integer CHECK (validity_months BETWEEN 1 AND 600),
  refresher_required   boolean NOT NULL DEFAULT false,
  safety_critical      boolean NOT NULL DEFAULT false,
  certificate_expected boolean NOT NULL DEFAULT false,
  learning_content_id  uuid REFERENCES public.learning_content(id) ON DELETE SET NULL,
  active_status        text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS training_courses_title_unique
  ON public.training_courses (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(title)));

-- Levels are configurable; `rank` orders them. Global defaults seeded.
CREATE TABLE IF NOT EXISTS public.competency_levels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key ~ '^[a-z_]{2,40}$'),
  label       text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  rank        integer NOT NULL CHECK (rank BETWEEN 1 AND 20),
  description text CHECK (length(description) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS competency_levels_key_unique
  ON public.competency_levels (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
CREATE UNIQUE INDEX IF NOT EXISTS competency_levels_rank_unique
  ON public.competency_levels (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), rank);
INSERT INTO public.competency_levels (company_id, key, label, rank, description) VALUES
  (NULL, 'awareness',  'Awareness',  1, 'Knows the hazards and the rules; does not perform the task'),
  (NULL, 'trained',    'Trained',    2, 'Has completed the training; not yet assessed as competent'),
  (NULL, 'supervised', 'Supervised', 3, 'Performs the task under direct supervision'),
  (NULL, 'competent',  'Competent',  4, 'Assessed as able to perform the task safely unsupervised'),
  (NULL, 'authorised', 'Authorised', 5, 'Competent and formally authorised to perform the task'),
  (NULL, 'assessor',   'Assessor',   6, 'May assess the competence of others')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.competencies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description       text CHECK (length(description) <= 4000),
  category          text CHECK (length(category) <= 100),
  safety_critical   boolean NOT NULL DEFAULT false,
  assessment_method text NOT NULL DEFAULT 'practical_observation' CHECK (assessment_method IN
                      ('practical_observation','external_certificate','assessment','supervisor_signoff',
                       'qualification','logged_experience','competency_test')),
  renewal_months    integer CHECK (renewal_months BETWEEN 1 AND 600),
  active_status     text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS competencies_title_unique
  ON public.competencies (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(title)));

CREATE TABLE IF NOT EXISTS public.credential_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('qualification','certification','licence','card','permit')),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  awarding_body   text CHECK (length(awarding_body) <= 200),
  description     text CHECK (length(description) <= 2000),
  validity_months integer CHECK (validity_months BETWEEN 1 AND 600),
  active_status   text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS credential_types_title_unique
  ON public.credential_types (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(btrim(title)));

CREATE TABLE IF NOT EXISTS public.induction_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  scope              text NOT NULL DEFAULT 'company' CHECK (scope IN ('company','site','project','department','contractor','role')),
  site_id            uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  content            text CHECK (length(content) <= 20000),
  reinduction_months integer CHECK (reinduction_months BETWEEN 1 AND 600),
  active_status      text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.occupational_health_requirements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  category        text NOT NULL CHECK (category IN ('audiometry','respiratory','havs','skin','night_worker',
                    'safety_critical_medical','driver_medical','fitness_for_task','other')),
  frequency_months integer CHECK (frequency_months BETWEEN 1 AND 600),
  safety_critical boolean NOT NULL DEFAULT false,
  active_status   text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.occupational_health_requirements (company_id, title, category, frequency_months, safety_critical) VALUES
  (NULL, 'Audiometry (noise)',                        'audiometry',              12, false),
  (NULL, 'Respiratory health surveillance',           'respiratory',             12, false),
  (NULL, 'Hand-arm vibration (HAVS) surveillance',    'havs',                    12, false),
  (NULL, 'Skin surveillance',                         'skin',                    12, false),
  (NULL, 'Night worker health assessment',            'night_worker',            12, false),
  (NULL, 'Safety-critical worker medical',            'safety_critical_medical', 24, true),
  (NULL, 'Driver medical',                            'driver_medical',          36, true),
  (NULL, 'Fitness for task assessment',               'fitness_for_task',        NULL, false)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.authorisation_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description     text CHECK (length(description) <= 2000),
  scope_kind      text NOT NULL DEFAULT 'general' CHECK (scope_kind IN ('general','site','plant','equipment','voltage','permit')),
  validity_months integer CHECK (validity_months BETWEEN 1 AND 600),
  safety_critical boolean NOT NULL DEFAULT false,
  active_status   text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ppe_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  replacement_months integer CHECK (replacement_months BETWEEN 1 AND 240),
  active_status      text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pre_employment_check_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  key           text NOT NULL CHECK (key ~ '^[a-z_]{2,60}$'),
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  active_status text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pre_employment_check_types_key_unique
  ON public.pre_employment_check_types (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
INSERT INTO public.pre_employment_check_types (company_id, key, title) VALUES
  (NULL, 'right_to_work',      'Right to work'),
  (NULL, 'references',         'References'),
  (NULL, 'qualifications',     'Qualifications'),
  (NULL, 'licences',           'Licences'),
  (NULL, 'medical',            'Pre-employment medical'),
  (NULL, 'background',         'Background check'),
  (NULL, 'role_certification', 'Role-specific certification')
ON CONFLICT DO NOTHING;

-- Catalogue plumbing: updated_at, same-organisation links, RLS, guard, audit.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['training_courses','competency_levels','competencies','credential_types','induction_templates',
                           'occupational_health_requirements','authorisation_types','ppe_types','pre_employment_check_types'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_company_idx ON public.%1$I (company_id)', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated USING (company_id IS NULL OR company_id = (SELECT public.my_company_id()) OR (SELECT public.is_tps_staff()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_staff_all ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_staff_all ON public.%1$I FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_org_manage ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_org_manage ON public.%1$I FOR ALL TO authenticated USING (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, ''workforce.manage'')) WITH CHECK (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, ''workforce.manage''))', t);
    PERFORM public.apply_write_guard(format('public.%I', t)::regclass);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_audit ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_row(%2$L, ''company_id'', ''title'', ''active_status'')',
                   t, CASE t WHEN 'occupational_health_requirements' THEN 'health_requirement_type'
                             WHEN 'pre_employment_check_types' THEN 'pre_employment_check_type'
                             WHEN 'competencies' THEN 'competency'
                             ELSE regexp_replace(t, 's$', '') END);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS induction_templates_links ON public.induction_templates;
CREATE OR REPLACE FUNCTION public.induction_template_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.induction_template_links() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER induction_templates_links BEFORE INSERT OR UPDATE ON public.induction_templates
  FOR EACH ROW EXECUTE FUNCTION public.induction_template_links();

-- ─── 2. Requirement rules ───────────────────────────────────────────

-- The columns every rule table shares, in one place.
CREATE OR REPLACE FUNCTION public.workforce_requirement_types()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT ARRAY['training','competency','qualification','certification','licence','card','permit',
               'induction','medical','authorisation','ppe','document','pre_employment_check']
$$;

DO $$
DECLARE t text; scope_col text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_requirements','site_requirements','person_requirements'] LOOP
    scope_col := CASE t WHEN 'role_requirements' THEN 'role_id uuid NOT NULL REFERENCES public.job_roles(id) ON DELETE CASCADE'
                        WHEN 'site_requirements' THEN 'site_id uuid NOT NULL REFERENCES public.hs_sites(id) ON DELETE CASCADE'
                        ELSE 'person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE' END;
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%1$I (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
        %2$s,
        requirement_type  text NOT NULL CHECK (requirement_type = ANY (public.workforce_requirement_types())),
        reference_id      uuid,
        reference_key     text CHECK (length(reference_key) <= 100),
        min_level_id      uuid REFERENCES public.competency_levels(id) ON DELETE RESTRICT,
        mandatory         boolean NOT NULL DEFAULT true,
        safety_critical   boolean NOT NULL DEFAULT false,
        evidence_required boolean NOT NULL DEFAULT false,
        allow_elearning   boolean NOT NULL DEFAULT true,
        validity_months   integer CHECK (validity_months BETWEEN 1 AND 600),
        grace_days        integer NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 90),
        required_by       date,
        effective_from    date,
        effective_until   date,
        superseded_by     uuid,
        source_type       text CHECK (source_type IN ('manual','incident','corrective_action','coshh','risk_assessment','clone','import')),
        source_id         uuid,
        notes             text CHECK (length(notes) <= 2000),
        created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from - 1),
        CHECK ((requirement_type = 'document') = (reference_key IS NOT NULL AND reference_id IS NULL)),
        CHECK (requirement_type = 'document' OR reference_id IS NOT NULL),
        CHECK ((requirement_type = 'competency') = (min_level_id IS NOT NULL))
      )$f$, t, scope_col);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_company_idx ON public.%1$I (company_id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_scope_idx ON public.%1$I (%2$s, effective_from)', t,
                   CASE t WHEN 'role_requirements' THEN 'role_id' WHEN 'site_requirements' THEN 'site_id' ELSE 'person_id' END);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_reference_idx ON public.%1$I (requirement_type, reference_id)', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t);
  END LOOP;
END $$;

-- Reference integrity (the catalogue row exists, belongs to this
-- organisation or is global, and — for credentials — is the right kind),
-- scope integrity, and the versioning rules.
CREATE OR REPLACE FUNCTION public.requirement_rule_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  ref_org uuid; ref_found boolean := false; ref_kind text; lvl_org uuid;
  in_force boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.effective_from IS NOT NULL AND OLD.effective_from <= current_date THEN
      RAISE EXCEPTION 'A requirement that has been in force is never deleted; end it instead' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  -- Scope in the same organisation.
  IF TG_TABLE_NAME = 'role_requirements' THEN
    PERFORM public.assert_same_org(NEW.company_id, 'job_roles', NEW.role_id);
  ELSIF TG_TABLE_NAME = 'site_requirements' THEN
    PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  ELSE
    PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.person_id);
  END IF;

  -- Reference.
  IF NEW.requirement_type <> 'document' THEN
    CASE
      WHEN NEW.requirement_type = 'training' THEN
        SELECT true, company_id INTO ref_found, ref_org FROM training_courses WHERE id = NEW.reference_id;
      WHEN NEW.requirement_type = 'competency' THEN
        SELECT true, company_id INTO ref_found, ref_org FROM competencies WHERE id = NEW.reference_id;
      WHEN NEW.requirement_type IN ('qualification','certification','licence','card','permit') THEN
        SELECT true, company_id, kind INTO ref_found, ref_org, ref_kind FROM credential_types WHERE id = NEW.reference_id;
        IF ref_found AND ref_kind <> NEW.requirement_type THEN
          RAISE EXCEPTION 'Credential type is a %, not a %', ref_kind, NEW.requirement_type USING ERRCODE = '23514';
        END IF;
      WHEN NEW.requirement_type = 'induction' THEN
        SELECT true, company_id INTO ref_found, ref_org FROM induction_templates WHERE id = NEW.reference_id;
      WHEN NEW.requirement_type = 'medical' THEN
        SELECT true, company_id INTO ref_found, ref_org FROM occupational_health_requirements WHERE id = NEW.reference_id;
      WHEN NEW.requirement_type = 'authorisation' THEN
        SELECT true, company_id INTO ref_found, ref_org FROM authorisation_types WHERE id = NEW.reference_id;
      WHEN NEW.requirement_type = 'ppe' THEN
        SELECT true, company_id INTO ref_found, ref_org FROM ppe_types WHERE id = NEW.reference_id;
      WHEN NEW.requirement_type = 'pre_employment_check' THEN
        SELECT true, company_id INTO ref_found, ref_org FROM pre_employment_check_types WHERE id = NEW.reference_id;
    END CASE;
    IF NOT COALESCE(ref_found, false) OR (ref_org IS NOT NULL AND ref_org <> NEW.company_id) THEN
      RAISE EXCEPTION 'The % referenced does not exist in this organisation', NEW.requirement_type USING ERRCODE = '23503';
    END IF;
  END IF;
  IF NEW.min_level_id IS NOT NULL THEN
    SELECT company_id INTO lvl_org FROM competency_levels WHERE id = NEW.min_level_id;
    IF lvl_org IS NOT NULL AND lvl_org <> NEW.company_id THEN
      RAISE EXCEPTION 'Competency level belongs to another organisation' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.effective_from IS NOT NULL AND NEW.effective_from < current_date THEN
      RAISE EXCEPTION 'A requirement cannot start in the past' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: a rule that has been in force keeps its meaning.
  in_force := OLD.effective_from IS NOT NULL AND OLD.effective_from <= current_date;
  IF in_force THEN
    IF OLD.effective_until IS NOT NULL AND OLD.effective_until < current_date THEN
      RAISE EXCEPTION 'An ended requirement is history and cannot change' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['effective_until','notes','superseded_by','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['effective_until','notes','superseded_by','updated_at']) THEN
      RAISE EXCEPTION 'A requirement in force cannot be changed; supersede it with a new version' USING ERRCODE = '23514';
    END IF;
    IF NEW.effective_until IS DISTINCT FROM OLD.effective_until
       AND (NEW.effective_until IS NULL OR NEW.effective_until < current_date - 1) THEN
      RAISE EXCEPTION 'A requirement can only be ended from yesterday onwards, never retroactively' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.effective_from IS NOT NULL AND NEW.effective_from < current_date THEN
    RAISE EXCEPTION 'A requirement cannot start in the past' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.requirement_rule_guard() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text; scope_col text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_requirements','site_requirements','person_requirements'] LOOP
    scope_col := CASE t WHEN 'role_requirements' THEN 'role_id' WHEN 'site_requirements' THEN 'site_id' ELSE 'person_id' END;
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_guard ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.requirement_rule_guard()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_staff_all ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_staff_all ON public.%1$I FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()))', t);
    IF t = 'person_requirements' THEN
      EXECUTE 'DROP POLICY IF EXISTS person_requirements_read ON public.person_requirements';
      EXECUTE 'CREATE POLICY person_requirements_read ON public.person_requirements FOR SELECT TO authenticated USING (public.person_visible(person_id))';
    ELSE
      EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$I', t);
      EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()))', t);
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %1$s_manage ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_manage ON public.%1$I FOR ALL TO authenticated USING (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, ''workforce.manage'')) WITH CHECK (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, ''workforce.manage''))', t);
    PERFORM public.apply_write_guard(format('public.%I', t)::regclass);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_audit ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_row(%2$L, ''company_id'', %3$L, ''requirement_type'', ''reference_id'', ''reference_key'', ''min_level_id'', ''mandatory'', ''safety_critical'', ''evidence_required'', ''validity_months'', ''effective_from'', ''effective_until'', ''source_type'', ''source_id'')',
                   t, regexp_replace(t, 's$', ''), scope_col);
  END LOOP;
END $$;

-- ─── 3. Versioning and cloning (the only ways to change a rule) ─────

CREATE OR REPLACE FUNCTION public.requirement_table_ok(p_table text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_table IN ('role_requirements','site_requirements','person_requirements')
$$;

-- Copy a rule as a DRAFT the caller may edit freely. The original stays
-- in force until the draft is activated.
CREATE OR REPLACE FUNCTION public.requirement_supersede(p_table text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.requirement_table_ok(p_table) THEN RAISE EXCEPTION 'Unknown requirement table' USING ERRCODE = '22023'; END IF;
  EXECUTE format($q$
    INSERT INTO public.%1$I
      SELECT (jsonb_populate_record(NULL::public.%1$I,
               to_jsonb(r) || jsonb_build_object('id', gen_random_uuid(), 'effective_from', NULL, 'effective_until', NULL,
                                                 'superseded_by', NULL, 'source_type', COALESCE(r.source_type, 'manual'),
                                                 'created_by', auth.uid(), 'created_at', now(), 'updated_at', now()))).*
        FROM public.%1$I r WHERE r.id = $1
    RETURNING id$q$, p_table) INTO new_id USING p_id;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Requirement not found' USING ERRCODE = 'P0002'; END IF;
  RETURN new_id;
END $$;

-- Bring a draft into force from a date (today or later). If it replaces
-- a rule, that rule ends the day before and points at its successor.
CREATE OR REPLACE FUNCTION public.requirement_activate(p_table text, p_id uuid, p_from date DEFAULT current_date,
                                                      p_replaces uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  IF NOT public.requirement_table_ok(p_table) THEN RAISE EXCEPTION 'Unknown requirement table' USING ERRCODE = '22023'; END IF;
  IF p_from IS NULL OR p_from < current_date THEN RAISE EXCEPTION 'Activate from today or later' USING ERRCODE = '22023'; END IF;
  EXECUTE format('UPDATE public.%I SET effective_from = $2 WHERE id = $1 AND effective_from IS NULL', p_table) USING p_id, p_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Only a draft requirement can be activated' USING ERRCODE = '23514'; END IF;
  IF p_replaces IS NOT NULL THEN
    EXECUTE format('UPDATE public.%I SET effective_until = $2, superseded_by = $3 WHERE id = $1', p_table)
      USING p_replaces, p_from - 1, p_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'The requirement being replaced was not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
END $$;

-- Clone a role: a DRAFT role with draft copies of its rules in force
-- today. Nothing applies to anyone until job_role_activate() (spec 104).
CREATE OR REPLACE FUNCTION public.job_role_clone(p_role uuid, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE r job_roles%ROWTYPE; new_id uuid;
BEGIN
  SELECT * INTO r FROM job_roles WHERE id = p_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO job_roles (company_id, title, department_id, default_site_id, description, role_category,
                         safety_critical, active_status, cloned_from_id)
    VALUES (r.company_id, p_title, r.department_id, r.default_site_id, r.description, r.role_category,
            r.safety_critical, 'draft', r.id)
    RETURNING id INTO new_id;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, reference_key, min_level_id,
                                 mandatory, safety_critical, evidence_required, allow_elearning, validity_months,
                                 grace_days, source_type, source_id, notes)
    SELECT company_id, new_id, requirement_type, reference_id, reference_key, min_level_id, mandatory, safety_critical,
           evidence_required, allow_elearning, validity_months, grace_days, 'clone', id, notes
      FROM role_requirements
     WHERE role_id = p_role AND effective_from IS NOT NULL AND effective_from <= current_date
       AND (effective_until IS NULL OR effective_until >= current_date);
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.job_role_activate(p_role uuid, p_from date DEFAULT current_date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  IF p_from IS NULL OR p_from < current_date THEN RAISE EXCEPTION 'Activate from today or later' USING ERRCODE = '22023'; END IF;
  UPDATE job_roles SET active_status = 'active' WHERE id = p_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE role_requirements SET effective_from = p_from WHERE role_id = p_role AND effective_from IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.requirement_supersede(text, uuid), public.requirement_activate(text, uuid, date, uuid),
  public.job_role_clone(uuid, text), public.job_role_activate(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requirement_supersede(text, uuid), public.requirement_activate(text, uuid, date, uuid),
  public.job_role_clone(uuid, text), public.job_role_activate(uuid, date) TO authenticated;
