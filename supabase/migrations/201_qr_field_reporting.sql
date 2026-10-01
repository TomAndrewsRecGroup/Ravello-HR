-- ═══════════════════════════════════════════════════════════════════
-- 201: QR field reporting — incident/hazard reporting from a no-login
-- worker badge scan (/w/[token], 179) and an issue report from an
-- entity badge scan (/e/[token], 196).
-- ═══════════════════════════════════════════════════════════════════
--
-- Closes a named, real gap: the worker/entity QR scan pages only ever
-- showed a coarse status + check-in/out — a person on site with no
-- portal login had no way to report what they had just seen.
--
-- The reporter has NO SESSION. Every insert here runs under the
-- SERVICE ROLE from a public, token-gated route (worker_qr_tokens/
-- entity_qr_tokens, 179/196's own "possession of the token is the
-- proof" model) — never a direct session write, the same reason
-- site_checkins' own mutations are route-only (179's own header
-- comment). RLS on hs_incidents/hazards is UNCHANGED by this
-- migration: a service-role write bypasses it entirely, exactly as
-- 179's own checkin route already bypasses site_checkins' RLS. Both
-- tables' own BEFORE INSERT guards (hs_incident_guard/hs_hazard_guard)
-- already branch on `current_user IN ('authenticated','anon')` — for
-- a service-role connection that is false, so the guard's own
-- session-only defaulting is skipped and the route is responsible for
-- supplying sensible values, exactly the same shape the two existing
-- consequence rules (incident_reported / hazard_reported in
-- safetyRules.ts) already react to regardless of who or what inserted
-- the row — no new consequence rule is needed here at all.
--
-- `reported_by_person_id` names WHO scanned the badge and reported it
-- — a fact worth keeping, distinct from `reported_by`/`identified_by`
-- (an auth.users id, which an anonymous scan has none of).
-- `reported_via` is the exact `site_checkins.recorded_via` pattern,
-- applied here per report.
--
-- Added to hs_check_refs' own shared VALUES list (123/125's own "one
-- function... 124/125 extend a list, never re-invent the check" rule)
-- rather than a bespoke check, so it is validated same-organisation
-- for free on every hazard/incident write, portal or QR alike. The
-- body below is 125's own latest definition (the canonical one, read
-- live before extending it, per this codebase's own standing
-- discipline) plus the one addition.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── hs_check_refs: one more reference to validate ───────────────────

CREATE OR REPLACE FUNCTION public.hs_check_refs(p_company uuid, p_row jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k text; t text; v uuid; owner uuid; ok boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_tps_staff() AND p_company IS DISTINCT FROM public.my_company_id() THEN
    RAISE EXCEPTION 'Not your organisation' USING ERRCODE = '42501';
  END IF;
  FOR k, t IN SELECT * FROM (VALUES
      ('site_id','hs_sites'), ('department_id','departments'), ('linked_asset_id','hs_equipment'),
      ('hazard_id','hazards'), ('control_id','controls'), ('substance_id','substances'),
      ('person_id','people'), ('linked_contractor_id','people'), ('person_in_charge_id','people'),
      ('risk_assessment_id','risk_assessments'), ('method_statement_id','method_statements'),
      ('coshh_assessment_id','coshh_assessments'), ('linked_risk_assessment_id','risk_assessments'),
      ('incident_id','hs_incidents'), ('investigation_id','incident_investigations'),
      ('incident_person_id','incident_people'), ('evidence_id','hs_files'),
      ('reported_by_person_id','people')) x(k, t) LOOP
    v := NULLIF(p_row ->> k, '')::uuid;
    CONTINUE WHEN v IS NULL OR to_regclass('public.' || t) IS NULL;
    EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', t) INTO owner USING v;
    IF owner IS DISTINCT FROM p_company THEN
      RAISE EXCEPTION '% is not a record of this organisation', replace(k, '_id', '') USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOR k, t IN SELECT * FROM (VALUES
      ('hazard_category_id','hazard_categories'), ('assessment_type_id','assessment_types'),
      ('risk_matrix_id','risk_matrices')) x(k, t) LOOP
    v := NULLIF(p_row ->> k, '')::uuid;
    CONTINUE WHEN v IS NULL;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND (company_id IS NULL OR company_id = $2))', t)
      INTO ok USING v, p_company;
    IF NOT ok THEN
      RAISE EXCEPTION '% is not available to this organisation', replace(k, '_id', '') USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['owner_id','assessor_id','responsible_manager_id','author_id','lead_investigator_id','verifier_id'] LOOP
    v := NULLIF(p_row ->> k, '')::uuid;
    CONTINUE WHEN v IS NULL;
    IF NOT public.hs_user_in_org(v, p_company) THEN
      RAISE EXCEPTION '% must be a user of this organisation', replace(k, '_id', '') USING ERRCODE = '23514';
    END IF;
  END LOOP;
END $$;

-- ── hs_incidents / hazards gain who-via-QR reported them ────────────

ALTER TABLE public.hs_incidents
  ADD COLUMN IF NOT EXISTS reported_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_via           text NOT NULL DEFAULT 'portal';
ALTER TABLE public.hs_incidents DROP CONSTRAINT IF EXISTS hs_incidents_reported_via_check;
ALTER TABLE public.hs_incidents ADD CONSTRAINT hs_incidents_reported_via_check CHECK (reported_via IN ('portal', 'qr_scan'));

ALTER TABLE public.hazards
  ADD COLUMN IF NOT EXISTS reported_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_via           text NOT NULL DEFAULT 'portal';
ALTER TABLE public.hazards DROP CONSTRAINT IF EXISTS hazards_reported_via_check;
ALTER TABLE public.hazards ADD CONSTRAINT hazards_reported_via_check CHECK (reported_via IN ('portal', 'qr_scan'));

-- ── entity_qr_report_context(): the one place an ENTITY badge token
-- resolves to what a report route needs ────────────────────────────
--
-- entity_qr_status() (196) deliberately never exposes entity_id/
-- company_id to the browser — a report route needs both server-side
-- to insert a correctly-scoped hazard. SERVICE-ROLE-only, mirroring
-- worker_qr_status()'s own grant shape exactly.
CREATE OR REPLACE FUNCTION public.entity_qr_report_context(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.entity_qr_tokens WHERE token_hash = p_token_hash;
  IF NOT FOUND OR t.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'entity_type', t.entity_type, 'entity_id', t.entity_id, 'company_id', t.company_id);
END $$;
REVOKE ALL ON FUNCTION public.entity_qr_report_context(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entity_qr_report_context(text) TO service_role;
