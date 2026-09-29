-- ═══════════════════════════════════════════════════════════════════
-- 135: Core-OS 360 Phase 3 — occupational health, clinical kept apart (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Plan §5. Two tables, two audiences:
--
-- person_health_outcomes — the OPERATIONAL summary: outcome (fit, fit
--   with restrictions, temporarily unfit, unfit, further assessment
--   required), date, provider, an operational restriction summary ("no
--   work at height"), the next review date, and a reference. There is no
--   diagnosis column. Read with occupational_health.summary.read (or by
--   the person themselves); written with occupational_health.manage.
--   History: insert-only, a new assessment is a new row.
--
-- occupational_health_clinical — clinical notes and documents. Read and
--   written ONLY with an EXPLICIT occupational_health.clinical.read grant
--   (has_explicit_capability: being staff is not enough, 132). Its own
--   private bucket, oh-clinical. Nothing from it reaches an outbox
--   whitelist, an audit value, a notification or Safe to Deploy.
--
-- Health REQUIREMENTS are not a separate table: a medical requirement is
-- an ordinary rule (133) on a role, a site or a person, pointing at the
-- occupational_health_requirements catalogue, with source_type recording
-- where it came from (COSHH, risk assessment, individual). One rule model,
-- one engine (136). Managers see what Safe to Deploy says — met, met
-- with restrictions, due, not met — never the restriction text.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.person_health_outcomes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id           uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  requirement_id      uuid REFERENCES public.occupational_health_requirements(id) ON DELETE RESTRICT,
  assessed_on         date NOT NULL,
  provider            text CHECK (length(provider) <= 200),
  outcome             text NOT NULL CHECK (outcome IN
                        ('fit','fit_with_restrictions','temporarily_unfit','unfit','further_assessment_required')),
  restriction_summary text CHECK (length(restriction_summary) <= 500),
  review_date         date,
  evidence_ref        text CHECK (length(evidence_ref) <= 200),
  recorded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (review_date IS NULL OR review_date >= assessed_on),
  CHECK (outcome <> 'fit_with_restrictions' OR length(btrim(COALESCE(restriction_summary, ''))) >= 3)
);
CREATE INDEX IF NOT EXISTS person_health_outcomes_person_idx
  ON public.person_health_outcomes (person_id, requirement_id, assessed_on DESC);
CREATE INDEX IF NOT EXISTS person_health_outcomes_review_idx
  ON public.person_health_outcomes (company_id, review_date) WHERE review_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.occupational_health_clinical (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id     uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  outcome_id    uuid REFERENCES public.person_health_outcomes(id) ON DELETE RESTRICT,
  clinical_notes text CHECK (length(clinical_notes) <= 20000),
  document_path text CHECK (length(document_path) <= 500),
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(clinical_notes, document_path) >= 1)
);
CREATE INDEX IF NOT EXISTS occupational_health_clinical_person_idx ON public.occupational_health_clinical (person_id);

-- Fill the organisation from the person; keep links inside it; the
-- recorder is the session. SECURITY INVOKER (keys on current_user); the
-- lookups are DEFINER helpers from 134a.
CREATE OR REPLACE FUNCTION public.health_record_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE org uuid;
BEGIN
  IF TG_OP <> 'INSERT' AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Health records are never edited or deleted; record a new one' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  org := public.workforce_person_company(NEW.person_id);
  IF org IS NULL THEN RAISE EXCEPTION 'Unknown person' USING ERRCODE = '23503'; END IF;
  NEW.company_id := org;
  IF TG_TABLE_NAME = 'person_health_outcomes' THEN
    PERFORM public.assert_catalogue(org, 'occupational_health_requirements', NEW.requirement_id);
  ELSIF NEW.outcome_id IS NOT NULL AND public.health_outcome_person(NEW.outcome_id) IS DISTINCT FROM NEW.person_id THEN
    RAISE EXCEPTION 'The outcome belongs to someone else' USING ERRCODE = '23514';
  END IF;
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.recorded_by := auth.uid();
    IF public.is_me(NEW.person_id) THEN
      RAISE EXCEPTION 'Nobody records their own occupational health outcome' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.health_outcome_person(p_outcome uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT person_id FROM person_health_outcomes WHERE id = p_outcome
$$;
REVOKE ALL ON FUNCTION public.health_outcome_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_outcome_person(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.health_record_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_record_guard() TO authenticated;

DROP TRIGGER IF EXISTS person_health_outcomes_guard ON public.person_health_outcomes;
CREATE TRIGGER person_health_outcomes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.person_health_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.health_record_guard();
DROP TRIGGER IF EXISTS occupational_health_clinical_guard ON public.occupational_health_clinical;
CREATE TRIGGER occupational_health_clinical_guard BEFORE INSERT OR UPDATE OR DELETE ON public.occupational_health_clinical
  FOR EACH ROW EXECUTE FUNCTION public.health_record_guard();

-- The clinical test, in one place: an explicit grant in the organisation
-- the caller is acting in. No staff shortcut.
CREATE OR REPLACE FUNCTION public.can_read_clinical(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_org = public.my_company_id() AND public.has_explicit_capability(p_org, 'occupational_health.clinical.read')
$$;
REVOKE ALL ON FUNCTION public.can_read_clinical(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_clinical(uuid) TO authenticated, service_role;

ALTER TABLE public.person_health_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS person_health_outcomes_read ON public.person_health_outcomes;
CREATE POLICY person_health_outcomes_read ON public.person_health_outcomes FOR SELECT TO authenticated
  USING (public.workforce_can(company_id, 'occupational_health.summary.read') OR public.is_me(person_id));
DROP POLICY IF EXISTS person_health_outcomes_insert ON public.person_health_outcomes;
CREATE POLICY person_health_outcomes_insert ON public.person_health_outcomes FOR INSERT TO authenticated
  WITH CHECK (public.workforce_can(company_id, 'occupational_health.manage'));
SELECT public.apply_write_guard('public.person_health_outcomes');
REVOKE UPDATE, DELETE, TRUNCATE ON public.person_health_outcomes FROM anon, authenticated;

ALTER TABLE public.occupational_health_clinical ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS occupational_health_clinical_read ON public.occupational_health_clinical;
CREATE POLICY occupational_health_clinical_read ON public.occupational_health_clinical FOR SELECT TO authenticated
  USING (public.can_read_clinical(company_id));
DROP POLICY IF EXISTS occupational_health_clinical_insert ON public.occupational_health_clinical;
CREATE POLICY occupational_health_clinical_insert ON public.occupational_health_clinical FOR INSERT TO authenticated
  WITH CHECK (public.can_read_clinical(company_id));
SELECT public.apply_write_guard('public.occupational_health_clinical');
REVOKE UPDATE, DELETE, TRUNCATE ON public.occupational_health_clinical FROM anon, authenticated;

-- Audit: the fact of an outcome, never its restriction text; the fact of
-- a clinical record, never its content.
DROP TRIGGER IF EXISTS person_health_outcomes_audit ON public.person_health_outcomes;
CREATE TRIGGER person_health_outcomes_audit AFTER INSERT OR UPDATE OR DELETE ON public.person_health_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('health_outcome', 'company_id', 'person_id', 'requirement_id',
    'outcome', 'assessed_on', 'review_date');
DROP TRIGGER IF EXISTS occupational_health_clinical_audit ON public.occupational_health_clinical;
CREATE TRIGGER occupational_health_clinical_audit AFTER INSERT OR UPDATE OR DELETE ON public.occupational_health_clinical
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('health_clinical_record', 'company_id', 'person_id', 'outcome_id');

-- The clinical bucket: private, reads inherit the clinical row's RLS,
-- uploads only by a clinical grant into the organisation's own folder.
INSERT INTO storage.buckets (id, name, public) VALUES ('oh-clinical', 'oh-clinical', false)
ON CONFLICT (id) DO UPDATE SET public = false;
DROP POLICY IF EXISTS oh_clinical_read ON storage.objects;
CREATE POLICY oh_clinical_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'oh-clinical'
         AND EXISTS (SELECT 1 FROM public.occupational_health_clinical r WHERE r.document_path = objects.name));
DROP POLICY IF EXISTS oh_clinical_insert ON storage.objects;
CREATE POLICY oh_clinical_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'oh-clinical'
              AND (storage.foldername(name))[1] = (SELECT public.my_company_id())::text
              AND public.can_read_clinical((SELECT public.my_company_id())));
