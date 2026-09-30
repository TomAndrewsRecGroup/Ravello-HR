-- Core-OS 360 Completion Programme, Phase 23, Group 2 (closes gap-
-- ledger row C8.5 — "Portfolio-safe consultant Risk Graph view").
-- Phase 8's own migration (177) deliberately added no portfolio-wide
-- RLS: "nothing about 'Risk Graph & Connected Compliance Intelligence'
-- as a phase name implies a cross-client capability." This phase's own
-- gap ledger disagrees, explicitly, so it is built here.
--
-- Live inspection (pg_policies) before writing this, the same
-- discipline every prior consultancy-RLS migration in this codebase
-- has followed: only `actions` (175) had a consultancy-read policy
-- among the tables computeRiskGraphIntelligence() needs. `hazards`,
-- `risk_assessments`, `risk_assessment_items`, `risk_item_controls`,
-- `organisation_legal_obligations` and `hs_links` all had the exact
-- same gap `actions` had before 175 — gated only on
-- `company_id = my_company_id()`, the currently ACTIVE organisation,
-- which a portfolio-wide consultant who never switches into the
-- client can never satisfy.
--
-- Six new, narrowly-scoped, ADDITIVE, SELECT-ONLY policies (RLS ORs
-- permissive policies — none of the six existing policies on these
-- tables are touched). SELECT-only, deliberately: this closes a
-- READ gap ("view the risk graph across my portfolio"), not a write
-- one — a consultant creating hazards/risk assessments on behalf of a
-- client they have not switched into is a separate, bigger feature
-- this group's own scope note does not ask for.
--
-- Because risk_graph_neighbors() (177) is SECURITY INVOKER, opening
-- hs_links here alone makes the EXPLORER portfolio-safe with NO code
-- change: a consultant calling it for a genuine record in an
-- authorised client now succeeds regardless of which organisation is
-- "active" in their session — the walk can never cross companies
-- anyway (hs_links_check()'s own same-organisation guard, untouched
-- by this migration).

CREATE POLICY hazards_consultancy_select ON public.hazards FOR SELECT TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));

CREATE POLICY risk_assessments_consultancy_select ON public.risk_assessments FOR SELECT TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));

CREATE POLICY risk_assessment_items_consultancy_select ON public.risk_assessment_items FOR SELECT TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));

CREATE POLICY risk_item_controls_consultancy_select ON public.risk_item_controls FOR SELECT TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));

CREATE POLICY organisation_legal_obligations_consultancy_select ON public.organisation_legal_obligations FOR SELECT TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));

CREATE POLICY hs_links_consultancy_select ON public.hs_links FOR SELECT TO authenticated
  USING ((SELECT public.has_capability(company_id, 'consultancy.service_manage')));
