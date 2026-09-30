-- ═══════════════════════════════════════════════════════════════════
-- 181: Core-OS 360 Phase 16, Group 1 — Cross-Client Lessons Learned
-- Network: schema (2026-09-30)
-- ═══════════════════════════════════════════════════════════════════
--
-- See docs/CORE_OS_360_PHASE16_PLAN.md for the full derivation. In
-- short: nothing anywhere takes what was learned at ONE client's real
-- incident/audit finding and puts a GENERALISED version of it in front
-- of OTHER clients. This is a staff-curated, never-automatic feature:
-- the raw incident/finding stays exactly where it is (private to its
-- own client); a human writes a NEW, deliberately anonymised summary,
-- and only that summary — never the source record itself — is ever
-- shown to anyone else.
--
-- Three tables:
--   lessons_learned              — the staff-authored content itself.
--                                   NO company_id: this is platform-
--                                   wide reference content, the exact
--                                   legal_requirements (159) shape —
--                                   staff-only RLS, no client SELECT
--                                   policy at all. A client only ever
--                                   sees a lesson's content via the
--                                   portal's own service-role-mediated
--                                   read, scoped to exactly the ids
--                                   their own RLS-protected read of
--                                   lesson_learned_distributions
--                                   returns — the identical Legal
--                                   Register precedent (159/D.4).
--   lesson_learned_distributions — which companies a PUBLISHED lesson
--                                   was shared with. Staff write only;
--                                   client SELECT own company rows.
--   lesson_learned_reads         — per-user "I have seen this" receipt.
--                                   Insert-only, one row per (lesson,
--                                   reader); the ONE client-writable
--                                   table in this migration, so it
--                                   alone gets apply_write_guard().
--
-- source_type/source_id on lessons_learned is STAFF-ONLY traceability
-- back to the real incident/audit finding/inspection a lesson was
-- drawn from — reusing hs_entity_table()/hs_entity_company() exactly
-- as requirement_evidence_links (163) already does for its own
-- polymorphic source side. It is never selected in any client-facing
-- read anywhere in this feature (enforced in the TypeScript that reads
-- this table in Group 2, not by RLS — there is no RLS on this table a
-- client could reach in the first place).
--
-- No AI anywhere in this migration. Distribution targeting (Group 1's
-- suggestDistribution.ts) is a plain, deterministic sector match —
-- "which clients share this client's sector" is a fact, not a
-- judgement call, and needs no model.
--
-- Idempotent. Safe to re-run.

-- ── lessons_learned ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lessons_learned (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  category            text NOT NULL CHECK (category IN (
                         'people', 'plant_equipment', 'process', 'procedure', 'environment', 'management',
                         'training', 'supervision', 'maintenance', 'communication', 'design', 'contractor', 'organisational')),
  summary             text NOT NULL CHECK (length(summary) <= 4000),
  recommended_action  text CHECK (recommended_action IS NULL OR length(recommended_action) <= 2000),
  -- Staff-only traceability back to the real source record. Never
  -- read by any client-facing code path.
  source_type         text CHECK (source_type IS NULL OR source_type IN ('incident', 'audit_finding', 'inspection')),
  source_id           uuid,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_type IS NULL) = (source_id IS NULL))
);
CREATE INDEX IF NOT EXISTS lessons_learned_status_idx ON public.lessons_learned (status);
CREATE INDEX IF NOT EXISTS lessons_learned_category_idx ON public.lessons_learned (category);

-- created_by is derived, never trusted from the caller. source_type/
-- source_id are validated (a real row must exist) but never checked
-- against a company, since staff may draw a lesson from ANY client's
-- record. published_at/published_by are stamped once, the first time
-- status reaches 'published', and never reset by a later archive/
-- republish cycle.
CREATE OR REPLACE FUNCTION public.lessons_learned_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();

  IF NEW.source_type IS NOT NULL THEN
    IF public.hs_entity_table(NEW.source_type) IS NULL THEN
      RAISE EXCEPTION 'Unknown lesson source type: %', NEW.source_type USING ERRCODE = '23514';
    END IF;
    IF public.hs_entity_company(NEW.source_type, NEW.source_id) IS NULL THEN
      RAISE EXCEPTION 'Lesson source record not found' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
    NEW.published_by := auth.uid();
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lessons_learned_stamp() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lessons_learned_stamp ON public.lessons_learned;
CREATE TRIGGER lessons_learned_stamp BEFORE INSERT OR UPDATE ON public.lessons_learned
  FOR EACH ROW EXECUTE FUNCTION public.lessons_learned_stamp();

-- Staff-only RLS, no client SELECT policy at all — the exact
-- legal_requirements (159) shape. No apply_write_guard(): there is no
-- client-writable policy here to guard, the same hs_documents/
-- legal_requirements precedent.
ALTER TABLE public.lessons_learned ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lessons_learned_staff_all ON public.lessons_learned;
CREATE POLICY lessons_learned_staff_all ON public.lessons_learned FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- ── lesson_learned_distributions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lesson_learned_distributions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      uuid NOT NULL REFERENCES public.lessons_learned(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  distributed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  distributed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, company_id)
);
CREATE INDEX IF NOT EXISTS lesson_learned_distributions_company_idx ON public.lesson_learned_distributions (company_id);

-- A lesson may only be distributed once it is actually published — a
-- client must never be able to see a distribution row (and, via the
-- Group 2 portal read, the lesson's own content) for a draft.
CREATE OR REPLACE FUNCTION public.lesson_learned_distributions_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE lesson_status text;
BEGIN
  NEW.distributed_by := auth.uid();
  NEW.distributed_at := now();

  SELECT status INTO lesson_status FROM public.lessons_learned WHERE id = NEW.lesson_id;
  IF lesson_status IS NULL THEN
    RAISE EXCEPTION 'Lesson not found' USING ERRCODE = '23514';
  END IF;
  IF lesson_status <> 'published' THEN
    RAISE EXCEPTION 'A lesson may only be distributed once it is published' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lesson_learned_distributions_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lesson_learned_distributions_fill ON public.lesson_learned_distributions;
CREATE TRIGGER lesson_learned_distributions_fill BEFORE INSERT ON public.lesson_learned_distributions
  FOR EACH ROW EXECUTE FUNCTION public.lesson_learned_distributions_fill();

DROP TRIGGER IF EXISTS lesson_learned_distributions_audit ON public.lesson_learned_distributions;
CREATE TRIGGER lesson_learned_distributions_audit AFTER INSERT OR DELETE ON public.lesson_learned_distributions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('lesson_learned_distribution', 'company_id', 'lesson_id');

-- Staff write; client read own company only. No client write policy —
-- no apply_write_guard() needed, the exact hs_documents precedent.
ALTER TABLE public.lesson_learned_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_learned_distributions_staff_all ON public.lesson_learned_distributions;
CREATE POLICY lesson_learned_distributions_staff_all ON public.lesson_learned_distributions FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS lesson_learned_distributions_client_read ON public.lesson_learned_distributions;
CREATE POLICY lesson_learned_distributions_client_read ON public.lesson_learned_distributions FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- ── lesson_learned_reads ─────────────────────────────────────────────
--
-- A per-user "have I seen this" receipt — the ONE client-writable
-- table in this migration. company_id/read_by/read_by_name/read_at
-- are ALL derived from the caller's own session, never trusted from
-- the request; insertion is refused outright unless the lesson has
-- genuinely been distributed to the caller's own company.

CREATE TABLE IF NOT EXISTS public.lesson_learned_reads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid NOT NULL REFERENCES public.lessons_learned(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  read_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_by_name  text,
  read_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, read_by)
);
CREATE INDEX IF NOT EXISTS lesson_learned_reads_company_idx ON public.lesson_learned_reads (company_id, lesson_id);

CREATE OR REPLACE FUNCTION public.lesson_learned_reads_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE my_company uuid; my_name text;
BEGIN
  my_company := public.my_company_id();
  IF my_company IS NULL THEN
    RAISE EXCEPTION 'No active organisation' USING ERRCODE = '23514';
  END IF;
  NEW.company_id := my_company;
  NEW.read_by := auth.uid();
  NEW.read_at := now();

  SELECT full_name INTO my_name FROM public.profiles WHERE id = auth.uid();
  NEW.read_by_name := my_name;

  IF NOT EXISTS (
    SELECT 1 FROM public.lesson_learned_distributions d
    WHERE d.lesson_id = NEW.lesson_id AND d.company_id = my_company
  ) THEN
    RAISE EXCEPTION 'This lesson has not been shared with your organisation' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lesson_learned_reads_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lesson_learned_reads_fill ON public.lesson_learned_reads;
CREATE TRIGGER lesson_learned_reads_fill BEFORE INSERT ON public.lesson_learned_reads
  FOR EACH ROW EXECUTE FUNCTION public.lesson_learned_reads_fill();

ALTER TABLE public.lesson_learned_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_learned_reads_staff_all ON public.lesson_learned_reads;
CREATE POLICY lesson_learned_reads_staff_all ON public.lesson_learned_reads FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS lesson_learned_reads_select ON public.lesson_learned_reads;
CREATE POLICY lesson_learned_reads_select ON public.lesson_learned_reads FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

DROP POLICY IF EXISTS lesson_learned_reads_insert ON public.lesson_learned_reads;
CREATE POLICY lesson_learned_reads_insert ON public.lesson_learned_reads FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id()));

SELECT public.apply_write_guard('public.lesson_learned_reads');
