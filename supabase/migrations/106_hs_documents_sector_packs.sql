-- ═══════════════════════════════════════════════════════════════════
-- 106: H&S document library + sector packs (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 2 of the Health & Safety roadmap (see CLAUDE.md). Two things,
-- both built on the staff-delivered model 105 left behind — no provider
-- layer, no hs_can_access/hs_can_write, staff full access + client
-- read-only, the same shape as hs_sites and the register.
--
--   * DOCUMENT LIBRARY: hs_documents is METADATA (title, category,
--     version, review due date) for a client's H&S paperwork (policies,
--     RAMS, COSHH data sheets, fire risk assessments...). The actual
--     file is stored the same way every other piece of H&S evidence
--     is — via hs_files in the hs-evidence bucket, entity_type
--     'document' (already a valid hs_scope_for_entity() key and already
--     labelled in HS_ENTITY_LABELS — this table is the metadata that
--     entity_type was always waiting for). A new version is a NEW row
--     (status 'active'), with the old row flipped to 'superseded': the
--     register's "a correction is a new row" discipline, so a
--     write-only edit can never silently replace what a previous
--     version said.
--   * SECTOR PACKS: hs_sector_packs + hs_sector_pack_items are seeded
--     REFERENCE DATA — typical register items for a sector (Office,
--     Construction, Manufacturing & Warehousing, Care & Health,
--     Hospitality & Food). "Apply pack" (a staff action, not a trigger)
--     bulk-inserts compliance_items rows for a company, skipping any
--     category+title already on that company's register so re-applying
--     a pack is idempotent by hand, the same discipline the referral
--     pipeline's unique constraint gives it automatically.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── document library metadata ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id        uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  category       text NOT NULL CHECK (category IN (
                    'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
                    'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
                    'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other'
                  )),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description    text CHECK (length(description) <= 2000),
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  review_due_at  date,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  supersedes_id  uuid REFERENCES public.hs_documents(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_documents_company_idx ON public.hs_documents (company_id, status);
CREATE INDEX IF NOT EXISTS hs_documents_review_idx  ON public.hs_documents (review_due_at) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.hs_document_stamp()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hs_documents_stamp ON public.hs_documents;
CREATE TRIGGER hs_documents_stamp
  BEFORE INSERT OR UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.hs_document_stamp();
REVOKE ALL ON FUNCTION public.hs_document_stamp() FROM PUBLIC, anon, authenticated;

-- Safety Timeline entry on add/replace, mirroring hs_files_hs_event.
CREATE OR REPLACE FUNCTION public.hs_document_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_added',
      'Document added: ' || NEW.title || ' (v' || NEW.version || ')');
  ELSIF NEW.status = 'superseded' AND OLD.status = 'active' THEN
    PERFORM public.hs_log(NEW.company_id, 'document', NEW.id, 'document_superseded',
      'Document superseded: ' || NEW.title);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS hs_documents_hs_event ON public.hs_documents;
CREATE TRIGGER hs_documents_hs_event
  AFTER INSERT OR UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.hs_document_event();
REVOKE ALL ON FUNCTION public.hs_document_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_documents_platform_event ON public.hs_documents;
CREATE TRIGGER hs_documents_platform_event AFTER INSERT OR UPDATE ON public.hs_documents
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('category', 'title', 'version', 'review_due_at', 'status');

REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_documents FROM PUBLIC, anon, authenticated;
GRANT UPDATE (title, description, category, site_id, review_due_at, status) ON public.hs_documents TO authenticated;

ALTER TABLE public.hs_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hs_documents_staff_all   ON public.hs_documents;
DROP POLICY IF EXISTS hs_documents_client_read ON public.hs_documents;
CREATE POLICY hs_documents_staff_all ON public.hs_documents FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY hs_documents_client_read ON public.hs_documents FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- ── sector packs: seeded reference data, staff-managed ───────────────

CREATE TABLE IF NOT EXISTS public.hs_sector_packs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector      text NOT NULL UNIQUE CHECK (length(btrim(sector)) BETWEEN 1 AND 100),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  description text CHECK (length(description) <= 1000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hs_sector_pack_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id           uuid NOT NULL REFERENCES public.hs_sector_packs(id) ON DELETE CASCADE,
  category          text NOT NULL CHECK (category IN (
                      'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
                      'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
                      'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other'
                    )),
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description       text CHECK (length(description) <= 2000),
  recurrence_every  integer CHECK (recurrence_every IS NULL OR recurrence_every BETWEEN 1 AND 120),
  recurrence_unit   text CHECK (recurrence_unit IS NULL OR recurrence_unit IN ('day', 'week', 'month', 'year')),
  legal_basis       text CHECK (length(legal_basis) <= 200),
  sort_order        integer NOT NULL DEFAULT 0,
  CONSTRAINT hs_sector_pack_items_recurrence_pair CHECK ((recurrence_every IS NULL) = (recurrence_unit IS NULL))
);
CREATE INDEX IF NOT EXISTS hs_sector_pack_items_pack_idx ON public.hs_sector_pack_items (pack_id, sort_order);

ALTER TABLE public.hs_sector_packs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_sector_pack_items ENABLE ROW LEVEL SECURITY;

-- Reference data for staff to browse and apply; not client-visible —
-- a pack is a drafting aid, not a commitment until its items land on
-- the client's own register (which the client-read policy above and
-- the register's own policies already cover).
DROP POLICY IF EXISTS hs_sector_packs_staff_all ON public.hs_sector_packs;
CREATE POLICY hs_sector_packs_staff_all ON public.hs_sector_packs FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_sector_pack_items_staff_all ON public.hs_sector_pack_items;
CREATE POLICY hs_sector_pack_items_staff_all ON public.hs_sector_pack_items FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- ── seed: five starter sector packs ──────────────────────────────────

INSERT INTO public.hs_sector_packs (sector, name, description) VALUES
  ('office',       'Office',                      'A typical office or professional-services workplace: no manufacturing, no public-facing premises risk beyond fire and DSE.'),
  ('construction',  'Construction & Trades',       'Site-based construction, M&E or trades work: CDM, lifting, work equipment and asbestos all apply.'),
  ('manufacturing', 'Manufacturing & Warehousing', 'Production floors and warehousing: work equipment, COSHH, manual handling and noise are the recurring themes.'),
  ('care',          'Care & Health',               'Care homes and health settings: infection control, moving and handling of people, and health surveillance.'),
  ('hospitality',   'Hospitality & Food',          'Kitchens, food service and hospitality venues: fire, gas, food-adjacent COSHH and first aid.')
ON CONFLICT (sector) DO NOTHING;

-- Office
INSERT INTO public.hs_sector_pack_items (pack_id, category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
SELECT p.id, v.category, v.title, v.description, v.recurrence_every, v.recurrence_unit, v.legal_basis, v.sort_order
FROM public.hs_sector_packs p, (VALUES
  ('hs_policy_governance', 'Health & safety policy review',          'Annual review of the written H&S policy statement.', 12, 'month', 'Health and Safety at Work etc. Act 1974', 1),
  ('hs_risk_assessment',   'General workplace risk assessment',      'Office-wide risk assessment covering common office hazards.', 12, 'month', 'Management of Health and Safety at Work Regulations 1999', 2),
  ('hs_fire',              'Fire risk assessment',                   'Fire risk assessment for the premises.', 12, 'month', 'Regulatory Reform (Fire Safety) Order 2005', 3),
  ('hs_fire',              'Fire alarm test',                        'Weekly fire alarm test.', 1, 'week', 'Regulatory Reform (Fire Safety) Order 2005', 4),
  ('hs_fire',              'Fire drill',                             'Evacuation drill.', 6, 'month', 'Regulatory Reform (Fire Safety) Order 2005', 5),
  ('hs_electrical',        'Portable appliance testing (PAT)',       'PAT testing of portable electrical equipment.', 12, 'month', 'Electricity at Work Regulations 1989', 6),
  ('hs_electrical',        'Fixed wiring inspection (EICR)',         'Periodic inspection and test of fixed electrical installation.', 5, 'year', 'Electricity at Work Regulations 1989', 7),
  ('hs_first_aid',         'First aid needs assessment',             'Assessment of first-aid provision.', 12, 'month', 'Health and Safety (First-Aid) Regulations 1981', 8),
  ('hs_other',             'Display screen equipment (DSE) assessments', 'DSE self-assessments for habitual screen users.', 12, 'month', 'Health and Safety (Display Screen Equipment) Regulations 1992', 9)
) AS v(category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
WHERE p.sector = 'office'
  AND NOT EXISTS (SELECT 1 FROM public.hs_sector_pack_items i WHERE i.pack_id = p.id AND i.title = v.title);

-- Construction & Trades
INSERT INTO public.hs_sector_pack_items (pack_id, category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
SELECT p.id, v.category, v.title, v.description, v.recurrence_every, v.recurrence_unit, v.legal_basis, v.sort_order
FROM public.hs_sector_packs p, (VALUES
  ('hs_policy_governance',    'Health & safety policy review',       'Annual review of the written H&S policy statement.', 12, 'month', 'Health and Safety at Work etc. Act 1974', 1),
  ('hs_risk_assessment',      'Site risk assessment',                'Risk assessment for site-based work.', 12, 'month', 'Management of Health and Safety at Work Regulations 1999', 2),
  ('hs_construction',         'Construction phase plan',             'Construction phase health and safety plan for notifiable projects.', 12, 'month', 'Construction (Design and Management) Regulations 2015', 3),
  ('hs_work_equipment',       'Work equipment inspection',           'Inspection of powered and hand tools.', 6, 'month', 'Provision and Use of Work Equipment Regulations 1998', 4),
  ('hs_lifting',              'Lifting equipment thorough examination', 'Thorough examination of lifting equipment and accessories.', 6, 'month', 'Lifting Operations and Lifting Equipment Regulations 1998', 5),
  ('hs_asbestos',             'Asbestos survey / management plan',   'Asbestos management survey for premises built before 2000.', 12, 'month', 'Control of Asbestos Regulations 2012', 6),
  ('hs_electrical',           'Portable appliance testing (PAT)',    'PAT testing of site electrical equipment (110V tools included).', 12, 'month', 'Electricity at Work Regulations 1989', 7),
  ('hs_first_aid',            'First aid needs assessment',          'Assessment of first-aid provision for site work.', 12, 'month', 'Health and Safety (First-Aid) Regulations 1981', 8),
  ('hs_other',                'Manual handling risk assessment',     'Assessment of manual handling tasks on site.', 12, 'month', 'Manual Handling Operations Regulations 1992', 9)
) AS v(category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
WHERE p.sector = 'construction'
  AND NOT EXISTS (SELECT 1 FROM public.hs_sector_pack_items i WHERE i.pack_id = p.id AND i.title = v.title);

-- Manufacturing & Warehousing
INSERT INTO public.hs_sector_pack_items (pack_id, category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
SELECT p.id, v.category, v.title, v.description, v.recurrence_every, v.recurrence_unit, v.legal_basis, v.sort_order
FROM public.hs_sector_packs p, (VALUES
  ('hs_policy_governance',    'Health & safety policy review',       'Annual review of the written H&S policy statement.', 12, 'month', 'Health and Safety at Work etc. Act 1974', 1),
  ('hs_risk_assessment',      'General workplace risk assessment',   'Risk assessment for the production floor and warehouse.', 12, 'month', 'Management of Health and Safety at Work Regulations 1999', 2),
  ('hs_work_equipment',       'Work equipment inspection',           'Inspection of machinery and powered work equipment.', 6, 'month', 'Provision and Use of Work Equipment Regulations 1998', 3),
  ('hs_lifting',              'Lifting equipment thorough examination', 'Thorough examination of forklifts, hoists and lifting accessories.', 6, 'month', 'Lifting Operations and Lifting Equipment Regulations 1998', 4),
  ('hs_hazardous_substances', 'COSHH assessment',                    'Assessment of substances hazardous to health used on site.', 12, 'month', 'Control of Substances Hazardous to Health Regulations 2002', 5),
  ('hs_electrical',           'Fixed wiring inspection (EICR)',      'Periodic inspection and test of fixed electrical installation.', 5, 'year', 'Electricity at Work Regulations 1989', 6),
  ('hs_fire',                 'Fire risk assessment',                'Fire risk assessment for the premises.', 12, 'month', 'Regulatory Reform (Fire Safety) Order 2005', 7),
  ('hs_first_aid',            'First aid needs assessment',          'Assessment of first-aid provision.', 12, 'month', 'Health and Safety (First-Aid) Regulations 1981', 8),
  ('hs_other',                'Manual handling risk assessment',     'Assessment of manual handling tasks in production and warehousing.', 12, 'month', 'Manual Handling Operations Regulations 1992', 9),
  ('hs_other',                'Noise assessment',                    'Assessment of noise exposure on the production floor.', 12, 'month', 'No specific instrument, or unsure', 10)
) AS v(category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
WHERE p.sector = 'manufacturing'
  AND NOT EXISTS (SELECT 1 FROM public.hs_sector_pack_items i WHERE i.pack_id = p.id AND i.title = v.title);

-- Care & Health
INSERT INTO public.hs_sector_pack_items (pack_id, category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
SELECT p.id, v.category, v.title, v.description, v.recurrence_every, v.recurrence_unit, v.legal_basis, v.sort_order
FROM public.hs_sector_packs p, (VALUES
  ('hs_policy_governance',   'Health & safety policy review',       'Annual review of the written H&S policy statement.', 12, 'month', 'Health and Safety at Work etc. Act 1974', 1),
  ('hs_risk_assessment',     'General workplace risk assessment',   'Risk assessment for the care setting.', 12, 'month', 'Management of Health and Safety at Work Regulations 1999', 2),
  ('hs_care',                'Moving and handling of people',       'Assessment of moving and handling tasks involving service users.', 12, 'month', 'Manual Handling Operations Regulations 1992', 3),
  ('hs_care',                'Infection control audit',             'Infection prevention and control self-audit.', 6, 'month', 'No specific instrument, or unsure', 4),
  ('hs_health_surveillance', 'Health surveillance programme',       'Health surveillance for staff exposed to relevant hazards.', 12, 'month', 'No specific instrument, or unsure', 5),
  ('hs_water',               'Legionella risk assessment',          'Water hygiene / Legionella risk assessment.', 24, 'month', 'ACOP L8 / HSG274 (Legionella control)', 6),
  ('hs_fire',                'Fire risk assessment',                'Fire risk assessment, including evacuation of residents/service users.', 12, 'month', 'Regulatory Reform (Fire Safety) Order 2005', 7),
  ('hs_first_aid',           'First aid needs assessment',          'Assessment of first-aid provision.', 12, 'month', 'Health and Safety (First-Aid) Regulations 1981', 8),
  ('hs_hazardous_substances','COSHH assessment',                    'Assessment of cleaning and clinical substances.', 12, 'month', 'Control of Substances Hazardous to Health Regulations 2002', 9)
) AS v(category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
WHERE p.sector = 'care'
  AND NOT EXISTS (SELECT 1 FROM public.hs_sector_pack_items i WHERE i.pack_id = p.id AND i.title = v.title);

-- Hospitality & Food
INSERT INTO public.hs_sector_pack_items (pack_id, category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
SELECT p.id, v.category, v.title, v.description, v.recurrence_every, v.recurrence_unit, v.legal_basis, v.sort_order
FROM public.hs_sector_packs p, (VALUES
  ('hs_policy_governance',    'Health & safety policy review',      'Annual review of the written H&S policy statement.', 12, 'month', 'Health and Safety at Work etc. Act 1974', 1),
  ('hs_risk_assessment',      'General workplace risk assessment',  'Risk assessment for kitchen and front-of-house areas.', 12, 'month', 'Management of Health and Safety at Work Regulations 1999', 2),
  ('hs_fire',                 'Fire risk assessment',                'Fire risk assessment for the premises.', 12, 'month', 'Regulatory Reform (Fire Safety) Order 2005', 3),
  ('hs_gas',                  'Gas safety check',                   'Annual gas safety check of catering appliances.', 12, 'month', 'Gas Safety (Installation and Use) Regulations 1998', 4),
  ('hs_electrical',           'Portable appliance testing (PAT)',   'PAT testing of kitchen and front-of-house equipment.', 12, 'month', 'Electricity at Work Regulations 1989', 5),
  ('hs_hazardous_substances', 'COSHH assessment',                   'Assessment of cleaning chemicals and catering substances.', 12, 'month', 'Control of Substances Hazardous to Health Regulations 2002', 6),
  ('hs_first_aid',            'First aid needs assessment',         'Assessment of first-aid provision.', 12, 'month', 'Health and Safety (First-Aid) Regulations 1981', 7),
  ('hs_other',                'Manual handling risk assessment',    'Assessment of manual handling tasks (deliveries, stock).', 12, 'month', 'Manual Handling Operations Regulations 1992', 8)
) AS v(category, title, description, recurrence_every, recurrence_unit, legal_basis, sort_order)
WHERE p.sector = 'hospitality'
  AND NOT EXISTS (SELECT 1 FROM public.hs_sector_pack_items i WHERE i.pack_id = p.id AND i.title = v.title);
