-- ═══════════════════════════════════════════════════════════════════
-- 110: Health & Safety Phase 3 — on-site audits (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════
--
-- An AUDIT is one visit's checklist run: a set of questions, each
-- answered pass/fail/n-a with an optional comment, scored, and — for
-- every failed answer — a client action raised automatically (the same
-- "findings become actions" shape 095's failed-check rule already has
-- for the register). A TEMPLATE is reusable, staff-authored reference
-- data (same status as a sector pack, 106): never client-specific,
-- never a Safety Timeline entry on its own.
--
-- INSERT-ONLY, like hs_register_completions/hs_activities/hs_files: a
-- correction is a new audit, not an edit to an old one. There is no
-- draft status stored server-side — the offline-capable runner keeps
-- every in-progress answer in the browser's own storage until the one
-- submit call, so the only server-visible state is "submitted".
-- Submitting twice (a retried request after a dropped connection) must
-- not create a second audit or a second round of actions/emails: the
-- id is CLIENT-GENERATED (crypto.randomUUID() in the browser) so the
-- route can check for that id before inserting, the same idempotency
-- shape the referral pipeline and every keyed email in this codebase
-- already use.
--
-- hs_scope_for_entity('audit') already returns 'audits' (094/095
-- anticipated this phase) and HS_ENTITY_LABELS already has an 'audit'
-- entry — no vocab change needed for evidence uploads against an audit.
--
-- Idempotent. Safe to re-run.

-- ── templates: staff reference data, like sector packs ──────────────

CREATE TABLE IF NOT EXISTS public.hs_audit_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text CHECK (length(description) <= 2000),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hs_audit_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.hs_audit_templates(id) ON DELETE CASCADE,
  category    text CHECK (category IS NULL OR category IN (
                'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
                'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
                'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other')),
  prompt      text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 500),
  guidance    text CHECK (length(guidance) <= 1000),
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS hs_audit_template_items_template_idx ON public.hs_audit_template_items (template_id, sort_order);

-- ── audits: one row per completed visit ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_audits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id          uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  template_id      uuid REFERENCES public.hs_audit_templates(id) ON DELETE SET NULL,
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  conducted_on     date NOT NULL CHECK (conducted_on <= current_date + 1),
  score            numeric CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  notes            text CHECK (length(notes) <= 4000),
  recorded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind text NOT NULL DEFAULT 'system',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_audits_company_idx ON public.hs_audits (company_id, conducted_on DESC);

DROP TRIGGER IF EXISTS hs_audits_author ON public.hs_audits;
CREATE TRIGGER hs_audits_author
  BEFORE INSERT ON public.hs_audits
  FOR EACH ROW EXECUTE FUNCTION public.hs_stamp_author();

-- ── responses: one row per answered checklist item ──────────────────

CREATE TABLE IF NOT EXISTS public.hs_audit_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id          uuid NOT NULL REFERENCES public.hs_audits(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_item_id  uuid REFERENCES public.hs_audit_template_items(id) ON DELETE SET NULL,
  prompt            text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 500),
  category          text CHECK (category IS NULL OR category IN (
                      'hs_policy_governance', 'hs_risk_assessment', 'hs_fire', 'hs_electrical', 'hs_gas',
                      'hs_lifting', 'hs_work_equipment', 'hs_hazardous_substances', 'hs_water', 'hs_asbestos',
                      'hs_first_aid', 'hs_construction', 'hs_health_surveillance', 'hs_care', 'hs_other')),
  rating            text NOT NULL CHECK (rating IN ('pass', 'fail', 'na')),
  comment           text CHECK (length(comment) <= 2000),
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_audit_responses_audit_idx ON public.hs_audit_responses (audit_id, sort_order);

-- company_id is filled from the parent audit, never trusted from the
-- caller — the same discipline hs_completion_fill() already uses for
-- hs_register_completions.item_id -> company_id.
CREATE OR REPLACE FUNCTION public.hs_audit_response_fill()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE aud record;
BEGIN
  SELECT company_id INTO aud FROM public.hs_audits WHERE id = NEW.audit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Audit not found' USING ERRCODE = '23503';
  END IF;
  NEW.company_id := aud.company_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hs_audit_response_fill ON public.hs_audit_responses;
CREATE TRIGGER hs_audit_response_fill
  BEFORE INSERT ON public.hs_audit_responses
  FOR EACH ROW EXECUTE FUNCTION public.hs_audit_response_fill();

REVOKE ALL ON FUNCTION public.hs_audit_response_fill() FROM PUBLIC, anon, authenticated;

-- ── atomic submit: the audit row and every response, or neither ──────
-- SECURITY INVOKER (not DEFINER): this runs as the calling staff user,
-- so hs_audits_staff_all's WITH CHECK still applies exactly as if the
-- caller ran the inserts directly — the function exists for the
-- TRANSACTION, not to escalate privilege. Without it, a network failure
-- between the audit insert and the responses insert would leave a
-- permanently-orphaned audit row with zero responses — hs_audits is
-- insert-only (no UPDATE/DELETE grant to fix it up, no correction but a
-- new audit) — and the automation rule reads "zero responses" as "zero
-- findings", reporting a clean audit that was never actually checked.
-- p_id is CLIENT-GENERATED: calling this twice with the same id after a
-- dropped connection returns the existing audit rather than creating a
-- second one and re-raising its findings/notifications a second time.
CREATE OR REPLACE FUNCTION public.hs_submit_audit(
  p_id uuid, p_company_id uuid, p_site_id uuid, p_template_id uuid,
  p_title text, p_conducted_on date, p_notes text, p_score numeric,
  p_responses jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing uuid;
  r        jsonb;
BEGIN
  SELECT id INTO existing FROM public.hs_audits WHERE id = p_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  INSERT INTO public.hs_audits (id, company_id, site_id, template_id, title, conducted_on, score, notes)
  VALUES (p_id, p_company_id, p_site_id, p_template_id, p_title, p_conducted_on, p_score, p_notes);

  FOR r IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
    INSERT INTO public.hs_audit_responses (audit_id, template_item_id, prompt, category, rating, comment, sort_order)
    VALUES (
      p_id,
      NULLIF(r->>'template_item_id', '')::uuid,
      r->>'prompt',
      NULLIF(r->>'category', ''),
      r->>'rating',
      NULLIF(r->>'comment', ''),
      COALESCE((r->>'sort_order')::integer, 0)
    );
  END LOOP;

  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_submit_audit(uuid, uuid, uuid, uuid, text, date, text, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hs_submit_audit(uuid, uuid, uuid, uuid, text, date, text, numeric, jsonb) TO authenticated;

-- ── one starter template, so the runner has something to pick on day
-- one (the same reasoning as 106's five sector packs) ────────────────

INSERT INTO public.hs_audit_templates (id, name, description)
VALUES ('00000000-0000-4000-8000-000000000001', 'General H&S walk-round',
        'A general-purpose site walk-round covering the most common findings across sectors.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hs_audit_template_items (template_id, category, prompt, guidance, sort_order)
SELECT '00000000-0000-4000-8000-000000000001', v.category, v.prompt, v.guidance, v.sort_order
FROM (VALUES
  ('hs_fire',                 'Fire exits and escape routes clear?',            'Check both internal routes and the final exit point outside.', 1),
  ('hs_fire',                 'Fire extinguishers present, in date and unobstructed?', 'Look for the service tag date, not just presence.', 2),
  ('hs_electrical',           'Visible electrical equipment PAT tested / in date?', 'Spot-check a sample, not every item.', 3),
  ('hs_first_aid',            'First aid box stocked and accessible?',          'Check contents against the checklist inside the lid.', 4),
  ('hs_hazardous_substances', 'Hazardous substances stored and labelled correctly?', 'COSHH data sheets should be accessible nearby.', 5),
  ('hs_work_equipment',       'Work equipment guarded and free of visible damage?', NULL, 6),
  ('hs_policy_governance',    'H&S policy and risk assessments visible/accessible to staff?', NULL, 7),
  ('hs_other',                'Housekeeping: walkways and fire exits free of trip hazards?', NULL, 8)
) AS v(category, prompt, guidance, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hs_audit_template_items
  WHERE template_id = '00000000-0000-4000-8000-000000000001' AND prompt = v.prompt
);

-- ── Safety Timeline: one entry per audit, not per answer ─────────────
-- A 20-question audit would otherwise put 20 lines on the client's
-- Timeline for one visit; the audit row itself is the event that
-- matters there. Findings are visible as the actions they raise.

CREATE OR REPLACE FUNCTION public.hs_event_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.hs_log(NEW.company_id, 'audit', NEW.id, 'completed',
    NEW.title || ' — ' || to_char(NEW.conducted_on, 'DD Mon YYYY')
    || CASE WHEN NEW.score IS NULL THEN '' ELSE ' (' || round(NEW.score) || '%)' END);
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS hs_audits_hs_event ON public.hs_audits;
CREATE TRIGGER hs_audits_hs_event
  AFTER INSERT ON public.hs_audits
  FOR EACH ROW EXECUTE FUNCTION public.hs_event_audit();

REVOKE ALL ON FUNCTION public.hs_event_audit() FROM PUBLIC, anon, authenticated;

-- ── outbox: only the audit itself, not each response ─────────────────
-- The rule that raises finding-actions queries hs_audit_responses
-- directly from the one event this fires — one event per audit, not
-- one per answer, keeps the queue quiet for a 20-question checklist.

DROP TRIGGER IF EXISTS hs_audits_platform_event ON public.hs_audits;
CREATE TRIGGER hs_audits_platform_event AFTER INSERT ON public.hs_audits
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('title','site_id','template_id','conducted_on','score');

-- ── immutability: a correction is a new audit, never an edit ─────────

REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_audits           FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_audit_responses  FROM PUBLIC, anon, authenticated;

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.hs_audit_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_audit_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_audits               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_audit_responses      ENABLE ROW LEVEL SECURITY;

-- Templates: staff reference data only, same posture as sector packs.
DROP POLICY IF EXISTS hs_audit_templates_staff_all ON public.hs_audit_templates;
CREATE POLICY hs_audit_templates_staff_all ON public.hs_audit_templates FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_audit_template_items_staff_all ON public.hs_audit_template_items;
CREATE POLICY hs_audit_template_items_staff_all ON public.hs_audit_template_items FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- Audits/responses: staff full access; a client reads their own
-- company's rows (nothing here is self-certified — same as the
-- register and the rest of the Safety Timeline's sources).
DROP POLICY IF EXISTS hs_audits_staff_all ON public.hs_audits;
CREATE POLICY hs_audits_staff_all ON public.hs_audits FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_audits_client_read ON public.hs_audits;
CREATE POLICY hs_audits_client_read ON public.hs_audits FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

DROP POLICY IF EXISTS hs_audit_responses_staff_all ON public.hs_audit_responses;
CREATE POLICY hs_audit_responses_staff_all ON public.hs_audit_responses FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_audit_responses_client_read ON public.hs_audit_responses;
CREATE POLICY hs_audit_responses_client_read ON public.hs_audit_responses FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
