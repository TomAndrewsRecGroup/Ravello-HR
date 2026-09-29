-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 2: Environmental Incidents, Spills, Waste,
-- Monitoring, Permits & Conditions (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on Group 1 (migration 156, environmental_aspects). Read
-- docs/CORE_OS_360_PHASE5_GOVERNANCE_MAP.md and this file's own header
-- comments before touching anything here.
--
-- Hard rules this migration is built to:
--   1. Environmental incidents EXTEND hs_incidents (125+), never a
--      parallel incident table. Checked live before writing a line of
--      SQL: hs_incidents.incident_type already includes 'environmental'
--      (migration 125's own CHECK) — so no ADD COLUMN/enum change was
--      needed at all to TAG an incident as environmental. What was
--      missing was environmental-specific DETAIL (substance, volume,
--      receiving environment), which is a new table keyed to
--      hs_incidents.id, exactly as instructed.
--   2. Never a second action table. Corrective actions from a spill, a
--      waste non-conformance, a monitoring exceedance or a permit
--      condition breach are all `actions` rows. New source_type values:
--      'environmental_spill', 'waste_movement', 'environmental_monitoring',
--      'environmental_permit_condition'.
--   3. Waste carriers/disposal sites are `contractors` rows (150) —
--      never a parallel supplier table. A new contractor_insurances
--      .insurance_type value, 'waste_carrier_licence', lets
--      contractor_is_current() (already generic over "any on-file
--      policy past its expiry fails") surface an expired waste-carrier
--      licence with no change to that function at all.
--   4. environmental_monitoring compares a recorded VALUE against a
--      recorded LIMIT a human entered. within_limit is NULL until a
--      limit is on file — never defaulted true or false. The comparison
--      direction (value <= limit = "within") assumes an UPPER-bound
--      limit, the common case (max noise dB, max effluent load); a
--      lower-bound limit (e.g. minimum flow rate) is a known,
--      documented simplification for a later group, not silently
--      guessed at.
--   5. permit_conditions.status is a FACTUAL vocabulary — current /
--      evidence_due / overdue / breach_recorded / review_required —
--      never "compliant"/"non_compliant"/"legal". Same discipline
--      PUWER_ASSESSMENT_OUTCOME_LABELS already applies (148): say what
--      was recorded, never assert a legal conclusion.
--   6. RLS on every new table, capability-gated on the SAME
--      environmental.read/environmental.manage capabilities Group 1
--      already seeded (156) — no new capability invented for this
--      group, per the task brief.
--   7. apply_write_guard() on every new client-writable table.
--   8. Outbox + audit trail on every new table that needs a
--      consequence; column whitelists are identifying/classifying
--      fields only, never free-text notes/description.
--   9. Evidence rides the existing hs_files/hs-evidence infrastructure:
--      new 'environmental_spill' / 'waste_movement' /
--      'environmental_monitoring' / 'environmental_permit' branches on
--      the four evidence functions, scope 'register', gated the same
--      way as 'environmental_aspect' (156).
--  10. No legal-compliance or certification language anywhere in this
--      file's copy, notifications or Timeline entries.
--
-- Idempotent. Safe to re-run.

-- ── environmental_incident_details: extends hs_incidents, one row ────

CREATE TABLE IF NOT EXISTS public.environmental_incident_details (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hs_incident_id              uuid NOT NULL UNIQUE REFERENCES public.hs_incidents(id) ON DELETE CASCADE,
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  substance                   text CHECK (length(substance) <= 200),
  estimated_volume            numeric CHECK (estimated_volume IS NULL OR estimated_volume >= 0),
  volume_unit                 text CHECK (length(volume_unit) <= 20),
  receiving_environment       text CHECK (receiving_environment IS NULL OR receiving_environment IN ('land', 'water', 'drain', 'air', 'other')),
  environmental_agency_notified boolean NOT NULL DEFAULT false,
  notified_at                 timestamptz,
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- company_id is filled from the parent incident, never trusted from
-- the caller — the same discipline every "detail" row keyed to a
-- parent record already uses (contractor_insurances_fill(),
-- environmental_aspect_assessments_fill()).
CREATE OR REPLACE FUNCTION public.environmental_incident_details_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inc record;
BEGIN
  SELECT company_id INTO inc FROM public.hs_incidents WHERE id = NEW.hs_incident_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := inc.company_id;
  NEW.created_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_incident_details_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_incident_details_fill ON public.environmental_incident_details;
CREATE TRIGGER environmental_incident_details_fill
  BEFORE INSERT ON public.environmental_incident_details
  FOR EACH ROW EXECUTE FUNCTION public.environmental_incident_details_fill();

ALTER TABLE public.environmental_incident_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS environmental_incident_details_staff_all ON public.environmental_incident_details;
CREATE POLICY environmental_incident_details_staff_all ON public.environmental_incident_details FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS environmental_incident_details_read ON public.environmental_incident_details;
CREATE POLICY environmental_incident_details_read ON public.environmental_incident_details FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'incident.read')));

DROP POLICY IF EXISTS environmental_incident_details_insert ON public.environmental_incident_details;
CREATE POLICY environmental_incident_details_insert ON public.environmental_incident_details FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_capability((SELECT public.my_company_id()), 'incident.create')));

SELECT public.apply_write_guard('public.environmental_incident_details');

DROP TRIGGER IF EXISTS environmental_incident_details_audit ON public.environmental_incident_details;
CREATE TRIGGER environmental_incident_details_audit AFTER INSERT ON public.environmental_incident_details
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_incident_detail', 'company_id', 'hs_incident_id', 'receiving_environment');

-- ── environmental_spills ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.environmental_spills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id             uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  occurred_at         timestamptz NOT NULL,
  substance           text NOT NULL CHECK (length(btrim(substance)) BETWEEN 1 AND 200),
  estimated_volume    numeric CHECK (estimated_volume IS NULL OR estimated_volume >= 0),
  volume_unit         text CHECK (length(volume_unit) <= 20),
  receiving_environment text NOT NULL CHECK (receiving_environment IN ('land', 'water', 'drain', 'air', 'other')),
  contained           boolean NOT NULL DEFAULT false,
  notified_authority  boolean NOT NULL DEFAULT false,
  notified_at         timestamptz,
  hs_incident_id      uuid REFERENCES public.hs_incidents(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'contained', 'closed')),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS environmental_spills_company_idx ON public.environmental_spills (company_id, status);

CREATE OR REPLACE FUNCTION public.environmental_spills_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'hs_incidents', NEW.hs_incident_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_spills_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_spills_stamp ON public.environmental_spills;
CREATE TRIGGER environmental_spills_stamp BEFORE INSERT OR UPDATE ON public.environmental_spills
  FOR EACH ROW EXECUTE FUNCTION public.environmental_spills_stamp();

ALTER TABLE public.environmental_spills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS environmental_spills_staff_all ON public.environmental_spills;
CREATE POLICY environmental_spills_staff_all ON public.environmental_spills FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS environmental_spills_read ON public.environmental_spills;
CREATE POLICY environmental_spills_read ON public.environmental_spills FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS environmental_spills_insert ON public.environmental_spills;
CREATE POLICY environmental_spills_insert ON public.environmental_spills FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

DROP POLICY IF EXISTS environmental_spills_update ON public.environmental_spills;
CREATE POLICY environmental_spills_update ON public.environmental_spills FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

SELECT public.apply_write_guard('public.environmental_spills');

DROP TRIGGER IF EXISTS environmental_spills_audit ON public.environmental_spills;
CREATE TRIGGER environmental_spills_audit AFTER INSERT OR UPDATE OR DELETE ON public.environmental_spills
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_spill', 'company_id', 'receiving_environment', 'status', 'contained');

DROP TRIGGER IF EXISTS environmental_spills_platform_event ON public.environmental_spills;
CREATE TRIGGER environmental_spills_platform_event AFTER INSERT OR UPDATE ON public.environmental_spills
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('site_id', 'receiving_environment', 'contained', 'notified_authority', 'status', 'hs_incident_id');

-- ── waste_streams (reference data per client) ─────────────────────

CREATE TABLE IF NOT EXISTS public.waste_streams (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  waste_code            text CHECK (length(waste_code) <= 20),
  hazardous             boolean NOT NULL DEFAULT false,
  typical_disposal_route text CHECK (length(typical_disposal_route) <= 200),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waste_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waste_streams_staff_all ON public.waste_streams;
CREATE POLICY waste_streams_staff_all ON public.waste_streams FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS waste_streams_read ON public.waste_streams;
CREATE POLICY waste_streams_read ON public.waste_streams FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS waste_streams_manage ON public.waste_streams;
CREATE POLICY waste_streams_manage ON public.waste_streams FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

DROP POLICY IF EXISTS waste_streams_manage_update ON public.waste_streams;
CREATE POLICY waste_streams_manage_update ON public.waste_streams FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

SELECT public.apply_write_guard('public.waste_streams');

DROP TRIGGER IF EXISTS waste_streams_audit ON public.waste_streams;
CREATE TRIGGER waste_streams_audit AFTER INSERT OR UPDATE OR DELETE ON public.waste_streams
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('waste_stream', 'company_id', 'name', 'waste_code', 'hazardous');

-- ── waste_movements: carrier/disposal-site are contractors rows ──────

CREATE TABLE IF NOT EXISTS public.waste_movements (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  waste_stream_id             uuid NOT NULL REFERENCES public.waste_streams(id) ON DELETE RESTRICT,
  site_id                     uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  moved_at                    date NOT NULL,
  quantity                    numeric NOT NULL CHECK (quantity >= 0),
  unit                        text NOT NULL CHECK (length(unit) <= 20),
  carrier_contractor_id       uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  disposal_site_contractor_id uuid REFERENCES public.contractors(id) ON DELETE RESTRICT,
  consignment_note_reference  text CHECK (length(consignment_note_reference) <= 100),
  non_conformance             boolean NOT NULL DEFAULT false,
  notes                       text CHECK (length(notes) <= 2000),
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waste_movements_company_idx ON public.waste_movements (company_id, moved_at DESC);

CREATE OR REPLACE FUNCTION public.waste_movements_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ws record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  SELECT company_id INTO ws FROM public.waste_streams WHERE id = NEW.waste_stream_id;
  IF NOT FOUND OR ws.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Waste stream must belong to the same organisation' USING ERRCODE = '23514';
  END IF;
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  PERFORM public.assert_same_org(NEW.company_id, 'contractors', NEW.carrier_contractor_id);
  PERFORM public.assert_same_org(NEW.company_id, 'contractors', NEW.disposal_site_contractor_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.waste_movements_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS waste_movements_stamp ON public.waste_movements;
CREATE TRIGGER waste_movements_stamp BEFORE INSERT OR UPDATE ON public.waste_movements
  FOR EACH ROW EXECUTE FUNCTION public.waste_movements_stamp();

ALTER TABLE public.waste_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waste_movements_staff_all ON public.waste_movements;
CREATE POLICY waste_movements_staff_all ON public.waste_movements FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS waste_movements_read ON public.waste_movements;
CREATE POLICY waste_movements_read ON public.waste_movements FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS waste_movements_insert ON public.waste_movements;
CREATE POLICY waste_movements_insert ON public.waste_movements FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

DROP POLICY IF EXISTS waste_movements_update ON public.waste_movements;
CREATE POLICY waste_movements_update ON public.waste_movements FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

SELECT public.apply_write_guard('public.waste_movements');

DROP TRIGGER IF EXISTS waste_movements_audit ON public.waste_movements;
CREATE TRIGGER waste_movements_audit AFTER INSERT OR UPDATE OR DELETE ON public.waste_movements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('waste_movement', 'company_id', 'waste_stream_id', 'quantity', 'unit', 'non_conformance');

-- Outbox fires on every movement, but the consequence rule only ever
-- acts when non_conformance is true (routine movements notify nobody)
-- — rule 8's "on exceedance/incident only, not routine".
DROP TRIGGER IF EXISTS waste_movements_platform_event ON public.waste_movements;
CREATE TRIGGER waste_movements_platform_event AFTER INSERT OR UPDATE ON public.waste_movements
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('waste_stream_id', 'site_id', 'quantity', 'unit', 'non_conformance');

-- ── environmental_monitoring: value vs a HUMAN-entered limit only ────

CREATE TABLE IF NOT EXISTS public.environmental_monitoring (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id         uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  category        text NOT NULL DEFAULT 'other' CHECK (category IN ('water', 'air', 'noise', 'energy', 'emissions', 'other')),
  parameter       text NOT NULL CHECK (length(btrim(parameter)) BETWEEN 1 AND 200),
  value           numeric NOT NULL,
  unit            text NOT NULL CHECK (length(unit) <= 30),
  recorded_limit  numeric,
  -- Never defaulted true/false: NULL until a limit is on file. Assumes
  -- an UPPER-bound limit (the common case here) — see this file's own
  -- header comment for the documented lower-bound gap.
  within_limit    boolean GENERATED ALWAYS AS (CASE WHEN recorded_limit IS NULL THEN NULL ELSE (value <= recorded_limit) END) STORED,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  recorded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS environmental_monitoring_company_idx ON public.environmental_monitoring (company_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.environmental_monitoring_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.recorded_by := auth.uid();
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_monitoring_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_monitoring_stamp ON public.environmental_monitoring;
CREATE TRIGGER environmental_monitoring_stamp BEFORE INSERT ON public.environmental_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.environmental_monitoring_stamp();

-- Insert-only: a correction is a new reading, never an edit of a past
-- one — the register's own "a correction is a new row" discipline.
REVOKE UPDATE, DELETE, TRUNCATE ON public.environmental_monitoring FROM PUBLIC, anon, authenticated;

ALTER TABLE public.environmental_monitoring ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS environmental_monitoring_staff_all ON public.environmental_monitoring;
CREATE POLICY environmental_monitoring_staff_all ON public.environmental_monitoring FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS environmental_monitoring_read ON public.environmental_monitoring;
CREATE POLICY environmental_monitoring_read ON public.environmental_monitoring FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS environmental_monitoring_insert ON public.environmental_monitoring;
CREATE POLICY environmental_monitoring_insert ON public.environmental_monitoring FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

SELECT public.apply_write_guard('public.environmental_monitoring');

DROP TRIGGER IF EXISTS environmental_monitoring_audit ON public.environmental_monitoring;
CREATE TRIGGER environmental_monitoring_audit AFTER INSERT ON public.environmental_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_monitoring', 'company_id', 'category', 'parameter', 'within_limit');

DROP TRIGGER IF EXISTS environmental_monitoring_platform_event ON public.environmental_monitoring;
CREATE TRIGGER environmental_monitoring_platform_event AFTER INSERT ON public.environmental_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('site_id', 'category', 'parameter', 'recorded_limit', 'within_limit');

-- ── environmental_permits + permit_conditions ─────────────────────
--
-- Deliberately its OWN table, not attached to `contractors` — per the
-- governance map, a permit is a compliance fact about the CLIENT's own
-- operation, not a third party. `permits` (152) is Health & Safety's
-- permit-TO-WORK (a different concept entirely — a time-bounded
-- authorisation for one job); this is an environmental PERMIT (a
-- regulator's ongoing licence to operate, e.g. an Environmental
-- Permitting Regulations permit or discharge consent). Different tab,
-- different table, on purpose.

CREATE TABLE IF NOT EXISTS public.environmental_permits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id           uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  permit_type       text NOT NULL CHECK (length(btrim(permit_type)) BETWEEN 1 AND 200),
  permit_number     text CHECK (length(permit_number) <= 100),
  issuing_authority text CHECK (length(issuing_authority) <= 200),
  issued_on         date,
  expires_on        date,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'surrendered', 'revoked')),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS environmental_permits_company_idx ON public.environmental_permits (company_id, status);

CREATE OR REPLACE FUNCTION public.environmental_permits_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.environmental_permits_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_permits_stamp ON public.environmental_permits;
CREATE TRIGGER environmental_permits_stamp BEFORE INSERT OR UPDATE ON public.environmental_permits
  FOR EACH ROW EXECUTE FUNCTION public.environmental_permits_stamp();

ALTER TABLE public.environmental_permits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS environmental_permits_staff_all ON public.environmental_permits;
CREATE POLICY environmental_permits_staff_all ON public.environmental_permits FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS environmental_permits_read ON public.environmental_permits;
CREATE POLICY environmental_permits_read ON public.environmental_permits FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS environmental_permits_insert ON public.environmental_permits;
CREATE POLICY environmental_permits_insert ON public.environmental_permits FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

DROP POLICY IF EXISTS environmental_permits_update ON public.environmental_permits;
CREATE POLICY environmental_permits_update ON public.environmental_permits FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

SELECT public.apply_write_guard('public.environmental_permits');

DROP TRIGGER IF EXISTS environmental_permits_audit ON public.environmental_permits;
CREATE TRIGGER environmental_permits_audit AFTER INSERT OR UPDATE OR DELETE ON public.environmental_permits
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('environmental_permit', 'company_id', 'permit_type', 'permit_number', 'status');

DROP TRIGGER IF EXISTS environmental_permits_platform_event ON public.environmental_permits;
CREATE TRIGGER environmental_permits_platform_event AFTER INSERT OR UPDATE ON public.environmental_permits
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('site_id', 'permit_type', 'status', 'expires_on');

CREATE TABLE IF NOT EXISTS public.permit_conditions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environmental_permit_id uuid NOT NULL REFERENCES public.environmental_permits(id) ON DELETE CASCADE,
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  condition_text          text NOT NULL CHECK (length(btrim(condition_text)) BETWEEN 1 AND 2000),
  review_frequency        text CHECK (review_frequency IS NULL OR review_frequency IN ('monthly', 'quarterly', 'annually', 'other')),
  next_review_due         date,
  -- Factual, never a compliance verdict (rule 5): current means "no
  -- action needed right now", not "this condition is being met".
  status                  text NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'evidence_due', 'overdue', 'breach_recorded', 'review_required')),
  last_evidence_at        timestamptz,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permit_conditions_permit_idx ON public.permit_conditions (environmental_permit_id);

CREATE OR REPLACE FUNCTION public.permit_conditions_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p record;
BEGIN
  SELECT company_id INTO p FROM public.environmental_permits WHERE id = NEW.environmental_permit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Environmental permit not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := p.company_id;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.permit_conditions_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS permit_conditions_stamp ON public.permit_conditions;
CREATE TRIGGER permit_conditions_stamp BEFORE INSERT OR UPDATE ON public.permit_conditions
  FOR EACH ROW EXECUTE FUNCTION public.permit_conditions_stamp();

ALTER TABLE public.permit_conditions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permit_conditions_staff_all ON public.permit_conditions;
CREATE POLICY permit_conditions_staff_all ON public.permit_conditions FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS permit_conditions_read ON public.permit_conditions;
CREATE POLICY permit_conditions_read ON public.permit_conditions FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.read')));

DROP POLICY IF EXISTS permit_conditions_insert ON public.permit_conditions;
CREATE POLICY permit_conditions_insert ON public.permit_conditions FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

DROP POLICY IF EXISTS permit_conditions_update ON public.permit_conditions;
CREATE POLICY permit_conditions_update ON public.permit_conditions FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')))
  WITH CHECK (company_id = (SELECT public.my_company_id())
              AND (SELECT public.has_capability((SELECT public.my_company_id()), 'environmental.manage')));

SELECT public.apply_write_guard('public.permit_conditions');

DROP TRIGGER IF EXISTS permit_conditions_audit ON public.permit_conditions;
CREATE TRIGGER permit_conditions_audit AFTER INSERT OR UPDATE OR DELETE ON public.permit_conditions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('permit_condition', 'company_id', 'environmental_permit_id', 'status', 'review_frequency');

DROP TRIGGER IF EXISTS permit_conditions_platform_event ON public.permit_conditions;
CREATE TRIGGER permit_conditions_platform_event AFTER INSERT OR UPDATE ON public.permit_conditions
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('environmental_permit_id', 'status', 'next_review_due');

-- ── evidence: four new hs_files branches (rule 9) ─────────────────
--
-- Re-creates hs_entity_table()/hs_scope_for_entity()/hs_evidence_
-- readable()/hs_evidence_writable()/hs_files_entity_check() (156's
-- latest bodies), adding only the new branches — every other branch
-- copied unchanged so this migration is provably additive, the exact
-- discipline 156 itself documents.

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
                         'environmental_spill', 'waste_movement', 'environmental_monitoring', 'environmental_permit') THEN
    owner := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
    IF owner IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Evidence must belong to a record of the same organisation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── Safety Timeline: one entry per meaningful event, never per row ──

CREATE OR REPLACE FUNCTION public.environmental_spills_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'environmental_spill', NEW.id, 'spill_reported',
      'Spill reported: ' || NEW.substance || ' — ' || replace(NEW.receiving_environment, '_', ' '));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'environmental_spill', NEW.id, 'status_' || NEW.status,
      NEW.substance || ' — ' || replace(NEW.status, '_', ' '));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.environmental_spills_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_spills_hs_event ON public.environmental_spills;
CREATE TRIGGER environmental_spills_hs_event AFTER INSERT OR UPDATE ON public.environmental_spills
  FOR EACH ROW EXECUTE FUNCTION public.environmental_spills_event();

CREATE OR REPLACE FUNCTION public.environmental_permits_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.hs_log(NEW.company_id, 'environmental_permit', NEW.id, 'permit_added',
      'Environmental permit added: ' || NEW.permit_type);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hs_log(NEW.company_id, 'environmental_permit', NEW.id, 'status_' || NEW.status,
      NEW.permit_type || ' — ' || replace(NEW.status, '_', ' '));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.environmental_permits_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS environmental_permits_hs_event ON public.environmental_permits;
CREATE TRIGGER environmental_permits_hs_event AFTER INSERT OR UPDATE ON public.environmental_permits
  FOR EACH ROW EXECUTE FUNCTION public.environmental_permits_event();

-- ── never build a second action table (rule 2): new source_type values ──

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_source_type_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_source_type_check CHECK (source_type IS NULL OR source_type IN (
  'incident', 'audit', 'audit_finding', 'risk_assessment', 'inspection', 'equipment_inspection', 'consultant_visit',
  'service_request', 'legal_requirement', 'regulatory_broadcast', 'broadcast', 'hr_process', 'training_gap',
  'contractor_review', 'compliance_item', 'hs_check', 'onboarding', 'manual', 'other',
  'hazard', 'method_statement', 'coshh_assessment', 'investigation', 'riddor_review', 'puwer_assessment',
  'environmental_aspect', 'environmental_spill', 'waste_movement', 'environmental_monitoring', 'environmental_permit_condition'));

-- ── waste carrier licence: a contractor_insurances.insurance_type value ──
--
-- Reuses contractor_is_current() (150) unchanged: it already fails
-- currency on ANY on-file policy past its expiry, not only the two
-- required ones — a waste carrier licence recorded here with an
-- expires_on in the past already surfaces correctly with no function
-- change at all.

ALTER TABLE public.contractor_insurances DROP CONSTRAINT IF EXISTS contractor_insurances_insurance_type_check;
ALTER TABLE public.contractor_insurances ADD CONSTRAINT contractor_insurances_insurance_type_check
  CHECK (insurance_type IN ('employers_liability', 'public_liability', 'professional_indemnity', 'waste_carrier_licence', 'other'));

-- ── capabilities: reuse environmental.read/environmental.manage (156) ──
-- No new capability invented for this group, per the task brief — both
-- already seeded and granted by migration 156.

-- ── write guards already applied per-table above ──────────────────
