-- Rolled-back live probe for migration 170 (Core-OS 360 Phase 6,
-- Group 5: Roadmap Integration — 'milestone' joins
-- requirement_evidence_links.source_type).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.probe170() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  co_a uuid; co_b uuid;
  ms_a uuid; eq_a uuid; eq_b uuid;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe170 Co A', 'probe170-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe170 Co B', 'probe170-co-b') RETURNING id INTO co_b;

  INSERT INTO public.milestones (company_id, pillar, title, status, quarter) VALUES (co_a, 'protect', 'Probe170 milestone', 'in_progress', 'Q1-2027') RETURNING id INTO ms_a;
  INSERT INTO public.hs_equipment (company_id, name, status) VALUES (co_a, 'Probe170 Asset A', 'in_service') RETURNING id INTO eq_a;
  INSERT INTO public.hs_equipment (company_id, name, status) VALUES (co_b, 'Probe170 Asset B', 'in_service') RETURNING id INTO eq_b;

  BEGIN
    INSERT INTO public.requirement_evidence_links (company_id, source_type, source_id, entity_type, entity_id)
      VALUES (co_a, 'milestone', ms_a, 'equipment', eq_a);
    RETURN NEXT '1. milestone linked to a same-org asset: true';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT format('1. milestone linked to a same-org asset: false (%s)', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.requirement_evidence_links (company_id, source_type, source_id, entity_type, entity_id)
      VALUES (co_a, 'milestone', ms_a, 'equipment', eq_b);
    RETURN NEXT '2. milestone linked to a CROSS-ORG asset refused: false (WRONGLY SUCCEEDED)';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEXT '2. milestone linked to a CROSS-ORG asset refused: true';
  END;
END $$;

SELECT * FROM pg_temp.probe170();

ROLLBACK;
