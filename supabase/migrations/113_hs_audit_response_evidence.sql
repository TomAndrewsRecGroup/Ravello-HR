-- ═══════════════════════════════════════════════════════════════════
-- 113: H&S audit evidence — a photo against a specific failed answer
--      (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 3 (110) shipped the audit runner and noted evidence photos were
-- not wired in: hs_files already accepted entity_type: 'audit' with no
-- schema change needed, but that only lets a photo be attached to the
-- AUDIT as a whole, not to the specific failed answer it documents.
--
-- Two changes, both small:
--
--   1. hs_scope_for_entity() gains 'audit_response' -> 'audits' (same
--      scope as the audit itself — it's the same permission dimension,
--      just a finer-grained entity). hs_files' own CHECK
--      (hs_scope_for_entity(entity_type) IS NOT NULL) is what actually
--      enforces this is a known kind of evidence, not a typo.
--
--   2. hs_submit_audit() now takes an 'id' inside each response object
--      and inserts it explicitly instead of leaving it to
--      hs_audit_responses.id's DEFAULT gen_random_uuid(). The runner
--      generates that id client-side the same way it already generates
--      the audit's own id (crypto.randomUUID(), at draft-creation time)
--      — which is what lets it stage a photo against a specific answer
--      WHILE OFFLINE, before that answer's row exists anywhere, and
--      upload it under the right entity_id the moment Submit succeeds.
--      Old drafts saved in a browser's localStorage before this
--      shipped have no per-response id; the runner falls back to
--      generating one at submit time for those, same as it always did
--      implicitly via the column default.
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.hs_scope_for_entity(p_entity text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_entity
           WHEN 'register_item'       THEN 'register'
           WHEN 'register_completion' THEN 'register'
           WHEN 'activity'            THEN 'register'
           WHEN 'site'                THEN 'register'
           WHEN 'document'            THEN 'documents'
           WHEN 'training'            THEN 'training'
           WHEN 'audit'               THEN 'audits'
           WHEN 'audit_response'      THEN 'audits'
           WHEN 'incident'            THEN 'incidents'
           ELSE NULL
         END;
$$;

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
    INSERT INTO public.hs_audit_responses (id, audit_id, template_item_id, prompt, category, rating, comment, sort_order)
    VALUES (
      COALESCE(NULLIF(r->>'id', '')::uuid, gen_random_uuid()),
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
