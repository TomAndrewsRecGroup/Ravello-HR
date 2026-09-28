-- Core-OS 360 Phase 4, Group 2: the asset register.
--
-- The Phase 4 existing-operations audit (task #20) found `hs_equipment`
-- (112) already IS the asset register — a company-scoped register row with
-- status, inspection dates and a Safety Timeline trigger — with live FK
-- dependents (`hs_equipment_inspections`, `hs_events`). Building a parallel
-- `assets` table would fork the register in two, so this migration EXTENDS
-- `hs_equipment` in place, the same call already made for H&S generally
-- (105: staff-delivered, not a second system) and for workforce (Phase 3:
-- one `people` table, not a parallel contractor-worker table).
--
-- New columns, one job each:
--   asset_ref            human number, AST-000123, minted once via
--                         next_record_number() — never guessed, never reused.
--   asset_type           what kind of thing this is (plant/machinery/
--                         vehicle/tool/lifting_equipment/fixed_installation/
--                         ppe_equipment/other) — a CHECKed vocabulary, not
--                         free text, so a filter/report can rely on it.
--   parent_asset_id      a sub-assembly's containing asset (a motor inside
--                         a machine); a self-reference with a cycle guard,
--                         same discipline `departments.parent_department_id`
--                         already has.
--   operational_area_id  → departments(id), kind='operational_area' or
--                         'department' — where the asset lives, for
--                         filtering and for LOTO/permit scoping later.
--   owner_person_id      → people(id) — who is accountable for it.
--   puwer_applicable /
--   loler_applicable      flags, not a free-text "regime" column: Groups 5
--                         and 6 branch on these, and a boolean can't be
--                         misspelled the way a text tag could.
--   safety_critical       the ONE definition of safety-critical this system
--                         will ever use for an asset (Phase 3's own rule:
--                         "one definition of safety-critical" — the workforce
--                         engine's copy is a role/rule flag; this is the
--                         asset's). Groups 4/9/10 (defects, permits,
--                         isolation) read this to decide whether a failure
--                         quarantines the asset outright.
--   archived_at           soft-retire without losing history (evidence,
--                         inspections, incidents already reference the row).
--
-- `status` gains 'quarantined' now, ahead of Group 4 (defects), because
-- rewriting a CHECK a second time to insert one value in the middle of the
-- lifecycle is exactly the kind of avoidable second pass this phase's
-- "logical groups, no errors" instruction exists to prevent.

ALTER TABLE public.hs_equipment DROP CONSTRAINT IF EXISTS hs_equipment_status_check;
ALTER TABLE public.hs_equipment ADD CONSTRAINT hs_equipment_status_check
  CHECK (status IN ('in_service', 'out_of_service', 'decommissioned', 'quarantined'));

ALTER TABLE public.hs_equipment
  ADD COLUMN IF NOT EXISTS asset_ref           text,
  ADD COLUMN IF NOT EXISTS asset_type          text
    CHECK (asset_type IS NULL OR asset_type IN
      ('plant', 'machinery', 'vehicle', 'tool', 'lifting_equipment', 'fixed_installation', 'ppe_equipment', 'other')),
  ADD COLUMN IF NOT EXISTS manufacturer        text CHECK (length(manufacturer) <= 200),
  ADD COLUMN IF NOT EXISTS model               text CHECK (length(model) <= 200),
  ADD COLUMN IF NOT EXISTS parent_asset_id     uuid REFERENCES public.hs_equipment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operational_area_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_person_id     uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS puwer_applicable    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loler_applicable    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_critical     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at         timestamptz,
  ADD COLUMN IF NOT EXISTS created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.hs_equipment ADD CONSTRAINT hs_equipment_no_self_parent
    CHECK (parent_asset_id IS DISTINCT FROM id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS hs_equipment_asset_ref_idx
  ON public.hs_equipment (company_id, asset_ref) WHERE asset_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS hs_equipment_parent_idx ON public.hs_equipment (parent_asset_id) WHERE parent_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hs_equipment_area_idx ON public.hs_equipment (operational_area_id) WHERE operational_area_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hs_equipment_status_idx ON public.hs_equipment (company_id, status);

-- ─── Same-organisation + no-cycle guard ─────────────────────────────
--
-- Reuses 118's assert_same_org() for the three FK-shaped checks (parent
-- asset, operational area, owner) — the same helper every other Phase
-- 1-3 same-org guard already calls, never a bespoke re-implementation.
-- The cycle walk is bounded (COUNT check) rather than a recursive CTE,
-- because a hierarchy of plant sub-assemblies is never deep and a
-- runaway recursive query is a worse failure mode than an early exit.

CREATE OR REPLACE FUNCTION public.hs_equipment_same_org_and_no_cycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cur uuid;
  depth integer := 0;
  area_site uuid;
  asset_site uuid;
BEGIN
  PERFORM public.assert_same_org(NEW.company_id, 'hs_equipment', NEW.parent_asset_id);
  PERFORM public.assert_same_org(NEW.company_id, 'departments', NEW.operational_area_id);
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.owner_person_id);

  IF NEW.operational_area_id IS NOT NULL AND NEW.site_id IS NOT NULL THEN
    SELECT site_id INTO area_site FROM public.departments WHERE id = NEW.operational_area_id;
    IF area_site IS NOT NULL AND area_site IS DISTINCT FROM NEW.site_id THEN
      RAISE EXCEPTION 'Operational area belongs to a different site' USING ERRCODE = '23514';
    END IF;
  END IF;
  asset_site := NEW.site_id;

  IF NEW.parent_asset_id IS NOT NULL THEN
    cur := NEW.parent_asset_id;
    WHILE cur IS NOT NULL AND depth < 50 LOOP
      IF cur = NEW.id THEN
        RAISE EXCEPTION 'An asset cannot be its own ancestor' USING ERRCODE = '23514';
      END IF;
      SELECT parent_asset_id INTO cur FROM public.hs_equipment WHERE id = cur;
      depth := depth + 1;
    END LOOP;
    IF depth >= 50 THEN
      RAISE EXCEPTION 'Asset hierarchy is too deep or cyclic' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_equipment_same_org_and_no_cycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_equipment_org_cycle_guard ON public.hs_equipment;
CREATE TRIGGER hs_equipment_org_cycle_guard BEFORE INSERT OR UPDATE ON public.hs_equipment
  FOR EACH ROW EXECUTE FUNCTION public.hs_equipment_same_org_and_no_cycle();

-- ─── Asset reference numbering ──────────────────────────────────────
--
-- Minted once, on first insert, via the same next_record_number()
-- sequence every other numbered record in this system uses (permits will
-- use it again in Group 9). Never re-minted on update — an asset's number
-- is its identity, not a display field.

CREATE OR REPLACE FUNCTION public.hs_equipment_assign_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.asset_ref IS NULL THEN
    NEW.asset_ref := public.next_record_number(NEW.company_id, 'AST', false);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_equipment_assign_ref() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_equipment_assign_ref_trg ON public.hs_equipment;
CREATE TRIGGER hs_equipment_assign_ref_trg BEFORE INSERT ON public.hs_equipment
  FOR EACH ROW EXECUTE FUNCTION public.hs_equipment_assign_ref();

-- ─── Evidence: assets get their own hs_files scope ──────────────────
--
-- hs_scope_for_entity()/hs_entity_table() never mapped 'equipment' despite
-- hs_equipment already existing (the audit's own finding) — asset
-- documents (manuals, certificates, photos) had nowhere sanctioned to
-- live. Both latest-definition functions are re-created here (124's
-- versions), adding 'equipment' only; every other branch is copied
-- unchanged so this migration is provably additive, not a rewrite.

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

CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_entity
    WHEN 'register_item'          THEN 'register'
    WHEN 'register_completion'    THEN 'register'
    WHEN 'activity'                THEN 'register'
    WHEN 'site'                    THEN 'register'
    WHEN 'equipment'               THEN 'register'
    WHEN 'equipment_inspection'    THEN 'register'
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

-- hs_evidence_readable/writable (124's latest) gain the 'equipment'
-- branch, gated on the new asset.* capabilities seeded below. Every
-- other branch is 124's unchanged body.

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
    WHEN p_entity_type IN ('equipment', 'equipment_inspection') THEN
      public.has_capability(p_company, 'asset.read')
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
    WHEN p_entity_type IN ('equipment', 'equipment_inspection') THEN public.has_capability(p_company, 'asset.manage')
    ELSE false
  END
$$;

-- hs_files_entity_check() (124's latest) gains 'equipment' to the
-- same-org-owner list so an asset photo cannot be filed against another
-- company's asset row.

CREATE OR REPLACE FUNCTION public.hs_files_entity_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner uuid;
BEGIN
  IF NEW.entity_type IN ('hazard', 'risk_assessment', 'method_statement', 'method_statement_step', 'substance', 'sds',
                         'coshh_assessment', 'incident', 'investigation', 'action', 'equipment') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ─── Capabilities ────────────────────────────────────────────────────
--
-- Seeded the same 3-column shape 117 established (key, description,
-- sensitive), and the role grant follows 122's own VALUES/unnest shape —
-- both mirrored in capabilities.ts in THIS migration's PR, not a
-- follow-up (tenancySql.test.ts's regex-driven parity check reads both
-- shapes and fails otherwise). The role lists are copied verbatim from
-- 'risk.read'/'risk.create' in 117 so an asset register is usable by the
-- same people who can already work with risk assessments, immediately,
-- rather than invisible until a manual grant.

INSERT INTO public.access_capabilities (key, description, sensitive) VALUES
  ('asset.read',   'See the asset register', false),
  ('asset.manage', 'Add, edit and retire assets', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('asset.read',   ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager','department_manager','read_only']),
  ('asset.manage', ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','site_manager'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;

-- ─── Audit trail ─────────────────────────────────────────────────────
--
-- Column whitelist mirrors the CLAUDE.md rule: identifying/classifying
-- fields only, never notes (free text) or the storage_path evidence
-- carries elsewhere.

DROP TRIGGER IF EXISTS hs_equipment_audit ON public.hs_equipment;
CREATE TRIGGER hs_equipment_audit AFTER INSERT OR UPDATE OR DELETE ON public.hs_equipment
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('asset', 'company_id', 'name', 'asset_type', 'status',
    'asset_ref', 'parent_asset_id', 'operational_area_id', 'owner_person_id', 'puwer_applicable', 'loler_applicable',
    'safety_critical', 'site_id', 'archived_at');

-- ─── Optional read view, mirroring the organisations/sites pattern ──

CREATE OR REPLACE VIEW public.assets WITH (security_invoker = true) AS
  SELECT * FROM public.hs_equipment;

COMMENT ON VIEW public.assets IS
  'Read alias for hs_equipment — the asset register (Phase 4, migration 144). hs_equipment is still the table; FKs point at it.';
