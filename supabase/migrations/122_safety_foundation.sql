-- ═══════════════════════════════════════════════════════════════════
-- 122: Core-OS 360 Phase 2 — operational H&S foundation (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- Shared machinery the Phase 2 modules (123-126) stand on. Nothing here
-- is H&S content yet.
--
-- 1. CAPABILITIES. hazard.report / hazard.manage, incident.read /
--    incident.sensitive.read / incident.approve, riddor.review,
--    templates.manage — added to the 117 catalogue and mirrored in
--    lib/auth/capabilities.ts (pinned both ways by tenancySql.test.ts).
--    A standard employee may REPORT a hazard or an incident without
--    gaining sight of every investigation or any medical detail.
-- 2. STAFF IN THE CLIENT WORKSPACE. Core OS 360 staff deliver H&S. They
--    may now set an active organisation (any live client) and work in
--    the portal's PROTECT workspace exactly as a consultant does, one
--    client at a time, named on screen. They could already read and
--    write every row; this only gives them the same single-tenant view.
-- 3. RECORD NUMBERS. Organisation-scoped, human-readable, concurrency
--    safe (INC-2026-000124, HAZ-000031…). Never a security boundary:
--    the uuid stays the key and RLS the gate.
-- 4. hs_links. ONE typed relationship table between H&S records, both
--    ends checked to belong to the same organisation. This is the
--    Risk Graph's foundation — relationships as rows, not free text.
-- 5. EVIDENCE. hs_files gains evidence_type/description and new entity
--    kinds; clients may now upload where their capabilities allow; and
--    a file in the private bucket is readable ONLY if its hs_files row
--    is readable, so evidence inherits the record's permissions
--    (incident photos need incident.read; a witness statement needs
--    incident.sensitive.read) instead of "anyone in the company".
-- 6. TEMPLATES (platform / private / consultancy-portfolio) and
--    attribution (who acted, and for which home organisation).
-- 7. org_user_ids_with_capability() — the audience resolver the
--    notification rules use ("everyone in ABC who holds riddor.review").

-- ─── 1. Capabilities ─────────────────────────────────────────────────

INSERT INTO public.access_capabilities (key, description, sensitive) VALUES
  ('hazard.report',           'Report a hazard', false),
  ('hazard.manage',           'Review, assign and close hazards', false),
  ('incident.read',           'See all incidents in the organisation', false),
  ('incident.sensitive.read', 'See injury, medical and personal contact details of people in incidents', true),
  ('incident.approve',        'Approve investigations and close incidents', false),
  ('riddor.review',           'Record the RIDDOR reportability decision', true),
  ('templates.manage',        'Create and edit H&S templates', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, sensitive = EXCLUDED.sensitive;

INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('hazard.report',           ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','department_manager','hr_manager','recruiter','employee']),
  ('hazard.manage',           ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','department_manager']),
  ('incident.read',           ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','department_manager','hr_manager','read_only']),
  ('incident.sensitive.read', ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager','hr_manager']),
  ('incident.approve',        ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager']),
  ('riddor.review',           ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager']),
  ('templates.manage',        ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;

-- ─── 2. Staff may work inside a client, one at a time ───────────────

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT organisation_id FROM public.my_active_grant()),
    (SELECT a.organisation_id FROM user_active_organisation a
       JOIN profiles p ON p.id = a.user_id AND p.role = 'tps_admin'
      WHERE a.user_id = auth.uid()),
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.set_active_organisation(p_org uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE home uuid; prev uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT company_id INTO home FROM profiles WHERE id = auth.uid();
  prev := public.my_company_id();
  IF p_org IS NULL OR p_org IS NOT DISTINCT FROM home THEN
    DELETE FROM user_active_organisation WHERE user_id = auth.uid();
  ELSE
    IF public.is_tps_staff() THEN
      IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_org AND archived_at IS NULL) THEN
        RAISE EXCEPTION 'No access to that organisation' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM user_organisation_access g
       WHERE g.user_id = auth.uid() AND g.organisation_id = p_org AND g.active_status = 'active'
         AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())) THEN
      RAISE EXCEPTION 'No access to that organisation' USING ERRCODE = '42501';
    END IF;
    INSERT INTO user_active_organisation (user_id, organisation_id, switched_at)
    VALUES (auth.uid(), p_org, now())
    ON CONFLICT (user_id) DO UPDATE SET organisation_id = EXCLUDED.organisation_id, switched_at = now();
  END IF;
  IF public.my_company_id() IS DISTINCT FROM prev THEN
    INSERT INTO audit_events (organisation_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (public.my_company_id(), auth.uid(), public.audit_actor_kind(), 'organisation.switched', 'user_active_organisation',
            auth.uid()::text, jsonb_build_object('organisation_id', prev), jsonb_build_object('organisation_id', public.my_company_id()),
            public.audit_context());
  END IF;
  RETURN public.my_company_id();
END $$;

CREATE OR REPLACE FUNCTION public.my_organisations()
RETURNS TABLE (organisation_id uuid, name text, organisation_type text, role_key text, is_home boolean, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.organisation_type, public.my_home_role_key(), true, c.id = public.my_company_id()
    FROM profiles p JOIN companies c ON c.id = p.company_id
   WHERE p.id = auth.uid()
  UNION ALL
  SELECT c.id, c.name, c.organisation_type, g.role_key, false, c.id = public.my_company_id()
    FROM user_organisation_access g JOIN companies c ON c.id = g.organisation_id
   WHERE g.user_id = auth.uid() AND g.active_status = 'active'
     AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
     AND c.archived_at IS NULL
  UNION ALL
  -- Staff: every live organisation (they have no home company).
  SELECT c.id, c.name, c.organisation_type, 'platform_super_admin', false, c.id = public.my_company_id()
    FROM companies c
   WHERE public.is_tps_staff() AND c.archived_at IS NULL
  ORDER BY 5 DESC, 2
$$;

-- ─── 3. Organisation-scoped record numbers ──────────────────────────

CREATE TABLE IF NOT EXISTS public.record_sequences (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prefix     text NOT NULL CHECK (prefix ~ '^[A-Z]{2,6}$'),
  period     integer NOT NULL DEFAULT 0,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, period)
);
ALTER TABLE public.record_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.record_sequences FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS record_sequences_staff_read ON public.record_sequences;
CREATE POLICY record_sequences_staff_read ON public.record_sequences
  FOR SELECT TO authenticated USING ((SELECT public.is_tps_staff()));

-- Yearly numbering for incidents (INC-2026-000124), running numbers for
-- everything else (RA-000012). One row lock per organisation+prefix, so
-- two simultaneous reports never share a number.
CREATE OR REPLACE FUNCTION public.next_record_number(p_company uuid, p_prefix text, p_yearly boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE yr integer := CASE WHEN p_yearly THEN extract(year FROM now())::integer ELSE 0 END; n integer;
BEGIN
  INSERT INTO record_sequences (company_id, prefix, period, last_value) VALUES (p_company, p_prefix, yr, 1)
  ON CONFLICT (company_id, prefix, period) DO UPDATE SET last_value = record_sequences.last_value + 1
  RETURNING last_value INTO n;
  RETURN p_prefix || '-' || CASE WHEN p_yearly THEN yr::text || '-' ELSE '' END || lpad(n::text, 6, '0');
END $$;
REVOKE ALL ON FUNCTION public.next_record_number(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- ─── 4. Which organisation owns an H&S entity ──────────────────────

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
    WHEN 'document'         THEN 'hs_documents'
    WHEN 'control'          THEN 'controls'
    WHEN 'training_record'  THEN 'training_records'
    WHEN 'action'           THEN 'actions'
    WHEN 'audit'            THEN 'hs_audits'
    WHEN 'site'             THEN 'hs_sites'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.hs_entity_company(p_type text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t text := public.hs_entity_table(p_type); c uuid;
BEGIN
  IF t IS NULL OR p_id IS NULL THEN RETURN NULL; END IF;
  IF to_regclass('public.' || t) IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', t) INTO c USING p_id;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.hs_entity_company(text, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 5. Typed relationships between H&S records ─────────────────────

CREATE TABLE IF NOT EXISTS public.hs_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_type   text NOT NULL,
  from_id     uuid NOT NULL,
  to_type     text NOT NULL,
  to_id       uuid NOT NULL,
  relation    text NOT NULL DEFAULT 'related' CHECK (relation ~ '^[a-z_]{2,40}$'),
  note        text CHECK (length(note) <= 500),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (public.hs_entity_table(from_type) IS NOT NULL),
  CHECK (public.hs_entity_table(to_type) IS NOT NULL),
  CHECK (NOT (from_type = to_type AND from_id = to_id)),
  UNIQUE (from_type, from_id, to_type, to_id, relation)
);
CREATE INDEX IF NOT EXISTS hs_links_from_idx ON public.hs_links (from_type, from_id);
CREATE INDEX IF NOT EXISTS hs_links_to_idx ON public.hs_links (to_type, to_id);
CREATE INDEX IF NOT EXISTS hs_links_company_idx ON public.hs_links (company_id);

CREATE OR REPLACE FUNCTION public.hs_links_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a uuid; b uuid;
BEGIN
  a := public.hs_entity_company(NEW.from_type, NEW.from_id);
  b := public.hs_entity_company(NEW.to_type, NEW.to_id);
  IF a IS NULL OR b IS NULL THEN
    RAISE EXCEPTION 'Linked record not found' USING ERRCODE = '23503';
  END IF;
  IF a <> b THEN
    RAISE EXCEPTION 'Records in different organisations cannot be linked' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := a;
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_links_check() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_links_check ON public.hs_links;
CREATE TRIGGER hs_links_check BEFORE INSERT OR UPDATE ON public.hs_links
  FOR EACH ROW EXECUTE FUNCTION public.hs_links_check();

ALTER TABLE public.hs_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hs_links_staff_all ON public.hs_links;
CREATE POLICY hs_links_staff_all ON public.hs_links FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_links_read ON public.hs_links;
CREATE POLICY hs_links_read ON public.hs_links FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.read'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage'))));
DROP POLICY IF EXISTS hs_links_write ON public.hs_links;
CREATE POLICY hs_links_write ON public.hs_links FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage'))));
DROP POLICY IF EXISTS hs_links_delete ON public.hs_links;
CREATE POLICY hs_links_delete ON public.hs_links FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND ((SELECT public.has_capability((SELECT public.my_company_id()), 'risk.create'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.investigate'))
           OR (SELECT public.has_capability((SELECT public.my_company_id()), 'hazard.manage'))));
SELECT public.apply_write_guard('public.hs_links');

-- ─── 6. Evidence: new kinds, metadata, capability-scoped access ─────

CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_entity
           WHEN 'register_item'        THEN 'register'
           WHEN 'register_completion'  THEN 'register'
           WHEN 'activity'             THEN 'register'
           WHEN 'site'                 THEN 'register'
           WHEN 'equipment_inspection' THEN 'register'
           WHEN 'document'             THEN 'documents'
           WHEN 'training'             THEN 'training'
           WHEN 'audit'                THEN 'audits'
           WHEN 'audit_response'       THEN 'audits'
           WHEN 'incident'             THEN 'incidents'
           WHEN 'investigation'        THEN 'incidents'
           WHEN 'hazard'               THEN 'register'
           WHEN 'risk_assessment'      THEN 'register'
           WHEN 'method_statement'     THEN 'register'
           WHEN 'substance'            THEN 'register'
           WHEN 'sds'                  THEN 'register'
           WHEN 'coshh_assessment'     THEN 'register'
           WHEN 'action'               THEN 'register'
           ELSE NULL
         END;
$$;

ALTER TABLE public.hs_files
  ADD COLUMN IF NOT EXISTS evidence_type text NOT NULL DEFAULT 'document',
  ADD COLUMN IF NOT EXISTS description   text CHECK (length(description) <= 1000);
DO $$ BEGIN
  ALTER TABLE public.hs_files ADD CONSTRAINT hs_files_evidence_type_check CHECK (evidence_type IN (
    'photo','document','witness_statement','medical','sketch','cctv_reference','permit','rams',
    'training_evidence','maintenance_record','equipment_evidence','sds','certificate','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.hs_files ADD CONSTRAINT hs_files_mime_allowed CHECK (mime_type IS NULL OR mime_type IN (
    'application/pdf','image/jpeg','image/png','image/webp','image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Is this evidence row readable by the caller? Legacy kinds keep their
-- old rule (any company member). Incident evidence needs incident.read,
-- and personal kinds (witness statements, medical) the sensitive
-- capability. The uploader always sees what they uploaded.
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
    WHEN p_entity_type IN ('risk_assessment','method_statement','substance','sds','coshh_assessment') THEN
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
    WHEN p_entity_type IN ('risk_assessment','method_statement','substance','sds','coshh_assessment')
                                         THEN public.has_capability(p_company, 'risk.create')
    WHEN p_entity_type = 'action'        THEN true
    ELSE false   -- the register, audits, documents: staff-delivered, as before
  END
$$;
REVOKE ALL ON FUNCTION public.hs_evidence_readable(uuid, text, text, uuid), public.hs_evidence_writable(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_evidence_readable(uuid, text, text, uuid), public.hs_evidence_writable(uuid, text) TO authenticated;

-- A file row must point at a real record of its own organisation.
CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF public.hs_entity_table(NEW.entity_type) IS NOT NULL
     AND NEW.entity_type IN ('hazard','risk_assessment','method_statement','substance','sds','coshh_assessment','incident','investigation','action') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_files_entity_check() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_files_entity_check ON public.hs_files;
CREATE TRIGGER hs_files_entity_check BEFORE INSERT ON public.hs_files
  FOR EACH ROW EXECUTE FUNCTION public.hs_files_entity_check();

DROP POLICY IF EXISTS hs_files_client_read ON public.hs_files;
CREATE POLICY hs_files_client_read ON public.hs_files FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND public.hs_evidence_readable(company_id, entity_type, evidence_type, recorded_by));
DROP POLICY IF EXISTS hs_files_client_insert ON public.hs_files;
CREATE POLICY hs_files_client_insert ON public.hs_files FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND public.hs_evidence_writable(company_id, entity_type));

-- Storage: an object in hs-evidence is readable only through a readable
-- hs_files row (that subquery runs under the caller's RLS), so a
-- guessed path in your own company's folder is no longer enough.
DROP POLICY IF EXISTS hs_evidence_client_read ON storage.objects;
CREATE POLICY hs_evidence_client_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hs-evidence'
         AND EXISTS (SELECT 1 FROM public.hs_files f WHERE f.storage_path = objects.name));
DROP POLICY IF EXISTS hs_evidence_client_insert ON storage.objects;
CREATE POLICY hs_evidence_client_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hs-evidence'
              AND (storage.foldername(name))[1] = ((SELECT public.my_company_id()))::text
              AND public.hs_evidence_writable((SELECT public.my_company_id()), (storage.foldername(name))[2]));

-- ─── 7. Templates ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('risk_assessment','method_statement','coshh_assessment','investigation')),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description      text CHECK (length(description) <= 2000),
  content          jsonb NOT NULL DEFAULT '{}'::jsonb,
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  visibility       text NOT NULL DEFAULT 'private' CHECK (visibility IN ('platform','private','portfolio')),
  active           boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((visibility = 'platform') = (owner_company_id IS NULL)),
  CHECK (octet_length(content::text) <= 200000)
);
CREATE INDEX IF NOT EXISTS hs_templates_owner_idx ON public.hs_templates (owner_company_id, kind);

-- A content change is a new template version; records made from the
-- old version are never touched — they learn "update available".
CREATE OR REPLACE FUNCTION public.hs_templates_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.created_by := COALESCE(NEW.created_by, auth.uid()); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hs_templates_version ON public.hs_templates;
CREATE TRIGGER hs_templates_version BEFORE INSERT OR UPDATE ON public.hs_templates
  FOR EACH ROW EXECUTE FUNCTION public.hs_templates_version();

CREATE OR REPLACE FUNCTION public.hs_template_visible(p_owner uuid, p_visibility text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_tps_staff()
      OR p_visibility = 'platform'
      OR p_owner = public.my_company_id()
      OR p_owner = public.my_home_company_id()
      OR (p_visibility = 'portfolio' AND EXISTS (
            SELECT 1 FROM organisation_relationships r
             WHERE r.source_organisation_id = p_owner AND r.target_organisation_id = public.my_company_id()
               AND r.relationship_type = 'consultancy_client' AND r.status = 'active'
               AND r.valid_from <= current_date AND (r.valid_until IS NULL OR r.valid_until >= current_date)))
$$;
REVOKE ALL ON FUNCTION public.hs_template_visible(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_template_visible(uuid, text) TO authenticated;

ALTER TABLE public.hs_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hs_templates_read ON public.hs_templates;
CREATE POLICY hs_templates_read ON public.hs_templates FOR SELECT TO authenticated
  USING (public.hs_template_visible(owner_company_id, visibility));
DROP POLICY IF EXISTS hs_templates_staff_all ON public.hs_templates;
CREATE POLICY hs_templates_staff_all ON public.hs_templates FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_templates_owner_write ON public.hs_templates;
CREATE POLICY hs_templates_owner_write ON public.hs_templates FOR ALL TO authenticated
  USING (owner_company_id IN ((SELECT public.my_company_id()), (SELECT public.my_home_company_id()))
         AND public.has_capability(owner_company_id, 'templates.manage'))
  WITH CHECK (visibility <> 'platform'
         AND owner_company_id IN ((SELECT public.my_company_id()), (SELECT public.my_home_company_id()))
         AND public.has_capability(owner_company_id, 'templates.manage'));
SELECT public.apply_write_guard('public.hs_templates');

-- ─── 8. Attribution ──────────────────────────────────────────────────
-- "Created by Steve Consultant (Laws Safety) on behalf of Client A":
-- the audit context records the actor's HOME organisation.

CREATE OR REPLACE FUNCTION public.audit_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'db_role',        current_user,
    'actor_home_org', public.my_home_company_id(),
    'session_id',     NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id',
    'ip',             split_part(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ',', 1),
    'user_agent',     left(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', 300)))
$$;
REVOKE ALL ON FUNCTION public.audit_context() FROM PUBLIC, anon, authenticated;

-- Names and home organisations for the people who acted on records in
-- the caller's CURRENT organisation — and nobody else.
CREATE OR REPLACE FUNCTION public.hs_actor_labels(p_users uuid[])
RETURNS TABLE (user_id uuid, full_name text, home_organisation text, is_staff boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id, COALESCE(p.full_name, p.email), CASE WHEN p.role = 'tps_admin' THEN 'Core OS 360' ELSE c.name END,
         p.role = 'tps_admin'
    FROM profiles p LEFT JOIN companies c ON c.id = p.company_id
   WHERE p.id = ANY (p_users)
     AND auth.uid() IS NOT NULL
     AND (public.is_tps_staff()
          OR p.role = 'tps_admin'
          OR p.company_id = public.my_company_id()
          OR EXISTS (SELECT 1 FROM user_organisation_access g WHERE g.user_id = p.id AND g.organisation_id = public.my_company_id()))
$$;
REVOKE ALL ON FUNCTION public.hs_actor_labels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_actor_labels(uuid[]) TO authenticated;

-- ─── 9. Notification audience: who in ORG holds CAPABILITY ─────────

CREATE OR REPLACE FUNCTION public.org_user_ids_with_capability(p_org uuid, p_cap text)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id FROM profiles p
    JOIN companies c ON c.id = p.company_id
    JOIN legacy_role_map m ON m.legacy_role = p.role::text
     AND m.org_kind = CASE WHEN c.organisation_type = 'consultancy'
                            AND EXISTS (SELECT 1 FROM legacy_role_map x WHERE x.legacy_role = p.role::text AND x.org_kind = 'consultancy')
                           THEN 'consultancy' ELSE 'any' END
    JOIN access_role_capabilities rc ON rc.role_key = m.role_key AND rc.capability_key = p_cap
   WHERE p.company_id = p_org
  UNION
  SELECT g.user_id FROM user_organisation_access g
    JOIN access_role_capabilities rc ON rc.role_key = g.role_key AND rc.capability_key = p_cap
   WHERE g.organisation_id = p_org AND g.active_status = 'active'
     AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
$$;
REVOKE ALL ON FUNCTION public.org_user_ids_with_capability(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_user_ids_with_capability(uuid, text) TO service_role;
