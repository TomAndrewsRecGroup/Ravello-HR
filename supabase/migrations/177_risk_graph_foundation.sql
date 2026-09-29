-- ═══════════════════════════════════════════════════════════════════
-- 177: Core-OS 360 Phase 8, Group 1 — Risk Graph foundation (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- hs_links (122) has been, in its own header comment, "the Risk
-- Graph's foundation — relationships as rows, not free text" since
-- Phase 2. It has sat unused as anything but a per-record "linked
-- items" list ever since: five portal pages each show ONE record's
-- direct links; nothing anywhere traverses the graph beyond one hop.
-- This migration does two things, both additive:
--
-- 1. hs_entity_table()/hs_entity_company() gain FOUR entity types that
--    exist, have a company_id column, but were never wired into this
--    shared resolver: permit (152), isolation (153), emergency_plan
--    (154), management_review (161) — each added in its own migration
--    with nobody circling back to this one. Every prior branch is
--    reproduced unchanged (a regression test pins several of them).
--
-- 2. risk_graph_neighbors(p_type, p_id, p_depth) — a recursive walk of
--    hs_links in BOTH directions, capped at 3 hops and 500 rows
--    (matching this codebase's standing row-cap discipline), returning
--    (entity_type, entity_id, relation, hop, direction). SECURITY
--    INVOKER, deliberately: the exact rule search_records() already
--    established — it can never return a row the caller's own RLS on
--    hs_links would refuse them directly, because every underlying
--    read runs AS the caller, not as a privilege-escalated definer.

-- ─── 1. hs_entity_table(): four missing branches ────────────────────

CREATE OR REPLACE FUNCTION public.hs_entity_table(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
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
    WHEN 'compliance_item'           THEN 'compliance_items'
    WHEN 'iso_certification'         THEN 'iso_certifications'
    WHEN 'compliance_evaluation'     THEN 'compliance_evaluations'
    WHEN 'audit_finding'             THEN 'audit_findings'
    WHEN 'consultation_record'       THEN 'consultation_records'
    WHEN 'environmental_complaint'   THEN 'environmental_complaints'
    WHEN 'legal_obligation'          THEN 'organisation_legal_obligations'
    WHEN 'objective'                 THEN 'objectives'
    WHEN 'milestone'                 THEN 'milestones'
    WHEN 'visit_observation'         THEN 'visit_observations'
    WHEN 'permit'                    THEN 'permits'
    WHEN 'isolation'                 THEN 'isolations'
    WHEN 'emergency_plan'            THEN 'emergency_plans'
    WHEN 'management_review'         THEN 'management_reviews'
    ELSE NULL END
$$;

-- hs_entity_company() is unchanged — it already resolves any table
-- generically via hs_entity_table() + EXECUTE format(), so the four
-- new branches above are all it needed.

-- ─── 2. risk_graph_neighbors(): capped, SECURITY INVOKER, both directions ───

CREATE OR REPLACE FUNCTION public.risk_graph_neighbors(p_type text, p_id uuid, p_depth integer DEFAULT 1)
RETURNS TABLE (entity_type text, entity_id uuid, relation text, hop integer, direction text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH RECURSIVE walk(entity_type, entity_id, relation, hop, direction) AS (
    SELECT p_type, p_id, NULL::text, 0, 'self'
    UNION ALL
    SELECT
      CASE WHEN l.from_type = w.entity_type AND l.from_id = w.entity_id THEN l.to_type ELSE l.from_type END,
      CASE WHEN l.from_type = w.entity_type AND l.from_id = w.entity_id THEN l.to_id ELSE l.from_id END,
      l.relation,
      w.hop + 1,
      CASE WHEN l.from_type = w.entity_type AND l.from_id = w.entity_id THEN 'outgoing' ELSE 'incoming' END
    FROM public.hs_links l
    JOIN walk w ON (l.from_type = w.entity_type AND l.from_id = w.entity_id)
                OR (l.to_type   = w.entity_type AND l.to_id   = w.entity_id)
    WHERE w.hop < LEAST(GREATEST(p_depth, 1), 3)
  )
  SELECT DISTINCT ON (entity_type, entity_id) entity_type, entity_id, relation, hop, direction
  FROM walk
  WHERE hop > 0
  ORDER BY entity_type, entity_id, hop ASC
  LIMIT 500
$$;
-- SECURITY INVOKER, so it carries no privilege to escalate — every row
-- it can ever return is one hs_links_read's own RLS already let the
-- caller see directly. The REVOKE/GRANT pair below matches
-- search_records()'s own precedent (119/126/137/163) exactly: anon
-- gets nothing (a signed-out caller has no auth.uid(), so RLS would
-- return zero rows anyway, but this is the established belt-and-braces
-- shape every session-scoped function in this codebase follows).
REVOKE ALL ON FUNCTION public.risk_graph_neighbors(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.risk_graph_neighbors(text, uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.risk_graph_neighbors(text, uuid, integer) IS
  'Core-OS 360 Phase 8. Walks hs_links up to 3 hops, 500 rows, as the CALLER (SECURITY INVOKER) — never returns a row hs_links RLS would refuse the caller directly.';
