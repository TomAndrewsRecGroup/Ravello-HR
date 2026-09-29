-- Core-OS 360 Phase 7, Group 1: the visit entity and visit templates.
--
-- Section 1 asks to "Create consultant_visits" — that name predates
-- this codebase's own Phase 6 table, `consultancy_visits` (168), which
-- was built DELIBERATELY MINIMAL specifically so Phase 7 could extend
-- it: "Phase 7 explicitly OWNS the full workflow... EXTENDS this
-- table, never replaces it" (168's own header comment, and repeated in
-- the Phase 6 handover). A parallel `consultant_visits` table would be
-- exactly the "second, forked system" this codebase's own standing
-- rule refuses (hs_equipment/assets, the register, every extend-in-
-- place precedent since Phase 4's existing-operations audit) — so this
-- migration EXTENDS consultancy_visits, never forks it. 0 live rows
-- exist (checked before writing this: no INSERT/UPDATE call site for
-- this table exists anywhere in either app), so every change below
-- applies directly with no backfill/migration-of-data step needed.
--
-- Section 1's own field list separately names "status" and "report
-- status" as two fields, but also gives ONE status list that already
-- embeds report progression (planned, confirmed, in_progress,
-- awaiting_report, report_draft, report_issued, closed, cancelled).
-- Keeping two columns that could disagree about the same fact (is the
-- report drafted or not) is the exact anti-pattern this codebase
-- avoids everywhere else (one vocabulary, not a copy that might
-- drift) — so there is ONE `status` column carrying the full
-- lifecycle, matching the literal "Statuses:" list, not a second
-- report_status column.

ALTER TABLE public.consultancy_visits DROP CONSTRAINT IF EXISTS consultancy_visits_status_check;
ALTER TABLE public.consultancy_visits ADD CONSTRAINT consultancy_visits_status_check
  CHECK (status IN ('planned', 'confirmed', 'in_progress', 'awaiting_report', 'report_draft', 'report_issued', 'closed', 'cancelled'));
ALTER TABLE public.consultancy_visits ALTER COLUMN status SET DEFAULT 'planned';

ALTER TABLE public.consultancy_visits
  ADD COLUMN IF NOT EXISTS previous_visit_id  uuid REFERENCES public.consultancy_visits(id) ON DELETE SET NULL,
  -- "start/end times" is genuinely distinct from scheduled_date (when
  -- the visit was PLANNED for) — when the consultant actually opened
  -- and closed visit mode on site. scheduled_date is untouched: every
  -- existing reader (the health-snapshot cron, the portfolio calendar,
  -- the workload page, Client 360) keeps working unchanged.
  ADD COLUMN IF NOT EXISTS started_at         timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at           timestamptz,
  ADD COLUMN IF NOT EXISTS scope              text CHECK (scope IS NULL OR length(scope) <= 4000),
  -- Plain names, not a structured contact model — the spec names no
  -- further shape ("client attendees") and a client's own contact
  -- details already live on `profiles`/`companies`; this is a
  -- lightweight per-visit record of who was actually in the room.
  ADD COLUMN IF NOT EXISTS client_attendees   text[],
  -- internal_notes is staff/consultant-only, NEVER shown to the
  -- client — the register's own "internal vs shared" split
  -- (hs_audit_responses' comment vs shared_summary below), enforced
  -- by RLS/the report builder reading only shared_summary for
  -- anything client-facing.
  ADD COLUMN IF NOT EXISTS internal_notes     text CHECK (internal_notes IS NULL OR length(internal_notes) <= 10000),
  ADD COLUMN IF NOT EXISTS shared_summary     text CHECK (shared_summary IS NULL OR length(shared_summary) <= 10000),
  ADD COLUMN IF NOT EXISTS template_id        uuid;

-- previous_visit_id must be the SAME client relationship — a visit's
-- own "previous visit" is always the prior visit to the SAME client,
-- never a different client's history leaking through this link.
CREATE OR REPLACE FUNCTION public.consultancy_visit_previous_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE prev_client uuid;
BEGIN
  IF NEW.previous_visit_id IS NOT NULL THEN
    SELECT client_organisation_id INTO prev_client FROM public.consultancy_visits WHERE id = NEW.previous_visit_id;
    IF prev_client IS DISTINCT FROM NEW.client_organisation_id THEN
      RAISE EXCEPTION 'previous_visit_id must reference a visit for the SAME client' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultancy_visit_previous_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS consultancy_visit_previous_guard ON public.consultancy_visits;
CREATE TRIGGER consultancy_visit_previous_guard BEFORE INSERT OR UPDATE ON public.consultancy_visits
  FOR EACH ROW EXECUTE FUNCTION public.consultancy_visit_previous_guard();

-- ── consultancy_visit_templates ──────────────────────────────────────
-- Per-CONSULTANCY reference data (unlike hs_audit_templates, which is
-- platform-wide staff data) — "versioned consultancy templates" means
-- the templates belong to the consultancy that authored them, so a
-- future second consultancy on this platform gets its own library,
-- never Laws Safety's. Versioned by SUPERSEDING (a new version is a
-- new row, is_active flips the old one off) — the same discipline
-- hs_documents/emergency_plans/environmental_aspects already use,
-- rather than editing a template's content in place while visits
-- already reference it.
CREATE TABLE IF NOT EXISTS public.consultancy_visit_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultancy_organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  category                    text NOT NULL CHECK (category IN (
    'general_hs', 'construction', 'manufacturing', 'iso', 'compliance', 'contractor_review'
  )),
  version                     integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_active                   boolean NOT NULL DEFAULT true,
  supersedes_id               uuid REFERENCES public.consultancy_visit_templates(id) ON DELETE SET NULL,
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultancy_visit_templates_consultancy ON public.consultancy_visit_templates(consultancy_organisation_id);

-- One flat items table, mirroring hs_audit_template_items' own proven
-- shape (110) — a "section" is a plain grouping label on the item, not
-- a separate table, which was already sufficient for a template with
-- real structure at Phase 4's own scale.
CREATE TABLE IF NOT EXISTS public.consultancy_visit_template_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           uuid NOT NULL REFERENCES public.consultancy_visit_templates(id) ON DELETE CASCADE,
  section               text NOT NULL CHECK (length(btrim(section)) BETWEEN 1 AND 200),
  question              text NOT NULL CHECK (length(btrim(question)) BETWEEN 1 AND 500),
  expects_evidence       boolean NOT NULL DEFAULT false,
  sort_order            integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_consultancy_visit_template_items_template ON public.consultancy_visit_template_items(template_id, sort_order);

ALTER TABLE public.consultancy_visits ADD CONSTRAINT consultancy_visits_template_fk
  FOREIGN KEY (template_id) REFERENCES public.consultancy_visit_templates(id) ON DELETE SET NULL;

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.consultancy_visit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultancy_visit_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultancy_visit_templates_staff_all ON public.consultancy_visit_templates FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
-- Portfolio-wide, same shape as every other Phase 6 consultancy
-- table: read via consultancy.client_access is too narrow a gate for
-- TEMPLATES (a template is not about any one client) — templates are
-- gated on consultancy.service_manage alone, the same capability that
-- already governs booking/running a visit at all.
CREATE POLICY consultancy_visit_templates_consultancy_read ON public.consultancy_visit_templates FOR SELECT TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_visit_templates.consultancy_organisation_id, 'consultancy.service_manage')));
CREATE POLICY consultancy_visit_templates_consultancy_write ON public.consultancy_visit_templates FOR ALL TO authenticated
  USING (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_visit_templates.consultancy_organisation_id, 'consultancy.service_manage')))
  WITH CHECK (consultancy_organisation_id = (SELECT public.my_home_company_id())
         AND (SELECT public.has_capability(consultancy_visit_templates.consultancy_organisation_id, 'consultancy.service_manage')));

CREATE POLICY consultancy_visit_template_items_staff_all ON public.consultancy_visit_template_items FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY consultancy_visit_template_items_consultancy_all ON public.consultancy_visit_template_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.consultancy_visit_templates t WHERE t.id = consultancy_visit_template_items.template_id
                   AND t.consultancy_organisation_id = (SELECT public.my_home_company_id())
                   AND (SELECT public.has_capability(t.consultancy_organisation_id, 'consultancy.service_manage'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.consultancy_visit_templates t WHERE t.id = consultancy_visit_template_items.template_id
                   AND t.consultancy_organisation_id = (SELECT public.my_home_company_id())
                   AND (SELECT public.has_capability(t.consultancy_organisation_id, 'consultancy.service_manage'))));

SELECT public.apply_write_guard('public.consultancy_visit_templates');
SELECT public.apply_write_guard('public.consultancy_visit_template_items');

-- ── audit trail: the visit's own richer lifecycle now matters enough
--    to audit (previously only entity/verb via consultancy_visits_audit,
--    169/168 — unchanged, this just confirms the whitelist still
--    excludes internal_notes/shared_summary/scope, all free text).
DROP TRIGGER IF EXISTS consultancy_visits_audit ON public.consultancy_visits;
CREATE TRIGGER consultancy_visits_audit AFTER INSERT OR UPDATE OR DELETE ON public.consultancy_visits
  FOR EACH ROW EXECUTE FUNCTION public.audit_row(
    'consultancy_visit', 'client_organisation_id',
    'consultancy_organisation_id', 'visit_type', 'status', 'scheduled_date', 'template_id', 'previous_visit_id'
  );
