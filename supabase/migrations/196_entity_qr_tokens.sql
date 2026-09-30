-- Core-OS 360 Completion Programme, Phase 26, Group 4 (C14.9): "QR
-- coverage beyond people." Worker badges (179) only ever covered
-- PERSONS — this closes the two other real, coarse-status object
-- kinds this codebase already tracks: machines/assets (hs_equipment)
-- and COSHH assessments.
--
-- Deliberately, honestly scoped narrower than the gap's own five-item
-- wording ("machines/assets, work areas, COSHH, site entrance/
-- induction, PPE"):
--   * "work areas / site entrance" needs a site-management surface to
--     host a mint action, and none exists anywhere in either app today
--     (checked live before writing this — no admin or portal page
--     writes hs_sites at all). Scannable infrastructure with no UI to
--     ever mint a token from it would be dead code, not a feature —
--     left out rather than built half-finished.
--   * "induction" is a per-PERSON Safe-to-Deploy requirement
--     (workforce requirement_type), already exposed by the EXISTING
--     worker badge scan (worker_qr_status already reports the
--     person's own deployment status) — not a separate entity.
--   * "PPE" has no standalone catalogue/register table in this
--     codebase — it is a workforce requirement type
--     (role_requirements.requirement_type = 'ppe'), never a physical
--     object with its own id a badge could point at.
--
-- entity_type is validated against hs_entity_table() — the platform's
-- one polymorphic entity resolver (122+) — so a third kind can be
-- added later by widening the CHECK alone, never a new resolver.
--
-- Durable, not single-use — the EXACT worker_qr_tokens (179)
-- departure from every other token table in this codebase: a label on
-- a machine must stay scannable indefinitely, the same reason a
-- worker's own badge is durable. SHA-256 hash only, RLS on with NO
-- session policies at all (service role only) — there is no "look the
-- token back up" path, by construction.

CREATE TABLE public.entity_qr_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('equipment', 'coshh_assessment')),
  entity_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  revoked_at  timestamptz,
  revoked_by  uuid
);

-- At most one ACTIVE token per (entity_type, entity_id) — the same
-- "lost badge is revoked, a fresh one minted" rule 179 already
-- established, applied here per object instead of per person.
CREATE UNIQUE INDEX entity_qr_tokens_one_active
  ON public.entity_qr_tokens (entity_type, entity_id) WHERE revoked_at IS NULL;
CREATE INDEX entity_qr_tokens_company_idx ON public.entity_qr_tokens (company_id);

ALTER TABLE public.entity_qr_tokens ENABLE ROW LEVEL SECURITY;
-- No CREATE POLICY at all: service role only, the worker_qr_tokens/
-- policy_ack_tokens shape. Mint/revoke is a route boundary, never a
-- direct session insert.

-- company_id is ALWAYS derived, never trusted from the caller — the
-- hs_equipment_inspection_fill()/hs_audit_response_fill() discipline,
-- applied here via hs_entity_company() (the platform's own generic
-- entity->company lookup, 122+) so this needs no per-table branch of
-- its own. An entity_type/entity_id pair that does not resolve to a
-- real row (unknown type, or a deleted/nonexistent row) is refused
-- outright — never silently stored with a null company.
CREATE OR REPLACE FUNCTION public.entity_qr_tokens_fill()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE derived uuid;
BEGIN
  derived := public.hs_entity_company(NEW.entity_type, NEW.entity_id);
  IF derived IS NULL THEN
    RAISE EXCEPTION 'entity_qr_tokens: unknown % (%)', NEW.entity_type, NEW.entity_id USING ERRCODE = '23503';
  END IF;
  NEW.company_id := derived;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS entity_qr_tokens_fill ON public.entity_qr_tokens;
CREATE TRIGGER entity_qr_tokens_fill BEFORE INSERT ON public.entity_qr_tokens
  FOR EACH ROW EXECUTE FUNCTION public.entity_qr_tokens_fill();

-- entity_qr_status(): the public scan read, mirroring worker_qr_status()
-- (179) exactly — STATUS ONLY, never a free-text column (notes,
-- description, task_or_process, spill_response, …). A passer-by
-- scanning a label sees exactly what the label is FOR: is this asset
-- in service, is this COSHH assessment current — nothing more.
-- SECURITY DEFINER so it may read across every caller's company (an
-- anonymous scan has no session for RLS to evaluate against anyway);
-- granted to service_role only, matching worker_qr_status() exactly.
CREATE OR REPLACE FUNCTION public.entity_qr_status(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE t record; result jsonb;
BEGIN
  SELECT * INTO t FROM public.entity_qr_tokens WHERE token_hash = p_token_hash;
  IF NOT FOUND OR t.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF t.entity_type = 'equipment' THEN
    SELECT jsonb_build_object(
      'ok', true, 'entity_type', 'equipment',
      'name', e.name, 'asset_ref', e.asset_ref, 'asset_type', e.asset_type, 'category', e.category,
      'status', e.status,
      'last_inspected_on', e.last_inspected_on, 'next_inspection_due', e.next_inspection_due,
      'company_name', (SELECT name FROM public.companies WHERE id = e.company_id),
      'site_name', (SELECT name FROM public.hs_sites WHERE id = e.site_id)
    ) INTO result
    FROM public.hs_equipment e WHERE e.id = t.entity_id;
  ELSIF t.entity_type = 'coshh_assessment' THEN
    SELECT jsonb_build_object(
      'ok', true, 'entity_type', 'coshh_assessment',
      'title', c.title, 'status', c.status, 'review_date', c.review_date,
      'substance_name', (SELECT product_name FROM public.substances WHERE id = c.substance_id),
      'company_name', (SELECT name FROM public.companies WHERE id = c.company_id)
    ) INTO result
    FROM public.coshh_assessments c WHERE c.id = t.entity_id;
  END IF;

  IF result IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.entity_qr_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entity_qr_status(text) TO service_role;
