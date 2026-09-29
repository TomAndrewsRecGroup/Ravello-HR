-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 6: Objectives & Targets, and Management
-- Review (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Builds on Groups 1-5 (migrations 156-160). Read docs/CORE_OS_360_
-- PHASE5_GOVERNANCE_MAP.md before touching this.
--
-- Five tables: objectives (a target the client is working toward, e.g.
-- an ISO 45001/14001 objective or a standalone one), objective_
-- measurements (insert-only progress readings that deterministically
-- roll the objective's own status forward), management_reviews (the
-- ISO clause 9.3 management review meeting), management_review_
-- attendees, management_review_data_pack (a stored, reproducible
-- snapshot of factual counts) and management_review_decisions
-- (insert-only, immutable once the review is completed).
--
-- Absolute rules this migration is built to (see the task brief):
--   1. Never a second action table. A corrective action against an
--      objective or arising from a management review decision is an
--      `actions` row via two new actions.source_type values,
--      'objective' and 'management_review' (added to the existing
--      CHECK below).
--   2. objective_measurements.value vs. objectives.target_value/
--      target_direction is a DETERMINISTIC comparison, computed by a
--      database trigger — never an AI judgement. target_direction
--      ('increase'/'decrease') is the one column this migration adds
--      beyond the task brief's literal list, because "is 40 above or
--      below the target of 20" cannot be answered without knowing
--      which way the objective is meant to move — the same kind of
--      documented, necessary assumption environmental_monitoring's
--      upper-bound-only within_limit (157) already recorded rather
--      than silently guessing.
--   3. A completed management review's decisions are immutable —
--      management_review_decisions is fully insert-only (a correction
--      is a new decision row, never an edit — the hs_documents/
--      environmental_aspects "material change is a new row"
--      discipline) AND refuses a new INSERT once the parent review's
--      status is 'completed' — a genuinely different decision after
--      that point needs a new management_reviews row (a follow-up
--      review), not an addition to a closed one.
--   4. The data pack is a STORED SNAPSHOT, computed factually in
--      TypeScript at generation time from existing tables (pure
--      counts/aggregates only, never an AI-generated summary or
--      conclusion) and inserted once per generation — never
--      recomputed live when a review is reopened, so it stays
--      reproducible/auditable even after the underlying counts move.
--      management_review_data_pack is insert-only for the same reason
--      compliance_evaluations/iso_certifications-adjacent snapshot
--      tables already are in this codebase.
--   5. RLS: staff MANAGE, client READ-ONLY on every client-visible
--      table here — no client write path at all, the exact
--      organisation_legal_obligations/compliance_evaluations (159)
--      posture, reusing 'risk.read' (never a new capability, per the
--      task brief and the 158/159 precedent). management_review_
--      data_pack is staff-only, not client-visible — the internal
--      analysis pack is not the same thing as the client-facing
--      decisions a review reaches (documented UI decision, see the
--      portal page).
--   6. apply_write_guard() on every client-readable table (objectives,
--      objective_measurements, management_reviews, management_review_
--      attendees, management_review_decisions) — not on the staff-only
--      management_review_data_pack, the exact 158/159 precedent.
--   7. Outbox + audit trail + reminders, never a text field in a
--      whitelist: objectives (status changes) and management_reviews
--      (status changes, esp. reaching 'completed') join
--      TRIGGERED_ENTITIES; objectives.target_date and management_
--      reviews.review_date (while 'scheduled') join REMINDER_ENTITIES.
--
-- Idempotent. Safe to re-run.

-- ── objectives ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.objectives (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  standard_id       uuid REFERENCES public.management_system_standards(id) ON DELETE SET NULL,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  description       text CHECK (description IS NULL OR length(description) <= 4000),
  target_value      numeric,
  target_unit       text CHECK (target_unit IS NULL OR length(target_unit) <= 50),
  baseline_value    numeric,
  -- Rule 2: which way "better" moves. Only meaningful alongside
  -- target_value; ignored (no automatic roll at all) when target_value
  -- is null, since a purely qualitative objective has nothing for the
  -- database to compare.
  target_direction  text NOT NULL DEFAULT 'increase' CHECK (target_direction IN ('increase', 'decrease')),
  target_date       date,
  owner_person_id   uuid REFERENCES public.people(id) ON DELETE SET NULL,
  -- Factual progress states, never a compliance verdict — the same
  -- discipline permit_conditions.status/compliance_evaluations.status
  -- already follow for their own domains.
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft', 'active', 'on_track', 'at_risk', 'achieved', 'missed', 'abandoned')),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS objectives_company_idx ON public.objectives (company_id, status);

CREATE OR REPLACE FUNCTION public.objectives_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.owner_person_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.objectives_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS objectives_stamp ON public.objectives;
CREATE TRIGGER objectives_stamp BEFORE INSERT OR UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.objectives_stamp();

-- ── objective_measurements: insert-only progress readings (rule 2) ──

CREATE TABLE IF NOT EXISTS public.objective_measurements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id  uuid NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  measured_at   timestamptz NOT NULL DEFAULT now(),
  value         numeric NOT NULL,
  notes         text CHECK (notes IS NULL OR length(notes) <= 2000),
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS objective_measurements_objective_idx ON public.objective_measurements (objective_id, measured_at DESC);

-- company_id derived from the parent objective, never trusted from the
-- caller (the environmental_aspect_assessments_fill()/compliance_
-- evaluations_fill() discipline). recorded_by is always the acting
-- session.
CREATE OR REPLACE FUNCTION public.objective_measurements_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  SELECT company_id INTO o FROM public.objectives WHERE id = NEW.objective_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Objective not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := o.company_id;
  NEW.recorded_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.objective_measurements_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS objective_measurements_fill ON public.objective_measurements;
CREATE TRIGGER objective_measurements_fill
  BEFORE INSERT ON public.objective_measurements
  FOR EACH ROW EXECUTE FUNCTION public.objective_measurements_fill();

REVOKE UPDATE, DELETE, TRUNCATE ON public.objective_measurements FROM PUBLIC, anon, authenticated;

-- Rule 2: roll the objective's status forward from the NEWEST
-- measurement only (the 148a/PUWER lesson — reading an insert-only
-- history table directly fires once per historical row, not just the
-- current one). No automatic roll at all when target_value is null (a
-- purely qualitative objective) or once an objective has been marked
-- 'abandoned' (a human terminal decision the roll must never override).
-- The thresholds below (30 days / progress reached) are explicit,
-- inspectable constants — not a model's judgement.
CREATE OR REPLACE FUNCTION public.objective_measurements_roll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record; reached boolean; new_status text;
BEGIN
  SELECT target_value, target_direction, target_date, status
    INTO o FROM public.objectives WHERE id = NEW.objective_id;
  IF NOT FOUND OR o.status = 'abandoned' OR o.target_value IS NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.objective_measurements m2
    WHERE m2.objective_id = NEW.objective_id AND m2.id <> NEW.id AND m2.measured_at > NEW.measured_at
  ) THEN
    RETURN NULL;
  END IF;

  reached := CASE o.target_direction
    WHEN 'decrease' THEN NEW.value <= o.target_value
    ELSE NEW.value >= o.target_value
  END;

  IF reached THEN
    new_status := 'achieved';
  ELSIF o.target_date IS NOT NULL AND o.target_date < current_date THEN
    new_status := 'missed';
  ELSIF o.target_date IS NOT NULL AND o.target_date <= current_date + 30 THEN
    new_status := 'at_risk';
  ELSE
    new_status := 'on_track';
  END IF;

  UPDATE public.objectives SET status = new_status, updated_at = now() WHERE id = NEW.objective_id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.objective_measurements_roll() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS objective_measurements_roll ON public.objective_measurements;
CREATE TRIGGER objective_measurements_roll
  AFTER INSERT ON public.objective_measurements
  FOR EACH ROW EXECUTE FUNCTION public.objective_measurements_roll();

-- ── management_reviews ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.management_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  review_date   date NOT NULL,
  chaired_by    uuid REFERENCES public.people(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                  'scheduled', 'in_progress', 'completed', 'cancelled')),
  completed_at  timestamptz,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_reviews_company_idx ON public.management_reviews (company_id, review_date DESC);

CREATE OR REPLACE FUNCTION public.management_reviews_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    IF NEW.status = 'completed' THEN NEW.completed_at := now(); END IF;
  ELSE
    NEW.created_by := OLD.created_by;
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := now();
    ELSIF NEW.status <> 'completed' THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;
  NEW.updated_at := now();
  PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.chaired_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.management_reviews_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS management_reviews_stamp ON public.management_reviews;
CREATE TRIGGER management_reviews_stamp BEFORE INSERT OR UPDATE ON public.management_reviews
  FOR EACH ROW EXECUTE FUNCTION public.management_reviews_stamp();

-- ── management_review_attendees ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.management_review_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES public.management_reviews(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  attended    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, person_id)
);

CREATE OR REPLACE FUNCTION public.management_review_attendees_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  SELECT company_id INTO r FROM public.management_reviews WHERE id = NEW.review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Management review not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := r.company_id;
  PERFORM public.assert_same_org(r.company_id, 'people', NEW.person_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.management_review_attendees_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS management_review_attendees_fill ON public.management_review_attendees;
CREATE TRIGGER management_review_attendees_fill
  BEFORE INSERT ON public.management_review_attendees
  FOR EACH ROW EXECUTE FUNCTION public.management_review_attendees_fill();

-- ── management_review_data_pack: a stored, reproducible snapshot ────
-- (rule 4). Computed FACTUALLY in TypeScript (pure counts/aggregates
-- only — see admin/src/lib/governance/dataPack.ts) and inserted once
-- per generation; never edited and never recomputed live for an
-- existing snapshot.

CREATE TABLE IF NOT EXISTS public.management_review_data_pack (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL REFERENCES public.management_reviews(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  computed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data          jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_review_data_pack_review_idx ON public.management_review_data_pack (review_id, computed_at DESC);

CREATE OR REPLACE FUNCTION public.management_review_data_pack_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  SELECT company_id INTO r FROM public.management_reviews WHERE id = NEW.review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Management review not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := r.company_id;
  NEW.computed_by := auth.uid();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.management_review_data_pack_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS management_review_data_pack_fill ON public.management_review_data_pack;
CREATE TRIGGER management_review_data_pack_fill
  BEFORE INSERT ON public.management_review_data_pack
  FOR EACH ROW EXECUTE FUNCTION public.management_review_data_pack_fill();

REVOKE UPDATE, DELETE, TRUNCATE ON public.management_review_data_pack FROM PUBLIC, anon, authenticated;

-- ── management_review_decisions: insert-only, immutable once the
--    review is completed (rule 3) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.management_review_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id             uuid NOT NULL REFERENCES public.management_reviews(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  topic                 text NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 200),
  decision_text         text NOT NULL CHECK (length(decision_text) <= 4000),
  resulting_action_id   uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS management_review_decisions_review_idx ON public.management_review_decisions (review_id, created_at);

-- Rule 3's gate: a decision may only be recorded while the parent
-- review is NOT 'completed'. resulting_action_id, when given, must
-- already belong to the same organisation — the action is created
-- FIRST (an ordinary actions insert, source_type = 'management_review')
-- and then named here, so this table never needs an UPDATE to attach
-- it after the fact.
CREATE OR REPLACE FUNCTION public.management_review_decisions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  SELECT company_id, status INTO r FROM public.management_reviews WHERE id = NEW.review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Management review not found' USING ERRCODE = '23503';
  END IF;
  IF r.status = 'completed' THEN
    RAISE EXCEPTION 'This review is completed — start a new review to record a further decision' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := r.company_id;
  NEW.created_by := auth.uid();
  IF NEW.resulting_action_id IS NOT NULL THEN
    PERFORM public.assert_same_org(r.company_id, 'actions', NEW.resulting_action_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.management_review_decisions_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS management_review_decisions_guard ON public.management_review_decisions;
CREATE TRIGGER management_review_decisions_guard
  BEFORE INSERT ON public.management_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.management_review_decisions_guard();

REVOKE UPDATE, DELETE, TRUNCATE ON public.management_review_decisions FROM PUBLIC, anon, authenticated;

-- ── actions.source_type: two new values (rule 1) ────────────────────

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_source_type_check;
ALTER TABLE public.actions ADD CONSTRAINT actions_source_type_check CHECK (
  source_type IS NULL OR source_type = ANY (ARRAY[
    'incident', 'audit', 'audit_finding', 'risk_assessment', 'inspection', 'equipment_inspection',
    'consultant_visit', 'service_request', 'legal_requirement', 'regulatory_broadcast', 'broadcast',
    'hr_process', 'training_gap', 'contractor_review', 'compliance_item', 'hs_check', 'onboarding',
    'manual', 'other', 'hazard', 'method_statement', 'coshh_assessment', 'investigation', 'riddor_review',
    'puwer_assessment', 'environmental_aspect', 'environmental_spill', 'waste_movement',
    'environmental_monitoring', 'environmental_permit_condition',
    'objective', 'management_review'
  ]::text[])
);

-- ── audit trail (117) — identifying/classifying only, never free text ─

DROP TRIGGER IF EXISTS objectives_audit ON public.objectives;
CREATE TRIGGER objectives_audit AFTER INSERT OR UPDATE OR DELETE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('objective', 'company_id', 'title', 'standard_id', 'status');

DROP TRIGGER IF EXISTS objective_measurements_audit ON public.objective_measurements;
CREATE TRIGGER objective_measurements_audit AFTER INSERT ON public.objective_measurements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('objective_measurement', 'company_id', 'objective_id', 'value');

DROP TRIGGER IF EXISTS management_reviews_audit ON public.management_reviews;
CREATE TRIGGER management_reviews_audit AFTER INSERT OR UPDATE OR DELETE ON public.management_reviews
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('management_review', 'company_id', 'review_date', 'status');

DROP TRIGGER IF EXISTS management_review_decisions_audit ON public.management_review_decisions;
CREATE TRIGGER management_review_decisions_audit AFTER INSERT ON public.management_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('management_review_decision', 'company_id', 'review_id', 'topic');

-- ── outbox: whitelist is classifying fields only, never description/
--    decision_text/notes (rule 7) ───────────────────────────────────

DROP TRIGGER IF EXISTS objectives_platform_event ON public.objectives;
CREATE TRIGGER objectives_platform_event AFTER INSERT OR UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('title', 'standard_id', 'status', 'target_date');

DROP TRIGGER IF EXISTS management_reviews_platform_event ON public.management_reviews;
CREATE TRIGGER management_reviews_platform_event AFTER INSERT OR UPDATE ON public.management_reviews
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('review_date', 'chaired_by', 'status', 'completed_at');

-- ── write guards (117) — client-readable tables only (rule 6) ───────

SELECT public.apply_write_guard('public.objectives');
SELECT public.apply_write_guard('public.objective_measurements');
SELECT public.apply_write_guard('public.management_reviews');
SELECT public.apply_write_guard('public.management_review_attendees');
SELECT public.apply_write_guard('public.management_review_decisions');

-- ── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE public.objectives                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_measurements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_reviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_review_attendees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_review_data_pack   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_review_decisions   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS objectives_staff_all ON public.objectives;
CREATE POLICY objectives_staff_all ON public.objectives FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS objectives_read ON public.objectives;
CREATE POLICY objectives_read ON public.objectives FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

DROP POLICY IF EXISTS objective_measurements_staff_all ON public.objective_measurements;
CREATE POLICY objective_measurements_staff_all ON public.objective_measurements FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS objective_measurements_read ON public.objective_measurements;
CREATE POLICY objective_measurements_read ON public.objective_measurements FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

DROP POLICY IF EXISTS management_reviews_staff_all ON public.management_reviews;
CREATE POLICY management_reviews_staff_all ON public.management_reviews FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS management_reviews_read ON public.management_reviews;
CREATE POLICY management_reviews_read ON public.management_reviews FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

DROP POLICY IF EXISTS management_review_attendees_staff_all ON public.management_review_attendees;
CREATE POLICY management_review_attendees_staff_all ON public.management_review_attendees FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS management_review_attendees_read ON public.management_review_attendees;
CREATE POLICY management_review_attendees_read ON public.management_review_attendees FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

DROP POLICY IF EXISTS management_review_decisions_staff_all ON public.management_review_decisions;
CREATE POLICY management_review_decisions_staff_all ON public.management_review_decisions FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS management_review_decisions_read ON public.management_review_decisions;
CREATE POLICY management_review_decisions_read ON public.management_review_decisions FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id())
         AND (SELECT public.has_capability((SELECT public.my_company_id()), 'risk.read')));

-- management_review_data_pack: STAFF ONLY (rule 5) — the internal
-- analysis pack is never client-visible; the portal shows only the
-- decisions a completed review reached.
DROP POLICY IF EXISTS management_review_data_pack_staff_all ON public.management_review_data_pack;
CREATE POLICY management_review_data_pack_staff_all ON public.management_review_data_pack FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
